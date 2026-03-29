/**
 * Container that hosts the trace canvas and control panel with responsive sizing.
 */
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { useEffect, useRef, useState } from 'react';
import { TraceCanvas } from './TraceCanvas';
import { TraceControlPanel } from './TraceControlPanel';

/**
 * Trace visualization layout with resize-aware canvas and render status overlays.
 * Manages canvas sizing using ResizeObserver and debounces viewport updates to optimize rendering.
 *
 * @returns Trace visualization container with controls and canvas
 */
export const TraceVisualizationContainer = () => {
  const { updateViewport } = useTraceVisualizationStore();
  const mainRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const clampSize = (width: number, height: number) => ({
      width: Math.max(100, Math.round(width)),
      height: Math.max(100, Math.round(height)),
    });

    const isResizeSignificant = (
      currentViewport: { width: number; height: number },
      newWidth: number,
      newHeight: number
    ) => {
      const currentArea = currentViewport.width * currentViewport.height;
      const nextArea = newWidth * newHeight;
      const areaDelta = Math.abs(nextArea - currentArea);
      const areaThreshold = Math.max(2000, Math.round(currentArea * 0.005));
      const dimensionThreshold = Math.max(
        6,
        Math.round(Math.min(currentViewport.width, currentViewport.height) * 0.008)
      );

      return (
        areaDelta >= areaThreshold ||
        Math.abs(newWidth - currentViewport.width) >= dimensionThreshold ||
        Math.abs(newHeight - currentViewport.height) >= dimensionThreshold
      );
    };

    const updateCanvasSize = (newWidth: number, newHeight: number) => {
      setCanvasSize(prev => {
        if (prev.width === newWidth && prev.height === newHeight) return prev;
        return { width: newWidth, height: newHeight };
      });
    };

    // Debounced resize handler
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handleResize = (rawWidth: number, rawHeight: number) => {
      const { width: newWidth, height: newHeight } = clampSize(rawWidth, rawHeight);

      // Update canvas size immediately for smooth visual feedback, but don't trigger render
      updateCanvasSize(newWidth, newHeight);

      const currentViewport = useTraceVisualizationStore.getState().viewport;
      if (!isResizeSignificant(currentViewport, newWidth, newHeight)) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        return;
      }

      // Debounce the viewport update (which triggers render)
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        if (mainRef.current) {
          const { width, height } = mainRef.current.getBoundingClientRect();
          const { width: nextWidth, height: nextHeight } = clampSize(width, height);

          // Only update if dimensions actually changed
          const latestViewport = useTraceVisualizationStore.getState().viewport;
          if (isResizeSignificant(latestViewport, nextWidth, nextHeight)) {
            updateViewport({ width: nextWidth, height: nextHeight });
          }
        }
      }, 400); // Slightly shorter than the render debounce
    };

    // Initial size - update canvas immediately, debounce viewport update
    if (mainRef.current) {
      const { width, height } = mainRef.current.getBoundingClientRect();
      handleResize(width, height);
    }

    // Use ResizeObserver for more reliable measurement of the pane
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        handleResize(width, height);
      }
    });

    if (mainRef.current) {
      resizeObserver.observe(mainRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [updateViewport]);

  return (
    <div className="flex h-full flex-col bg-panel">
      {/* Control Panel - Compact Header */}
      <div className="flex-shrink-0 border-b border-border bg-panel-strong">
        <TraceControlPanel />
      </div>

      {/* Main Canvas Area */}
      <main
        ref={mainRef}
        className="canvas-shell relative flex-1 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-[var(--canvas-bg)]"
      >
        <aside className="pointer-events-none absolute right-3 top-3 z-20">
          <div className="group pointer-events-auto relative">
            <button
              type="button"
              aria-label="Show visualization shortcuts"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-panel-strong text-sm font-extrabold text-text shadow-[var(--shadow)] transition duration-200 hover:border-transparent hover:bg-panel-muted focus:outline-none focus:border-transparent focus:shadow-[0_0_0_2px_var(--accent-focus)] motion-reduce:transition-none"
            >
              ?
            </button>

            <div className="pointer-events-none absolute right-0 top-[calc(100%+0.4rem)] w-72 translate-y-1 rounded-[var(--radius-md)] border border-border bg-panel p-3 text-xs text-text opacity-0 shadow-[var(--shadow)] transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-dim">
                Navigation Help
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-center justify-between gap-3">
                  <kbd className="rounded border border-border bg-panel-muted px-1.5 py-0.5 font-mono text-[11px] text-text">
                    Scroll
                  </kbd>
                  <span className="text-right text-text-muted">Horizontal zoom</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <kbd className="rounded border border-border bg-panel-muted px-1.5 py-0.5 font-mono text-[11px] text-text">
                    Shift + Scroll
                  </kbd>
                  <span className="text-right text-text-muted">Vertical zoom</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <kbd className="rounded border border-border bg-panel-muted px-1.5 py-0.5 font-mono text-[11px] text-text">
                    Click + Drag
                  </kbd>
                  <span className="text-right text-text-muted">Pan canvas</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <kbd className="rounded border border-border bg-panel-muted px-1.5 py-0.5 font-mono text-[11px] text-text">
                    Ctrl/Cmd + O
                  </kbd>
                  <span className="text-right text-text-muted">Open local file</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <kbd className="rounded border border-border bg-panel-muted px-1.5 py-0.5 font-mono text-[11px] text-text">
                    Ctrl/Cmd + Shift + O
                  </kbd>
                  <span className="text-right text-text-muted">Open remote file</span>
                </li>
              </ul>
            </div>
          </div>
        </aside>

        <div className="relative z-[1] h-full w-full">
          {/* Tiled canvas renderer */}
          <TraceCanvas width={canvasSize.width} height={canvasSize.height} />
        </div>
      </main>
    </div>
  );
};
