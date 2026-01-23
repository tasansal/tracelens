/**
 * Canvas renderer with zoom and pan for trace visualization images.
 */
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import React, { useEffect, useRef, useState } from 'react';

/**
 * Props for TraceCanvas size.
 */
interface TraceCanvasProps {
  width: number;
  height: number;
}

/**
 * Draws the current rendered trace image onto a canvas and handles pan/zoom.
 */
export const TraceCanvas: React.FC<TraceCanvasProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { currentImage, zoomLevel, panOffset, setZoomLevel, setPanOffset, setCanvasSize } =
    useTraceVisualizationStore();

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Update canvas size in store when dimensions change.
  useEffect(() => {
    setCanvasSize({ width, height });
  }, [width, height, setCanvasSize]);
  // Render image to canvas whenever it changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas.
    ctx.clearRect(0, 0, width, height);

    // Apply zoom and pan transforms.
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoomLevel, zoomLevel);

    // Draw image.
    if (currentImage instanceof HTMLImageElement) {
      ctx.drawImage(currentImage, 0, 0, width, height);
    } else if (currentImage instanceof ImageData) {
      // For ImageData, create temp canvas and draw.
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = currentImage.width;
      tempCanvas.height = currentImage.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(currentImage, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0, width, height);
      }
    }

    ctx.restore();
  }, [currentImage, width, height, panOffset, zoomLevel]);

  // Mouse wheel zoom with a non-passive listener for preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, zoomLevel * delta));
      setZoomLevel(newZoom);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [zoomLevel, setZoomLevel]);

  // Mouse drag pan.
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        display: 'block',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    />
  );
};
