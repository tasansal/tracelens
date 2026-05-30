import { INITIAL_VISIBLE_TRACES } from '@/features/trace-visualization/renderer/constants';

const MAX_ZOOM = 50;

export const MIN_ZOOM_Y = 1.0;
export const MAX_ZOOM_Y = MAX_ZOOM;

/** Returns the minimum allowed zoomX for a file with the given number of traces. */
export function getMinZoomX(totalTraces: number): number {
  return totalTraces > INITIAL_VISIBLE_TRACES ? INITIAL_VISIBLE_TRACES / totalTraces : 1.0;
}

/** Returns the maximum allowed zoomX (higher than Y for historical/UX reasons). */
export function getMaxZoomX(): number {
  return Math.max(MAX_ZOOM, INITIAL_VISIBLE_TRACES / 10);
}

/**
 * Apply a multiplicative zoom factor to the horizontal (traces) axis.
 * Enforces min/max zoom bounds and adjusts panX to keep anchorX stable.
 */
export function applyZoomX(
  factor: number,
  curZoomX: number,
  curPan: { x: number; y: number },
  anchorX: number,
  totalTraceCount: number
): { newZoomX: number; newPanX: number } {
  const minZoomX = getMinZoomX(totalTraceCount);
  const maxZoomX = getMaxZoomX();
  const newZoomX = Math.max(minZoomX, Math.min(maxZoomX, curZoomX * factor));
  const scale = newZoomX / curZoomX;
  return { newZoomX, newPanX: anchorX - scale * (anchorX - curPan.x) };
}

/**
 * Apply a multiplicative zoom factor to the vertical (samples) axis.
 * Enforces MIN_ZOOM_Y / MAX_ZOOM_Y bounds and adjusts panY to keep anchorY stable.
 */
export function applyZoomY(
  factor: number,
  curZoomY: number,
  curPan: { x: number; y: number },
  anchorY: number
): { newZoomY: number; newPanY: number } {
  const newZoomY = Math.max(MIN_ZOOM_Y, Math.min(MAX_ZOOM_Y, curZoomY * factor));
  const scale = newZoomY / curZoomY;
  return { newZoomY, newPanY: anchorY - scale * (anchorY - curPan.y) };
}

/**
 * Apply uniform zoom to both axes simultaneously.
 */
export function applyZoomUniform(
  factor: number,
  curZoomX: number,
  curZoomY: number,
  curPan: { x: number; y: number },
  anchor: { x: number; y: number },
  totalTraceCount: number
): { newZoomX: number; newZoomY: number; newPanX: number; newPanY: number } {
  const { newZoomX, newPanX } = applyZoomX(factor, curZoomX, curPan, anchor.x, totalTraceCount);
  const { newZoomY, newPanY } = applyZoomY(factor, curZoomY, curPan, anchor.y);
  return { newZoomX, newZoomY, newPanX, newPanY };
}
