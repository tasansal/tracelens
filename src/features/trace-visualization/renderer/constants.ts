/**
 * Renderer-wide constants. Tile size, zoom limits, and cache budget live here
 * so the scene, loader, and React layer agree on the same grid.
 */

/** Traces per data tile along the horizontal axis. */
export const TILE_TRACES = 768;

/** Samples per data tile along the vertical axis. */
export const TILE_SAMPLES = 1536;

/** Extra tiles prefetched beyond the visible bounds in each direction. */
export const TILE_PREFETCH = 1;

/** Maximum number of data tiles held in the cache before LRU eviction. */
export const MAX_CACHED_TILES = 128;

/** Number of traces visible at zoomX=1 (the reset-view baseline). */
export const INITIAL_VISIBLE_TRACES = 1000;

/** Pixels per trace at the current viewport width and horizontal zoom. */
export function pxPerTrace(viewportWidth: number, zoomX: number): number {
  const z = Math.max(0, zoomX || 0);
  const w = Math.max(0, viewportWidth || 0);
  return (w / INITIAL_VISIBLE_TRACES) * z;
}

/**
 * Pixels per sample at the current viewport height, total samples, and vertical
 * zoom. Returns 1 when `totalSamples <= 0` so callers don't divide by zero.
 */
export function pxPerSample(viewportHeight: number, totalSamples: number, zoomY: number): number {
  if (totalSamples <= 0) return 1;
  const h = Math.max(0, viewportHeight || 0);
  const z = Math.max(0, zoomY || 0);
  return (h / totalSamples) * z;
}

/**
 * Convert a viewport pixel coordinate to a zero-based trace or sample index.
 * Returns null when `pixelsPerUnit <= 0` (e.g. before the viewport is sized).
 *
 * When `maxCount` is provided and > 0, the result is clamped to `[0, maxCount-1]`
 * to guarantee a valid index for cursor, locked traces, sample fetches, etc.
 */
export function pixelToIndex(
  px: number,
  pan: number,
  pixelsPerUnit: number,
  maxCount?: number
): number | null {
  if (pixelsPerUnit <= 0) return null;
  let idx = Math.max(0, Math.round((px - pan) / pixelsPerUnit));
  if (maxCount != null && maxCount > 0) {
    idx = Math.min(idx, maxCount - 1);
  }
  return idx;
}
