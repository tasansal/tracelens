import { create } from 'zustand';
import { SegyData } from './types/segy';

interface AppState {
  filePath: string | null;
  isDarkMode: boolean;
  isLoading: boolean;
  segyData: SegyData | null;
  error: string | null;
  setFilePath: (path: string | null) => void;
  toggleDarkMode: () => void;
  setLoading: (loading: boolean) => void;
  setSegyData: (data: SegyData | null) => void;
  setError: (error: string | null) => void;
}

// Detect OS dark mode preference
const getSystemTheme = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const useAppStore = create<AppState>(set => ({
  filePath: null,
  isDarkMode: getSystemTheme(),
  isLoading: false,
  segyData: null,
  error: null,
  setFilePath: path => set({ filePath: path }),
  toggleDarkMode: () => set(state => ({ isDarkMode: !state.isDarkMode })),
  setLoading: loading => set({ isLoading: loading }),
  setSegyData: data => set({ segyData: data }),
  setError: error => set({ error }),
}));
