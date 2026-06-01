/**
 * UI Density utilities.
 *
 * Provides helpers to apply density classes (`density-compact`, `density-standard`,
 * `density-spacious`) to DOM elements. Mirrors the structure of the theme utilities.
 *
 * These classes are the attachment point for the global density scaling system
 * (typography + spacing) that affects the entire app in both windows.
 */
import type { UiDensity } from '@/shared/api/tauri/settings';

const DENSITY_CLASS_PREFIX = 'density-';

const ALL_DENSITY_CLASSES = [
  `${DENSITY_CLASS_PREFIX}compact`,
  `${DENSITY_CLASS_PREFIX}standard`,
  `${DENSITY_CLASS_PREFIX}spacious`,
] as const;

/**
 * Apply the correct density class to a host element and remove the others.
 */
export const applyDensityClass = (host: HTMLElement, density: UiDensity): void => {
  ALL_DENSITY_CLASSES.forEach((cls) => host.classList.remove(cls));
  host.classList.add(`${DENSITY_CLASS_PREFIX}${density}`);
};

/**
 * Remove all density classes from a host (cleanup).
 */
export const removeAllDensityClasses = (host: HTMLElement): void => {
  ALL_DENSITY_CLASSES.forEach((cls) => host.classList.remove(cls));
};
