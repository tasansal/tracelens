/**
 * Keyboard shortcut handler for the trace visualization canvas.
 *
 * Registers a window-level `keydown` listener that maps shortcut keys to
 * dispatch actions and store mutations. Automatically skips when an input or
 * textarea has focus so native text-editing shortcuts are not intercepted.
 */
import { pxPerSample, pxPerTrace } from '@/features/trace-visualization/renderer/constants';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { useEffect, useRef, type Dispatch } from 'react';
import type { CanvasInteractionAction } from './canvasInteractionReducer';
import { applyZoomUniform, MIN_ZOOM_Y } from './gestureClassifier';

const ZOOM_STEP = 1.2;
const ARROW_STEP = 1;
const ARROW_STEP_LARGE = 10;

export interface CanvasKeyboardParams {
  /** When true the listener is not registered — use while a modal/dialog is open. */
  disabled: boolean;
  /** Reducer dispatch from `useReducer(canvasInteractionReducer, ...)`. */
  dispatch: Dispatch<CanvasInteractionAction>;
  /** Total number of traces in the loaded SEG-Y file. */
  totalTraces: number;
  /** Total number of samples per trace in the loaded SEG-Y file. */
  totalSamples: number;
  /** Canvas viewport width in CSS pixels. */
  viewportWidth: number;
  /** Canvas viewport height in CSS pixels. */
  viewportHeight: number;
}

/**
 * Registers all canvas keyboard shortcuts on the window.
 *
 * Shortcuts supported:
 * - `ArrowLeft / Right / Up / Down` — pan one trace / sample step (×10 with Shift)
 * - `Home` — jump to first trace (panX = 0)
 * - `End` — jump to last trace
 * - `+` / `=` — zoom in uniformly
 * - `-` — zoom out uniformly
 * - `f` / `F` — fit vertical (reset zoomY + panY)
 * - `r` / `R` — reset entire view
 * - `c` / `C` — toggle crosshair
 * - `Escape` — clear locked trace
 *
 * Arrow keys and +/- respect browser key-repeat via `keydown`.
 *
 * @param params - Hook parameters (see {@link CanvasKeyboardParams}).
 */
export function useCanvasKeyboard({
  disabled,
  dispatch,
  totalTraces,
  totalSamples,
  viewportWidth,
  viewportHeight,
}: CanvasKeyboardParams): void {
  const paramsRef = useRef({ totalTraces, totalSamples, viewportWidth, viewportHeight });
  useEffect(() => {
    paramsRef.current = { totalTraces, totalSamples, viewportWidth, viewportHeight };
  });

  useEffect(() => {
    if (disabled) return;

    const handleKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const { totalTraces, totalSamples, viewportWidth, viewportHeight } = paramsRef.current;
      const store = useTraceVisualizationStore.getState();
      const { zoomX, zoomY, panOffset } = store;

      const step = e.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
      const pxTrace = pxPerTrace(viewportWidth, zoomX);
      const pxSample = pxPerSample(viewportHeight, totalSamples, zoomY);

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          store.setPanOffset({ x: panOffset.x + step * pxTrace, y: panOffset.y });
          break;

        case 'ArrowRight':
          e.preventDefault();
          store.setPanOffset({ x: panOffset.x - step * pxTrace, y: panOffset.y });
          break;

        case 'ArrowUp':
          e.preventDefault();
          store.setPanOffset({ x: panOffset.x, y: panOffset.y + step * pxSample });
          break;

        case 'ArrowDown':
          e.preventDefault();
          store.setPanOffset({ x: panOffset.x, y: panOffset.y - step * pxSample });
          break;

        case 'Home':
          e.preventDefault();
          store.setPanOffset({ x: 0, y: panOffset.y });
          break;

        case 'End': {
          e.preventDefault();
          const lastTraceCenter = (totalTraces - 1) * pxTrace;
          store.setPanOffset({ x: viewportWidth / 2 - lastTraceCenter, y: panOffset.y });
          break;
        }

        case '+':
        case '=': {
          e.preventDefault();
          const anchor = { x: viewportWidth / 2, y: viewportHeight / 2 };
          const result = applyZoomUniform(ZOOM_STEP, zoomX, zoomY, panOffset, anchor, totalTraces);
          useTraceVisualizationStore.setState({
            zoomX: result.newZoomX,
            zoomY: result.newZoomY,
            panOffset: { x: result.newPanX, y: result.newPanY },
          });
          break;
        }

        case '-': {
          e.preventDefault();
          const anchor = { x: viewportWidth / 2, y: viewportHeight / 2 };
          const result = applyZoomUniform(
            1 / ZOOM_STEP,
            zoomX,
            zoomY,
            panOffset,
            anchor,
            totalTraces
          );
          useTraceVisualizationStore.setState({
            zoomX: result.newZoomX,
            zoomY: result.newZoomY,
            panOffset: { x: result.newPanX, y: result.newPanY },
          });
          break;
        }

        case 'f':
        case 'F':
          e.preventDefault();
          useTraceVisualizationStore.setState({
            zoomY: MIN_ZOOM_Y,
            panOffset: { x: panOffset.x, y: 0 },
          });
          break;

        case 'r':
        case 'R':
          e.preventDefault();
          store.resetView();
          break;

        case 'c':
        case 'C':
          dispatch({ type: 'toggleCrosshair' });
          break;

        case 'Escape':
          dispatch({ type: 'clearLockedTrace' });
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [disabled, dispatch]);
}
