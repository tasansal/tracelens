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
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { exit } from '@tauri-apps/plugin-process';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [isDragActive, setIsDragActive] = useState(false);
  const isLoadingRef = useRef(isLoading);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  /**
   * Load SEG-Y metadata from the backend and refresh trace state + notifications.
   */
  const loadSegyData = useCallback(
    async (path: string) => {
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
    },
    [resetTraceState, setError, setLoading, setSegyData]
  );

  const handleFileLoad = useCallback(
    async (path: string) => {
      setFilePath(path);
      await loadSegyData(path);
    },
    [loadSegyData, setFilePath]
  );

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
        await handleFileLoad(selected);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      toast.error(`Failed to open file: ${errorMsg}`);
      console.error(error);
    }
  };

  /**
   * Listen for file drops on the window and load valid SEG-Y files.
   */
  useEffect(() => {
    if (segyData) {
      return;
    }

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const setupFileDropListener = async () => {
      try {
        unlisten = await getCurrentWindow().onDragDropEvent(async event => {
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            setIsDragActive(true);
            return;
          }

          if (event.payload.type === 'leave') {
            setIsDragActive(false);
            return;
          }

          if (event.payload.type !== 'drop') {
            return;
          }

          setIsDragActive(false);

          const [droppedPath] = event.payload.paths ?? [];
          if (!droppedPath) {
            return;
          }

          if (isLoadingRef.current) {
            toast.error('A file is already loading. Please wait.');
            return;
          }

          const lowerPath = droppedPath.toLowerCase();
          if (!lowerPath.endsWith('.segy') && !lowerPath.endsWith('.sgy')) {
            const errorMsg = 'Unsupported file type. Drop a .segy or .sgy file.';
            setError(errorMsg);
            toast.error(errorMsg);
            return;
          }

          await handleFileLoad(droppedPath);
        });

        if (cancelled && unlisten) {
          unlisten();
        }
      } catch (error) {
        console.error('Failed to register file drop listener', error);
      }
    };

    void setupFileDropListener();

    return () => {
      cancelled = true;
      setIsDragActive(false);
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleFileLoad, segyData, setError]);

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
    <div className="app-shell flex h-screen flex-col">
      <Toaster position="top-right" />

      <AppHeader onFileSelect={handleFileSelect} onExit={handleExit} />

      <main className="app-main">
        {isLoading && <SegyLoadingState />}

        {!isLoading && !segyData && (
          <SegyEmptyState onFileSelect={handleFileSelect} isDragActive={isDragActive} />
        )}

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
