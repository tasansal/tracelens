/**
 * Control panel for trace visualization settings (render mode, colormap, scaling).
 */
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { scanAmplitudeRange } from '@/shared/api/tauri/segy';
import { useAppStore } from '@/shared/store/appStore';
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
import { useState } from 'react';

/**
 * UI controls for rendering and viewport settings.
 * Provides controls for render mode, colormap, amplitude scaling, and trace range.
 * Auto-renders visualization with debouncing when settings change.
 *
 * @returns Control panel component with settings UI
 */
export const TraceControlPanel = () => {
  const {
    renderMode,
    colormap,
    amplitudeScaling,
    amplitudeStats,
    setRenderMode,
    setColormap,
    setAmplitudeScaling,
    setAmplitudeStats,
  } = useTraceVisualizationStore();

  const { segyData, filePath } = useAppStore();

  // Local state for percentile slider and dB gain input
  const [percentile, setPercentile] = useState(0.99);
  const [gainDb, setGainDb] = useState(-6);
  const [isScanning, setIsScanning] = useState(false);

  // Get total traces from loaded file
  const totalTraces = segyData?.total_traces ?? 0;
  const maxAmp = amplitudeStats?.maxAmplitude ?? 1.0;
  const gainFactor = Math.pow(10, gainDb / 20);
  const appliedClipValue = maxAmp * gainFactor;

  /**
   * Human-readable label for the current amplitude scaling mode.
   */
  const getScalingLabel = () => {
    switch (amplitudeScaling.type) {
      case 'global-percentile':
        return `Percentile (${(percentile * 100).toFixed(0)}%)`;
      case 'global-fixed':
        return `Fixed (${gainDb >= 0 ? '+' : ''}${gainDb} dB)`;
      case 'agc':
        return amplitudeScaling.windowSize ? `AGC (${amplitudeScaling.windowSize})` : 'AGC (full)';
      default:
        return 'Unknown';
    }
  };

  /**
   * Re-scan amplitude range at the given percentile and apply global-percentile scaling.
   */
  const handlePercentileChange = async (newPercentile: number) => {
    setPercentile(newPercentile);
    if (!filePath) return;

    setIsScanning(true);
    try {
      const stats = await scanAmplitudeRange(filePath, newPercentile);
      setAmplitudeStats(stats);
      setAmplitudeScaling({ type: 'global-percentile', clipValue: stats.percentileClip });
    } catch (err) {
      console.warn('Amplitude scan failed:', err);
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Compute the clip value for global-fixed mode from max amplitude and dB gain.
   * clip = maxAmplitude * 10^(gainDb / 20)
   */
  const handleGainDbChange = (newGainDb: number) => {
    setGainDb(newGainDb);
    const clipValue = maxAmp * Math.pow(10, newGainDb / 20);
    setAmplitudeScaling({ type: 'global-fixed', clipValue });
  };

  const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.24em] text-text-dim';
  const surfaceClass =
    'rounded-[var(--radius-sm)] border border-border bg-panel-muted px-2.5 py-1.5 text-[12px] text-text transition duration-200 focus:outline-none focus:border-transparent focus:shadow-[0_0_0_2px_var(--accent-focus)] motion-reduce:transition-none';

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
                    if (type === 'global-percentile') {
                      // Re-scan with current percentile
                      handlePercentileChange(percentile);
                    } else if (type === 'global-fixed') {
                      handleGainDbChange(gainDb);
                    } else if (type === 'agc') {
                      setAmplitudeScaling({ type: 'agc' });
                    }
                  }}
                  className={`${surfaceClass} w-full`}
                >
                  <option value="global-percentile">Global Percentile</option>
                  <option value="global-fixed">Global Fixed (dB Gain)</option>
                  <option value="agc">AGC</option>
                </select>
              </div>

              {/* Global Percentile Settings */}
              {amplitudeScaling.type === 'global-percentile' && (
                <div className="mb-4">
                  <label className={`mb-2 block ${labelClass}`}>
                    Percentile: {(percentile * 100).toFixed(0)}%{isScanning && ' (scanning…)'}
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.01"
                    value={percentile}
                    onChange={e => handlePercentileChange(parseFloat(e.target.value))}
                    disabled={isScanning}
                    className="range-slider h-1 w-full accent-accent"
                  />
                  <div className="mt-1 flex justify-between text-xs text-text-dim">
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

              {/* Global Fixed Settings */}
              {amplitudeScaling.type === 'global-fixed' && (
                <div className="mb-4">
                  <label className={`mb-2 block ${labelClass}`}>
                    Gain: {gainDb >= 0 ? '+' : ''}
                    {gainDb} dB
                  </label>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    step="1"
                    value={gainDb}
                    onChange={e => handleGainDbChange(parseInt(e.target.value))}
                    className="range-slider h-1 w-full accent-accent"
                  />
                  <div className="mt-1 flex justify-between text-xs text-text-dim">
                    <span>-40 dB</span>
                    <span>+40 dB</span>
                  </div>
                  {amplitudeStats && (
                    <div className="mt-1 space-y-0.5 text-xs text-text-dim">
                      <p>Max amplitude: {maxAmp.toExponential(2)}</p>
                      <p>
                        After gain: {appliedClipValue.toExponential(2)} ({gainFactor.toFixed(3)}x)
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* AGC Settings */}
              {amplitudeScaling.type === 'agc' && (
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
                        type: 'agc',
                        windowSize: val ? parseInt(val) : undefined,
                      });
                    }}
                    placeholder="None (full trace)"
                    className={`${surfaceClass} w-full`}
                  />
                  <p className="mt-1 text-xs text-text-dim">Leave empty for full-trace AGC.</p>
                </div>
              )}

              <DialogClose asChild>
                <Button className="w-full text-sm">Done</Button>
              </DialogClose>
            </DialogContent>
          </Dialog>
        </div>

        {/* Trace Info */}
        <div className="ml-auto flex items-center gap-2">
          <label className={labelClass}>Traces</label>
          <span className={`${surfaceClass} font-mono`}>{totalTraces.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};
