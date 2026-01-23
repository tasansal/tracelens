/**
 * Hook for managing SEG-Y header view state and trace header loading.
 */
import type { SegyData, TraceHeader } from '@/features/segy/types/segy';
import { loadSingleTrace } from '@/services/tauri/segy';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MAX_TRACE_SAMPLES } from '../constants';

/**
 * Supported header tabs in the SEG-Y header panel.
 */
export type HeaderView = 'textual' | 'binary' | 'trace';

/**
 * Manage header view selection and on-demand trace header loading.
 * @param params.segyData Parsed SEG-Y metadata (or null while idle).
 * @param params.filePath Path to the loaded SEG-Y file.
 * @param params.maxSamples Optional cap for trace samples when fetching headers.
 */
export function useTraceHeader(params: {
  segyData: SegyData | null;
  filePath: string | null;
  maxSamples?: number;
}) {
  const { segyData, filePath, maxSamples = MAX_TRACE_SAMPLES } = params;

  const [headerView, setHeaderView] = useState<HeaderView>('binary');
  const [traceId, setTraceId] = useState<number>(1);
  const [sliderValue, setSliderValue] = useState<number>(1);
  const [currentTrace, setCurrentTrace] = useState<TraceHeader | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);

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
        toast.error(`Failed to load trace: ${errorMsg}`);
        console.error(error);
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
  }, []);

  return {
    headerView,
    setHeaderView,
    sliderValue,
    setSliderValue,
    currentTrace,
    loadingTrace,
    resetTraceState,
  };
}
