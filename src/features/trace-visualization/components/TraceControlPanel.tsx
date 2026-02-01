/**
 * Control panel for trace visualization settings (render mode, colormap, scaling).
 */
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import React, { useEffect, useRef } from 'react';
import { useTraceLoader } from '../hooks/useTraceLoader';

/**
 * UI controls for rendering and viewport settings.
 */
export const TraceControlPanel: React.FC = () => {
  const {
    renderMode,
    colormap,
    amplitudeScaling,
    viewport,
    setRenderMode,
    setColormap,
    setAmplitudeScaling,
    updateViewport,
  } = useTraceVisualizationStore();

  const { loadAndRenderVariableDensity } = useTraceLoader();

  // Auto-render with debouncing
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasRenderedOnce = useRef(false);

  useEffect(() => {
    // If it's the first render and the viewport dimensions are still the default ones (800x600),
    // wait for TraceVisualizationContainer to measure the actual container size.
    // We check if it's 800x600 because that's our placeholder default.
    if (!hasRenderedOnce.current && viewport.width === 800 && viewport.height === 600) {
      return;
    }

    // Clear existing timeout
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    // Always debounce renders to avoid double-render on initial resize/measure.
    const delay = hasRenderedOnce.current ? 600 : 250;
    if (!hasRenderedOnce.current) {
      hasRenderedOnce.current = true;
    }

    renderTimeoutRef.current = setTimeout(() => {
      loadAndRenderVariableDensity();
    }, delay);

    // Cleanup on unmount
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [renderMode, colormap, amplitudeScaling, viewport, loadAndRenderVariableDensity]);

  /**
   * Human-readable label for the current amplitude scaling mode.
   */
  const getScalingLabel = () => {
    switch (amplitudeScaling.type) {
      case 'per-trace':
        return 'Per-Trace AGC';
      case 'percentile':
        return `Percentile (${(amplitudeScaling.percentile * 100).toFixed(0)}%)`;
      case 'manual':
        return `Manual (${amplitudeScaling.scale}x)`;
      case 'global':
        return 'Global';
      default:
        return 'Unknown';
    }
  };

  const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.24em] text-text-dim';
  const surfaceClass =
    'rounded-[var(--radius-sm)] border border-border bg-panel-muted px-2.5 py-1.5 text-[12px] text-text transition duration-200 focus:outline-none focus:border-transparent focus:shadow-[0_0_0_2px_var(--accent-focus)] motion-reduce:transition-none';
  const stepperButtonClass =
    'flex h-[22px] w-[22px] items-center justify-center rounded-full border border-border bg-panel-strong text-text transition duration-200 ease-out hover:-translate-y-px hover:border-transparent hover:bg-[linear-gradient(130deg,var(--accent),var(--accent-3))] hover:text-accent-ink active:translate-y-0 motion-reduce:transition-none';

  return (
    <div className="text-text">
      {/* Compact Header Bar */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3">
        {/* Render Mode */}
        <div className="flex items-center gap-2">
          <label className={labelClass}>Mode</label>
          <select
            value={renderMode}
            onChange={e =>
              setRenderMode(
                e.target.value as 'variable-density' | 'wiggle' | 'wiggle-variable-density'
              )
            }
            className={surfaceClass}
          >
            <option value="variable-density">Variable Density</option>
            <option value="wiggle">Wiggle</option>
            <option value="wiggle-variable-density">Wiggle + VD</option>
          </select>
        </div>

        {/* Colormap */}
        <div className="flex items-center gap-2">
          <label className={labelClass}>Colormap</label>
          <select
            value={colormap}
            onChange={e =>
              setColormap(
                e.target.value as 'seismic' | 'grayscale' | 'grayscale-inverted' | 'viridis'
              )
            }
            className={surfaceClass}
          >
            <option value="seismic">Seismic</option>
            <option value="grayscale">Grayscale</option>
            <option value="grayscale-inverted">Gray (Inv)</option>
            <option value="viridis">Viridis</option>
          </select>
        </div>

        {/* Amplitude Scaling */}
        <div className="flex items-center gap-2">
          <label className={labelClass}>Scaling</label>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className={`${surfaceClass} flex items-center gap-2`}
                title="Click to configure scaling"
              >
                <span>{getScalingLabel()}</span>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </DialogTrigger>
            <DialogContent className="w-96 max-w-full">
              <DialogHeader>
                <DialogTitle className="text-base font-extrabold uppercase tracking-[0.2em] text-text">
                  Amplitude Scaling
                </DialogTitle>
                <DialogDescription className="text-xs text-text-dim">
                  Tune how amplitudes are normalized before rendering.
                </DialogDescription>
              </DialogHeader>

              {/* Type Selector */}
              <div className="mb-4 mt-5">
                <label className={`mb-2 block ${labelClass}`}>Scaling Type</label>
                <select
                  value={amplitudeScaling.type}
                  onChange={e => {
                    const type = e.target.value;
                    if (type === 'per-trace') {
                      setAmplitudeScaling({ type: 'per-trace' });
                    } else if (type === 'percentile') {
                      setAmplitudeScaling({ type: 'percentile', percentile: 0.98 });
                    } else if (type === 'manual') {
                      setAmplitudeScaling({ type: 'manual', scale: 1.0 });
                    }
                  }}
                  className={`${surfaceClass} w-full`}
                >
                  <option value="per-trace">Per-Trace AGC</option>
                  <option value="percentile">Percentile Clipping</option>
                  <option value="manual">Manual Scale</option>
                </select>
              </div>

              {/* Per-Trace AGC Settings */}
              {amplitudeScaling.type === 'per-trace' && (
                <div className="mb-4">
                  <label className={`mb-2 block ${labelClass}`}>AGC Window (samples)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={amplitudeScaling.windowSize || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setAmplitudeScaling({
                        type: 'per-trace',
                        windowSize: val ? parseInt(val) : undefined,
                      });
                    }}
                    placeholder="None (full trace)"
                    className={`${surfaceClass} w-full`}
                  />
                  <p className="mt-1 text-xs text-text-dim">Leave empty for full-trace AGC.</p>
                </div>
              )}

              {/* Percentile Settings */}
              {amplitudeScaling.type === 'percentile' && (
                <div className="mb-4">
                  <label className={`mb-2 block ${labelClass}`}>
                    Percentile: {(amplitudeScaling.percentile * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.01"
                    value={amplitudeScaling.percentile}
                    onChange={e =>
                      setAmplitudeScaling({
                        type: 'percentile',
                        percentile: parseFloat(e.target.value),
                      })
                    }
                    className="range-slider h-1 w-full accent-accent"
                  />
                  <div className="mt-1 flex justify-between text-xs text-text-dim">
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

              {/* Manual Scale Settings */}
              {amplitudeScaling.type === 'manual' && (
                <div className="mb-4">
                  <label className={`mb-2 block ${labelClass}`}>Scale Factor</label>
                  <input
                    type="number"
                    step="0.1"
                    value={amplitudeScaling.scale}
                    onChange={e =>
                      setAmplitudeScaling({ type: 'manual', scale: parseFloat(e.target.value) })
                    }
                    className={`${surfaceClass} w-full`}
                  />
                </div>
              )}

              <DialogClose asChild>
                <Button className="w-full text-sm">Done</Button>
              </DialogClose>
            </DialogContent>
          </Dialog>
        </div>

        {/* Trace Range - Custom Stepper Controls */}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className={labelClass}>Start</label>

          {/* Start Trace Stepper */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateViewport({ startTrace: Math.max(0, viewport.startTrace - 1) })}
              className={`${stepperButtonClass} text-xs font-bold`}
            >
              ←
            </button>
            <input
              type="text"
              value={viewport.startTrace}
              onChange={e => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) updateViewport({ startTrace: Math.max(0, val) });
              }}
              className={`${surfaceClass} w-16 text-center font-mono`}
            />
            <button
              type="button"
              onClick={() => updateViewport({ startTrace: viewport.startTrace + 1 })}
              className={`${stepperButtonClass} text-xs font-bold`}
            >
              →
            </button>
          </div>

          <label className={labelClass}>Count</label>

          {/* Trace Count Stepper */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateViewport({ traceCount: Math.max(1, viewport.traceCount - 1) })}
              className={`${stepperButtonClass} text-xs font-bold`}
            >
              ←
            </button>
            <input
              type="text"
              value={viewport.traceCount}
              onChange={e => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) updateViewport({ traceCount: Math.max(1, val) });
              }}
              className={`${surfaceClass} w-16 text-center font-mono`}
            />
            <button
              type="button"
              onClick={() => updateViewport({ traceCount: viewport.traceCount + 1 })}
              className={`${stepperButtonClass} text-xs font-bold`}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
