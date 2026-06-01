import { describe, expect, it } from 'vitest';
import {
  canvasInteractionReducer,
  initialCanvasInteractionState,
  type CanvasInteractionState,
} from './canvasInteractionReducer';

describe('canvasInteractionReducer', () => {
  it('initializes with correct defaults', () => {
    expect(initialCanvasInteractionState).toEqual({
      isDragging: false,
      showCrosshair: true,
      cursor: null,
      lockedTraceIdx: null,
      sampleValue: null,
    });
  });

  it('startDrag sets isDragging true', () => {
    const next = canvasInteractionReducer(initialCanvasInteractionState, { type: 'startDrag' });
    expect(next.isDragging).toBe(true);
  });

  it('endDrag sets isDragging false', () => {
    const dragging: CanvasInteractionState = { ...initialCanvasInteractionState, isDragging: true };
    const next = canvasInteractionReducer(dragging, { type: 'endDrag' });
    expect(next.isDragging).toBe(false);
  });

  it('setCursor updates cursor', () => {
    const next = canvasInteractionReducer(initialCanvasInteractionState, {
      type: 'setCursor',
      cursor: { x: 10, y: 20 },
    });
    expect(next.cursor).toEqual({ x: 10, y: 20 });
  });

  it('setCursor with null clears cursor', () => {
    const withCursor: CanvasInteractionState = {
      ...initialCanvasInteractionState,
      cursor: { x: 5, y: 5 },
    };
    const next = canvasInteractionReducer(withCursor, { type: 'setCursor', cursor: null });
    expect(next.cursor).toBeNull();
  });

  it('toggleCrosshair flips showCrosshair', () => {
    const s1 = canvasInteractionReducer(initialCanvasInteractionState, { type: 'toggleCrosshair' });
    expect(s1.showCrosshair).toBe(false);
    const s2 = canvasInteractionReducer(s1, { type: 'toggleCrosshair' });
    expect(s2.showCrosshair).toBe(true);
  });

  it('clearLockedTrace sets lockedTraceIdx to null', () => {
    const locked: CanvasInteractionState = { ...initialCanvasInteractionState, lockedTraceIdx: 42 };
    const next = canvasInteractionReducer(locked, { type: 'clearLockedTrace' });
    expect(next.lockedTraceIdx).toBeNull();
  });

  it('toggleLockedTrace sets index when previously null', () => {
    const next = canvasInteractionReducer(initialCanvasInteractionState, {
      type: 'toggleLockedTrace',
      traceIdx: 5,
    });
    expect(next.lockedTraceIdx).toBe(5);
  });

  it('toggleLockedTrace clears index when same trace toggled', () => {
    const locked: CanvasInteractionState = { ...initialCanvasInteractionState, lockedTraceIdx: 5 };
    expect(
      canvasInteractionReducer(locked, { type: 'toggleLockedTrace', traceIdx: 5 }).lockedTraceIdx
    ).toBeNull();
  });

  it('toggleLockedTrace switches to new index', () => {
    const locked: CanvasInteractionState = { ...initialCanvasInteractionState, lockedTraceIdx: 5 };
    expect(
      canvasInteractionReducer(locked, { type: 'toggleLockedTrace', traceIdx: 10 }).lockedTraceIdx
    ).toBe(10);
  });

  it('setSampleValue updates sampleValue', () => {
    const next = canvasInteractionReducer(initialCanvasInteractionState, {
      type: 'setSampleValue',
      value: 3.14,
    });
    expect(next.sampleValue).toBe(3.14);
  });

  it('leaveCanvas clears isDragging, cursor, sampleValue but preserves lockedTraceIdx and showCrosshair', () => {
    const active: CanvasInteractionState = {
      isDragging: true,
      showCrosshair: true,
      cursor: { x: 1, y: 2 },
      lockedTraceIdx: 3,
      sampleValue: 1.5,
    };
    const next = canvasInteractionReducer(active, { type: 'leaveCanvas' });
    expect(next.isDragging).toBe(false);
    expect(next.cursor).toBeNull();
    expect(next.sampleValue).toBeNull();
    expect(next.lockedTraceIdx).toBe(3);
    expect(next.showCrosshair).toBe(true);
  });
});
