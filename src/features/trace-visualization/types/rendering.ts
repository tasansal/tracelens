/**
 * Rendering types that mirror backend commands and payloads.
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
 */
export type ColormapType = 'seismic' | 'grayscale' | 'grayscale-inverted' | 'viridis';

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
  | { type: 'agc'; windowSize?: number };

/**
 * Backend image encoding format.
 */
export type ImageFormat = 'png';

/**
 * Rendered image payload returned from the backend (base64-encoded).
 */
export interface RenderedImage {
  width: number;
  height: number;
  data: string; // base64-encoded PNG
  format: ImageFormat;
}

/** RGB color channel tuple clamped to 0–255 integer range to match Rust `[u8; 3]`. */
export type RgbColor = [number, number, number];

/** Clamp an RGB tuple to valid u8 values (0–255 integers). */
export function clampRgb(color: RgbColor): RgbColor {
  return color.map(c => Math.max(0, Math.min(255, Math.round(c)))) as RgbColor;
}

/**
 * Wiggle render configuration for stroke/fill styling.
 */
export interface WiggleConfig {
  lineWidth: number;
  lineColor: RgbColor;
  fillPositive: boolean;
  fillNegative: boolean;
  positiveFillColor: RgbColor;
  negativeFillColor: RgbColor;
}

/**
 * Request for rendering a 2D tile (trace column × sample row).
 */
export interface TileRequest {
  startTrace: number;
  traceCount: number;
  startSample: number;
  sampleCount: number;
  outputWidth: number;
  outputHeight: number;
  colormapType: ColormapType;
  scaling: AmplitudeScaling;
  renderMode: RenderMode;
  wiggleConfig: WiggleConfig | null;
}

/**
 * Rendered tile result with positioning metadata.
 */
export interface RenderedTile {
  startSample: number;
  sampleCount: number;
  image: RenderedImage;
}

/**
 * Unique key for a 2D tile: "col_row" where col is trace-column index, row is sample-row index.
 */
export type TileKey = string;

/**
 * Build a tile key from column and row indices.
 */
export function makeTileKey(col: number, row: number): TileKey {
  return `${col}_${row}`;
}

/**
 * Cached 2D tile with its image and positioning metadata.
 */
export interface TileLayer {
  col: number;
  row: number;
  startTrace: number;
  traceCount: number;
  startSample: number;
  sampleCount: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  image: HTMLImageElement | null;
  isLoading: boolean;
}

/**
 * Amplitude statistics from scanning traces.
 */
export interface AmplitudeStats {
  maxAmplitude: number;
  percentileClip: number;
  percentileUsed: number;
  tracesSampled: number;
}
