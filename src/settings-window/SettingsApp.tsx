/**
 * Settings window root component with sidebar navigation and custom titlebar.
 *
 * @returns Layout that wraps appearance/storage panels, titlebar, and save badges.
 */
import {
  closeSettingsWindow,
  getAppSettings,
  getStorageConfigSettings,
  updateAppSettings,
  updateStorageConfigSettings,
  type AppSettings,
  type ThemePreference,
} from '@/shared/api/tauri/settings';
import { useAppStore } from '@/shared/store/appStore';
import { isTauri } from '@/shared/utils/tauri';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { AppearanceSettings } from './components/AppearanceSettings';
import { StorageSettingsPanel } from './components/StorageSettingsPanel';
import { useSettingsStore } from './store/settingsStore';

const AUTO_SAVE_DEBOUNCE_MS = 450;
const SAVE_BADGE_RESET_MS = 1800;

const logoUrl = new URL('../../src-tauri/icons/64x64.png', import.meta.url).toString();

const sidebarItems = [
  { id: 'appearance', label: 'Appearance', caption: 'Theme' },
  { id: 'storage', label: 'Storage', caption: 'Cloud backends' },
] as const;

const titlebarButtonClass =
  'inline-flex h-7 w-[30px] items-center justify-center rounded-lg border border-border bg-panel-muted text-text transition duration-200 ease-out hover:border-transparent hover:bg-panel-strong active:translate-y-px motion-reduce:transition-none';
const titlebarCloseButtonClass = `${titlebarButtonClass} hover:bg-[linear-gradient(130deg,var(--accent),var(--accent-3))] hover:text-accent-ink hover:shadow-[0_8px_18px_var(--accent-glow)]`;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Get system theme preference
 */
const getSystemTheme = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/**
 * Apply theme to document root (entire settings window)
 */
const applyThemeToDocument = (theme: ThemePreference) => {
  const isDark = theme === 'system' ? getSystemTheme() : theme === 'dark';
  const themeClass = isDark ? 'theme-dark' : 'theme-light';

  document.documentElement.classList.remove('theme-dark', 'theme-light');
  document.documentElement.classList.add(themeClass);
};

/**
 * Apply theme to preview container only
 */
const applyThemeToPreview = (theme: ThemePreference) => {
  const previewContainer = document.getElementById('theme-preview-container');
  if (!previewContainer) return;

  const isDark = theme === 'system' ? getSystemTheme() : theme === 'dark';
  const themeClass = isDark ? 'theme-dark' : 'theme-light';

  previewContainer.classList.remove('theme-dark', 'theme-light');
  previewContainer.classList.add(themeClass);
};

/**
 * Settings application component.
 */
export const SettingsApp = () => {
  const { applyTheme: applyThemeToStore } = useAppStore();
  const {
    appSettings,
    storageConfig,
    isLoading,
    activeTab,
    setAppSettings,
    setStorageConfig,
    setActiveTab,
    setLoading,
  } = useSettingsStore();

  const inTauri = isTauri();
  const appWindow = inTauri ? getCurrentWindow() : null;
  const [appSaveState, setAppSaveState] = useState<SaveState>('idle');
  const [storageSaveState, setStorageSaveState] = useState<SaveState>('idle');
  const lastPersistedThemeRef = useRef<ThemePreference | null>(null);
  const lastPersistedStorageRef = useRef<string | null>(null);
  const appSavedResetTimerRef = useRef<number | null>(null);
  const storageSavedResetTimerRef = useRef<number | null>(null);

  const clearSavedBadgeTimer = useCallback((target: 'app' | 'storage') => {
    if (target === 'app' && appSavedResetTimerRef.current !== null) {
      window.clearTimeout(appSavedResetTimerRef.current);
      appSavedResetTimerRef.current = null;
    }
    if (target === 'storage' && storageSavedResetTimerRef.current !== null) {
      window.clearTimeout(storageSavedResetTimerRef.current);
      storageSavedResetTimerRef.current = null;
    }
  }, []);

  const scheduleSavedBadgeReset = useCallback(
    (target: 'app' | 'storage') => {
      clearSavedBadgeTimer(target);
      const timeoutId = window.setTimeout(() => {
        if (target === 'app') {
          setAppSaveState(current => (current === 'saved' ? 'idle' : current));
          appSavedResetTimerRef.current = null;
          return;
        }
        setStorageSaveState(current => (current === 'saved' ? 'idle' : current));
        storageSavedResetTimerRef.current = null;
      }, SAVE_BADGE_RESET_MS);

      if (target === 'app') {
        appSavedResetTimerRef.current = timeoutId;
      } else {
        storageSavedResetTimerRef.current = timeoutId;
      }
    },
    [clearSavedBadgeTimer]
  );

  // Clear pending save badge timers on unmount.
  useEffect(
    () => () => {
      clearSavedBadgeTimer('app');
      clearSavedBadgeTimer('storage');
    },
    [clearSavedBadgeTimer]
  );

  // Load settings on mount and apply theme.
  useEffect(() => {
    // Check for initial tab in URL query params.
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }

    if (!inTauri) {
      // Mock data for web dev mode.
      const mockAppSettings = { theme: 'system' as ThemePreference };
      const mockStorageConfig = {
        performance: { chunkSizeMb: 8, sparseThreshold: 64, renderChunkTraces: 128 },
      };
      setAppSettings(mockAppSettings);
      setStorageConfig(mockStorageConfig);
      lastPersistedThemeRef.current = mockAppSettings.theme;
      lastPersistedStorageRef.current = JSON.stringify(mockStorageConfig);
      applyThemeToDocument(mockAppSettings.theme);
      setLoading(false);
      return;
    }

    const loadSettings = async () => {
      setLoading(true);
      try {
        const [appSettingsData, storageConfigData] = await Promise.all([
          getAppSettings(),
          getStorageConfigSettings(),
        ]);
        setAppSettings(appSettingsData);
        setStorageConfig(storageConfigData);
        lastPersistedThemeRef.current = appSettingsData.theme;
        lastPersistedStorageRef.current = JSON.stringify(storageConfigData);

        // Apply theme to settings window.
        applyThemeToDocument(appSettingsData.theme);
        // Sync with app store for system theme monitoring.
        applyThemeToStore(appSettingsData);
      } catch (error) {
        console.error('Failed to load settings:', error);
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [inTauri, setAppSettings, setStorageConfig, setActiveTab, setLoading, applyThemeToStore]);

  // Apply selected theme immediately in the settings UI.
  useEffect(() => {
    if (!appSettings) return;
    applyThemeToDocument(appSettings.theme);
    applyThemeToPreview(appSettings.theme);
  }, [appSettings]);

  // Listen for system theme changes when preference is "system".
  useEffect(() => {
    if (!appSettings || appSettings.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyThemeToDocument('system');
      applyThemeToPreview('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [appSettings]);

  // Listen for settings changes from main window or other sources.
  useEffect(() => {
    if (!inTauri) return;

    let unlistenSettings: (() => void) | undefined;
    let unlistenTab: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenSettings = await listen<AppSettings>('settings:changed', event => {
        const newSettings = event.payload;
        setAppSettings(newSettings);
        applyThemeToDocument(newSettings.theme);
        applyThemeToPreview(newSettings.theme);
        applyThemeToStore(newSettings);
        lastPersistedThemeRef.current = newSettings.theme;
      });

      unlistenTab = await listen<string>('settings:set-tab', event => {
        const tab = event.payload;
        setActiveTab(tab);
      });
    };

    setupListeners().catch(error => {
      console.error('Failed to setup settings listeners:', error);
    });

    return () => {
      if (unlistenSettings) {
        unlistenSettings();
      }
      if (unlistenTab) {
        unlistenTab();
      }
    };
  }, [inTauri, setAppSettings, setActiveTab, applyThemeToStore]);

  // Auto-save app settings changes (debounced).
  useEffect(() => {
    if (!inTauri || !appSettings || isLoading) return;
    if (lastPersistedThemeRef.current === null) {
      lastPersistedThemeRef.current = appSettings.theme;
      return;
    }
    if (appSettings.theme === lastPersistedThemeRef.current) return;

    clearSavedBadgeTimer('app');
    setAppSaveState('saving');

    const themeToPersist = appSettings.theme;
    const settingsToPersist = appSettings;
    const saveTimer = window.setTimeout(async () => {
      try {
        await updateAppSettings(settingsToPersist);
        lastPersistedThemeRef.current = themeToPersist;
        setAppSaveState('saved');
        scheduleSavedBadgeReset('app');
      } catch (error) {
        console.error('Failed to save appearance settings:', error);
        setAppSaveState('error');
        toast.error('Failed to save appearance settings');
      }
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(saveTimer);
  }, [inTauri, appSettings, isLoading, scheduleSavedBadgeReset, clearSavedBadgeTimer]);

  // Auto-save storage config changes (debounced, session-only in-memory backend state).
  useEffect(() => {
    if (!inTauri || !storageConfig || isLoading) return;

    const serializedStorageConfig = JSON.stringify(storageConfig);
    if (lastPersistedStorageRef.current === null) {
      lastPersistedStorageRef.current = serializedStorageConfig;
      return;
    }
    if (serializedStorageConfig === lastPersistedStorageRef.current) return;

    clearSavedBadgeTimer('storage');
    setStorageSaveState('saving');

    const configToPersist = storageConfig;
    const serializedToPersist = serializedStorageConfig;
    const saveTimer = window.setTimeout(async () => {
      try {
        await updateStorageConfigSettings(configToPersist);
        lastPersistedStorageRef.current = serializedToPersist;
        setStorageSaveState('saved');
        scheduleSavedBadgeReset('storage');
      } catch (error) {
        console.error('Failed to save storage settings:', error);
        setStorageSaveState('error');
        toast.error('Failed to save storage settings');
      }
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(saveTimer);
  }, [inTauri, storageConfig, isLoading, scheduleSavedBadgeReset, clearSavedBadgeTimer]);

  const closeSettings = useCallback(async () => {
    if (!inTauri) {
      console.log('Close settings (web dev mode)');
      return;
    }

    try {
      await closeSettingsWindow();
    } catch (error) {
      console.error('Failed to close settings window:', error);
      toast.error('Failed to close settings window');
    }
  }, [inTauri]);

  // Keyboard close shortcut.
  useEffect(() => {
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return;
      event.preventDefault();
      void closeSettings();
    };

    window.addEventListener('keydown', handleEscClose);
    return () => window.removeEventListener('keydown', handleEscClose);
  }, [closeSettings]);

  // Intercept OS-level close requests and map them to the same hide behavior.
  useEffect(() => {
    if (!inTauri || !appWindow) return;

    let unlistenCloseRequest: (() => void) | undefined;

    const setupCloseListener = async () => {
      unlistenCloseRequest = await appWindow.onCloseRequested(event => {
        event.preventDefault();
        void closeSettings();
      });
    };

    setupCloseListener().catch(error => {
      console.error('Failed to setup close request listener:', error);
    });

    return () => {
      if (unlistenCloseRequest) {
        unlistenCloseRequest();
      }
    };
  }, [inTauri, appWindow, closeSettings]);

  const toggleMaximize = async () => {
    if (!inTauri || !appWindow) return;
    try {
      const isMaximized = await appWindow.isMaximized();
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (error) {
      console.error('Failed to toggle window maximize state:', error);
      toast.error('Failed to toggle window size');
    }
  };

  const saveStatusLabel =
    appSaveState === 'saving' || storageSaveState === 'saving'
      ? 'Saving...'
      : appSaveState === 'error' || storageSaveState === 'error'
        ? 'Failed to save'
        : appSaveState === 'saved' || storageSaveState === 'saved'
          ? 'Saved'
          : null;
  const saveStatusClassName =
    saveStatusLabel === 'Failed to save'
      ? 'text-[11px] font-mono uppercase tracking-[0.2em] text-accent'
      : 'text-[11px] font-mono uppercase tracking-[0.2em] text-text-dim';

  return (
    <div className="settings-shell relative flex h-screen flex-col overflow-hidden bg-bg text-text isolate">
      <Toaster position="top-right" />

      {/* Custom titlebar */}
      <header
        className="sticky top-0 z-[200] relative overflow-visible border-b border-[var(--grid)] bg-panel-tint text-text select-none"
        data-tauri-drag-region
      >
        <div className="flex h-16 items-center justify-between px-4" data-tauri-drag-region>
          <div className="flex items-center gap-6" data-tauri-drag-region>
            <div className="flex items-center gap-3" data-tauri-drag-region>
              <img
                src={logoUrl}
                alt="TraceLens logo"
                className="h-8 w-8 rounded-md border border-border bg-panel-strong"
                data-tauri-drag-region
              />
              <div className="flex flex-col leading-none" data-tauri-drag-region>
                <span
                  className="text-sm font-extrabold uppercase tracking-[0.2em] text-text"
                  data-tauri-drag-region
                >
                  Settings
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.24em] text-text-dim"
                  data-tauri-drag-region
                >
                  TraceLens
                </span>
              </div>
            </div>
          </div>

          {inTauri && (
            <div className="inline-flex items-center gap-1.5 ml-1.5" data-tauri-drag-region="false">
              <button
                type="button"
                onClick={async () => {
                  if (!appWindow) return;
                  try {
                    await appWindow.minimize();
                  } catch (error) {
                    console.error('Failed to minimize window:', error);
                    toast.error('Failed to minimize window');
                  }
                }}
                className={titlebarButtonClass}
                data-tauri-drag-region="false"
                aria-label="Minimize window"
              >
                <svg
                  className="h-3 w-3 stroke-current"
                  viewBox="0 0 12 12"
                  fill="none"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 6h8"></path>
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleMaximize}
                className={titlebarButtonClass}
                data-tauri-drag-region="false"
                aria-label="Toggle maximize window"
              >
                <svg
                  className="h-3 w-3 stroke-current"
                  viewBox="0 0 12 12"
                  fill="none"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2.25" y="2.25" width="7.5" height="7.5" rx="1"></rect>
                </svg>
              </button>
              <button
                type="button"
                onClick={closeSettings}
                className={titlebarCloseButtonClass}
                data-tauri-drag-region="false"
                aria-label="Close window"
              >
                <svg
                  className="h-3 w-3 stroke-current"
                  viewBox="0 0 12 12"
                  fill="none"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 3l6 6M9 3L3 9"></path>
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content with sidebar */}
      <main className="flex flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
            Loading settings...
          </div>
        ) : (
          <div className="flex h-full w-full">
            {/* Sidebar */}
            <aside className="w-56 border-r border-border bg-panel-muted p-4 flex flex-col gap-2">
              {sidebarItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex flex-col items-start gap-1 rounded-[14px] border px-4 py-3 text-left transition duration-200 ${
                    activeTab === item.id
                      ? 'border-[rgba(255,255,255,0.08)] bg-panel text-text shadow-[0_10px_30px_-18px_var(--accent-glow)]'
                      : 'border-transparent text-text-muted hover:border-border hover:bg-panel-strong'
                  }`}
                >
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">
                    {item.caption}
                  </span>
                </button>
              ))}
            </aside>

            {/* Content area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto scroll-area p-6">
                {activeTab === 'appearance' && <AppearanceSettings />}
                {activeTab === 'storage' && <StorageSettingsPanel />}
              </div>

              {/* Footer with info + close button */}
              <footer className="flex items-center justify-between border-t border-border bg-panel-muted px-6 py-4">
                <div className="flex items-center gap-3">
                  <p className="text-xs text-text-dim">
                    {activeTab === 'storage'
                      ? 'Storage settings are session-only (ephemeral)'
                      : 'App settings stored in ~/.tracelens'}
                  </p>
                  {saveStatusLabel && <p className={saveStatusClassName}>{saveStatusLabel}</p>}
                </div>
                <button
                  type="button"
                  onClick={closeSettings}
                  className="rounded-full border border-border px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-text transition-colors duration-200 hover:border-transparent hover:bg-panel-strong"
                >
                  Close
                </button>
              </footer>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
