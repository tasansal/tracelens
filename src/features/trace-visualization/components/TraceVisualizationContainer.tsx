/**
 * Container that hosts the trace canvas and control panel with responsive sizing.
 */
import { pxPerTrace } from '@/features/trace-visualization/renderer/constants';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useAppStore } from '@/shared/store/appStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useLayoutEffect, useRef, useState } from 'react';
import { TraceCanvas } from './TraceCanvas';
import { TraceControlPanel } from './TraceControlPanel';

/**
 * Debounce delay in ms before propagating a resize into the tile render viewport.
 * Local canvas size updates immediately for visual feedback; the store update
 * (which triggers tile re-rendering) is debounced to avoid render flooding.
 */
const RESIZE_DEBOUNCE_MS = 200;

/**
 * Trace visualization layout with resize-aware canvas and render status overlays.
 * ResizeObserver updates local canvas dimensions immediately for smooth feedback,
 * then debounces the store viewport update that triggers tile re-rendering.
 *
 * Typography (Task 4.2 final sweep / 4.2-mono): The "?" info affordance button uses
 * explicit `text-[length:var(--text-xs,10px)] font-extrabold` + vanishing-border surface (documented viz
 * chrome exception, distinct from header ghost and window controls; see design doc).
 * Popover content: section headers ("Navigation", "Viewport") and micro labels
 * ("Visible traces", "px / trace" etc.) correctly use `.text-eyebrow`; kbd shortcuts
 * use `font-mono text-[length:var(--text-sm,12px)]`; live viewport data values use `font-mono text-[length:var(--text-sm,12px)]
 * tabular-nums`. Longer descriptions use `text-text-muted` (proportional, correct
 * separation per 4.2-mono rules for HUD popovers). All short meta in dense technical
 * viz context. Design-language.md cites this + TraceControlPanel as canonical good
 * examples. No mono/eyebrow on sentences or help prose. Fully compliant; audited
 * clean in final sweep.
 *
 * @returns Trace visualization container with controls and canvas
 */
export const TraceVisualizationContainer = () => {
  const { updateViewport, zoomX, zoomY, panOffset, renderMode } = useTraceVisualizationStore();
  const { segyData } = useAppStore();
  const mainRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  const totalTraces = segyData?.total_traces ?? 0;
  const pixPerTrace = pxPerTrace(canvasSize.width, zoomX);
  const viewLeft = pixPerTrace > 0 ? -panOffset.x / pixPerTrace : 0;
  const viewRight = viewLeft + (pixPerTrace > 0 ? canvasSize.width / pixPerTrace : 0);
  const visibleTraces = Math.round(
    Math.max(0, Math.min(totalTraces, viewRight) - Math.max(0, viewLeft))
  );
  const wiggleLod = pixPerTrace >= 2 ? 'detail' : pixPerTrace <= 0.75 ? 'envelope' : 'transition';

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(100, Math.round(entry.contentRect.width));
      const height = Math.max(100, Math.round(entry.contentRect.height));

      // Update canvas element size immediately for smooth visual feedback.
      setCanvasSize(prev =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );

      // Debounce the store viewport update — this is what triggers tile re-rendering.
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const v = useTraceVisualizationStore.getState().viewport;
        if (v.width !== width || v.height !== height) {
          updateViewport({ width, height });
        }
      }, RESIZE_DEBOUNCE_MS);
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [updateViewport]);

  return (
    <ErrorBoundary
      title="Trace visualization unavailable"
      message="An error occurred while rendering the trace data"
    >
      <div className="flex h-full flex-col bg-panel">
        {/* Control Panel - Compact Header */}
        <div className="flex flex-shrink-0 items-center border-b border-border bg-panel-strong">
          <div className="flex-1">
            <TraceControlPanel />
          </div>
          <div className="pr-3">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Show visualization shortcuts"
                  className="focus-ring inline-flex size-5 items-center justify-center rounded-full border border-border bg-panel text-[length:var(--text-xs,10px)] font-extrabold text-text-dim transition duration-200 hover:border-transparent hover:bg-panel-muted hover:text-text motion-reduce:transition-none"
                >
                  ?
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-72 p-3">
                <p className="text-eyebrow mb-2">Navigation</p>
                <ul className="space-y-1.5">
                  {[
                    ['Scroll', 'Zoom'],
                    ['Shift + Scroll', 'Zoom vertical (samples)'],
                    ['Alt + Scroll', 'Zoom horizontal (traces)'],
                    ['Ctrl/Cmd + Scroll', 'Pan horizontal'],
                    ['Pinch', 'Zoom uniform'],
                    ['2-finger swipe', 'Pan (axis-locked or free)'],
                    ['Click + Drag', 'Pan canvas'],
                    ['Double-click', 'Jump to trace header'],
                    ['← →', 'Step traces (Shift ×10)'],
                    ['↑ ↓', 'Step samples (Shift ×10)'],
                    ['+ / -', 'Zoom in / out'],
                    ['Home / End', 'First / last trace'],
                    ['F', 'Fit height'],
                    ['R', 'Reset view'],
                    ['C', 'Toggle crosshair'],
                    ['Escape', 'Clear locked trace'],
                    ['Ctrl/Cmd + O', 'Open local file'],
                    ['Ctrl/Cmd + ⇧ + O', 'Open remote file'],
                  ].map(([key, desc]) => (
                    <li key={key} className="flex items-center justify-between gap-3">
                      <kbd className="shrink-0 rounded border border-border bg-panel-muted px-1.5 py-0.5 font-mono text-[length:var(--text-sm,12px)] text-text">
                        {key}
                      </kbd>
                      <span className="text-right text-text-muted">{desc}</span>
                    </li>
                  ))}
                </ul>

                {totalTraces > 0 && (
                  <>
                    <div className="my-2.5 border-t border-border" />
                    <p className="text-eyebrow mb-2">Viewport</p>
                    <ul className="space-y-1.5">
                      <li className="flex items-center justify-between gap-3">
                        <span className="text-eyebrow">Visible traces</span>
                        <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                          {visibleTraces.toLocaleString()} / {totalTraces.toLocaleString()}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3">
                        <span className="text-eyebrow">Scale</span>
                        <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                          {pixPerTrace.toFixed(2)} px/tr
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3">
                        <span className="text-eyebrow">H zoom</span>
                        <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                          {zoomX.toFixed(2)}×
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3">
                        <span className="text-eyebrow">V exag.</span>
                        <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                          {zoomY.toFixed(2)}×
                        </span>
                      </li>
                      {renderMode !== 'variable-density' && (
                        <li className="flex items-center justify-between gap-3">
                          <span className="text-eyebrow">Wiggle LOD</span>
                          <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                            {wiggleLod}
                          </span>
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Main Canvas Area */}
        <main
          ref={mainRef}
          className="canvas-shell relative flex-1 overflow-hidden rounded border border-border bg-[var(--canvas-bg)] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]"
        >
          <div className="relative z-[1] h-full w-full">
            <TraceCanvas width={canvasSize.width} height={canvasSize.height} />
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
};
