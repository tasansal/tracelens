/**
 * Hook for managing SEG-Y header view state and trace header loading.
 */
import type { SegyData, TraceHeader } from '@/features/segy/types/segy';
import {
  loadSingleTrace,
  setActiveRevision as setActiveRevisionApi,
  type SegyRevision,
} from '@/shared/api/tauri/segy';
import { useAppStore } from '@/shared/store/appStore';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MAX_TRACE_SAMPLES } from '../constants';

/**
 * Supported header tabs in the SEG-Y header panel.
 */
export type HeaderView = 'textual' | 'binary' | 'trace' | 'schema';

/**
 * Parameters for the useTraceHeader hook.
 */
interface UseTraceHeaderParams {
  /** Parsed SEG-Y metadata (or null while idle) */
  segyData: SegyData | null;
  /** Path to the loaded SEG-Y file */
  filePath: string | null;
  /** Optional cap for trace samples when fetching headers */
  maxSamples?: number;
}

/**
 * Manages header view selection and on-demand trace header loading.
 * Handles debounced loading of trace headers as the user interacts with the trace slider.
 *
 * @param params - Hook parameters
 * @returns Header view state and control functions
 */
export function useTraceHeader(params: UseTraceHeaderParams) {
  const { segyData, filePath, maxSamples = MAX_TRACE_SAMPLES } = params;

  const setShowRevisionDialog = useAppStore(s => s.setShowRevisionDialog);

  const [headerView, setHeaderView] = useState<HeaderView>('binary');
  const [traceId, setTraceId] = useState<number>(1);
  const [sliderValue, setSliderValue] = useState<number>(1);
  const [currentTrace, setCurrentTrace] = useState<TraceHeader | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [currentRevision, setCurrentRevision] = useState<SegyRevision | null>(null);
  const [revisionKey, setRevisionKey] = useState(0);

  useEffect(() => {
    if (segyData) {
      setCurrentRevision(segyData.detected_revision as SegyRevision);
    } else {
      setCurrentRevision(null);
    }
  }, [segyData]);

  useEffect(() => {
    if (segyData && segyData.detected_revision === 'Unknown') {
      setShowRevisionDialog(true);
      toast('Revision detection failed. Choose Rev 0 or Rev 1 below.', {
        icon: '⚠️',
        duration: 8000,
      });
    }
  }, [segyData, setShowRevisionDialog]);

  const handleSetActiveRevision = useCallback(
    async (revision: SegyRevision) => {
      if (!filePath) return;
      try {
        await setActiveRevisionApi(filePath, revision);
        setCurrentRevision(revision);
        setRevisionKey(prev => prev + 1);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to set revision: ${errorMsg}`);
        console.error('setActiveRevision error:', error);
      }
    },
    [filePath]
  );

  const loadTrace = useCallback(
    async (traceIndex: number) => {
      if (!segyData || !filePath) return;

      setLoadingTrace(true);
      try {
        const trace = await loadSingleTrace({
          filePath,
          traceIndex: traceIndex - 1,
          maxSamples,
        });

        setCurrentTrace(trace.header);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to load trace header at index ${traceIndex}: ${errorMsg}`);
        console.error('Trace header loading error:', error);
      } finally {
        setLoadingTrace(false);
      }
    },
    [filePath, maxSamples, segyData]
  );

  useEffect(() => {
    // Debounce trace header fetches while the slider is moving.
    if (headerView === 'trace' && segyData) {
      const timeoutId = setTimeout(() => {
        if (sliderValue !== traceId) {
          setTraceId(sliderValue);
          loadTrace(sliderValue);
        }
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [sliderValue, headerView, segyData, traceId, loadTrace]);

  useEffect(() => {
    // Ensure the first trace header is loaded when entering trace mode.
    if (headerView === 'trace' && segyData && !currentTrace) {
      loadTrace(traceId);
    }
  }, [headerView, segyData, currentTrace, traceId, loadTrace]);

  const resetTraceState = useCallback(() => {
    setHeaderView('binary');
    setTraceId(1);
    setSliderValue(1);
    setCurrentTrace(null);
    setLoadingTrace(false);
    setRevisionKey(0);
  }, []);

  return {
    headerView,
    setHeaderView,
    sliderValue,
    setSliderValue,
    currentTrace,
    loadingTrace,
    resetTraceState,
    currentRevision,
    setActiveRevision: handleSetActiveRevision,
    revisionKey,
  };
}
