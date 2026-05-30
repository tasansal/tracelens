/**
 * Hook that applies the current UI density preset to the document root.
 *
 * The density value lives in the global app store (populated from persisted
 * AppSettings). This hook keeps the `density-*` class in sync on <html>.
 *
 * It is intentionally simple (no OS media query) because density is a pure
 * user preference, not derived from the system like theme.
 */
import { useAppStore } from '@/shared/store/appStore';
import { applyDensityClass, removeAllDensityClasses } from '@/shared/utils/density';
import { useEffect } from 'react';

/**
 * Apply the density class from the store to document.documentElement.
 * Cleans up on unmount.
 */
export function useDensity() {
  const density = useAppStore((state) => state.density);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    applyDensityClass(root, density);

    return () => {
      removeAllDensityClasses(root);
    };
  }, [density]);
}
