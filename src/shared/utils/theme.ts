/**
 * Theme resolution helpers shared between the main and settings windows.
 */
import type { ThemePreference } from '@/shared/api/tauri/settings';

/** Returns true when the OS reports a dark color-scheme preference. */
export const getSystemIsDark = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/** Resolve a stored theme preference into a concrete dark/light boolean. */
export const resolveThemeIsDark = (preference: ThemePreference): boolean =>
  preference === 'system' ? getSystemIsDark() : preference === 'dark';

/** Apply the `theme-dark`/`theme-light` class pair to a host element. */
export const applyThemeClass = (host: HTMLElement, isDark: boolean): void => {
  host.classList.remove('theme-dark', 'theme-light');
  host.classList.add(isDark ? 'theme-dark' : 'theme-light');
};
