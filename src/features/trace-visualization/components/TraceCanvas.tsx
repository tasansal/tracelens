/**
 * Continuous 2D tiled canvas renderer with Lanczos3 interpolation.
 *
 * Implements:
 * - 2D tile grid positioned by trace column and sample row
 * - Viewport-based panning fetches new trace ranges on demand
 * - Single-pass Lanczos3 rendering for scientific accuracy
 * - Pan and zoom interactions with debounced re-rendering
 *
 * @returns Canvas element that paints tile layers and responds to pan/zoom input.
 */
import {
  INITIAL_VISIBLE_TRACES,
  useTileRenderer,
} from '@/features/trace-visualization/hooks/useTileRenderer';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import { useAppStore } from '@/shared/store/appStore';
import { useEffect, useRef, useState } from 'react';

interface TraceCanvasProps {
  width: number;
  height: number;
}

export const TraceCanvas = ({ width, height }: TraceCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    zoomLevel,
    zoomLevelY,
    panOffset,
    setZoomLevel,
    setZoomLevelY,
    setPanOffset,
    setCanvasSize,
  } = useTraceVisualizationStore();

  const { tiles, loadVisibleTiles, pixelsPerTrace, pixelsPerSample } = useTileRenderer();

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Keep refs in sync so the wheel handler always reads the latest values
  // without needing to re-register the listener on every zoom/pan change.
  const zoomRef = useRef(zoomLevel);
  const zoomYRef = useRef(zoomLevelY);
  const panRef = useRef(panOffset);
  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);
  useEffect(() => {
    zoomYRef.current = zoomLevelY;
  }, [zoomLevelY]);
  useEffect(() => {
    panRef.current = panOffset;
  }, [panOffset]);

  // Update canvas size in store
  useEffect(() => {
    setCanvasSize({ width, height });
  }, [width, height, setCanvasSize]);

  // Load tiles when viewport/zoom/pan changes
  useEffect(() => {
    loadVisibleTiles();
  }, [loadVisibleTiles]);

  // Render tiles to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Enable image smoothing for high-quality tile display
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Render each tile at its data-space position, transformed by pan/zoom.
    // Adjacent tiles share the same boundary value (tile N's startTrace +
    // traceCount === tile N+1's startTrace), so rounding the boundary points
    // with Math.round guarantees they snap to the identical pixel — no gap,
    // no overlap.
    tiles.forEach(tile => {
      if (tile.image) {
        const x = Math.round(tile.startTrace * pixelsPerTrace + panOffset.x);
        const y = Math.round(tile.startSample * pixelsPerSample + panOffset.y);
        const xEnd = Math.round((tile.startTrace + tile.traceCount) * pixelsPerTrace + panOffset.x);
        const yEnd = Math.round(
          (tile.startSample + tile.sampleCount) * pixelsPerSample + panOffset.y
        );

        const w = xEnd - x;
        const h = yEnd - y;

        if (w > 0 && h > 0 && tile.sourceWidth > 0 && tile.sourceHeight > 0) {
          ctx.drawImage(
            tile.image,
            tile.sourceX,
            tile.sourceY,
            tile.sourceWidth,
            tile.sourceHeight,
            x,
            y,
            w,
            h
          );
        }
      }
    });
  }, [tiles, width, height, panOffset, pixelsPerTrace, pixelsPerSample]);

  // Mouse wheel zoom (centered on cursor) — registered once and reads
  // current zoom/pan from refs to avoid stale closures and re-registration.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Accumulator + rAF-based throttle so rapid-fire wheel events are
    // batched into a single zoom update per animation frame.
    let accumulatedX = 0;
    let accumulatedY = 0;
    let rafId: number | null = null;
    let lastCursorX = 0;
    let lastCursorY = 0;

    const applyZoom = () => {
      rafId = null;

      const curPan = panRef.current;
      const totalTraces = useAppStore.getState().segyData?.total_traces ?? 0;

      let newPanX = curPan.x;
      let newPanY = curPan.y;

      // --- Vertical zoom (Shift+scroll) ---
      if (accumulatedY !== 0) {
        const dyV = accumulatedY;
        accumulatedY = 0;

        const curZoomY = zoomYRef.current;
        const zoomSpeed = 0.002;
        const clamped = Math.max(-150, Math.min(150, dyV));
        const factor = Math.exp(-clamped * zoomSpeed);

        // Min vertical zoom = 1.0 (all samples fit). Max = 50 (very zoomed in).
        const minZoomY = 1;
        const maxZoomY = 50;
        const newZoomY = Math.max(minZoomY, Math.min(maxZoomY, curZoomY * factor));

        // Vertical pan adjustment so point under cursor stays fixed
        const scaleY = newZoomY / curZoomY;
        newPanY = lastCursorY - scaleY * (lastCursorY - curPan.y);

        setZoomLevelY(newZoomY);
      }

      // --- Horizontal zoom (regular scroll) ---
      if (accumulatedX !== 0) {
        const dyH = accumulatedX;
        accumulatedX = 0;

        const curZoom = zoomRef.current;
        const zoomSpeed = 0.002;
        const clamped = Math.max(-150, Math.min(150, dyH));
        const factor = Math.exp(-clamped * zoomSpeed);

        // Min zoom: show all traces. Max zoom: ~10 traces visible.
        const minZoom =
          totalTraces > INITIAL_VISIBLE_TRACES ? INITIAL_VISIBLE_TRACES / totalTraces : 1;
        const maxZoom = Math.max(50, INITIAL_VISIBLE_TRACES / 10);
        const newZoom = Math.max(minZoom, Math.min(maxZoom, curZoom * factor));

        // Horizontal pan adjustment so point under cursor stays fixed
        const scaleX = newZoom / curZoom;
        newPanX = lastCursorX - scaleX * (lastCursorX - curPan.x);

        setZoomLevel(newZoom);
      }

      setPanOffset({ x: newPanX, y: newPanY });
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Normalize deltaY across browsers / input devices
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // line mode → approximate pixels
      if (e.deltaMode === 2) dy *= 100; // page mode → approximate pixels

      // Ignore negligible scroll impulses (< 1 px)
      if (Math.abs(dy) < 1) return;

      // Clamp individual event contribution to ±50 px so a single high-res
      // scroll tick can never jump more than ~1% zoom.
      const clampedDy = Math.max(-50, Math.min(50, dy));

      // Remember cursor position for zoom-toward-cursor
      const rect = canvas.getBoundingClientRect();
      lastCursorX = e.clientX - rect.left;
      lastCursorY = e.clientY - rect.top;

      // Shift+scroll → vertical zoom, regular scroll → horizontal zoom
      if (e.shiftKey) {
        accumulatedY += clampedDy;
      } else {
        accumulatedX += clampedDy;
      }

      // Schedule a single update per animation frame
      if (rafId === null) {
        rafId = requestAnimationFrame(applyZoom);
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [setZoomLevel, setZoomLevelY, setPanOffset]);

  // Mouse drag pan
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
