/**
 * Zustand store for trace visualization state, viewport settings, and render results.
 */
import { create } from 'zustand';
import {
  AmplitudeScaling,
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
  viewport: ViewportConfig;
  wiggleConfig: WiggleConfig;

  // Rendered image cache
  currentImage: HTMLImageElement | ImageData | null;
  isRendering: boolean;

  // UI state
  showControls: boolean;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  canvasSize: { width: number; height: number };

  // Actions
  setRenderMode: (mode: RenderMode) => void;
  setColormap: (colormap: ColormapType) => void;
  setAmplitudeScaling: (scaling: AmplitudeScaling) => void;
  setWiggleConfig: (config: Partial<WiggleConfig>) => void;
  updateViewport: (viewport: Partial<ViewportConfig>) => void;
  setCurrentImage: (image: HTMLImageElement | ImageData | null) => void;
  setIsRendering: (isRendering: boolean) => void;
  setZoomLevel: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  resetView: () => void;
}

/**
 * Initial viewport used before the canvas is measured.
 */
const DEFAULT_VIEWPORT: ViewportConfig = {
  startTrace: 0,
  traceCount: 500,
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
 */
export const useTraceVisualizationStore = create<TraceVisualizationState>(set => ({
  // Initial state
  renderMode: 'variable-density',
  colormap: 'grayscale',
  amplitudeScaling: { type: 'percentile', percentile: 0.98 },
  viewport: DEFAULT_VIEWPORT,
  wiggleConfig: DEFAULT_WIGGLE_CONFIG,
  currentImage: null,
  isRendering: false,
  showControls: true,
  zoomLevel: 1.0,
  panOffset: { x: 0, y: 0 },
  canvasSize: { width: 800, height: 600 },

  // Actions
  setRenderMode: mode => set({ renderMode: mode }),
  setColormap: colormap => set({ colormap }),
  setAmplitudeScaling: scaling => set({ amplitudeScaling: scaling }),
  setWiggleConfig: partial =>
    set(state => ({
      wiggleConfig: { ...state.wiggleConfig, ...partial },
    })),
  updateViewport: partial =>
    set(state => ({
      viewport: { ...state.viewport, ...partial },
    })),
  setCurrentImage: image => set({ currentImage: image }),
  setIsRendering: isRendering => set({ isRendering }),
  setZoomLevel: zoom => set({ zoomLevel: zoom }),
  setPanOffset: offset => set({ panOffset: offset }),
  setCanvasSize: size => set({ canvasSize: size }),
  resetView: () =>
    set({
      viewport: DEFAULT_VIEWPORT,
      zoomLevel: 1.0,
      panOffset: { x: 0, y: 0 },
    }),
}));
