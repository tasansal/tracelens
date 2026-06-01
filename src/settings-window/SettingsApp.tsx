/**
 * Settings window root component with sidebar navigation and custom titlebar.
 *
 * Typography (Task 4.2 final sweep): Titlebar "Settings" uses the documented
 * display-tight + text-sm font-extrabold uppercase tracking-[0.2em] pattern
 * (justified chrome-specific for window titles; see AppHeader for "TraceLens"
 * parallel and design-language.md). Sub-label "TraceLens" uses .text-eyebrow
 * (correct). Sidebar captions use .text-eyebrow. Save status badges use
 * text-eyebrow (or + text-accent). Footer uses font-mono text-[10px] for
 * version/build (data). All other content (forms, help) via shared Label
 * (proportional) + panels audited in Storage/Appearance. Branding chunk cleaned
 * duplication; final sweep confirms no leaks, full 4.2-mono compliance.
 *
 * @returns Layout that wraps appearance/storage panels, titlebar, and save badges.
 */
import { useDensity } from '@/app/hooks/useDensity';
import {
  closeSettingsWindow,
  getAppSettings,
  getStorageConfigSettings,
  updateAppSettings,
  updateStorageConfigSettings,
  type AppSettings,
  type ThemePreference,
} from '@/shared/api/tauri/settings';
import { useAutoSave } from '@/shared/hooks/useAutoSave';
import { useAppStore } from '@/shared/store/appStore';
import { Button } from '@/shared/ui/button';
import { OptionTile } from '@/shared/ui/option-tile';
import { WindowControls } from '@/shared/ui/window-controls';
import { logoUrl } from '@/shared/utils/assets';
import { isTauri } from '@/shared/utils/tauri';
import { applyThemeClass, resolveThemeIsDark } from '@/shared/utils/theme';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { AppearanceSettings } from './components/AppearanceSettings';
import { StorageSettingsPanel } from './components/StorageSettingsPanel';
import { useSettingsStore } from './store/settingsStore';

const sidebarItems = [
  { id: 'appearance', label: 'Appearance', caption: 'Theme' },
  { id: 'storage', label: 'Storage', caption: 'Cloud backends' },
] as const;

const applyThemeToDocument = (theme: ThemePreference) => {
  applyThemeClass(document.documentElement, resolveThemeIsDark(theme));
};

const applyThemeToPreview = (theme: ThemePreference) => {
  const preview = document.getElementById('theme-preview-container');
  if (preview) applyThemeClass(preview, resolveThemeIsDark(theme));
};

/**
 * Settings application component.
 */
export const SettingsApp = () => {
  useDensity();
  const { applyTheme: applyThemeToStore } = useAppStore();
  const { appSettings, storageConfig, isLoading, activeTab, setAppSettings, setActiveTab } =
    useSettingsStore();

  const inTauri = isTauri();
  // Memoized — getCurrentWindow() should not be called on every render.
  const appWindow = useMemo(() => (inTauri ? getCurrentWindow() : null), [inTauri]);

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
      const mockAppSettings = { theme: 'system' as ThemePreference, density: 'compact' as const };
      const mockStorageConfig = {
        performance: { chunkSizeMb: 8, readCacheMb: 32, renderChunkTraces: 128 },
      };
      useSettingsStore.setState({
        appSettings: mockAppSettings,
        storageConfig: mockStorageConfig,
        isLoading: false,
      });
      applyThemeToDocument(mockAppSettings.theme);
      return;
    }

    const loadSettings = async () => {
      useSettingsStore.setState({ isLoading: true });
      try {
        const [appSettingsData, storageConfigData] = await Promise.all([
          getAppSettings(),
          getStorageConfigSettings(),
        ]);
        useSettingsStore.setState({
          appSettings: appSettingsData,
          storageConfig: storageConfigData,
        });

        // Apply theme to settings window.
        applyThemeToDocument(appSettingsData.theme);
        // Sync with app store for system theme monitoring.
        applyThemeToStore(appSettingsData);
      } catch (error) {
        console.error('Failed to load settings:', error);
        toast.error('Failed to load settings');
      } finally {
        useSettingsStore.setState({ isLoading: false });
      }
    };

    loadSettings();
  }, [inTauri, setActiveTab, applyThemeToStore]);

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

  const { saveState: appSaveState, markPersisted: markAppPersisted } = useAutoSave<AppSettings>({
    value: appSettings,
    enabled: inTauri && !isLoading,
    persist: updateAppSettings,
    errorMessage: 'Failed to save appearance settings',
  });

  const { saveState: storageSaveState } = useAutoSave({
    value: storageConfig,
    enabled: inTauri && !isLoading,
    persist: updateStorageConfigSettings,
    errorMessage: 'Failed to save storage settings',
  });

  // Listen for settings changes from main window or other sources.
  useEffect(() => {
    if (!inTauri) return;

    let mounted = true;
    let unlistenSettings: (() => void) | undefined;
    let unlistenTab: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenSettings = await listen<AppSettings>('settings:changed', event => {
        const newSettings = event.payload;
        markAppPersisted(newSettings);
        setAppSettings(newSettings);
        applyThemeToDocument(newSettings.theme);
        applyThemeToPreview(newSettings.theme);
        applyThemeToStore(newSettings);
      });

      unlistenTab = await listen<string>('settings:set-tab', event => {
        setActiveTab(event.payload);
      });

      // If the component unmounted while awaiting, tear down immediately.
      if (!mounted) {
        unlistenSettings();
        unlistenTab();
      }
    };

    setupListeners().catch(error => {
      console.error('Failed to setup settings listeners:', error);
    });

    return () => {
      mounted = false;
      unlistenSettings?.();
      unlistenTab?.();
    };
  }, [inTauri, setAppSettings, setActiveTab, applyThemeToStore, markAppPersisted]);

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

  const saveStatusLabel =
    appSaveState === 'saving' || storageSaveState === 'saving'
      ? 'Saving...'
      : appSaveState === 'error' || storageSaveState === 'error'
        ? 'Failed to save'
        : appSaveState === 'saved' || storageSaveState === 'saved'
          ? 'Saved'
          : null;
  const saveStatusClassName =
    saveStatusLabel === 'Failed to save' ? 'text-eyebrow text-accent' : 'text-eyebrow';

  /*
   * Root shell for the settings window (form/preferences context).
   *
   * Structural parity with main window's .app-shell (same flex h-screen layout,
   * bg-bg, isolate for stacking, relative positioning).
   *
   * Subtle atmosphere treatment (Task 3.5) is applied automatically via
   * .settings-shell::before (soft dual radial glows) + ::after (very faint grid)
   * defined in src/index.css.
   *
   * - Uses shared tokens (--grid, --grid-size, --accent-glow, --accent-2-glow,
   *   --settings-grid-opacity, --settings-glow-opacity) for visual kinship.
   * - Intensities deliberately low (grid ~0.11, glow ~0.18) — does not compete
   *   with content, cards (unified in 3.3), or controls.
   * - Explicitly NO film grain (unlike dark .app-shell) to preserve calm,
   *   readable form UI.
   * - The `isolate` + `relative` + `> * { z-index: 1 }` (in CSS) keep all
   *   UI layers (header z-[200], cards, sidebar, footer) above the backdrop.
   *
   * This directly addresses the highest-severity "two apps" divergence from
   * the Task 3.1 audit (atmosphere was the primary remaining gap after 3.3/3.4).
   * See design-language.md Windows section and index.css for full rationale.
   */
  return (
    <div className="settings-shell relative flex h-screen flex-col overflow-hidden bg-bg text-text isolate">
      <Toaster position="top-right" />

      {/* Custom titlebar */}
      <header
        className="sticky top-0 z-[200] relative overflow-visible border-b border-[var(--grid)] bg-panel-tint text-text select-none"
        data-tauri-drag-region
      >
        <div
          className="flex h-11 items-center justify-between px-[var(--space-4)]"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-6" data-tauri-drag-region>
            <div className="flex items-center gap-[var(--space-3)]" data-tauri-drag-region>
              <img
                src={logoUrl}
                alt="TraceLens logo"
                className="size-8 rounded-[var(--radius-sm)] border border-border bg-panel-strong"
                data-tauri-drag-region
              />
              <div className="flex flex-col leading-none" data-tauri-drag-region>
                <span
                  className="display-tight text-[length:var(--text-sm,12px)] font-extrabold uppercase tracking-[0.2em] text-text"
                  data-tauri-drag-region
                >
                  Settings
                </span>
                <span className="text-eyebrow" data-tauri-drag-region>
                  TraceLens
                </span>
              </div>
            </div>
          </div>

          <WindowControls onClose={closeSettings} />
        </div>
      </header>

      {/* Main content with sidebar */}
      <main className="flex flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-[length:var(--text-sm,12px)] text-text-muted">
            Loading settings…
          </div>
        ) : (
          <div className="flex h-full w-full">
            {/* Sidebar */}
            <aside className="w-56 border-r border-border bg-panel-muted p-[var(--space-4)] flex flex-col gap-[var(--space-2)]">
              {sidebarItems.map(item => (
                <OptionTile
                  key={item.id}
                  selected={activeTab === item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="flex-col items-start gap-[var(--space-1)]"
                >
                  <span className="text-[length:var(--text-sm,12px)] font-semibold">
                    {item.label}
                  </span>
                  <span className="text-eyebrow">{item.caption}</span>
                </OptionTile>
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
                <div className="flex items-center gap-[var(--space-3)]">
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                    {activeTab === 'storage'
                      ? 'Storage settings are session-only (ephemeral)'
                      : 'App settings stored in ~/.tracelens'}
                  </p>
                  {saveStatusLabel && <p className={saveStatusClassName}>{saveStatusLabel}</p>}
                </div>
                <div className="flex items-center gap-[var(--space-4)]">
                  <span className="font-mono text-[length:var(--text-2xs,9px)] text-text-dim">
                    v{__APP_VERSION__} · {__APP_BUILD__}
                  </span>
                  <Button variant="tonal" onClick={closeSettings}>
                    Close
                  </Button>
                </div>
              </footer>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
