/**
 * Hook for managing continuous 2D tiled rendering with Lanczos3 interpolation.
 *
 * Implements:
 * - 2D tile grid: trace columns × sample rows
 * - Viewport-based visibility — traces fetched on demand as user pans
 * - Tile cache with LRU eviction for off-screen tiles
 * - Single-pass Lanczos3 rendering for scientific accuracy
 * - Debounced tile loading to avoid render flooding during pan/zoom
 * - Canvas resize tolerance to skip re-renders on small changes
 *
 * @returns Render state, cached tiles, and commands for adaptive tile loading.
 */
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import {
  makeTileKey,
  type RenderedImage,
  type TileKey,
  type TileLayer,
  type TileRequest,
} from '@/features/trace-visualization/types/rendering';
import { renderTile } from '@/shared/api/tauri/segy';
import { useAppStore } from '@/shared/store/appStore';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Number of traces per tile column.
 */
const TILE_WIDTH_TRACES = 100;

/**
 * Base number of samples per tile row.
 */
const BASE_TILE_HEIGHT_SAMPLES = 512;

/**
 * Horizontal trace overlap between adjacent tiles.
 *
 * This gives Lanczos3 interpolation a small context window at column edges.
 */
const TILE_HORIZONTAL_OVERLAP_TRACES = 2;

/**
 * Minimum adaptive vertical tile height in samples.
 */
const MIN_TILE_HEIGHT_SAMPLES = 64;

/**
 * Target on-screen height for a vertical tile.
 */
const TARGET_TILE_HEIGHT_PX = 1024;

/**
 * Quantization step for adaptive tile heights.
 */
const TILE_HEIGHT_STEP_SAMPLES = 32;

/**
 * Vertical sample overlap between adjacent tiles.
 *
 * This provides interpolation context so per-tile Lanczos3 resize does not
 * create visible seams at row boundaries.
 */
const TILE_VERTICAL_OVERLAP_SAMPLES = 8;

/**
 * Debounce delay in ms before triggering tile re-render on zoom/pan changes.
 */
const RENDER_DEBOUNCE_MS = 150;

/**
 * Minimum canvas dimension change (in pixels) to trigger a full re-render.
 */
const CANVAS_RESIZE_THRESHOLD = 20;

/**
 * Maximum number of cached tiles before evicting distant ones.
 */
const MAX_CACHED_TILES = 200;

/**
 * Number of extra tiles to prefetch beyond the visible area in each direction.
 */
const TILE_PREFETCH = 1;

/**
 * Number of traces visible at zoom level 1.0 (the default view).
 * All zoom calculations are based on this baseline.
 */
export const INITIAL_VISIBLE_TRACES = 500;

/**
 * Helper to create an HTMLImageElement from base64-encoded RenderedImage data.
 */
async function createImageFromRendered(rendered: RenderedImage): Promise<HTMLImageElement> {
  const dataUrl = `data:image/png;base64,${rendered.data}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load tile image'));
    img.src = dataUrl;
  });
}

/**
 * Adapt vertical tile sample height so zoomed-in tiles do not become excessively large.
 */
function computeAdaptiveTileHeightSamples(pixelsPerSample: number): number {
  if (!Number.isFinite(pixelsPerSample) || pixelsPerSample <= 0) {
    return BASE_TILE_HEIGHT_SAMPLES;
  }

  const idealSamples = Math.round(TARGET_TILE_HEIGHT_PX / pixelsPerSample);
  const clamped = Math.max(
    MIN_TILE_HEIGHT_SAMPLES,
    Math.min(BASE_TILE_HEIGHT_SAMPLES, idealSamples)
  );

  return Math.max(
    MIN_TILE_HEIGHT_SAMPLES,
    Math.min(
      BASE_TILE_HEIGHT_SAMPLES,
      Math.ceil(clamped / TILE_HEIGHT_STEP_SAMPLES) * TILE_HEIGHT_STEP_SAMPLES
    )
  );
}

export function useTileRenderer() {
  const { filePath, segyData } = useAppStore();
  const {
    viewport,
    colormap,
    amplitudeScaling,
    renderMode,
    wiggleConfig,
    panOffset,
    zoomLevel,
    zoomLevelY,
  } = useTraceVisualizationStore();

  const [tiles, setTiles] = useState<Map<TileKey, TileLayer>>(new Map());
  const [isRendering, setIsRendering] = useState(false);

  // Track active render operations to cancel stale requests
  const renderIdRef = useRef(0);
  // Debounce timer for zoom/pan changes
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Last rendered canvas size for resize tolerance
  const lastRenderedSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  // Last rendered zoom level — tiles are invalidated when zoom changes significantly
  const lastRenderedZoomRef = useRef(1.0);
  const lastRenderedZoomYRef = useRef(1.0);
  const lastRenderedTileHeightRef = useRef(BASE_TILE_HEIGHT_SAMPLES);
  // Last rendered visual settings — tiles are invalidated when these change
  const lastRenderedSettingsRef = useRef<string>('');
  // Ref mirror of tiles state so loadVisibleTilesImmediate can read the
  // latest cache without including `tiles` in its dependency array (which
  // would create a feedback loop: setTiles → new callback → useEffect → re-load).
  const tilesRef = useRef<Map<TileKey, TileLayer>>(new Map());
  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  const totalTraces = segyData?.total_traces ?? 0;
  const totalSamples = (segyData?.binary_header.samples_per_trace as number | undefined) ?? 0;

  /**
   * Pixels per trace at the current zoom level.
   * At zoom=1, exactly INITIAL_VISIBLE_TRACES (500) traces fit the canvas width.
   * Zoom >1 shows fewer traces (zoomed in), zoom <1 shows more (zoomed out).
   */
  const pixelsPerTrace = (viewport.width / INITIAL_VISIBLE_TRACES) * zoomLevel;

  /**
   * Pixels per sample at the current vertical zoom level.
   * At zoomLevelY=1, all samples fit the canvas height.
   * zoomLevelY >1 zooms in (fewer samples visible), <1 is not allowed.
   */
  const pixelsPerSample = totalSamples > 0 ? (viewport.height / totalSamples) * zoomLevelY : 1;
  const tileHeightSamples = computeAdaptiveTileHeightSamples(pixelsPerSample);

  /**
   * Calculate which 2D tiles are visible based on current pan/zoom viewport.
   */
  const calculateVisibleTiles = useCallback(() => {
    if (totalTraces === 0 || totalSamples === 0) {
      return { startCol: 0, endCol: -1, startRow: 0, endRow: -1, totalCols: 0, totalRows: 0 };
    }

    const totalCols = Math.ceil(totalTraces / TILE_WIDTH_TRACES);
    const totalRows = Math.ceil(totalSamples / tileHeightSamples);

    // Visible area in "data space" (trace index, sample index)
    const viewLeftTrace = -panOffset.x / pixelsPerTrace;
    const viewRightTrace = viewLeftTrace + viewport.width / pixelsPerTrace;
    const viewTopSample = -panOffset.y / pixelsPerSample;
    const viewBottomSample = viewTopSample + viewport.height / pixelsPerSample;

    // Convert to tile indices with prefetch margin
    const startCol = Math.max(0, Math.floor(viewLeftTrace / TILE_WIDTH_TRACES) - TILE_PREFETCH);
    const endCol = Math.min(
      totalCols - 1,
      Math.floor(viewRightTrace / TILE_WIDTH_TRACES) + TILE_PREFETCH
    );
    const startRow = Math.max(0, Math.floor(viewTopSample / tileHeightSamples) - TILE_PREFETCH);
    const endRow = Math.min(
      totalRows - 1,
      Math.floor(viewBottomSample / tileHeightSamples) + TILE_PREFETCH
    );

    return { startCol, endCol, startRow, endRow, totalCols, totalRows };
  }, [
    totalTraces,
    totalSamples,
    panOffset.x,
    panOffset.y,
    pixelsPerTrace,
    pixelsPerSample,
    tileHeightSamples,
    viewport.width,
    viewport.height,
  ]);

  /**
   * Render a single 2D tile with Lanczos3 interpolation.
   */
  const renderSingleTile = useCallback(
    async (
      col: number,
      row: number,
      currentRenderId: number
    ): Promise<{ key: TileKey; tile: TileLayer } | null> => {
      if (!filePath) return null;

      const coreStartTrace = col * TILE_WIDTH_TRACES;
      const coreTraceCount = Math.min(TILE_WIDTH_TRACES, totalTraces - coreStartTrace);
      if (coreTraceCount <= 0) return null;

      const coreEndTrace = coreStartTrace + coreTraceCount;
      const requestStartTrace = Math.max(0, coreStartTrace - TILE_HORIZONTAL_OVERLAP_TRACES);
      const requestEndTrace = Math.min(totalTraces, coreEndTrace + TILE_HORIZONTAL_OVERLAP_TRACES);
      const requestTraceCount = requestEndTrace - requestStartTrace;
      if (requestTraceCount <= 0) return null;

      const coreStartSample = row * tileHeightSamples;
      const coreSampleCount = Math.min(tileHeightSamples, totalSamples - coreStartSample);
      if (coreSampleCount <= 0) return null;

      const coreEndSample = coreStartSample + coreSampleCount;
      const requestStartSample = Math.max(0, coreStartSample - TILE_VERTICAL_OVERLAP_SAMPLES);
      const requestEndSample = Math.min(
        totalSamples,
        coreEndSample + TILE_VERTICAL_OVERLAP_SAMPLES
      );
      const requestSampleCount = requestEndSample - requestStartSample;
      if (requestSampleCount <= 0) return null;

      // Output pixel dimensions — use the same Math.round boundary logic as
      // the canvas draw pass so the rendered image matches its draw rect exactly.
      const requestX = Math.round(requestStartTrace * pixelsPerTrace);
      const requestXEnd = Math.round(requestEndTrace * pixelsPerTrace);
      const outputWidth = Math.max(1, requestXEnd - requestX);
      const requestY = Math.round(requestStartSample * pixelsPerSample);
      const requestYEnd = Math.round(requestEndSample * pixelsPerSample);
      const outputHeight = Math.max(1, requestYEnd - requestY);

      // Source crop that trims overlap so each tile draws only its core region.
      const coreX = Math.round(coreStartTrace * pixelsPerTrace);
      const coreXEnd = Math.round(coreEndTrace * pixelsPerTrace);
      const sourceX = Math.max(0, coreX - requestX);
      const unclampedSourceWidth = Math.max(0, coreXEnd - coreX);
      const sourceWidth = Math.min(unclampedSourceWidth, outputWidth - sourceX);

      const coreY = Math.round(coreStartSample * pixelsPerSample);
      const coreYEnd = Math.round(coreEndSample * pixelsPerSample);
      const sourceY = Math.max(0, coreY - requestY);
      const unclampedSourceHeight = Math.max(0, coreYEnd - coreY);
      const sourceHeight = Math.min(unclampedSourceHeight, outputHeight - sourceY);

      try {
        const tileRequest: TileRequest = {
          startTrace: requestStartTrace,
          traceCount: requestTraceCount,
          startSample: requestStartSample,
          sampleCount: requestSampleCount,
          outputWidth,
          outputHeight,
          colormapType: colormap,
          scaling: amplitudeScaling,
          renderMode,
          wiggleConfig: renderMode !== 'variable-density' ? wiggleConfig : null,
        };

        const renderedTile = await renderTile(filePath, tileRequest);

        // Check if this render is still valid
        if (currentRenderId !== renderIdRef.current) {
          return null;
        }

        const image = await createImageFromRendered(renderedTile.image);
        const key = makeTileKey(col, row);

        return {
          key,
          tile: {
            col,
            row,
            startTrace: coreStartTrace,
            traceCount: coreTraceCount,
            startSample: coreStartSample,
            sampleCount: coreSampleCount,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            image,
            isLoading: false,
          },
        };
      } catch (error) {
        console.error(`Failed to render tile (${col},${row}):`, error);
        return null;
      }
    },
    [
      filePath,
      totalTraces,
      totalSamples,
      tileHeightSamples,
      pixelsPerTrace,
      pixelsPerSample,
      colormap,
      amplitudeScaling,
      renderMode,
      wiggleConfig,
    ]
  );

  /**
   * Core tile loading logic — renders all visible 2D tiles with Lanczos3.
   */
  const loadVisibleTilesImmediate = useCallback(async () => {
    if (!segyData || totalTraces === 0 || totalSamples === 0) return;

    // Increment render ID to invalidate previous renders
    renderIdRef.current += 1;
    const currentRenderId = renderIdRef.current;

    setIsRendering(true);

    const { startCol, endCol, startRow, endRow } = calculateVisibleTiles();

    // Determine if zoom changed enough to invalidate cached tiles
    const zoomRatioX = zoomLevel / lastRenderedZoomRef.current;
    const zoomRatioY = zoomLevelY / lastRenderedZoomYRef.current;
    const tileHeightChanged = tileHeightSamples !== lastRenderedTileHeightRef.current;
    const zoomChanged =
      zoomRatioX < 0.8 ||
      zoomRatioX > 1.25 ||
      zoomRatioY < 0.8 ||
      zoomRatioY > 1.25 ||
      tileHeightChanged;

    // Detect if visual settings (colormap, scaling, render mode, wiggle)
    // changed since the last render — if so, all cached tiles are stale.
    const currentSettings = JSON.stringify({
      colormap,
      amplitudeScaling,
      renderMode,
      wiggleConfig,
    });
    const settingsChanged = currentSettings !== lastRenderedSettingsRef.current;

    // Evict tiles: remove those outside visible range + margin, or all if
    // zoom/settings changed so stale appearance can't persist.
    setTiles(prevTiles => {
      if (zoomChanged || settingsChanged) return new Map();

      const newTiles = new Map(prevTiles);
      const evictMargin = TILE_PREFETCH + 2;
      for (const [key, tile] of newTiles) {
        if (
          tile.col < startCol - evictMargin ||
          tile.col > endCol + evictMargin ||
          tile.row < startRow - evictMargin ||
          tile.row > endRow + evictMargin
        ) {
          newTiles.delete(key);
        }
      }

      // LRU-style eviction if cache is too large
      if (newTiles.size > MAX_CACHED_TILES) {
        const entries = [...newTiles.entries()];
        // Keep visible tiles, evict farthest first
        const centerCol = (startCol + endCol) / 2;
        const centerRow = (startRow + endRow) / 2;
        entries.sort((a, b) => {
          const distA = Math.abs(a[1].col - centerCol) + Math.abs(a[1].row - centerRow);
          const distB = Math.abs(b[1].col - centerCol) + Math.abs(b[1].row - centerRow);
          return distB - distA;
        });
        const toRemove = entries.slice(0, entries.length - MAX_CACHED_TILES);
        for (const [key] of toRemove) {
          newTiles.delete(key);
        }
      }

      return newTiles;
    });

    // Update lastRenderedZoomRef immediately after eviction so that if this
    // render is cancelled mid-batch (by a new debounced call triggered when
    // tiles state changes), the next call won't see zoomChanged again and
    // re-evict all the tiles we just loaded.
    lastRenderedZoomRef.current = zoomLevel;
    lastRenderedZoomYRef.current = zoomLevelY;
    lastRenderedTileHeightRef.current = tileHeightSamples;

    // Collect tiles that need rendering (not already cached with correct zoom)
    const currentTiles = tilesRef.current;
    const tilesToLoad: Array<{ col: number; row: number }> = [];
    for (let col = startCol; col <= endCol; col++) {
      const startTrace = col * TILE_WIDTH_TRACES;
      const traceCount = Math.min(TILE_WIDTH_TRACES, totalTraces - startTrace);
      if (traceCount <= 0) continue;

      for (let row = startRow; row <= endRow; row++) {
        const startSample = row * tileHeightSamples;
        const sampleCount = Math.min(tileHeightSamples, totalSamples - startSample);
        if (sampleCount <= 0) continue;

        const key = makeTileKey(col, row);
        const cachedTile = currentTiles.get(key);
        const tileMatchesGrid =
          cachedTile !== undefined &&
          cachedTile.startTrace === startTrace &&
          cachedTile.traceCount === traceCount &&
          cachedTile.startSample === startSample &&
          cachedTile.sampleCount === sampleCount;

        // Always re-render if zoom or visual settings changed, otherwise skip cached tiles
        if (zoomChanged || settingsChanged || !tileMatchesGrid) {
          tilesToLoad.push({ col, row });
        }
      }
    }

    if (tilesToLoad.length === 0) {
      lastRenderedSettingsRef.current = currentSettings;
      setIsRendering(false);
      return;
    }

    // Render tiles in parallel batches
    const BATCH_SIZE = 8;
    for (let i = 0; i < tilesToLoad.length; i += BATCH_SIZE) {
      if (currentRenderId !== renderIdRef.current) return;

      const batch = tilesToLoad.slice(i, i + BATCH_SIZE);
      const promises = batch.map(({ col, row }) => renderSingleTile(col, row, currentRenderId));

      const results = await Promise.all(promises);

      if (currentRenderId !== renderIdRef.current) return;

      setTiles(prevTiles => {
        const newTiles = new Map(prevTiles);
        results.forEach(result => {
          if (result) {
            newTiles.set(result.key, result.tile);
          }
        });
        return newTiles;
      });
    }

    // Track the canvas size we rendered at
    lastRenderedSizeRef.current = { width: viewport.width, height: viewport.height };
    lastRenderedSettingsRef.current = currentSettings;
    setIsRendering(false);
  }, [
    segyData,
    totalTraces,
    totalSamples,
    calculateVisibleTiles,
    renderSingleTile,
    viewport.width,
    viewport.height,
    zoomLevel,
    zoomLevelY,
    tileHeightSamples,
    colormap,
    amplitudeScaling,
    renderMode,
    wiggleConfig,
  ]);

  /**
   * Debounced tile loading — waits for zoom/pan to settle before re-rendering.
   */
  const loadVisibleTiles = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadVisibleTilesImmediate();
    }, RENDER_DEBOUNCE_MS);
  }, [loadVisibleTilesImmediate]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /**
   * Check if canvas resize is significant enough to warrant re-render.
   */
  const isSignificantResize = useCallback((): boolean => {
    const dw = Math.abs(viewport.width - lastRenderedSizeRef.current.width);
    const dh = Math.abs(viewport.height - lastRenderedSizeRef.current.height);
    return dw >= CANVAS_RESIZE_THRESHOLD || dh >= CANVAS_RESIZE_THRESHOLD;
  }, [viewport.width, viewport.height]);

  // Trigger re-render when canvas is significantly resized
  useEffect(() => {
    if (isSignificantResize()) {
      loadVisibleTiles();
    }
  }, [viewport.width, viewport.height, isSignificantResize, loadVisibleTiles]);

  return {
    tiles,
    isRendering,
    loadVisibleTiles,
    isSignificantResize,
    totalTraces,
    totalSamples,
    pixelsPerTrace,
    pixelsPerSample,
  };
}
