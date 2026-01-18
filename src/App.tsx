import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { exit } from '@tauri-apps/plugin-process';
import React from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { BinaryHeaderTable } from './components/BinaryHeaderTable';
import { Header } from './components/layout/Header';
import { LoadingSpinner } from './components/LoadingSpinner';
import { TraceHeaderTable } from './components/TraceHeaderTable';
import { useAppStore } from './store';
import { DataSampleFormat, getDataSampleFormatCode, SegyData } from './types/segy';

type HeaderView = 'textual' | 'binary' | 'trace';

function App() {
  const { isDarkMode, isLoading, segyData, setLoading, setSegyData, setFilePath, setError } =
    useAppStore();

  const [headerView, setHeaderView] = React.useState<HeaderView>('binary');
  const [traceId, setTraceId] = React.useState<number>(1);
  const [sliderValue, setSliderValue] = React.useState<number>(1);
  const [currentTrace, setCurrentTrace] = React.useState<{
    header: Record<string, unknown>;
  } | null>(null);
  const [loadingTrace, setLoadingTrace] = React.useState(false);

  const maxSamples = 2000;

  // Listen for OS theme changes
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      useAppStore.setState({ isDarkMode: e.matches });
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'SEG-Y Files',
            extensions: ['segy', 'sgy'],
          },
        ],
      });

      if (selected) {
        setFilePath(selected);
        await loadSegyFile(selected);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      toast.error(`Failed to open file: ${errorMsg}`);
      console.error(error);
    }
  };

  const loadSegyFile = async (filePath: string) => {
    setLoading(true);
    setError(null);
    toast.loading('Loading SEG-Y file...', { id: 'loading' });

    try {
      const data = await invoke<SegyData>('load_segy_file', {
        filePath,
      });

      setSegyData(data);
      setHeaderView('binary');
      setTraceId(1);
      setSliderValue(1);
      setCurrentTrace(null);

      toast.success(
        `Loaded file with ${data.total_traces || '?'} traces (${(data.file_size / 1024 / 1024).toFixed(2)} MB)`,
        { id: 'loading' }
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      toast.error(`Failed to load SEG-Y: ${errorMsg}`, { id: 'loading' });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrace = React.useCallback(
    async (traceIndex: number) => {
      if (!segyData || !useAppStore.getState().filePath) return;

      setLoadingTrace(true);
      try {
        const trace = await invoke<{ header: Record<string, unknown> }>('load_single_trace', {
          filePath: useAppStore.getState().filePath,
          traceIndex: traceIndex - 1, // Convert to zero-based
          samplesPerTrace: segyData.binary_header.samples_per_trace,
          dataSampleFormat: getDataSampleFormatCode(
            segyData.binary_header.data_sample_format as DataSampleFormat
          ),
          byteOrder: segyData.byte_order,
          maxSamples,
        });
        // Only update if this is still the trace we want (user might have moved slider again)
        setCurrentTrace(trace);
        setLoadingTrace(false);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to load trace: ${errorMsg}`);
        console.error(error);
        setLoadingTrace(false);
      }
    },
    [segyData, maxSamples]
  );

  // Debounced trace loading - only load after user stops dragging slider
  React.useEffect(() => {
    if (headerView === 'trace' && segyData) {
      const timeoutId = setTimeout(() => {
        if (sliderValue !== traceId) {
          setTraceId(sliderValue);
          loadTrace(sliderValue);
        }
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    }
  }, [sliderValue, headerView, segyData, traceId, loadTrace]);

  // Load trace immediately when switching to trace view
  React.useEffect(() => {
    if (headerView === 'trace' && segyData && !currentTrace) {
      loadTrace(traceId);
    }
  }, [headerView, segyData, currentTrace, traceId, loadTrace]);

  const handleExit = async () => {
    try {
      await exit(0);
    } catch (error) {
      console.error('Failed to exit:', error);
      toast.error('Failed to exit application');
    }
  };

  return (
    <div
      className={`flex h-screen flex-col ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}
    >
      <Toaster position="top-right" />

      <Header onFileSelect={handleFileSelect} onExit={handleExit} />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <section
          className={`border-b px-6 py-4 ${isDarkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white'}`}
        >
          <div className="flex items-center gap-4">
            {!segyData && (
              <button
                onClick={handleFileSelect}
                disabled={isLoading}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300'
                }`}
              >
                {isLoading ? 'Loading...' : 'Open SEG-Y'}
              </button>
            )}

            {/* File Info placeholder for spacing if needed */}
            <div className="flex-1"></div>
          </div>

          {/* Header View Toggle */}
          {segyData && !isLoading && (
            <div className="mt-4 flex items-center gap-2">
              <div className="flex gap-1">
                {(['textual', 'binary', 'trace'] as HeaderView[]).map(view => (
                  <button
                    key={view}
                    onClick={() => setHeaderView(view)}
                    className={`px-4 py-2 text-xs font-medium tracking-wider uppercase transition-colors ${
                      headerView === view
                        ? isDarkMode
                          ? 'border-b-2 border-blue-500 bg-gray-800 text-white'
                          : 'border-b-2 border-blue-600 bg-white text-gray-900'
                        : isDarkMode
                          ? 'text-gray-500 hover:text-gray-300'
                          : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {view}
                  </button>
                ))}
              </div>

              {/* Trace ID Slider */}
              {headerView === 'trace' && segyData.total_traces && (
                <div className="ml-4 flex max-w-xl flex-1 items-center gap-4">
                  <input
                    type="range"
                    min={1}
                    max={segyData.total_traces}
                    value={sliderValue}
                    onChange={e => setSliderValue(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span
                    className={`min-w-[120px] font-mono text-xs whitespace-nowrap ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    {sliderValue} / {segyData.total_traces}
                  </span>
                  <div
                    className={`flex h-4 w-4 items-center justify-center ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}
                  >
                    {loadingTrace && (
                      <svg
                        className="h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {isLoading && <LoadingSpinner />}

        {/* Main Content */}
        {!isLoading && segyData && (
          <div className="flex-1 overflow-hidden">
            {headerView === 'textual' && (
              <div className={`flex h-full flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                <div
                  className={`border-b px-4 py-3 ${isDarkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}
                >
                  <h2
                    className={`text-sm font-semibold tracking-tight ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}
                  >
                    TEXTUAL FILE HEADER
                  </h2>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <pre
                    className={`font-mono text-xs leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}
                  >
                    {segyData.textual_header.lines.join('\n')}
                  </pre>
                </div>
              </div>
            )}

            {headerView === 'binary' && <BinaryHeaderTable header={segyData.binary_header} />}

            {headerView === 'trace' &&
              (currentTrace ? (
                <div
                  className={`h-full ${loadingTrace ? 'opacity-60' : ''} transition-opacity duration-150`}
                >
                  <TraceHeaderTable header={currentTrace.header} traceId={sliderValue} />
                </div>
              ) : (
                <div
                  className={`flex flex-1 items-center justify-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
                >
                  {loadingTrace ? (
                    <LoadingSpinner />
                  ) : (
                    <p className="text-sm">Select a trace to view its header</p>
                  )}
                </div>
              ))}
          </div>
        )}

        {!isLoading && !segyData && (
          <div
            className={`flex flex-1 items-center justify-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
          >
            <div className="text-center">
              <p className="text-sm font-medium">No file loaded</p>
              <p className="mt-1 text-xs">Open a SEG-Y file to begin</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
