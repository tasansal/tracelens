/**
 * LRU cache of raw amplitude tiles keyed by (col, row).
 *
 * The cache holds the decoded amplitude data (as a GPU `Texture`) plus
 * metadata. Cache keys intentionally exclude rendering parameters
 * (colormap, scaling, mode) — render params are shader uniforms, so flipping
 * them never invalidates cached data. This is what structurally eliminates the
 * stale-tile bug class.
 */
import { BufferImageSource, Texture } from 'pixi.js';
import { MAX_CACHED_TILES } from './constants';

/** A cached tile with its GPU-side texture and data-space metadata. */
export interface DataTile {
  key: string;
  col: number;
  row: number;
  /** First trace index (inclusive) the tile covers. */
  startTrace: number;
  /** Number of traces in this tile (edge tiles may be smaller than TILE_TRACES). */
  traceCount: number;
  /** First sample index (inclusive). */
  startSample: number;
  /** Number of samples in this tile. */
  sampleCount: number;
  /** GPU texture (r32float, traceCount × sampleCount). */
  texture: Texture;
}

/** Stringify a tile grid coordinate for Map indexing. */
export function tileKeyStr(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Build a GPU `Texture` from a Float32Array of amplitude samples.
 *
 * The array is laid out row-major per trace (trace 0's samples, then trace 1's,
 * ...) so `width = sampleCount` and `height = traceCount`. The shader samples
 * with UV (x=sample, y=trace), matching the row-major layout.
 */
export function buildAmplitudeTexture(
  data: Float32Array,
  traceCount: number,
  sampleCount: number
): Texture {
  const source = new BufferImageSource({
    resource: data,
    width: sampleCount,
    height: traceCount,
    format: 'r32float',
    // r32float is unfilterable on WebGPU by spec; use nearest so the same
    // behaviour holds on WebGL2 and we never hit an unsupported sampler.
    scaleMode: 'nearest',
    addressMode: 'clamp-to-edge',
  });
  return new Texture({ source });
}

/**
 * LRU cache of raw amplitude tiles. Evicts the least recently touched entries
 * when the cache grows past `MAX_CACHED_TILES`, destroying their GPU textures
 * to free VRAM.
 *
 * Texture destruction is rAF-batched: an eviction-heavy frame (e.g. a sudden
 * zoom that invalidates many tiles at once) accumulates `gl.deleteTexture`
 * work into the next frame instead of stalling the current one.
 */
export class DataTileCache {
  private readonly entries = new Map<string, DataTile>();
  private readonly destroyQueue: Texture[] = [];
  private destroyRafId: number | null = null;

  /** Current number of cached tiles. */
  get size(): number {
    return this.entries.size;
  }

  /** Fetch a tile; re-insert to bump it to most-recently-used. */
  get(col: number, row: number): DataTile | undefined {
    const key = tileKeyStr(col, row);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  /** Whether the cache contains a tile at this grid position. */
  has(col: number, row: number): boolean {
    return this.entries.has(tileKeyStr(col, row));
  }

  /** Insert a tile and evict oldest unpinned entries if over budget. */
  set(tile: DataTile, pinnedKeys?: Iterable<string>): void {
    this.entries.set(tile.key, tile);
    // Caller's pinned set is "currently rendered tiles", but the tile we
    // just inserted hasn't been added to the scene yet. Without this guard,
    // when the cache is full and every other entry is pinned, the eviction
    // loop walks oldest→newest, skips them all, lands on the just-inserted
    // tile (the only unpinned entry), and destroys the texture before it
    // can render. Treat the new tile as implicitly pinned for this call.
    const pinned = new Set<string>(pinnedKeys ?? []);
    pinned.add(tile.key);
    while (this.entries.size > MAX_CACHED_TILES) {
      if (!this.evictOldestUnpinned(pinned)) break;
    }
  }

  /**
   * Evict tiles that lie more than `margin` grid cells outside the visible
   * window [minCol..maxCol] × [minRow..maxRow]. Keeps a border of prefetched
   * tiles so small pan deltas don't cause re-fetches.
   */
  evictOutsideWindow(
    minCol: number,
    maxCol: number,
    minRow: number,
    maxRow: number,
    margin: number,
    pinnedKeys?: Iterable<string>
  ): void {
    const pinned = pinnedKeys ? new Set(pinnedKeys) : null;
    for (const [key, tile] of this.entries) {
      if (pinned?.has(key)) continue;
      if (
        tile.col < minCol - margin ||
        tile.col > maxCol + margin ||
        tile.row < minRow - margin ||
        tile.row > maxRow + margin
      ) {
        this.entries.delete(key);
        this.queueDestroy(tile.texture);
      }
    }
  }

  /** Destroy every cached tile and release all GPU memory. */
  clear(): void {
    this.flushDestroyQueue();
    for (const tile of this.entries.values()) {
      tile.texture.destroy(true);
    }
    this.entries.clear();
  }

  /**
   * Queue a texture for destruction on the next animation frame. Coalesces
   * many evictions in one frame into a single rAF callback so the GL driver
   * doesn't stall the current frame's render with a long string of
   * `gl.deleteTexture` calls.
   */
  private queueDestroy(texture: Texture): void {
    this.destroyQueue.push(texture);
    if (this.destroyRafId === null) {
      this.destroyRafId = requestAnimationFrame(() => {
        this.destroyRafId = null;
        for (const t of this.destroyQueue) t.destroy(true);
        this.destroyQueue.length = 0;
      });
    }
  }

  /** Synchronously drain the destroy queue. Used during teardown. */
  private flushDestroyQueue(): void {
    if (this.destroyRafId !== null) {
      cancelAnimationFrame(this.destroyRafId);
      this.destroyRafId = null;
    }
    for (const t of this.destroyQueue) t.destroy(true);
    this.destroyQueue.length = 0;
  }

  /** Iterate all cached tiles (insertion order = LRU, oldest first). */
  values(): IterableIterator<DataTile> {
    return this.entries.values();
  }

  /**
   * Evict the least-recently-used entry that is not pinned. Returns false when
   * all entries are pinned (or cache is empty), in which case size may stay above
   * `MAX_CACHED_TILES` until the pinned set shrinks.
   */
  private evictOldestUnpinned(pinned: Set<string> | null): boolean {
    for (const key of this.entries.keys()) {
      if (pinned?.has(key)) continue;
      const tile = this.entries.get(key);
      if (!tile) continue;
      this.entries.delete(key);
      this.queueDestroy(tile.texture);
      return true;
    }
    return false;
  }
}
