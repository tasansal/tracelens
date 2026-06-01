/**
 * Global app store for SEG-Y file state and UI flags.
 */
import type { SegyData } from '@/features/segy/types/segy';
import type { AppSettings, ThemePreference, UiDensity } from '@/shared/api/tauri/settings';
import { getSystemIsDark, resolveThemeIsDark } from '@/shared/utils/theme';
import { create } from 'zustand';

/**
 * App-wide state managed by Zustand.
 */
interface AppState {
  filePath: string | null;
  isDarkMode: boolean;
  themePreference: ThemePreference;
  density: UiDensity;
  isLoading: boolean;
  segyData: SegyData | null;
  error: string | null;
  showRevisionDialog: boolean;
  traceJump: number | null;
  /** 0-based trace index to lock/highlight in the visualization (driven by double-click or header trace number entry) */
  traceLock: number | null;
  setFilePath: (path: string | null) => void;
  setTraceJump: (index: number | null) => void;
  setTraceLock: (index: number | null) => void;
  setLoading: (loading: boolean) => void;
  setSegyData: (data: SegyData | null) => void;
  setError: (error: string | null) => void;
  setShowRevisionDialog: (show: boolean) => void;
  setThemePreference: (theme: ThemePreference) => void;
  setDensity: (density: UiDensity) => void;
  applyTheme: (settings: AppSettings) => void;
}

/**
 * Store accessor for application-level state.
 */
export const useAppStore = create<AppState>(set => ({
  filePath: null,
  isDarkMode: getSystemIsDark(),
  themePreference: 'system',
  density: 'compact',
  isLoading: false,
  segyData: null,
  error: null,
  showRevisionDialog: false,
  traceJump: null,
  traceLock: null,
  setFilePath: path => set({ filePath: path }),
  setLoading: loading => set({ isLoading: loading }),
  setSegyData: data => set({ segyData: data }),
  setError: error => set({ error }),
  setShowRevisionDialog: show => set({ showRevisionDialog: show }),
  setTraceJump: index => set({ traceJump: index }),
  setTraceLock: index => set({ traceLock: index }),
  setThemePreference: theme =>
    set({ themePreference: theme, isDarkMode: resolveThemeIsDark(theme) }),
  setDensity: density => set({ density }),
  /**
   * Applies persisted AppSettings (theme + density).
   * Safe fallback to 'compact' for legacy settings files that predate the density field.
   */
  applyTheme: settings =>
    set({
      themePreference: settings.theme,
      isDarkMode: resolveThemeIsDark(settings.theme),
      density: settings.density ?? 'compact',
    }),
}));
