/**
 * Hook that keeps app theme in sync with OS color scheme preference.
 */
import { useAppStore } from '@/shared/store/appStore';
import { applyThemeClass } from '@/shared/utils/theme';
import { useEffect } from 'react';

/**
 * Subscribe to `prefers-color-scheme` changes, update the app store, and
 * toggle the `theme-dark`/`theme-light` class on the document root.
 */
export function useSystemTheme() {
  const isDarkMode = useAppStore(state => state.isDarkMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      useAppStore.setState({ isDarkMode: e.matches });
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    applyThemeClass(root, isDarkMode);
    return () => {
      root.classList.remove('theme-dark', 'theme-light');
    };
  }, [isDarkMode]);
}
