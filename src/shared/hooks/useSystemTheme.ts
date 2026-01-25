/**
 * Hook that keeps app theme in sync with OS color scheme preference.
 */
import { useAppStore } from '@/store/appStore';
import { useEffect } from 'react';

/**
 * Subscribe to `prefers-color-scheme` changes and update the app store.
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
    const themeClass = isDarkMode ? 'theme-dark' : 'theme-light';
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(themeClass);
    return () => {
      root.classList.remove('theme-dark', 'theme-light');
    };
  }, [isDarkMode]);
}
