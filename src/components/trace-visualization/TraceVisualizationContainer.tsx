import { useAppStore } from '@/store.ts';
import { useTraceVisualizationStore } from '@/store/traceVisualizationStore.ts';
import React, { useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '../LoadingSpinner';
import { TraceCanvas } from './TraceCanvas';
import { TraceControlPanel } from './TraceControlPanel';

export const TraceVisualizationContainer: React.FC = () => {
  const { isDarkMode } = useAppStore();
  const { isRendering, currentImage, updateViewport } = useTraceVisualizationStore();
  const mainRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateCanvasSize = (updateViewportDimensions = true) => {
      if (mainRef.current) {
        const { width, height } = mainRef.current.getBoundingClientRect();
        const newWidth = Math.max(100, Math.round(width));
        const newHeight = Math.max(100, Math.round(height));

        // Use functional update to ensure we're comparing with latest local state
        setCanvasSize(prev => {
          if (prev.width === newWidth && prev.height === newHeight) return prev;
          return { width: newWidth, height: newHeight };
        });

        // Only update viewport dimensions when requested (after debounce)
        if (updateViewportDimensions) {
          const currentViewport = useTraceVisualizationStore.getState().viewport;
          if (newWidth !== currentViewport.width || newHeight !== currentViewport.height) {
            updateViewport({ width: newWidth, height: newHeight });
          }
        }
      }
    };

    // Initial size - update viewport immediately
    updateCanvasSize(true);

    // Debounced resize handler
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      // Update canvas size immediately for smooth visual feedback, but don't trigger render
      updateCanvasSize(false);

      // Debounce the viewport update (which triggers render)
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (mainRef.current) {
          const { width, height } = mainRef.current.getBoundingClientRect();
          const newWidth = Math.max(100, Math.round(width));
          const newHeight = Math.max(100, Math.round(height));

          // Only update if dimensions actually changed
          const currentViewport = useTraceVisualizationStore.getState().viewport;
          if (newWidth !== currentViewport.width || newHeight !== currentViewport.height) {
            updateViewport({ width: newWidth, height: newHeight });
          }
        }
      }, 400); // Slightly shorter than the render debounce
    };

    // Use ResizeObserver for more reliable measurement of the pane
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const newWidth = Math.round(width);
        const newHeight = Math.round(height);

        // Always check against LATEST store state, not the state at the time of effect run
        const currentViewport = useTraceVisualizationStore.getState().viewport;

        // Only trigger handleResize if there's a meaningful change (>= 1px)
        if (
          Math.abs(newWidth - currentViewport.width) >= 1 ||
          Math.abs(newHeight - currentViewport.height) >= 1
        ) {
          handleResize();
        }
      }
    });

    if (mainRef.current) {
      resizeObserver.observe(mainRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, [updateViewport]);

  return (
    <div className="flex flex-col h-full">
      {/* Control Panel - Compact Header */}
      <div
        className={`border-b flex-shrink-0 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}
      >
        <TraceControlPanel />
      </div>

      {/* Main Canvas Area */}
      <main ref={mainRef} className="flex-1 relative overflow-hidden">
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        )}

        {!isRendering && !currentImage && (
          <div
            className={`absolute inset-0 flex items-center justify-center text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
          >
            <div>
              <p className="text-sm">Adjust settings to render visualization</p>
              <p className="text-xs mt-2">Changes auto-render after 500ms</p>
            </div>
          </div>
        )}

        {!isRendering && currentImage && (
          <TraceCanvas width={canvasSize.width} height={canvasSize.height} />
        )}
      </main>
    </div>
  );
};
