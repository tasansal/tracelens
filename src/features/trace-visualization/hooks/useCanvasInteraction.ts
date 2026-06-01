import {
  pixelToIndex,
  pxPerSample,
  pxPerTrace,
} from '@/features/trace-visualization/renderer/constants';
import type { TraceScene } from '@/features/trace-visualization/renderer/traceScene';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { getSampleValue } from '@/shared/api/tauri/segy';
import { useAppStore } from '@/shared/store/appStore';
import { useEffect, useReducer, useRef, type RefObject } from 'react';
import {
  canvasInteractionReducer,
  initialCanvasInteractionState,
} from './canvasInteractionReducer';
import {
  applyZoomUniform,
  applyZoomX,
  applyZoomY,
  extractMagnitude,
  getMaxZoomX,
  getMinZoomX,
  MAX_ZOOM_Y,
  MIN_ZOOM_Y,
  normalizeDelta,
  type ClassifiedGesture,
} from './gestureClassifier';
import { useCanvasKeyboard } from './useCanvasKeyboard';
import { useGestureClassifier } from './useGestureClassifier';

const MOUSE_ZOOM_RATE = 0.005;
const PINCH_ZOOM_RATE = 0.015;

export interface CanvasInteractionParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sceneRef: RefObject<TraceScene | null>;
  width: number;
  height: number;
  totalTraces: number;
  totalSamples: number;
  filePath: string | null;
  disabled?: boolean;
}

export interface CanvasInteractionResult {
  isDragging: boolean;
  showCrosshair: boolean;
  cursor: { x: number; y: number } | null;
  lockedTraceIdx: number | null;
  sampleValue: number | null;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave: () => void;
}

function useLatestRef<T>(value: T): { current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Top-level canvas interaction hook. Composes gesture classification, keyboard
 * shortcuts, and mouse drag. Owns all writes to zoomX, zoomY, and panOffset.
 */
export function useCanvasInteraction({
  canvasRef,
  sceneRef,
  width,
  height,
  totalTraces,
  totalSamples,
  filePath,
  disabled = false,
}: CanvasInteractionParams): CanvasInteractionResult {
  const [interaction, dispatch] = useReducer(
    canvasInteractionReducer,
    initialCanvasInteractionState
  );
  const { isDragging, showCrosshair, cursor, lockedTraceIdx, sampleValue } = interaction;

  // Latest-value refs — wheel/drag rAF callbacks read these instead of
  // capturing stale closure values.
  const widthRef = useLatestRef(width);
  const heightRef = useLatestRef(height);
  const totalTracesRef = useLatestRef(totalTraces);
  const totalSamplesRef = useLatestRef(totalSamples);
  const zoomXRef = useRef(useTraceVisualizationStore.getState().zoomX);
  const zoomYRef = useRef(useTraceVisualizationStore.getState().zoomY);
  const panRef = useRef(useTraceVisualizationStore.getState().panOffset);

  // Keep zoom/pan refs in sync with any external store writes
  // (e.g. keyboard shortcuts, settings reset).
  useEffect(() => {
    return useTraceVisualizationStore.subscribe(state => {
      zoomXRef.current = state.zoomX;
      zoomYRef.current = state.zoomY;
      panRef.current = state.panOffset;
    });
  }, []);

  // Consume traceLock signals from other features (header panel trace number entry)
  // and apply them to our local interaction state. Includes one-time initial sync
  // in case a lock was queued before the canvas mounted.
  // Mirrors the traceJump subscription pattern in useTraceHeader.
  useEffect(() => {
    // Handle any value that was set while this canvas wasn't mounted
    const initial = useAppStore.getState().traceLock;
    if (initial !== null) {
      dispatch({ type: 'setLockedTrace', traceIdx: initial });
      useAppStore.getState().setTraceLock(null);
    }

    return useAppStore.subscribe((state, prev) => {
      if (state.traceLock === null || state.traceLock === prev.traceLock) return;
      const lockIdx = state.traceLock;
      dispatch({ type: 'setLockedTrace', traceIdx: lockIdx });
      useAppStore.getState().setTraceLock(null);
    });
  }, [dispatch]);

  // When a new file is loaded (totalTraces changes), clear any stale locked trace
  // from the previous dataset so we don't draw a highlight at an invalid/out-of-range position.
  const prevTotalRef = useRef(totalTraces);
  useEffect(() => {
    if (prevTotalRef.current !== totalTraces && totalTraces > 0) {
      dispatch({ type: 'clearLockedTrace' });
    }
    prevTotalRef.current = totalTraces;
  }, [totalTraces, dispatch]);

  const wheelRafRef = useRef<number | null>(null);

  const flushWheelUpdate = () => {
    wheelRafRef.current = null;
    useTraceVisualizationStore.setState({
      zoomX: zoomXRef.current,
      zoomY: zoomYRef.current,
      panOffset: panRef.current,
    });
  };

  const handleGesture = (gesture: ClassifiedGesture, e: WheelEvent) => {
    const mag = extractMagnitude(e);
    const { dx, dy } = normalizeDelta(e);
    const curZoomX = zoomXRef.current;
    const curZoomY = zoomYRef.current;
    const curPan = panRef.current;
    const traceCount = totalTracesRef.current;

    switch (gesture.intent) {
      case 'zoom-uniform': {
        const rate = gesture.device === 'trackpad-pinch' ? PINCH_ZOOM_RATE : MOUSE_ZOOM_RATE;
        const factor = Math.exp(-rate * mag);
        const result = applyZoomUniform(
          factor,
          curZoomX,
          curZoomY,
          curPan,
          gesture.anchor,
          traceCount
        );
        zoomXRef.current = result.newZoomX;
        zoomYRef.current = result.newZoomY;
        panRef.current = { x: result.newPanX, y: result.newPanY };
        break;
      }
      case 'zoom-horizontal': {
        const factor = Math.exp(-MOUSE_ZOOM_RATE * mag);
        const result = applyZoomX(factor, curZoomX, curPan, gesture.anchor.x, traceCount);
        zoomXRef.current = result.newZoomX;
        panRef.current = { ...curPan, x: result.newPanX };
        break;
      }
      case 'zoom-vertical': {
        const factor = Math.exp(-MOUSE_ZOOM_RATE * mag);
        const result = applyZoomY(factor, curZoomY, curPan, gesture.anchor.y);
        zoomYRef.current = result.newZoomY;
        panRef.current = { ...curPan, y: result.newPanY };
        break;
      }
      case 'pan-horizontal':
        panRef.current = { ...curPan, x: curPan.x - mag };
        break;
      case 'pan-vertical':
        panRef.current = { ...curPan, y: curPan.y - mag };
        break;
      case 'pan-free':
        panRef.current = { x: curPan.x - dx, y: curPan.y - dy };
        break;
    }

    if (wheelRafRef.current === null) {
      wheelRafRef.current = requestAnimationFrame(flushWheelUpdate);
    }
  };

  useGestureClassifier(canvasRef, handleGesture, disabled);
  useCanvasKeyboard({
    disabled,
    dispatch,
    totalTraces,
    totalSamples,
    viewportWidth: width,
    viewportHeight: height,
  });

  // Drag pan fast-path: mousemove writes here and into the scene directly,
  // bypassing Zustand to avoid re-render storms across pan-subscribed components.
  // onMouseDown seeds dragPanRef; the store is only updated once on mouseup.
  const dragPanRef = useRef(useTraceVisualizationStore.getState().panOffset);
  const dragOriginRef = useRef<{
    mouseX: number;
    mouseY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const dragRafRef = useRef<number | null>(null);

  const flushDragUpdate = () => {
    dragRafRef.current = null;
    const scene = sceneRef.current;
    if (!scene) return;
    scene.update({
      viewportWidth: widthRef.current,
      viewportHeight: heightRef.current,
      totalTraces: totalTracesRef.current,
      totalSamples: totalSamplesRef.current,
      zoomX: zoomXRef.current,
      zoomY: zoomYRef.current,
      panX: dragPanRef.current.x,
      panY: dragPanRef.current.y,
    });
  };

  const commitDragPan = () => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (dragOriginRef.current) {
      const target = dragPanRef.current;
      if (target.x !== dragOriginRef.current.panX || target.y !== dragOriginRef.current.panY) {
        useTraceVisualizationStore.setState({ panOffset: { x: target.x, y: target.y } });
      }
      dragOriginRef.current = null;
    }
  };

  const sampleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedCellRef = useRef<{ trace: number; sample: number } | null>(null);
  const sampleRequestIdRef = useRef(0);

  useEffect(() => {
    sampleRequestIdRef.current++;
    lastFetchedCellRef.current = null;
    dispatch({ type: 'setSampleValue', value: null });
  }, [filePath]);

  // Clamp zoom/pan when the loaded file changes (different trace count).
  // This fixes the case where a previous "zoomed out" state on a large file
  // would leave a tiny new file with tons of empty space.
  useEffect(() => {
    if (totalTraces <= 0) return;

    const minZoomX = getMinZoomX(totalTraces);
    const maxZoomX = getMaxZoomX();

    let zoomX = zoomXRef.current;
    let panX = panRef.current.x;
    let changed = false;

    const clampedX = Math.max(minZoomX, Math.min(maxZoomX, zoomX));
    if (clampedX !== zoomX) {
      zoomX = clampedX;
      // When clamping down (new file smaller than previous view), reset pan for a clean start
      if (zoomX < zoomXRef.current) panX = 0;
      zoomXRef.current = zoomX;
      changed = true;
    }

    const clampedY = Math.max(MIN_ZOOM_Y, Math.min(MAX_ZOOM_Y, zoomYRef.current));
    if (clampedY !== zoomYRef.current) {
      zoomYRef.current = clampedY;
      changed = true;
    }

    if (changed) {
      useTraceVisualizationStore.setState({
        zoomX,
        zoomY: zoomYRef.current,
        panOffset: { x: panX, y: panRef.current.y },
      });
      panRef.current = { x: panX, y: panRef.current.y };
    }
  }, [totalTraces]);

  useEffect(
    () => () => {
      sampleRequestIdRef.current++;
      if (sampleTimerRef.current) clearTimeout(sampleTimerRef.current);
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current);
      if (wheelRafRef.current !== null) cancelAnimationFrame(wheelRafRef.current);
    },
    []
  );

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    dragOriginRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    dragPanRef.current = { x: pan.x, y: pan.y };
    dispatch({ type: 'startDrag' });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (isDragging && dragOriginRef.current) {
      const origin = dragOriginRef.current;
      dragPanRef.current = {
        x: origin.panX + (e.clientX - origin.mouseX),
        y: origin.panY + (e.clientY - origin.mouseY),
      };
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(flushDragUpdate);
      }
      return;
    }

    dispatch({ type: 'setCursor', cursor: pos });

    if (!filePath) return;
    const pxTrace = pxPerTrace(width, zoomXRef.current);
    const pxSample = pxPerSample(height, totalSamples, zoomYRef.current);
    const pan = panRef.current;

    const tIdx = pixelToIndex(pos.x, pan.x, pxTrace, totalTracesRef.current);
    const sIdx = pixelToIndex(pos.y, pan.y, pxSample, totalSamplesRef.current);
    if (tIdx === null || sIdx === null) return;

    if (sampleTimerRef.current) clearTimeout(sampleTimerRef.current);
    const last = lastFetchedCellRef.current;
    if (last && last.trace === tIdx && last.sample === sIdx) return;

    const requestId = ++sampleRequestIdRef.current;
    sampleTimerRef.current = setTimeout(() => {
      lastFetchedCellRef.current = { trace: tIdx, sample: sIdx };
      void getSampleValue(filePath, tIdx, sIdx)
        .then(value => {
          if (requestId === sampleRequestIdRef.current) {
            dispatch({ type: 'setSampleValue', value });
          }
        })
        .catch(() => {
          if (requestId === sampleRequestIdRef.current) {
            dispatch({ type: 'setSampleValue', value: null });
          }
        });
    }, 30);
  };

  const onMouseUp = () => {
    commitDragPan();
    dispatch({ type: 'endDrag' });
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    const pxTrace = pxPerTrace(width, zoomXRef.current);
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const tIdx = pixelToIndex(x, pan.x, pxTrace, totalTraces);
    if (tIdx === null) return;
    useAppStore.getState().setTraceJump(tIdx + 1);
    dispatch({ type: 'toggleLockedTrace', traceIdx: tIdx });
  };

  const onMouseLeave = () => {
    commitDragPan();
    dispatch({ type: 'leaveCanvas' });
    sampleRequestIdRef.current++;
    lastFetchedCellRef.current = null;
    if (sampleTimerRef.current) clearTimeout(sampleTimerRef.current);
  };

  return {
    isDragging,
    showCrosshair,
    cursor,
    lockedTraceIdx,
    sampleValue,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDoubleClick,
    onMouseLeave,
  };
}
