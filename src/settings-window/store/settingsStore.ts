/**
 * Settings window store for managing settings state and persistence.
 */
import type { AppSettings, ThemePreference, UiDensity } from '@/shared/api/tauri/settings';
import type { StorageConfig } from '@/shared/api/tauri/storage';
import { create } from 'zustand';

/**
 * Settings window state
 */
interface SettingsState {
  // App settings
  appSettings: AppSettings | null;

  // Storage settings
  storageConfig: StorageConfig | null;

  // UI state
  isLoading: boolean;
  activeTab: string;

  // Actions
  setAppSettings: (settings: AppSettings) => void;
  setStorageConfig: (config: StorageConfig) => void;
  setTheme: (theme: ThemePreference) => void;
  setDensity: (density: UiDensity) => void;
  setActiveTab: (tab: string) => void;
  setLoading: (loading: boolean) => void;
}

/**
 * Hook-like store accessor for settings window state and actions.
 *
 * @returns Zustand store for app/storage settings and UI flags.
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  appSettings: null,
  storageConfig: null,
  isLoading: false,
  activeTab: 'appearance',

  setAppSettings: settings => set({ appSettings: settings }),

  setStorageConfig: config => set({ storageConfig: config }),

  setTheme: theme => {
    const current = get().appSettings;
    if (current && current.theme !== theme) {
      set({ appSettings: { ...current, theme } });
    }
  },

  setDensity: density => {
    const current = get().appSettings;
    if (current && current.density !== density) {
      set({ appSettings: { ...current, density } });
    }
  },

  setActiveTab: tab => set({ activeTab: tab }),

  setLoading: loading => set({ isLoading: loading }),
}));
