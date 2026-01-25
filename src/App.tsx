/**
 * Top-level UI shell that wires SEG-Y loading, header inspection, and trace rendering.
 * Keeps high-level app state (loading/errors) in sync with stores and commands.
 */
import { AppHeader } from '@/app/components/AppHeader';
import { SegyEmptyState } from '@/features/segy/components/SegyEmptyState';
import { SegyHeaderPanel } from '@/features/segy/components/SegyHeaderPanel';
import { SegyLoadingState } from '@/features/segy/components/SegyLoadingState';
import { useTraceHeader } from '@/features/segy/hooks/useTraceHeader';
import { TraceVisualizationContainer } from '@/features/trace-visualization/components/TraceVisualizationContainer';
import { loadSegyFile as loadSegyFileCommand } from '@/services/tauri/segy';
import { useSystemTheme } from '@/shared/hooks/useSystemTheme';
import { useAppStore } from '@/store/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { exit } from '@tauri-apps/plugin-process';
import toast, { Toaster } from 'react-hot-toast';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

/**
 * Main application component. Coordinates file selection, data loading, and layout.
 */
function App() {
  useSystemTheme();

  const {
    filePath,
    isDarkMode,
    isLoading,
    segyData,
    revisionOverride,
    setLoading,
    setSegyData,
    setFilePath,
    setError,
  } = useAppStore();

  const {
    headerView,
    setHeaderView,
    sliderValue,
    setSliderValue,
    currentTrace,
    loadingTrace,
    resetTraceState,
  } = useTraceHeader({ segyData, filePath, revisionOverride });

  /**
   * Load SEG-Y metadata from the backend and refresh trace state + notifications.
   */
  const loadSegyData = async (path: string) => {
    setLoading(true);
    setError(null);
    toast.loading('Loading SEG-Y file...', { id: 'loading' });

    try {
      const data = await loadSegyFileCommand(path);

      setSegyData(data);
      resetTraceState();

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

  /**
   * Open a native file picker and trigger data load for the chosen file.
   */
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
        await loadSegyData(selected);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      toast.error(`Failed to open file: ${errorMsg}`);
      console.error(error);
    }
  };

  /**
   * Exit the Tauri process with a user-facing fallback if the call fails.
   */
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
      className={`app-shell flex h-screen flex-col ${isDarkMode ? 'theme-dark' : 'theme-light'}`}
    >
      <Toaster position="top-right" />

      <AppHeader onFileSelect={handleFileSelect} onExit={handleExit} />

      <main className="app-main">
        {isLoading && <SegyLoadingState />}

        {!isLoading && !segyData && <SegyEmptyState onFileSelect={handleFileSelect} />}

        {!isLoading && segyData && (
          <div className="panel-frame flex-1">
            <PanelGroup orientation="horizontal" className="h-full w-full">
              <Panel id="header-panel" defaultSize="37%" minSize="10%" maxSize="45%">
                <SegyHeaderPanel
                  segyData={segyData}
                  headerView={headerView}
                  onHeaderViewChange={setHeaderView}
                  sliderValue={sliderValue}
                  onSliderChange={setSliderValue}
                  currentTrace={currentTrace}
                  loadingTrace={loadingTrace}
                  revisionOverride={revisionOverride}
                />
              </Panel>

              <PanelResizeHandle className="panel-resize w-1.5 cursor-col-resize transition-transform hover:scale-x-125" />

              <Panel id="visualization-panel" defaultSize="63%" minSize="40%">
                <TraceVisualizationContainer />
              </Panel>
            </PanelGroup>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
