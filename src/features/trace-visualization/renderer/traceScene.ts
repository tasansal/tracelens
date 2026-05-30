/**
 * PixiJS-backed trace-rendering scene.
 *
 * Owns a Pixi `Application`, a container of per-tile layer groups, a data-tile
 * cache, and a loader. Exposes a small imperative API for the React layer:
 * `update(viewport)` to react to pan/zoom/size, `setColormap`/`setClip`/
 * `setRenderMode`/`setWiggleConfig` to swap render params without touching
 * cached data, and `destroy` to tear down.
 *
 * ## Design invariants
 *
 * - The cache is keyed strictly by `(col, row)`. Render params (colormap,
 *   clip, render mode, wiggle styling) are never part of the key, so style
 *   changes can't invalidate or evict anything.
 * - Each tile owns a `Container` with up to two children: a VD `Mesh`
 *   (amplitude texture → colormap via a fragment shader) and/or a wiggle
 *   `Mesh` (amplitude texture → wiggle/fill analytically in the fragment shader).
 * - The colormap texture is shared across all VD meshes and swapped via
 *   uniform update. VD and wiggle clip/color settings are also uniform updates.
 */
import type {
  ColormapType,
  RenderMode,
  RgbColor,
} from '@/features/trace-visualization/types/rendering';
import type { AgcOptions } from '@/shared/api/tauri/segy';
import { Application, Container, Mesh, MeshGeometry, type Shader, type Texture } from 'pixi.js';
import { createColormapTexture } from './colormaps';
import {
  pxPerSample as computePxPerSample,
  pxPerTrace as computePxPerTrace,
  TILE_PREFETCH,
  TILE_SAMPLES,
  TILE_TRACES,
} from './constants';
import { DataTileCache, tileKeyStr, type DataTile } from './dataTileCache';
import { DataTileLoader, type TileSpec } from './dataTileLoader';
import { createVdShader, createWiggleShader } from './shaders';

/** Viewport + data shape inputs from the React layer. */
export interface SceneUpdate {
  viewportWidth: number;
  viewportHeight: number;
  totalTraces: number;
  totalSamples: number;
  zoomX: number;
  zoomY: number;
  panX: number;
  panY: number;
}

/** Subset of `WiggleConfig` the renderer actually consumes. */
export interface WiggleRenderConfig {
  lineColor: RgbColor | null;
  wiggleScale: number;
  positiveFillColor: RgbColor | null;
  negativeFillColor: RgbColor | null;
  backgroundColor: RgbColor | null;
}

interface VdLayer {
  mesh: Mesh<MeshGeometry, Shader>;
  shader: Shader;
}

interface WiggleLayer {
  mesh: Mesh<MeshGeometry, Shader>;
  shader: Shader;
}

interface TileEntry {
  container: Container;
  tile: DataTile;
  vd: VdLayer | null;
  wiggle: WiggleLayer | null;
}

/**
 * Single shared unit-quad geometry [0,1]². All tile meshes scale this same
 * geometry via their `width`/`height` — no per-tile GPU buffer allocation.
 * Released only when `TraceScene.destroy()` runs (mesh-level destroys opt out
 * via `texture: false`, and we never destroy children in a way that takes the
 * geometry with them).
 */
const SHARED_TILE_GEOMETRY = new MeshGeometry({
  positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

/** URI schemes recognized by the Rust backend as remote object stores. */
const REMOTE_SCHEMES = ['s3://', 'gs://', 'az://', 'http://', 'https://'];

function isRemoteUri(path: string | null): boolean {
  if (!path) return false;
  return REMOTE_SCHEMES.some(prefix => path.startsWith(prefix));
}

/**
 * Desired wiggle stroke width in screen pixels.
 *
 * The shader converts this using the local screen-space normal direction
 * (derived from pxPerTrace, pxPerSample, and the instantaneous slope of the
 * wiggle) so the rendered line has constant *isotropic* thickness in pixels
 * regardless of horizontal zoom, vertical zoom, or the angle of the trace.
 */
const WIGGLE_STROKE_SCREEN_PX = 1.5;

interface WiggleUniformOverrides {
  fillBackground?: boolean;
  traceCount?: number;
  sampleCount?: number;
  pxPerTrace?: number;
  pxPerSample?: number;
}

/** Snapshot of renderer memory usage estimates for HUD/debug overlays. */
export interface SceneMemoryEstimate {
  cachedTileCount: number;
  activeTileCount: number;
  /** Sum of cached amplitude texture payload bytes (r32float tiles). */
  cacheTextureBytes: number;
  /**
   * Approximate non-tile GPU render-target overhead (swapchain + depth/stencil
   * + MSAA color target). This is device/driver dependent and intentionally rough.
   */
  approxRenderTargetBytes: number;
  /** Approximate total GPU bytes = cached texture payload + RT overhead. */
  approxTotalGpuBytes: number;
}

export class TraceScene {
  private readonly app = new Application();
  private readonly tileRoot = new Container();
  private readonly cache = new DataTileCache();
  private readonly loader: DataTileLoader;
  private readonly active = new Map<string, TileEntry>();
  private colormapTexture: Texture;
  private colormapName: ColormapType = 'seismic';
  private colormapInvert = false;
  private clipValue = 1.0;
  private renderMode: RenderMode = 'variable-density';
  private wiggleConfig: WiggleRenderConfig = {
    lineColor: [0, 0, 0],
    wiggleScale: 2.0,
    positiveFillColor: [0, 0, 0],
    negativeFillColor: [255, 255, 255],
    backgroundColor: [255, 255, 255],
  };
  private filePath: string | null = null;
  private agc: AgcOptions | null = null;
  private lastUpdate: SceneUpdate | null = null;
  private lastWantedKeys = new Set<string>();
  private cleanupRafId: number | null = null;
  private destroyed = false;

  constructor() {
    this.colormapTexture = createColormapTexture(this.colormapName, this.colormapInvert);
    this.loader = new DataTileLoader(
      this.cache,
      tile => this.onTileLoaded(tile),
      () => this.active.keys()
    );
  }

  /**
   * Initialize the underlying Pixi application and attach it to the DOM canvas.
   * Returns a promise that resolves once the renderer is ready.
   */
  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    await this.app.init({
      canvas,
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      // WebKit in Tauri ships WebGL2 reliably; WebGPU is still partial. Prefer
      // WebGL for now — the shader and tile data paths don't depend on either.
      preference: 'webgl',
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    this.app.stage.addChild(this.tileRoot);
  }

  /** Set the file being rendered; invalidates caches if the path changes. */
  setFilePath(path: string | null): void {
    if (path === this.filePath) return;
    this.filePath = path;
    this.cache.clear();
    this.loader.reset();
    // Local files saturate fast and the backend mutex serializes them anyway,
    // so a small cap is plenty. Remote storage benefits from much more
    // parallelism because per-request latency dominates and natural jitter
    // makes the fill feel responsive.
    this.loader.setMaxConcurrency(isRemoteUri(path) ? 16 : 6);
    this.clearActiveTiles();
  }

  /** Resize the renderer to new canvas dimensions. */
  resize(width: number, height: number): void {
    if (this.destroyed) return;
    // Renderer is only attached after `init()` resolves. During HMR or fast
    // unmount/remount, this method can fire while init is still pending —
    // skip silently rather than throwing into React's error boundary.
    if (!this.app.renderer) return;
    this.app.renderer.resize(width, height);
  }

  /** Swap the active colormap (and optional invert flag). Cached amplitude tiles are reused unchanged. */
  setColormap(name: ColormapType, invert = false): void {
    // Defensive normalization in case a legacy value ever reaches the renderer.
    const safeName: ColormapType =
      name === ('grayscale-inverted' as ColormapType) ? 'grayscale' : name;
    const safeInvert = invert || name === ('grayscale-inverted' as ColormapType);

    if (safeName === this.colormapName && safeInvert === this.colormapInvert) return;

    const next = createColormapTexture(safeName, safeInvert);
    const prev = this.colormapTexture;
    this.colormapTexture = next;
    this.colormapName = safeName;
    this.colormapInvert = safeInvert;
    for (const entry of this.active.values()) {
      if (entry.vd) entry.vd.shader.resources.uColormap = next.source;
    }
    prev.destroy(true);
  }

  /** Update global amplitude clip. Both VD and wiggle consume it as uniforms. */
  setClipValue(clip: number): void {
    if (clip === this.clipValue) return;
    this.clipValue = clip;
    for (const entry of this.active.values()) {
      this.writeVdClip(entry.vd, clip);
      this.writeWiggleUniforms(entry.wiggle);
    }
  }

  /**
   * Enable/disable AGC or change its window. Unlike clip (a shader uniform),
   * AGC alters the sample data itself, so a change invalidates the tile cache
   * and refetches the visible tiles with freshly normalized data.
   */
  setAmplitudeAgc(agc: AgcOptions | null): void {
    if (this.destroyed) return;
    const unchanged =
      (this.agc === null && agc === null) ||
      (this.agc !== null && agc !== null && this.agc.windowMs === agc.windowMs);
    if (unchanged) return;
    this.agc = agc;
    this.loader.setAgc(agc);
    this.cache.clear();
    this.loader.reset();
    this.clearActiveTiles();
    if (this.lastUpdate) this.update(this.lastUpdate);
  }

  /**
   * Swap the active render mode. The trailing `update()` call reconciles each
   * tile's VD/wiggle layers via `ensureTile`, so no per-mode layer juggling
   * lives here.
   */
  setRenderMode(mode: RenderMode): void {
    if (mode === this.renderMode) return;
    this.renderMode = mode;
    if (this.lastUpdate) this.update(this.lastUpdate);
  }

  /** Update wiggle styling via uniforms (no geometry rebuild). */
  setWiggleConfig(cfg: WiggleRenderConfig): void {
    const same =
      this.wiggleConfig.lineColor?.[0] === cfg.lineColor?.[0] &&
      this.wiggleConfig.lineColor?.[1] === cfg.lineColor?.[1] &&
      this.wiggleConfig.lineColor?.[2] === cfg.lineColor?.[2] &&
      this.wiggleConfig.wiggleScale === cfg.wiggleScale &&
      this.wiggleConfig.positiveFillColor?.[0] === cfg.positiveFillColor?.[0] &&
      this.wiggleConfig.positiveFillColor?.[1] === cfg.positiveFillColor?.[1] &&
      this.wiggleConfig.positiveFillColor?.[2] === cfg.positiveFillColor?.[2] &&
      this.wiggleConfig.negativeFillColor?.[0] === cfg.negativeFillColor?.[0] &&
      this.wiggleConfig.negativeFillColor?.[1] === cfg.negativeFillColor?.[1] &&
      this.wiggleConfig.negativeFillColor?.[2] === cfg.negativeFillColor?.[2] &&
      this.wiggleConfig.backgroundColor?.[0] === cfg.backgroundColor?.[0] &&
      this.wiggleConfig.backgroundColor?.[1] === cfg.backgroundColor?.[1] &&
      this.wiggleConfig.backgroundColor?.[2] === cfg.backgroundColor?.[2];
    if (same) return;
    this.wiggleConfig = {
      lineColor: cfg.lineColor ? ([...cfg.lineColor] as RgbColor) : null,
      wiggleScale: cfg.wiggleScale,
      positiveFillColor: cfg.positiveFillColor ? ([...cfg.positiveFillColor] as RgbColor) : null,
      negativeFillColor: cfg.negativeFillColor ? ([...cfg.negativeFillColor] as RgbColor) : null,
      backgroundColor: cfg.backgroundColor ? ([...cfg.backgroundColor] as RgbColor) : null,
    };
    for (const entry of this.active.values()) {
      this.writeWiggleUniforms(entry.wiggle);
    }
  }

  /**
   * React to viewport/zoom/pan changes. Computes the visible tile set, kicks
   * off fetches for missing tiles, removes offscreen tiles, and repositions
   * the ones that stayed visible.
   */
  update(u: SceneUpdate): void {
    if (this.destroyed) return;
    this.lastUpdate = u;
    if (!this.filePath || u.totalTraces <= 0 || u.totalSamples <= 0) {
      this.clearActiveTiles();
      return;
    }

    const pxPerTrace = Math.max(1e-9, computePxPerTrace(u.viewportWidth, u.zoomX));
    const pxPerSample = Math.max(
      1e-9,
      computePxPerSample(u.viewportHeight, u.totalSamples, u.zoomY)
    );

    const totalCols = Math.ceil(u.totalTraces / TILE_TRACES);
    const totalRows = Math.ceil(u.totalSamples / TILE_SAMPLES);

    const viewLeftTrace = -u.panX / pxPerTrace;
    const viewRightTrace = viewLeftTrace + u.viewportWidth / pxPerTrace;
    const viewTopSample = -u.panY / pxPerSample;
    const viewBottomSample = viewTopSample + u.viewportHeight / pxPerSample;

    const startCol = Math.max(0, Math.floor(viewLeftTrace / TILE_TRACES) - TILE_PREFETCH);
    const endCol = Math.min(
      totalCols - 1,
      Math.floor(viewRightTrace / TILE_TRACES) + TILE_PREFETCH
    );
    const startRow = Math.max(0, Math.floor(viewTopSample / TILE_SAMPLES) - TILE_PREFETCH);
    const endRow = Math.min(
      totalRows - 1,
      Math.floor(viewBottomSample / TILE_SAMPLES) + TILE_PREFETCH
    );

    this.cache.evictOutsideWindow(
      startCol,
      endCol,
      startRow,
      endRow,
      TILE_PREFETCH + 2,
      this.active.keys()
    );

    const wantedKeys = new Set<string>();
    const wantedSpecs: TileSpec[] = [];

    for (let col = startCol; col <= endCol; col++) {
      const startTrace = col * TILE_TRACES;
      // Fetch one extra trace and sample so adjacent tiles share their
      // boundary point. Without this, wiggle lines can break across tiles.
      const traceCount = Math.min(TILE_TRACES + 1, u.totalTraces - startTrace);
      if (traceCount <= 0) continue;
      for (let row = startRow; row <= endRow; row++) {
        const startSample = row * TILE_SAMPLES;
        const sampleCount = Math.min(TILE_SAMPLES + 1, u.totalSamples - startSample);
        if (sampleCount <= 0) continue;

        wantedKeys.add(tileKeyStr(col, row));

        const cached = this.cache.get(col, row);
        if (!cached) {
          wantedSpecs.push({
            col,
            row,
            startTrace,
            traceCount,
            startSample,
            sampleCount,
          });
          continue;
        }

        this.ensureTile(cached, u.panX, u.panY, pxPerTrace, pxPerSample);
      }
    }

    // Sort fetches by distance to viewport center so what the user is looking
    // at lands first instead of strictly left-to-right.
    const centerCol = (viewLeftTrace + viewRightTrace) / (2 * TILE_TRACES);
    const centerRow = (viewTopSample + viewBottomSample) / (2 * TILE_SAMPLES);
    wantedSpecs.sort((a, b) => {
      const da = (a.col - centerCol) ** 2 + (a.row - centerRow) ** 2;
      const db = (b.col - centerCol) ** 2 + (b.row - centerRow) ** 2;
      return da - db;
    });

    // Hand the loader the full wanted set in one call. It rebuilds its queue
    // from this set, so tiles that scrolled out of view are dropped before
    // they reach IPC — no backlog to drain when panning stops.
    this.loader.requestSet(this.filePath, wantedSpecs);

    // Store the latest wanted set so the deferred cleanup always reflects the
    // most recent viewport, even if update() is called again before the rAF fires.
    this.lastWantedKeys = wantedKeys;

    // Defer removal by one frame so outgoing tiles stay visible while incoming
    // ones load, preventing a blank flash during fast scrolling.
    if (this.cleanupRafId !== null) cancelAnimationFrame(this.cleanupRafId);
    this.cleanupRafId = requestAnimationFrame(() => {
      this.cleanupRafId = null;
      if (this.destroyed) return;
      for (const key of [...this.active.keys()]) {
        if (!this.lastWantedKeys.has(key)) this.removeTile(key);
      }
    });
  }

  /** Tear down the renderer and release all GPU resources. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.cleanupRafId !== null) {
      cancelAnimationFrame(this.cleanupRafId);
      this.cleanupRafId = null;
    }
    this.clearActiveTiles();
    this.cache.clear();
    this.loader.reset();
    this.colormapTexture.destroy(true);
    // removeView: false — the caller owns the <canvas> element.
    this.app.destroy({ removeView: false }, { children: true, texture: false });
  }

  // -- internals --------------------------------------------------------------

  private vdEnabled(): boolean {
    return this.renderMode === 'variable-density' || this.renderMode === 'wiggle-variable-density';
  }

  private wiggleEnabled(): boolean {
    return this.renderMode === 'wiggle' || this.renderMode === 'wiggle-variable-density';
  }

  private onTileLoaded(tile: DataTile): void {
    if (this.destroyed || !this.lastUpdate) return;
    const u = this.lastUpdate;
    this.ensureTile(
      tile,
      u.panX,
      u.panY,
      Math.max(1e-9, computePxPerTrace(u.viewportWidth, u.zoomX)),
      Math.max(1e-9, computePxPerSample(u.viewportHeight, u.totalSamples, u.zoomY))
    );
  }

  /** Ensure a tile exists, its layers match the render mode, and it's positioned. */
  private ensureTile(
    tile: DataTile,
    panX: number,
    panY: number,
    pxPerTrace: number,
    pxPerSample: number
  ): void {
    const existing = this.active.get(tile.key);
    const entry = existing ?? this.createTile(tile);

    if (existing && existing.tile !== tile) {
      this.swapTileTexture(existing, tile);
    }

    const wantsVd = this.vdEnabled();
    const wantsWiggle = this.wiggleEnabled();
    if (entry.vd) entry.vd.mesh.visible = wantsVd;
    if (entry.wiggle) {
      entry.wiggle.mesh.visible = wantsWiggle;
      this.writeWiggleUniforms(entry.wiggle, {
        fillBackground: !wantsVd,
        traceCount: tile.traceCount,
        sampleCount: tile.sampleCount,
        pxPerTrace,
        pxPerSample,
      });
    }
    this.ensureLayerOrder(entry);

    // Both layers live in canonical (trace, sample) units. The container
    // pin-points the tile origin in pixel space and scales its children;
    // zoom is therefore a pure transform.
    entry.container.position.set(
      tile.startTrace * pxPerTrace + panX,
      tile.startSample * pxPerSample + panY
    );
    entry.container.scale.set(pxPerTrace, pxPerSample);

    // Point-sampling convention: trace `t` sits at canonical x = `t`, sample
    // `s` at y = `s`. The Voronoi cell of the (0,0) point extends half a unit
    // into negative space, so meshes start at (-0.5, -0.5). Border tiles fetch
    // an extra trace/sample for boundary sharing; the mesh stays at the
    // nominal tile size so adjacent tiles abut exactly.
    const meshW = Math.min(tile.traceCount, TILE_TRACES);
    const meshH = Math.min(tile.sampleCount, TILE_SAMPLES);
    for (const layer of [entry.vd, entry.wiggle]) {
      if (!layer) continue;
      layer.mesh.x = -0.5;
      layer.mesh.y = -0.5;
      layer.mesh.width = meshW;
      layer.mesh.height = meshH;
    }
  }

  private createTile(tile: DataTile): TileEntry {
    const container = new Container();
    this.tileRoot.addChild(container);
    const entry: TileEntry = { container, tile, vd: null, wiggle: null };

    entry.vd = this.createVdLayer(tile);
    entry.vd.mesh.visible = false;
    container.addChild(entry.vd.mesh);

    entry.wiggle = this.createWiggleLayer(tile, true, 1, 1);
    entry.wiggle.mesh.visible = false;
    container.addChild(entry.wiggle.mesh);

    this.active.set(tile.key, entry);
    return entry;
  }

  private createVdLayer(tile: DataTile): VdLayer {
    const shader = createVdShader({
      amplitude: tile.texture,
      colormap: this.colormapTexture,
      clipValue: this.clipValue,
    });
    const mesh = new Mesh<MeshGeometry, Shader>({
      geometry: SHARED_TILE_GEOMETRY,
      shader,
    });
    return { mesh, shader };
  }

  private createWiggleLayer(
    tile: DataTile,
    fillBackground: boolean,
    pxPerTrace: number,
    pxPerSample: number
  ): WiggleLayer {
    const shader = createWiggleShader({
      amplitude: tile.texture,
      clipValue: this.clipValue,
      traceCount: tile.traceCount,
      sampleCount: tile.sampleCount,
      pxPerTrace,
      pxPerSample,
      lineColor: this.wiggleConfig.lineColor,
      positiveFillColor: this.wiggleConfig.positiveFillColor,
      negativeFillColor: this.wiggleConfig.negativeFillColor,
      backgroundColor: this.wiggleConfig.backgroundColor,
      fillBackground,
      strokeWidth: WIGGLE_STROKE_SCREEN_PX,
      wiggleScale: this.wiggleConfig.wiggleScale,
    });
    const mesh = new Mesh<MeshGeometry, Shader>({
      geometry: SHARED_TILE_GEOMETRY,
      shader,
    });
    return { mesh, shader };
  }

  private swapTileTexture(entry: TileEntry, tile: DataTile): void {
    if (entry.vd) entry.vd.shader.resources.uAmp = tile.texture.source;
    if (entry.wiggle) entry.wiggle.shader.resources.uAmp = tile.texture.source;
    entry.tile = tile;
  }

  /**
   * Pin VD beneath wiggle in the tile container's child list. Called after any
   * layer add/remove so mode transitions preserve intended visual ordering.
   */
  private ensureLayerOrder(entry: TileEntry): void {
    if (entry.vd && entry.wiggle) {
      entry.container.setChildIndex(entry.vd.mesh, 0);
      entry.container.setChildIndex(entry.wiggle.mesh, 1);
    }
  }

  private destroyVdLayer(entry: TileEntry): void {
    if (!entry.vd) return;
    entry.container.removeChild(entry.vd.mesh);
    entry.vd.mesh.destroy({ children: true, texture: false });
    entry.vd.shader.destroy(false);
    entry.vd = null;
  }

  private destroyWiggleLayer(entry: TileEntry): void {
    if (!entry.wiggle) return;
    entry.container.removeChild(entry.wiggle.mesh);
    entry.wiggle.mesh.destroy({ children: true, texture: false });
    entry.wiggle.shader.destroy(false);
    entry.wiggle = null;
  }

  private writeVdClip(layer: VdLayer | null, clip: number): void {
    if (!layer) return;
    const group = layer.shader.resources.vdUniforms as {
      uniforms: { uClip: number };
      update(): void;
    };
    group.uniforms.uClip = clip;
    group.update();
  }

  private writeWiggleUniforms(
    layer: WiggleLayer | null,
    overrides: WiggleUniformOverrides = {}
  ): void {
    if (!layer) return;

    const group = layer.shader.resources.wiggleUniforms as {
      uniforms: {
        uClip: number;
        uTraceCount: number;
        uSampleCount: number;
        uPxPerTrace: number;
        uPxPerSample: number;
        uLineR: number;
        uLineG: number;
        uLineB: number;
        uPosFillR: number;
        uPosFillG: number;
        uPosFillB: number;
        uNegFillR: number;
        uNegFillG: number;
        uNegFillB: number;
        uBgR: number;
        uBgG: number;
        uBgB: number;
        uHasLine: number;
        uHasPosFill: number;
        uHasNegFill: number;
        uHasBg: number;
        uFillBackground: number;
        uStrokeWidth: number;
        uWiggleScale: number;
      };
      update(): void;
    };

    const hasLine = this.wiggleConfig.lineColor !== null;
    const hasPos = this.wiggleConfig.positiveFillColor !== null;
    const hasNeg = this.wiggleConfig.negativeFillColor !== null;
    const hasBg = this.wiggleConfig.backgroundColor !== null;

    const [r, g, b] = this.wiggleConfig.lineColor ?? [0, 0, 0];
    const [pr, pg, pb] = this.wiggleConfig.positiveFillColor ?? [0, 0, 0];
    const [nr, ng, nb] = this.wiggleConfig.negativeFillColor ?? [0, 0, 0];
    const [bgR, bgG, bgB] = this.wiggleConfig.backgroundColor ?? [1, 1, 1];

    group.uniforms.uClip = this.clipValue;
    if (typeof overrides.traceCount === 'number') group.uniforms.uTraceCount = overrides.traceCount;
    if (typeof overrides.sampleCount === 'number') {
      group.uniforms.uSampleCount = overrides.sampleCount;
    }
    if (typeof overrides.pxPerTrace === 'number') {
      group.uniforms.uPxPerTrace = overrides.pxPerTrace;
    }
    if (typeof overrides.pxPerSample === 'number') {
      group.uniforms.uPxPerSample = overrides.pxPerSample;
    }
    group.uniforms.uLineR = r / 255;
    group.uniforms.uLineG = g / 255;
    group.uniforms.uLineB = b / 255;
    group.uniforms.uPosFillR = pr / 255;
    group.uniforms.uPosFillG = pg / 255;
    group.uniforms.uPosFillB = pb / 255;
    group.uniforms.uNegFillR = nr / 255;
    group.uniforms.uNegFillG = ng / 255;
    group.uniforms.uNegFillB = nb / 255;

    group.uniforms.uBgR = bgR / 255;
    group.uniforms.uBgG = bgG / 255;
    group.uniforms.uBgB = bgB / 255;

    group.uniforms.uHasLine = hasLine ? 1 : 0;
    group.uniforms.uHasPosFill = hasPos ? 1 : 0;
    group.uniforms.uHasNegFill = hasNeg ? 1 : 0;
    group.uniforms.uHasBg = hasBg ? 1 : 0;

    if (typeof overrides.fillBackground === 'boolean') {
      group.uniforms.uFillBackground = overrides.fillBackground ? 1 : 0;
    }
    group.uniforms.uStrokeWidth = WIGGLE_STROKE_SCREEN_PX;
    group.uniforms.uWiggleScale = this.wiggleConfig.wiggleScale;
    group.update();
  }

  /**
   * Return approximate renderer memory usage for diagnostics.
   *
   * Notes:
   * - Tile texture payload is exact for cached `r32float` tile dimensions.
   * - Render-target/MSAA overhead is estimated (implementation-specific in GPUs).
   */
  memoryEstimate(viewportWidth: number, viewportHeight: number): SceneMemoryEstimate {
    let cacheTextureBytes = 0;
    let cachedTileCount = 0;
    for (const tile of this.cache.values()) {
      cachedTileCount++;
      cacheTextureBytes += tile.traceCount * tile.sampleCount * 4;
    }

    const activeTileCount = this.active.size;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(viewportWidth * dpr));
    const h = Math.max(1, Math.round(viewportHeight * dpr));
    const pixelCount = w * h;
    const colorBytes = pixelCount * 4;

    // Heuristic model:
    // - Double-buffered color swapchain: 2x color
    // - Depth/stencil attachment: ~1x RGBA8-sized footprint
    // - 4x MSAA color target when antialiasing is enabled
    const swapchainBytes = colorBytes * 2;
    const depthStencilBytes = colorBytes;
    const msaaColorBytes = colorBytes * 4;
    const approxRenderTargetBytes = swapchainBytes + depthStencilBytes + msaaColorBytes;

    return {
      cachedTileCount,
      activeTileCount,
      cacheTextureBytes,
      approxRenderTargetBytes,
      approxTotalGpuBytes: cacheTextureBytes + approxRenderTargetBytes,
    };
  }

  private removeTile(key: string): void {
    const entry = this.active.get(key);
    if (!entry) return;
    this.active.delete(key);
    this.destroyVdLayer(entry);
    this.destroyWiggleLayer(entry);
    this.tileRoot.removeChild(entry.container);
    entry.container.destroy({ children: true });
  }

  private clearActiveTiles(): void {
    for (const key of [...this.active.keys()]) {
      this.removeTile(key);
    }
  }
}
