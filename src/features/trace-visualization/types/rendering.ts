/**
 * Rendering types shared between the trace-visualization feature and the
 * Tauri bridge. The GPU renderer consumes raw amplitudes directly, so most
 * of the legacy PNG-tile types are gone — what remains describes viewport
 * geometry, render-mode selection, amplitude scaling, and wiggle styling.
 */

/**
 * Canvas dimensions for the viewport (no trace range — that's computed from pan/zoom).
 */
export interface ViewportConfig {
  width: number;
  height: number;
}

/**
 * Supported colormaps for variable-density rendering.
 * Inversion is applied via the separate `invertColormap` flag in the visualization store
 * rather than dedicated "-inverted" variants.
 */
export type ColormapType = 'seismic' | 'grayscale' | 'viridis' | 'plasma' | 'coolwarm' | 'bone';

/**
 * Render mode selection for variable density and/or wiggle overlays.
 */
export type RenderMode = 'variable-density' | 'wiggle' | 'wiggle-variable-density';

/**
 * Amplitude scaling strategies used prior to rendering.
 *
 * Global modes pass a pre-computed clip value so normalization is consistent
 * across tiles.  AGC computes gain per-trace with a sliding window.
 */
export type AmplitudeScaling =
  | { type: 'global-percentile'; clipValue: number }
  | { type: 'global-fixed'; clipValue: number }
  | { type: 'agc'; windowSize?: number; gainDb?: number };

/** RGB color channel tuple clamped to 0–255 integer range to match Rust `[u8; 3]`. */
export type RgbColor = [number, number, number];

/** Clamp an RGB tuple to valid u8 values (0–255 integers). */
export function clampRgb(color: RgbColor): RgbColor {
  return color.map(c => Math.max(0, Math.min(255, Math.round(c)))) as RgbColor;
}

/**
 * Wiggle render configuration.
 */
export interface WiggleConfig {
  /**
   * Color of the wiggle trace line. `null` means do not draw the line at all.
   */
  lineColor: RgbColor | null;
  /** Deflection scale as a fraction of one trace slot. Default 2.0. Range 0.5–3.0. */
  wiggleScale: number;
  /**
   * Fill color for positive (rightward) excursions. `null` = no positive fill.
   */
  positiveFillColor: RgbColor | null;
  /**
   * Fill color for negative (leftward) excursions. `null` = no negative fill.
   */
  negativeFillColor: RgbColor | null;
  /** Background color used in pure wiggle mode (when no VD layer is underneath). `null` means transparent. */
  backgroundColor: RgbColor | null;
}

/**
 * Converts AGC gain (dB) to a display clip value.
 *
 * AGC output sits at RMS ≈ 1. The shader maps `sample / clip` to display
 * range, so `clip = 10^(−gainDb / 20)`. At 0 dB clip is 1.0 (full scale);
 * negative dB raises the clip, pulling RMS below full scale.
 *
 * @param gainDb - Gain in decibels. Default −6 dB ≈ clip 2.0 (half scale).
 * @returns Clip value for the shader uniform.
 */
export function agcClip(gainDb: number): number {
  return Math.pow(10, -gainDb / 20);
}

/**
 * Linear signed amplitude histogram (both negative and positive sides).
 * Bin edges run from -maxAbs to +maxAbs. Used by the Scaling panel.
 */
interface AmplitudeHistogram {
  binEdges: number[];
  counts: number[];
}

/**
 * Amplitude statistics from scanning traces.
 * Now includes a real signed linear histogram for the trace scaling UI.
 */
export interface AmplitudeStats {
  maxAmplitude: number;
  percentileClip: number;
  percentileUsed: number;
  tracesSampled: number;
  histogram: AmplitudeHistogram;
}
