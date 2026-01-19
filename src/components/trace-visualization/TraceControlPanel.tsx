import { useAppStore } from '@/store.ts';
import { useTraceVisualizationStore } from '@/store/traceVisualizationStore.ts';
import React, { useEffect, useRef, useState } from 'react';
import { useTraceLoader } from './hooks/useTraceLoader';

export const TraceControlPanel: React.FC = () => {
  const { isDarkMode } = useAppStore();
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
  const [showScalingSettings, setShowScalingSettings] = useState(false);

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

    // On first render (after dimensions are set), trigger with small delay
    if (!hasRenderedOnce.current) {
      hasRenderedOnce.current = true;
      // We don't use setTimeout here to avoid race conditions with debounced renders
      // and to ensure we "consume" this change.
      loadAndRenderVariableDensity();
      return;
    }

    // Clear existing timeout
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    // Set new timeout for debounced render
    renderTimeoutRef.current = setTimeout(() => {
      loadAndRenderVariableDensity();
    }, 600); // Increased debounce to 600ms to better capture window resize events

    // Cleanup on unmount
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [renderMode, colormap, amplitudeScaling, viewport, loadAndRenderVariableDensity]);

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

  return (
    <div className={`${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Compact Header Bar */}
      <div
        className={`flex items-center gap-3 px-4 py-2 ${isDarkMode ? 'bg-gray-950' : 'bg-gray-50'}`}
      >
        {/* Render Mode */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold whitespace-nowrap">Mode:</label>
          <select
            value={renderMode}
            onChange={e =>
              setRenderMode(
                e.target.value as 'variable-density' | 'wiggle' | 'wiggle-variable-density'
              )
            }
            className={`px-2 py-1 text-xs border ${
              isDarkMode
                ? 'bg-gray-800 border-gray-700 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="variable-density">Variable Density</option>
            <option value="wiggle">Wiggle</option>
            <option value="wiggle-variable-density">Wiggle + VD</option>
          </select>
        </div>

        {/* Colormap */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold whitespace-nowrap">Colormap:</label>
          <select
            value={colormap}
            onChange={e =>
              setColormap(
                e.target.value as 'seismic' | 'grayscale' | 'grayscale-inverted' | 'viridis'
              )
            }
            className={`px-2 py-1 text-xs border ${
              isDarkMode
                ? 'bg-gray-800 border-gray-700 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="seismic">Seismic</option>
            <option value="grayscale">Grayscale</option>
            <option value="grayscale-inverted">Gray (Inv)</option>
            <option value="viridis">Viridis</option>
          </select>
        </div>

        {/* Amplitude Scaling */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold whitespace-nowrap">Scaling:</label>
          <button
            onClick={() => setShowScalingSettings(!showScalingSettings)}
            className={`px-2 py-1 text-xs border flex items-center gap-1.5 ${
              isDarkMode
                ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-750'
                : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'
            }`}
            title="Click to configure scaling"
          >
            <span>{getScalingLabel()}</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        </div>

        {/* Trace Range - Custom Stepper Controls */}
        <div className="flex items-center gap-3 ml-auto">
          <label className="text-xs font-semibold whitespace-nowrap">Start:</label>

          {/* Start Trace Stepper */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateViewport({ startTrace: Math.max(0, viewport.startTrace - 1) })}
              className={`w-5 h-5 flex items-center justify-center text-xs font-bold transition-colors ${
                isDarkMode
                  ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
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
              className={`w-14 px-2 py-1 text-xs text-center font-mono border-0 ${
                isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
              } focus:outline-none focus:ring-1 ${
                isDarkMode ? 'focus:ring-blue-500' : 'focus:ring-blue-400'
              }`}
            />
            <button
              onClick={() => updateViewport({ startTrace: viewport.startTrace + 1 })}
              className={`w-5 h-5 flex items-center justify-center text-xs font-bold transition-colors ${
                isDarkMode
                  ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              →
            </button>
          </div>

          <label className="text-xs font-semibold whitespace-nowrap">Count:</label>

          {/* Trace Count Stepper */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateViewport({ traceCount: Math.max(1, viewport.traceCount - 1) })}
              className={`w-5 h-5 flex items-center justify-center text-xs font-bold transition-colors ${
                isDarkMode
                  ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
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
              className={`w-14 px-2 py-1 text-xs text-center font-mono border-0 ${
                isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
              } focus:outline-none focus:ring-1 ${
                isDarkMode ? 'focus:ring-blue-500' : 'focus:ring-blue-400'
              }`}
            />
            <button
              onClick={() => updateViewport({ traceCount: viewport.traceCount + 1 })}
              className={`w-5 h-5 flex items-center justify-center text-xs font-bold transition-colors ${
                isDarkMode
                  ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showScalingSettings && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowScalingSettings(false)}
        >
          <div
            className={`w-96 max-w-full mx-4 p-6 rounded-lg shadow-xl ${
              isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Amplitude Scaling Settings</h3>

            {/* Type Selector */}
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-2">Scaling Type</label>
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
                className={`w-full px-3 py-2 text-sm border rounded ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="per-trace">Per-Trace AGC</option>
                <option value="percentile">Percentile Clipping</option>
                <option value="manual">Manual Scale</option>
              </select>
            </div>

            {/* Per-Trace AGC Settings */}
            {amplitudeScaling.type === 'per-trace' && (
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-2">
                  AGC Window Size (samples)
                </label>
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
                  className={`w-full px-3 py-2 text-sm border rounded ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty for full-trace AGC</p>
              </div>
            )}

            {/* Percentile Settings */}
            {amplitudeScaling.type === 'percentile' && (
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-2">
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
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            )}

            {/* Manual Scale Settings */}
            {amplitudeScaling.type === 'manual' && (
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-2">Scale Factor</label>
                <input
                  type="number"
                  step="0.1"
                  value={amplitudeScaling.scale}
                  onChange={e =>
                    setAmplitudeScaling({ type: 'manual', scale: parseFloat(e.target.value) })
                  }
                  className={`w-full px-3 py-2 text-sm border rounded ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={() => setShowScalingSettings(false)}
              className={`w-full px-4 py-2 text-sm font-semibold rounded transition-colors ${
                isDarkMode
                  ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
