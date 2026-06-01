/**
 * Zustand store for trace visualization state, viewport settings, and render results.
 */
import { create } from 'zustand';
import {
  AmplitudeScaling,
  AmplitudeStats,
  clampRgb,
  ColormapType,
  RenderMode,
  ViewportConfig,
  WiggleConfig,
} from '../types/rendering';

/**
 * Shape of the trace visualization store.
 */
interface TraceVisualizationState {
  // View configuration
  renderMode: RenderMode;
  colormap: ColormapType;
  /** When true, the selected colormap is inverted (e.g. seismic becomes red-white-blue). */
  invertColormap: boolean;
  amplitudeScaling: AmplitudeScaling;
  amplitudeStats: AmplitudeStats | null;
  amplitudeScanFailed: boolean;
  viewport: ViewportConfig;
  wiggleConfig: WiggleConfig;

  // UI state — independent per-axis zoom
  /** Horizontal zoom. At 1.0, INITIAL_VISIBLE_TRACES (1000) traces fill the viewport width. */
  zoomX: number;
  /** Vertical zoom. At 1.0, all samples fill the viewport height. Cannot go below 1.0. */
  zoomY: number;
  panOffset: { x: number; y: number };

  // Actions
  setRenderMode: (mode: RenderMode) => void;
  setColormap: (colormap: ColormapType) => void;
  setInvertColormap: (invert: boolean) => void;
  setAmplitudeScaling: (scaling: AmplitudeScaling) => void;
  setWiggleConfig: (config: Partial<WiggleConfig>) => void;
  updateViewport: (viewport: Partial<ViewportConfig>) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  resetView: () => void;
}

/**
 * Initial viewport used before the canvas is measured.
 */
const DEFAULT_VIEWPORT: ViewportConfig = {
  width: 800,
  height: 600,
};

const DEFAULT_WIGGLE_CONFIG: WiggleConfig = {
  lineColor: [0, 0, 0],
  wiggleScale: 2.0,
  positiveFillColor: [0, 0, 0],
  negativeFillColor: [255, 255, 255],
  backgroundColor: [255, 255, 255],
};

/**
 * Store accessor for trace visualization state and actions.
 *
 * @returns Zustand store with viewport settings, render cache, and action setters.
 */
export const useTraceVisualizationStore = create<TraceVisualizationState>(set => ({
  // Initial state
  renderMode: 'variable-density',
  colormap: 'grayscale',
  invertColormap: false,
  amplitudeScaling: { type: 'global-percentile', clipValue: 1.0 },
  amplitudeStats: null,
  amplitudeScanFailed: false,
  viewport: DEFAULT_VIEWPORT,
  wiggleConfig: DEFAULT_WIGGLE_CONFIG,
  zoomX: 1.0,
  zoomY: 1.0,
  panOffset: { x: 0, y: 0 },

  // Actions
  setRenderMode: mode => set({ renderMode: mode }),
  setColormap: colormap => set({ colormap }),
  setInvertColormap: invert => set({ invertColormap: invert }),
  setAmplitudeScaling: scaling => set({ amplitudeScaling: scaling }),
  setWiggleConfig: partial => {
    const clamped: Partial<WiggleConfig> = { ...partial };
    if (clamped.lineColor) clamped.lineColor = clampRgb(clamped.lineColor);
    if (clamped.positiveFillColor) clamped.positiveFillColor = clampRgb(clamped.positiveFillColor);
    if (clamped.negativeFillColor) clamped.negativeFillColor = clampRgb(clamped.negativeFillColor);
    if (clamped.backgroundColor) clamped.backgroundColor = clampRgb(clamped.backgroundColor);
    set(state => ({
      wiggleConfig: { ...state.wiggleConfig, ...clamped },
    }));
  },
  updateViewport: partial =>
    set(state => ({
      viewport: { ...state.viewport, ...partial },
    })),
  setPanOffset: offset => set({ panOffset: offset }),
  resetView: () =>
    set({
      viewport: DEFAULT_VIEWPORT,
      zoomX: 1.0,
      zoomY: 1.0,
      panOffset: { x: 0, y: 0 },
    }),
}));
