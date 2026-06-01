/** Reducer and state types for canvas pointer/interaction state in the trace viewer. */

export interface CanvasInteractionState {
  isDragging: boolean;
  showCrosshair: boolean;
  cursor: { x: number; y: number } | null;
  lockedTraceIdx: number | null;
  sampleValue: number | null;
}

export type CanvasInteractionAction =
  | { type: 'startDrag' }
  | { type: 'endDrag' }
  | { type: 'setCursor'; cursor: { x: number; y: number } | null }
  | { type: 'toggleCrosshair' }
  | { type: 'clearLockedTrace' }
  | { type: 'toggleLockedTrace'; traceIdx: number }
  | { type: 'setLockedTrace'; traceIdx: number | null }
  | { type: 'setSampleValue'; value: number | null }
  | { type: 'leaveCanvas' };

export const initialCanvasInteractionState: CanvasInteractionState = {
  isDragging: false,
  showCrosshair: true,
  cursor: null,
  lockedTraceIdx: null,
  sampleValue: null,
};

export function canvasInteractionReducer(
  state: CanvasInteractionState,
  action: CanvasInteractionAction
): CanvasInteractionState {
  switch (action.type) {
    case 'startDrag':
      return { ...state, isDragging: true };
    case 'endDrag':
      return { ...state, isDragging: false };
    case 'setCursor':
      return { ...state, cursor: action.cursor };
    case 'toggleCrosshair':
      return { ...state, showCrosshair: !state.showCrosshair };
    case 'clearLockedTrace':
      return { ...state, lockedTraceIdx: null };
    case 'toggleLockedTrace':
      return {
        ...state,
        lockedTraceIdx: state.lockedTraceIdx === action.traceIdx ? null : action.traceIdx,
      };
    case 'setLockedTrace':
      return { ...state, lockedTraceIdx: action.traceIdx };
    case 'setSampleValue':
      return { ...state, sampleValue: action.value };
    case 'leaveCanvas':
      return { ...state, isDragging: false, cursor: null, sampleValue: null };
    default:
      return state;
  }
}
