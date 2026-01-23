/**
 * Rendering types that mirror backend commands and payloads.
 */

/**
 * Subset of traces and canvas dimensions to render.
 */
export interface ViewportConfig {
  startTrace: number;
  traceCount: number;
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
 */
export type AmplitudeScaling =
  | { type: 'global'; maxAmplitude: number }
  | { type: 'per-trace'; windowSize?: number }
  | { type: 'percentile'; percentile: number }
  | { type: 'manual'; scale: number };

/**
 * Backend image encoding format.
 */
export type ImageFormat = 'png';

/**
 * Rendered image payload returned from the backend.
 */
export interface RenderedImage {
  width: number;
  height: number;
  data: number[]; // u8 array
  format: ImageFormat;
}

/**
 * Wiggle render configuration for stroke/fill styling.
 */
export interface WiggleConfig {
  lineWidth: number;
  lineColor: [number, number, number]; // RGB
  fillPositive: boolean;
  fillNegative: boolean;
  positiveFillColor: [number, number, number]; // RGB
  negativeFillColor: [number, number, number]; // RGB
}
