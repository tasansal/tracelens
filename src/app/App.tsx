/**
 * Top-level UI shell that wires SEG-Y loading, header inspection, and trace rendering.
 * Keeps high-level app state (loading/errors) in sync with stores and commands.
 */
import { AppHeader } from '@/app/components/AppHeader';
import { useSystemTheme } from '@/app/hooks/useSystemTheme';
import { UriInputDialog } from '@/features/file/components/UriInputDialog';
import { SegyEmptyState } from '@/features/segy/components/SegyEmptyState';
import { SegyHeaderPanel } from '@/features/segy/components/SegyHeaderPanel';
import { SegyLoadingState } from '@/features/segy/components/SegyLoadingState';
import { useTraceHeader } from '@/features/segy/hooks/useTraceHeader';
import { TraceVisualizationContainer } from '@/features/trace-visualization/components/TraceVisualizationContainer';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { loadSegyFile as loadSegyFileCommand, scanAmplitudeRange } from '@/shared/api/tauri/segy';
import { getAppSettings, openSettingsWindow, type AppSettings } from '@/shared/api/tauri/settings';
import { useAppStore } from '@/shared/store/appStore';
import { isTauri } from '@/shared/utils/tauri';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { exit } from '@tauri-apps/plugin-process';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

interface BackendErrorPayload {
  name?: string;
  message?: string;
}

const parseBackendErrorMessage = (error: unknown): string => {
  const fallback = error instanceof Error ? error.message : String(error);

  if (typeof fallback !== 'string') {
    return String(fallback);
  }

  try {
    const payload = JSON.parse(fallback) as BackendErrorPayload;
    if (payload && typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Non-JSON error string, use as-is.
  }

  return fallback;
};

const formatLoadError = (error: unknown, uri: string): string => {
  const message = parseBackendErrorMessage(error);
  const isAzureUri =
    uri.startsWith('az://') || uri.startsWith('azure://') || uri.includes('.blob.core.windows.net');
  const looksLikeAuthFailure =
    /(authentication|authorization|forbidden|unauthorized|status code: 401|status code: 403|signature|sas)/i.test(
      message
    );

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

  const {
    filePath,
    isLoading,
    segyData,
    setLoading,
    setSegyData,
    setFilePath,
    setError,
    applyTheme,
  } = useAppStore();

  const {
    headerView,
    setHeaderView,
    sliderValue,
    setSliderValue,
    currentTrace,
    loadingTrace,
    resetTraceState,
  } = useTraceHeader({ segyData, filePath });
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUriDialogOpen, setIsUriDialogOpen] = useState(false);
  const isLoadingRef = useRef(isLoading);

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
      setLoading(true);
      setError(null);
      toast.loading('Loading SEG-Y file...', { id: 'loading' });

      try {
        const data = await loadSegyFileCommand(path);

        setSegyData(data);
        resetTraceState();

        // Reset zoom to 1.0 (shows INITIAL_VISIBLE_TRACES = 500 traces wide)
        // and pan to origin.
        const vizStore = useTraceVisualizationStore.getState();
        vizStore.setZoomLevel(1.0);
        vizStore.setZoomLevelY(1.0);
        vizStore.setPanOffset({ x: 0, y: 0 });

        // Scan traces to compute global amplitude statistics
        try {
          const stats = await scanAmplitudeRange(path);
          // Use pre-computed percentile clip value as global normalization
          const vizState = useTraceVisualizationStore.getState();
          vizState.setAmplitudeStats(stats);
          vizState.setAmplitudeScaling({
            type: 'global-percentile',
            clipValue: stats.percentileClip,
          });
        } catch (scanError) {
          console.warn('Amplitude scan failed, using default scaling:', scanError);
        }

        toast.success(
          `Loaded file with ${data.total_traces || '?'} traces (${(data.file_size / 1024 / 1024).toFixed(2)} MB)`,
          { id: 'loading' }
        );
      } catch (error) {
        const errorMsg = formatLoadError(error, path);
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

      <main className="flex flex-1 overflow-hidden px-4 pb-4 pt-3">
        {isLoading && <SegyLoadingState />}

        {!isLoading && !segyData && (
          <SegyEmptyState
            onFileSelect={handleFileSelect}
            onRemoteFileSelect={handleRemoteFileSelect}
            isDragActive={isDragActive}
          />
        )}

        {!isLoading && segyData && (
          <div className="h-full w-full flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-panel-tint shadow-[var(--shadow)]">
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
                />
              </Panel>

              <PanelResizeHandle className="relative w-1.5 cursor-col-resize bg-gradient-to-b from-transparent via-accent-2 to-transparent opacity-60 transition-transform hover:scale-x-125 motion-reduce:transition-none after:absolute after:inset-y-1.5 after:inset-x-0 after:bg-[var(--accent-2-muted)] after:opacity-80 after:content-['']" />

              <Panel id="visualization-panel" defaultSize="63%" minSize="40%">
                <TraceVisualizationContainer />
              </Panel>
            </PanelGroup>
          </div>
        )}
      </main>
    </div>
  );
};
