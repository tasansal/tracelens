/**
 * Global app store for SEG-Y file state and UI flags.
 */
import type { SegyData } from '@/features/segy/types/segy';
import { create } from 'zustand';

/**
 * App-wide state managed by Zustand.
 */
interface AppState {
  filePath: string | null;
  isDarkMode: boolean;
  isLoading: boolean;
  segyData: SegyData | null;
  error: string | null;
  setFilePath: (path: string | null) => void;
  setLoading: (loading: boolean) => void;
  setSegyData: (data: SegyData | null) => void;
  setError: (error: string | null) => void;
}

/**
 * Detect OS dark mode preference for initial theme sync.
 */
const getSystemTheme = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/**
 * Store accessor for application-level state.
 */
export const useAppStore = create<AppState>(set => ({
  filePath: null,
  isDarkMode: getSystemTheme(),
  isLoading: false,
  segyData: null,
  error: null,
  setFilePath: path => set({ filePath: path }),
  setLoading: loading => set({ isLoading: loading }),
  setSegyData: data => set({ segyData: data }),
  setError: error => set({ error }),
}));
