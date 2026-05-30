import { INITIAL_VISIBLE_TRACES } from '@/features/trace-visualization/renderer/constants';

export type GestureDevice = 'mouse-scroll' | 'mouse-ctrl' | 'trackpad-swipe' | 'trackpad-pinch';

export type GestureIntent =
  | 'zoom-uniform'
  | 'zoom-horizontal'
  | 'zoom-vertical'
  | 'pan-horizontal'
  | 'pan-vertical'
  | 'pan-free';

export interface ClassifiedGesture {
  intent: GestureIntent;
  device: GestureDevice;
  anchor: { x: number; y: number };
}

export const MOUSE_DELTA_THRESHOLD = 50;
const AXIS_LOCK_TAN = Math.tan((15 * Math.PI) / 180); // tan(15°) ≈ 0.268
const DECAY_THRESHOLD = 0.5;
export const DECAY_WINDOW = 5;
export const MAX_ZOOM = 50;
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
 * Normalize a WheelEvent's deltas to CSS pixels regardless of deltaMode.
 * All classification thresholds in this module are in pixel units.
 */
export function normalizeDelta(e: WheelEvent): { dx: number; dy: number } {
  const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
  return { dx: e.deltaX * factor, dy: e.deltaY * factor };
}

/**
 * Classify the input device from accumulated SAMPLING-phase events.
 *
 * Three signals in priority order:
 *
 * 1. `hasOtherModifier` (shiftKey or altKey held) → always mouse. Browsers
 *    never inject Shift/Alt for trackpad gestures; these modifiers are only
 *    set when the user deliberately holds them, which only happens with a
 *    physical input device.
 *
 * 2. Event count in the 100ms sampling window: a trackpad gesture in active
 *    motion produces 6+ events; a mouse wheel notch (with or without macOS
 *    smooth-scroll smearing) produces 1–3. So ≤2 events = discrete (mouse),
 *    3+ events = continuous stream candidate.
 *
 * 3. For 3+ events: peak per-event magnitude (max, not avg). macOS smooth-
 *    scroll smears one notch into an acceleration curve (small → large →
 *    small), so a single mouse notch has at least one event with high
 *    magnitude even if the average is low. Trackpad swipes are far more
 *    uniform, with peaks staying small.
 *
 * `hasCtrl` swaps the device family within each branch.
 */
export function classifyDevice(
  samples: Array<{ dx: number; dy: number }>,
  hasCtrl: boolean,
  hasOtherModifier: boolean
): GestureDevice {
  if (samples.length === 0) return 'mouse-scroll';

  // Shift or Alt held = deliberate user modifier on a physical input device.
  // Browsers don't inject these for trackpad gestures, so this is unambiguous.
  if (hasOtherModifier) {
    return hasCtrl ? 'mouse-ctrl' : 'mouse-scroll';
  }

  // Discrete burst (1–2 events in 100ms) = single mouse notch with macOS
  // smooth-scroll. Trackpad gestures in motion always produce more events.
  if (samples.length <= 2) {
    return hasCtrl ? 'mouse-ctrl' : 'mouse-scroll';
  }

  // 3+ events: distinguish by peak magnitude. Mouse smooth-scroll has an
  // acceleration curve with at least one large event; trackpad swipes are
  // uniformly small.
  const maxMag = Math.max(...samples.map(d => Math.abs(d.dx) + Math.abs(d.dy)));
  if (hasCtrl) {
    return maxMag < MOUSE_DELTA_THRESHOLD ? 'trackpad-pinch' : 'mouse-ctrl';
  }
  return maxMag < MOUSE_DELTA_THRESHOLD ? 'trackpad-swipe' : 'mouse-scroll';
}

/**
 * Determine pan axis from accumulated swipe direction.
 * Locks to horizontal if within ±15° of horizontal, vertical if within ±15°
 * of vertical; otherwise allows free 2D pan.
 */
export function classifySwipeIntent(
  sumDx: number,
  sumDy: number
): 'pan-horizontal' | 'pan-vertical' | 'pan-free' {
  const absDx = Math.abs(sumDx);
  const absDy = Math.abs(sumDy);
  if (absDx === 0 && absDy === 0) return 'pan-free';
  if (absDy <= absDx * AXIS_LOCK_TAN) return 'pan-horizontal';
  if (absDx <= absDy * AXIS_LOCK_TAN) return 'pan-vertical';
  return 'pan-free';
}

/**
 * Map device type + modifier keys → gesture intent.
 * Modifiers are read once at classification time (SAMPLING phase) and locked.
 */
export function classifyIntent(
  device: GestureDevice,
  modifiers: { shiftKey: boolean; altKey: boolean },
  swipeSumDx: number,
  swipeSumDy: number
): GestureIntent {
  switch (device) {
    case 'trackpad-pinch':
      return 'zoom-uniform';
    case 'mouse-ctrl':
      return modifiers.altKey ? 'pan-vertical' : 'pan-horizontal';
    case 'mouse-scroll':
      if (modifiers.shiftKey) return 'zoom-vertical';
      if (modifiers.altKey) return 'zoom-horizontal';
      return 'zoom-uniform';
    case 'trackpad-swipe':
      return classifySwipeIntent(swipeSumDx, swipeSumDy);
  }
}

/**
 * Extract the signed scalar magnitude from a WheelEvent for zoom/pan calculations.
 *
 * Returns whichever of dx/dy has the larger absolute normalized value.
 * This handles the macOS Shift+scroll axis swap transparently: when macOS
 * converts a Shift+vertical scroll to a horizontal event, the delta lands in
 * deltaX; this function returns that value regardless of which axis it's on.
 *
 * Sign convention matches DOM wheel: positive = scroll down / zoom out.
 */
export function extractMagnitude(e: WheelEvent): number {
  const { dx, dy } = normalizeDelta(e);
  return Math.abs(dx) > Math.abs(dy) ? dx : dy;
}

/**
 * Return true when the gesture has decayed to inertia-only scroll.
 * Uses the last DECAY_WINDOW magnitudes; if all are below DECAY_THRESHOLD,
 * the user's fingers have lifted and only macOS momentum events remain.
 */
export function checkDecay(recentMagnitudes: number[]): boolean {
  if (recentMagnitudes.length < DECAY_WINDOW) return false;
  const window = recentMagnitudes.slice(-DECAY_WINDOW);
  return Math.max(...window.map(Math.abs)) < DECAY_THRESHOLD;
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
