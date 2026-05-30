/**
 * Hook for managing SEG-Y header view state and trace header loading.
 */
import type { SegyData } from '@/features/segy/types/segy';
import {
  setActiveRevision as setActiveRevisionApi,
  type SegyRevision,
} from '@/shared/api/tauri/segy';
import { useAppStore } from '@/shared/store/appStore';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

/**
 * Supported header tabs in the SEG-Y header panel.
 */
export type HeaderView = 'text' | 'binary' | 'trace' | 'schema';

/**
 * Parameters for the useTraceHeader hook.
 */
interface UseTraceHeaderParams {
  /** Parsed SEG-Y metadata (or null while idle) */
  segyData: SegyData | null;
  /** Path to the loaded SEG-Y file */
  filePath: string | null;
}

/**
 * Manages header view selection and on-demand trace header loading.
 * Handles debounced loading of trace headers as the user interacts with the trace slider.
 *
 * @param params - Hook parameters
 * @returns Header view state and control functions
 */
export function useTraceHeader(params: UseTraceHeaderParams) {
  const { segyData, filePath } = params;

  const setShowRevisionDialog = useAppStore(s => s.setShowRevisionDialog);

  const [headerView, setHeaderView] = useState<HeaderView>('binary');
  const [traceId, setTraceId] = useState<number>(1);
  const [sliderValue, setSliderValue] = useState<number>(1);
  const [revisionKey, setRevisionKey] = useState(0);

  // Reset currentRevision whenever segyData changes (render-time update).
  const [currentRevision, setCurrentRevision] = useState<SegyRevision | null>(
    () => (segyData?.detected_revision as SegyRevision) ?? null
  );
  const [prevSegyData, setPrevSegyData] = useState(segyData);
  if (prevSegyData !== segyData) {
    setPrevSegyData(segyData);
    setCurrentRevision((segyData?.detected_revision as SegyRevision) ?? null);
  }

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

  // Subscribe to traceJump so setState fires in a callback, not synchronously in an effect.
  // useState setters are stable references, so this effect only runs once.
  useEffect(() => {
    return useAppStore.subscribe((state, prev) => {
      if (state.traceJump === null || state.traceJump === prev.traceJump) return;
      const jump = state.traceJump;
      setSliderValue(jump);
      setTraceId(jump);
      setHeaderView('trace');
      state.setTraceJump(null);
    });
  }, [setSliderValue, setTraceId, setHeaderView]);

  // Debounce traceId updates while the slider is moving.
  useEffect(() => {
    if (headerView !== 'trace' || !segyData) return;
    const timeoutId = setTimeout(() => setTraceId(sliderValue), 300);
    return () => clearTimeout(timeoutId);
  }, [sliderValue, headerView, segyData]);

  const resetTraceState = useCallback(() => {
    setHeaderView('binary');
    setTraceId(1);
    setSliderValue(1);
    setRevisionKey(0);
  }, []);

  return {
    headerView,
    setHeaderView,
    sliderValue,
    setSliderValue,
    traceId,
    resetTraceState,
    currentRevision,
    setActiveRevision: handleSetActiveRevision,
    revisionKey,
  };
}
