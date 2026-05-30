/**
 * Tauri environment detection utility.
 * Use this to check if running in Tauri before calling Tauri APIs.
 */

/**
 * Check if the app is running in a Tauri environment.
 * Returns false when running in pure web mode (e.g., `npm run dev`).
 */
export const isTauri = (): boolean => {
  try {
    return '__TAURI_INTERNALS__' in window;
  } catch {
    return false;
  }
};
