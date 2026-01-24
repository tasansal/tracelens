/**
 * Container that hosts the trace canvas and control panel with responsive sizing.
 */
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import React, { useEffect, useRef, useState } from 'react';
import { TraceCanvas } from './TraceCanvas';
import { TraceControlPanel } from './TraceControlPanel';

/**
 * Trace visualization layout with resize-aware canvas and render status overlays.
 */
export const TraceVisualizationContainer: React.FC = () => {
  const { isRendering, currentImage, updateViewport } = useTraceVisualizationStore();
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
      <div className="panel-header flex-shrink-0">
        <TraceControlPanel />
      </div>

      {/* Main Canvas Area */}
      <main ref={mainRef} className="canvas-shell flex-1 overflow-hidden">
        <div className="canvas-layer h-full w-full">
          {isRendering && (
            <div className="absolute inset-0 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          )}

          {!isRendering && !currentImage && (
            <div className="absolute inset-0 flex items-center justify-center text-center text-muted">
              <div>
                <p className="text-sm">Adjust settings to render visualization</p>
                <p className="mt-2 text-xs text-dim">Changes auto-render after 500ms</p>
              </div>
            </div>
          )}

          {!isRendering && currentImage && (
            <TraceCanvas width={canvasSize.width} height={canvasSize.height} />
          )}
        </div>
      </main>
    </div>
  );
};
