import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { renderHook } from '@testing-library/react';
import type { Dispatch } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasInteractionAction } from './canvasInteractionReducer';
import { useCanvasKeyboard } from './useCanvasKeyboard';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useCanvasKeyboard', () => {
  let dispatch: Dispatch<CanvasInteractionAction>;

  beforeEach(() => {
    dispatch = vi.fn();
    useTraceVisualizationStore.setState({
      zoomX: 1.0,
      zoomY: 1.0,
      panOffset: { x: 0, y: 0 },
    });
  });

  afterEach(() => {
    useTraceVisualizationStore.setState({
      zoomX: 1.0,
      zoomY: 1.0,
      panOffset: { x: 0, y: 0 },
    });
    vi.restoreAllMocks();
  });

  it('registers keydown listener on mount and removes it on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('does not register listener when disabled', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() =>
      useCanvasKeyboard({
        disabled: true,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('C key dispatches toggleCrosshair', () => {
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    fireKey('c');
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleCrosshair' });
  });

  it('Escape dispatches clearLockedTrace', () => {
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    fireKey('Escape');
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearLockedTrace' });
  });

  it('Home key sets panX to 0 and leaves panY unchanged', () => {
    useTraceVisualizationStore.setState({ panOffset: { x: -300, y: -100 } });
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    fireKey('Home');
    expect(useTraceVisualizationStore.getState().panOffset.x).toBe(0);
    expect(useTraceVisualizationStore.getState().panOffset.y).toBe(-100);
  });

  it('R key resets view', () => {
    useTraceVisualizationStore.setState({ zoomX: 3.0, zoomY: 2.0, panOffset: { x: -100, y: -50 } });
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    fireKey('r');
    const store = useTraceVisualizationStore.getState();
    expect(store.zoomX).toBe(1.0);
    expect(store.zoomY).toBe(1.0);
    expect(store.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('F key resets zoomY to 1.0 and panY to 0, leaves zoomX unchanged', () => {
    useTraceVisualizationStore.setState({ zoomX: 3.0, zoomY: 5.0, panOffset: { x: -50, y: -200 } });
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    fireKey('f');
    const store = useTraceVisualizationStore.getState();
    expect(store.zoomY).toBe(1.0);
    expect(store.panOffset.y).toBe(0);
    expect(store.zoomX).toBe(3.0);
  });

  it('+ key zooms in on both axes', () => {
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    fireKey('+');
    const store = useTraceVisualizationStore.getState();
    expect(store.zoomX).toBeGreaterThan(1.0);
    expect(store.zoomY).toBeGreaterThan(1.0);
  });

  it('= key also zooms in', () => {
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    fireKey('=');
    expect(useTraceVisualizationStore.getState().zoomX).toBeGreaterThan(1.0);
  });

  it('- key zooms out', () => {
    useTraceVisualizationStore.setState({ zoomX: 5.0, zoomY: 5.0 });
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    fireKey('-');
    expect(useTraceVisualizationStore.getState().zoomX).toBeLessThan(5.0);
  });

  it('skips shortcuts when document.activeElement is an input', () => {
    renderHook(() =>
      useCanvasKeyboard({
        disabled: false,
        dispatch,
        totalTraces: 100,
        totalSamples: 500,
        viewportWidth: 800,
        viewportHeight: 600,
      })
    );
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireKey('c');
    expect(dispatch).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
