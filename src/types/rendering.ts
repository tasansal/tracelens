// Match Rust types exactly

export interface ViewportConfig {
  startTrace: number;
  traceCount: number;
  width: number;
  height: number;
}

export type ColormapType = 'seismic' | 'grayscale' | 'grayscale-inverted' | 'viridis';

export type RenderMode = 'variable-density' | 'wiggle' | 'wiggle-variable-density';

export type AmplitudeScaling =
  | { type: 'global'; maxAmplitude: number }
  | { type: 'per-trace'; windowSize?: number }
  | { type: 'percentile'; percentile: number }
  | { type: 'manual'; scale: number };

export type ImageFormat = 'png';

export interface RenderedImage {
  width: number;
  height: number;
  data: number[]; // u8 array
  format: ImageFormat;
}

export interface WiggleConfig {
  lineWidth: number;
  lineColor: [number, number, number]; // RGB
  fillPositive: boolean;
  fillNegative: boolean;
  positiveFillColor: [number, number, number]; // RGB
  negativeFillColor: [number, number, number]; // RGB
}
