/**
 * Top-level UI shell that wires SEG-Y loading, header inspection, and trace rendering.
 * Keeps high-level app state (loading/errors) in sync with stores and commands.
 */
import { AppHeader } from '@/app/components/AppHeader';
import { useDensity } from '@/app/hooks/useDensity';
import { useSystemTheme } from '@/app/hooks/useSystemTheme';
import { UriInputDialog } from '@/features/file/components/UriInputDialog';
import { RevisionDetectionDialog } from '@/features/segy/components/RevisionDetectionDialog';
import { SegyEmptyState } from '@/features/segy/components/SegyEmptyState';
import { SegyHeaderPanel } from '@/features/segy/components/SegyHeaderPanel';
import { SegyLoadingState } from '@/features/segy/components/SegyLoadingState';
import { useTraceHeader } from '@/features/segy/hooks/useTraceHeader';
import { TraceVisualizationContainer } from '@/features/trace-visualization/components/TraceVisualizationContainer';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { takeOpenedFile } from '@/shared/api/tauri/desktop';
import { getErrorMessage, parseBackendError } from '@/shared/api/tauri/error';
import {
  loadSegyFile as loadSegyFileCommand,
  scanAmplitudeRange,
  type SegyRevision,
} from '@/shared/api/tauri/segy';
import { getAppSettings, openSettingsWindow, type AppSettings } from '@/shared/api/tauri/settings';
import { useAppStore } from '@/shared/store/appStore';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { checkForUpdates } from '@/shared/update/checkForUpdates';
import { isTauri } from '@/shared/utils/tauri';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { exit } from '@tauri-apps/plugin-process';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

const AUTH_FAILURE_RE =
  /(authentication|authorization|forbidden|unauthorized|status code: 40[13]|signature|sas)/i;

const formatLoadError = (error: unknown, uri: string): string => {
  const parsed = parseBackendError(error);
  const message = parsed?.message ?? getErrorMessage(error);

  const isAzureUri =
    uri.startsWith('az://') || uri.startsWith('azure://') || uri.includes('.blob.core.windows.net');

  // Typed IoError errors get a stricter match; untyped errors fall back to regex alone.
  const looksLikeAuthFailure =
    AUTH_FAILURE_RE.test(message) && (!parsed || parsed.name === 'IoError');

  if (!isAzureUri || !looksLikeAuthFailure) {
    return message;
  }

  return `${message} Check Settings > Storage > Azure and confirm auth mode/account/SAS configuration.`;
};

/**
 * Main application component. Coordinates file selection, data loading, and layout.
 * Manages SEG-Y file loading, drag-and-drop, and orchestrates the header/visualization panels.
 *
 * @returns The shell with header, dialogs, load states, and visualization panels.
 */
export const App = () => {
  useSystemTheme();
  useDensity();

  const {
    filePath,
    isLoading,
    segyData,
    showRevisionDialog,
    setShowRevisionDialog,
    setFilePath,
    setError,
    applyTheme,
  } = useAppStore();

  const {
    headerView,
    setHeaderView,
    sliderValue,
    setSliderValue,
    traceId,
    resetTraceState,
    currentRevision,
    setActiveRevision,
    revisionKey,
  } = useTraceHeader({ segyData, filePath });
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUriDialogOpen, setIsUriDialogOpen] = useState(false);
  const isLoadingRef = useRef(isLoading);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Load app settings on mount
  useEffect(() => {
    if (!isTauri()) return;

    const loadSettings = async () => {
      try {
        const settings = await getAppSettings();
        applyTheme(settings);
      } catch (error) {
        console.error('Failed to load app settings:', error);
      }
    };

    loadSettings();
  }, [applyTheme]);

  // Check for updates on startup using the backend for this install flavor.
  useEffect(() => {
    if (!isTauri()) return;
    void checkForUpdates();
  }, []);

  // Listen for settings changes from settings window
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    const setupSettingsListener = async () => {
      unlisten = await listen<AppSettings>('settings:changed', event => {
        applyTheme(event.payload);
      });
    };

    setupSettingsListener().catch(error => {
      console.error('Failed to setup settings listener:', error);
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [applyTheme]);

  /**
   * Load SEG-Y metadata from the backend and refresh trace state + notifications.
   */
  const loadSegyData = useCallback(
    async (path: string) => {
      const requestId = ++loadRequestIdRef.current;
      const isCurrentRequest = () => requestId === loadRequestIdRef.current;

      useAppStore.setState({ isLoading: true, error: null });
      toast.loading('Loading SEG-Y file...', { id: 'loading' });

      try {
        const data = await loadSegyFileCommand(path);
        if (!isCurrentRequest()) return;

        useAppStore.setState({ segyData: data });
        resetTraceState();

        // Reset zoom to defaults (zoomX=1 shows INITIAL_VISIBLE_TRACES=1000 traces wide,
        // zoomY=1 fits all samples in height) and pan to origin.
        useTraceVisualizationStore.setState({
          zoomX: 1.0,
          zoomY: 1.0,
          panOffset: { x: 0, y: 0 },
          amplitudeScanFailed: false,
        });

        // Clear any stale trace highlight/lock from previous file
        useAppStore.getState().setTraceLock(null);
        useAppStore.getState().setTraceJump(null);

        // Scan traces to compute global amplitude statistics
        try {
          const stats = await scanAmplitudeRange(path);
          if (!isCurrentRequest()) return;
          // Use pre-computed percentile clip value as global normalization
          useTraceVisualizationStore.setState({
            amplitudeStats: stats,
            amplitudeScaling: {
              type: 'global-percentile',
              clipValue: stats.percentileClip,
            },
          });
        } catch (scanError) {
          if (!isCurrentRequest()) return;
          console.warn('Amplitude scan failed, using default scaling:', scanError);
          useTraceVisualizationStore.setState({ amplitudeScanFailed: true });
        }

        toast.success(
          `Loaded file with ${data.total_traces || '?'} traces (${(data.file_size / 1024 / 1024).toFixed(2)} MB)`,
          { id: 'loading' }
        );
      } catch (error) {
        if (!isCurrentRequest()) return;
        const errorMsg = formatLoadError(error, path);
        useAppStore.setState({ error: errorMsg });
        toast.error(`Failed to load SEG-Y: ${errorMsg}`, { id: 'loading' });
        console.error(error);
      } finally {
        if (isCurrentRequest()) {
          useAppStore.setState({ isLoading: false });
        }
      }
    },
    [resetTraceState]
  );

  const handleFileLoad = useCallback(
    async (path: string) => {
      setFilePath(path);
      await loadSegyData(path);
    },
    [loadSegyData, setFilePath]
  );

  /**
   * Load a file the OS handed us via a file association (double-click / "Open
   * with"), validating the extension the same way drag-drop does.
   */
  const handleOpenedFile = useCallback(
    async (path: string) => {
      const lowerPath = path.toLowerCase();
      if (!lowerPath.endsWith('.segy') && !lowerPath.endsWith('.sgy')) {
        const errorMsg = 'Unsupported file type. Open a .segy or .sgy file.';
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      if (isLoadingRef.current) {
        toast.error('A file is already loading. Please wait.');
        return;
      }

      await handleFileLoad(path);
    },
    [handleFileLoad, setError]
  );

  /**
   * Route OS "open file" requests from file associations into the load pipeline.
   * Registers the live listener first (so a macOS open-event isn't missed), then
   * drains any path captured before the frontend mounted.
   */
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setupOpenFileHandler = async () => {
      unlisten = await listen<string>('open-file', event => {
        void handleOpenedFile(event.payload);
      });

      if (cancelled) {
        unlisten();
        return;
      }

      const pending = await takeOpenedFile();
      if (pending) {
        void handleOpenedFile(pending);
      }
    };

    setupOpenFileHandler().catch(error => {
      console.error('Failed to set up open-file handler:', error);
    });

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleOpenedFile]);

  /**
   * Open a native file picker and trigger data load for the chosen file.
   */
  const handleFileSelect = async () => {
    if (!isTauri()) {
      toast.error('File picker not available in web mode');
      return;
    }

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
   * Open the remote URI input dialog.
   */
  const handleRemoteFileSelect = () => {
    setIsUriDialogOpen(true);
  };

  /**
   * Handle URI submission from the dialog.
   */
  const handleUriSubmit = async (uri: string) => {
    await handleFileLoad(uri);
  };

  /**
   * Open the settings window.
   */
  const handleOpenSettings = async (initialTab?: string) => {
    if (!isTauri()) return;
    try {
      await openSettingsWindow(initialTab);
    } catch (error) {
      console.error('Failed to open settings window:', error);
      toast.error('Failed to open settings window');
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
      if (!isTauri()) return;

      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onDragDropEvent(async event => {
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

          const paths: string[] = event.payload.paths ?? [];
          const [droppedPath] = paths;
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
        console.error('Failed to register file drop listener:', error);
      }
    };

    setupFileDropListener().catch((error: unknown) => {
      console.error('Failed to setup file drop listener:', error);
    });

    return () => {
      cancelled = true;
      setIsDragActive(false);
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleFileLoad, segyData, setError]);

  /**
   * Handle revision selection from the detection dialog.
   */
  const handleRevisionConfirm = useCallback(
    async (revision: SegyRevision) => {
      try {
        await setActiveRevision(revision);
        setShowRevisionDialog(false);
        toast.success(`Using ${revision} revision`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to set revision: ${errorMsg}`);
        console.error('Revision confirm error:', error);
      }
    },
    [setActiveRevision, setShowRevisionDialog]
  );

  const handleRevisionDismiss = useCallback(async () => {
    try {
      await setActiveRevision('Rev0');
      setShowRevisionDialog(false);
      toast('Using Rev 0 as fallback. Change in Schema tab if needed.', {
        duration: 6000,
        icon: '⚠️',
      });
    } catch (error) {
      console.error('Revision dismiss error:', error);
      setShowRevisionDialog(false);
    }
  }, [setActiveRevision, setShowRevisionDialog]);

  /**
   * Exit the application process with a user-facing fallback if the call fails.
   */
  const handleExit = async () => {
    if (!isTauri()) {
      toast('Please close the browser tab manually.');
      return;
    }

    try {
      await exit(0);
    } catch (error) {
      console.error('Failed to exit:', error);
      toast.error('Failed to exit application');
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="app-shell relative flex h-screen flex-col overflow-hidden bg-bg text-text isolate">
        <Toaster position="top-right" />

        <AppHeader
          onFileSelect={handleFileSelect}
          onRemoteFileSelect={handleRemoteFileSelect}
          onExit={handleExit}
        />

        <UriInputDialog
          isOpen={isUriDialogOpen}
          onClose={() => setIsUriDialogOpen(false)}
          onSubmit={handleUriSubmit}
          onOpenSettings={isTauri() ? () => handleOpenSettings('storage') : undefined}
        />

        <RevisionDetectionDialog
          isOpen={showRevisionDialog}
          onClose={handleRevisionDismiss}
          onConfirm={handleRevisionConfirm}
        />

        <main className="flex flex-1 overflow-hidden px-3 pb-2 pt-2">
          {isLoading && <SegyLoadingState />}

          {!isLoading && !segyData && (
            <SegyEmptyState
              onFileSelect={handleFileSelect}
              onRemoteFileSelect={handleRemoteFileSelect}
              isDragActive={isDragActive}
            />
          )}

          {!isLoading && segyData && (
            <div className="h-full w-full flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-panel-tint shadow-[var(--shadow)] animate-[rise-in_0.5s_ease-out] motion-reduce:animate-none">
              <PanelGroup orientation="horizontal" className="h-full w-full">
                <Panel id="header-panel" defaultSize="37%" minSize="10%" maxSize="45%">
                  <div
                    className="h-full animate-[rise-in_0.45s_ease-out] motion-reduce:animate-none"
                    style={{ animationDelay: '80ms', animationFillMode: 'both' }}
                  >
                    <SegyHeaderPanel
                      filePath={filePath!}
                      segyData={segyData}
                      headerView={headerView}
                      onHeaderViewChange={setHeaderView}
                      sliderValue={sliderValue}
                      traceId={traceId}
                      onSliderChange={setSliderValue}
                      currentRevision={currentRevision}
                      setActiveRevision={setActiveRevision}
                      revisionKey={revisionKey}
                    />
                  </div>
                </Panel>

                <PanelResizeHandle className="group relative w-1.5 cursor-col-resize bg-gradient-to-b from-transparent via-accent-2/40 to-transparent transition-all duration-200 hover:via-accent-2/70 motion-reduce:transition-none">
                  {/* Grip dots — fade in on hover to reveal resize affordance */}
                  <div className="absolute inset-y-0 left-0 right-0 flex flex-col items-center justify-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none">
                    <div className="size-[3px] rounded-full bg-accent-2" />
                    <div className="size-[3px] rounded-full bg-accent-2" />
                    <div className="size-[3px] rounded-full bg-accent-2" />
                  </div>
                </PanelResizeHandle>

                <Panel id="visualization-panel" defaultSize="63%" minSize="40%">
                  <div
                    className="h-full animate-[rise-in_0.45s_ease-out] motion-reduce:animate-none"
                    style={{ animationDelay: '160ms', animationFillMode: 'both' }}
                  >
                    <TraceVisualizationContainer />
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
};
