/** Shared static asset URLs resolved at build time via Vite's import.meta.url. */

export const logoUrl = new URL('../../../src-tauri/icons/64x64.png', import.meta.url).toString();
