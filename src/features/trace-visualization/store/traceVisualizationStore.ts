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

  // Rendered image cache
  currentImage: HTMLImageElement | ImageData | null;
  isRendering: boolean;
  renderProgress: number; // 0 to 1, where 1 is complete

  // UI state
  showControls: boolean;
  zoomLevel: number;
  zoomLevelY: number;
  panOffset: { x: number; y: number };
  canvasSize: { width: number; height: number };
  lastRenderedZoom: number; // Track zoom level at which current image was rendered

  // Actions
  setRenderMode: (mode: RenderMode) => void;
  setColormap: (colormap: ColormapType) => void;
  setAmplitudeScaling: (scaling: AmplitudeScaling) => void;
  setAmplitudeStats: (stats: AmplitudeStats | null) => void;
  setWiggleConfig: (config: Partial<WiggleConfig>) => void;
  updateViewport: (viewport: Partial<ViewportConfig>) => void;
  setCurrentImage: (image: HTMLImageElement | ImageData | null) => void;
  setIsRendering: (isRendering: boolean) => void;
  setRenderProgress: (progress: number) => void;
  setZoomLevel: (zoom: number) => void;
  setZoomLevelY: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setLastRenderedZoom: (zoom: number) => void;
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
  currentImage: null,
  isRendering: false,
  renderProgress: 0,
  showControls: true,
  zoomLevel: 1.0,
  zoomLevelY: 1.0,
  panOffset: { x: 0, y: 0 },
  canvasSize: { width: 800, height: 600 },
  lastRenderedZoom: 1.0,

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
  setCurrentImage: image => set({ currentImage: image }),
  setIsRendering: isRendering => set({ isRendering }),
  setRenderProgress: progress => set({ renderProgress: progress }),
  setZoomLevel: zoom => set({ zoomLevel: zoom }),
  setZoomLevelY: zoom => set({ zoomLevelY: zoom }),
  setPanOffset: offset => set({ panOffset: offset }),
  setCanvasSize: size => set({ canvasSize: size }),
  setLastRenderedZoom: zoom => set({ lastRenderedZoom: zoom }),
  resetView: () =>
    set({
      viewport: DEFAULT_VIEWPORT,
      zoomLevel: 1.0,
      zoomLevelY: 1.0,
      panOffset: { x: 0, y: 0 },
    }),
}));
