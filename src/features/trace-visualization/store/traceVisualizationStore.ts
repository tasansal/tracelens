/**
 * Zustand store for trace visualization state, viewport settings, and render results.
 */
import { create } from 'zustand';
import {
  AmplitudeScaling,
  AmplitudeStats,
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
  amplitudeScaling: AmplitudeScaling;
  amplitudeStats: AmplitudeStats | null;
  viewport: ViewportConfig;
  wiggleConfig: WiggleConfig;

  // UI state
  zoomLevel: number;
  zoomLevelY: number;
  panOffset: { x: number; y: number };
  canvasSize: { width: number; height: number };

  // Actions
  setRenderMode: (mode: RenderMode) => void;
  setColormap: (colormap: ColormapType) => void;
  setAmplitudeScaling: (scaling: AmplitudeScaling) => void;
  setAmplitudeStats: (stats: AmplitudeStats | null) => void;
  setWiggleConfig: (config: Partial<WiggleConfig>) => void;
  updateViewport: (viewport: Partial<ViewportConfig>) => void;
  setZoomLevel: (zoom: number) => void;
  setZoomLevelY: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  resetView: () => void;
}

/**
 * Initial viewport used before the canvas is measured.
 */
const DEFAULT_VIEWPORT: ViewportConfig = {
  width: 800,
  height: 600,
};

/**
 * Default wiggle rendering parameters.
 */
const DEFAULT_WIGGLE_CONFIG: WiggleConfig = {
  lineWidth: 1.0,
  lineColor: [0, 0, 0],
  fillPositive: true,
  fillNegative: false,
  positiveFillColor: [0, 0, 0],
  negativeFillColor: [255, 0, 0],
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
  amplitudeScaling: { type: 'global-percentile', clipValue: 1.0 },
  amplitudeStats: null,
  viewport: DEFAULT_VIEWPORT,
  wiggleConfig: DEFAULT_WIGGLE_CONFIG,
  zoomLevel: 1.0,
  zoomLevelY: 1.0,
  panOffset: { x: 0, y: 0 },
  canvasSize: { width: 800, height: 600 },

  // Actions
  setRenderMode: mode => set({ renderMode: mode }),
  setColormap: colormap => set({ colormap }),
  setAmplitudeScaling: scaling => set({ amplitudeScaling: scaling }),
  setAmplitudeStats: stats => set({ amplitudeStats: stats }),
  setWiggleConfig: partial =>
    set(state => ({
      wiggleConfig: { ...state.wiggleConfig, ...partial },
    })),
  updateViewport: partial =>
    set(state => ({
      viewport: { ...state.viewport, ...partial },
    })),
  setZoomLevel: zoom => set({ zoomLevel: zoom }),
  setZoomLevelY: zoom => set({ zoomLevelY: zoom }),
  setPanOffset: offset => set({ panOffset: offset }),
  setCanvasSize: size => set({ canvasSize: size }),
  resetView: () =>
    set({
      viewport: DEFAULT_VIEWPORT,
      zoomLevel: 1.0,
      zoomLevelY: 1.0,
      panOffset: { x: 0, y: 0 },
    }),
}));
