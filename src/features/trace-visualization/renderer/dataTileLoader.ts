/**
 * Coordinates data-tile fetches: maintains a viewport-pruned queue, caps the
 * number of concurrent IPC requests, turns backend payloads into `Texture`s,
 * and notifies the scene when a tile lands.
 *
 * The loader is stateless about what's visible — the scene calls `requestSet`
 * each time the viewport changes, passing the full set of tiles it wants. The
 * loader rebuilds its pending queue from that set so out-of-view tiles never
 * get fetched. In-flight fetches are allowed to complete (their results go
 * into the cache and may be reused if the viewport revisits them).
 *
 * Concurrency is capped at MAX_CONCURRENCY; this is the main backpressure
 * mechanism that prevents fast pan/zoom from flooding the backend with
 * requests that serialize behind the reader's window-cache mutex.
 *
 * Failed requests are retried up to MAX_RETRIES times with exponential
 * backoff before surfacing an error toast to the user.
 */
import { fetchTraceSamples, type AgcOptions } from '@/shared/api/tauri/segy';
import toast from 'react-hot-toast';
import {
  buildAmplitudeTexture,
  tileKeyStr,
  type DataTile,
  type DataTileCache,
} from './dataTileCache';

const yieldToMain = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** Dimensions of the requested trace window for a single tile. */
export interface TileSpec {
  col: number;
  row: number;
  startTrace: number;
  traceCount: number;
  startSample: number;
  sampleCount: number;
}

interface InFlightEntry {
  retries: number;
}

interface PendingEntry {
  spec: TileSpec;
  filePath: string;
}

/**
 * Per-scene loader. A single instance owns the in-flight set, the pending
 * queue, and the target cache.
 */
export class DataTileLoader {
  private readonly inFlight = new Map<string, InFlightEntry>();
  private readonly pending = new Map<string, PendingEntry>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generation = 0;
  /**
   * Maximum number of fetches in-flight to the backend at one time. Tuned by
   * the scene depending on storage backend — local files saturate quickly so
   * a low cap is fine; remote (S3/GCS/etc.) benefits from many parallel
   * requests because per-request latency dominates.
   */
  private maxConcurrency = 6;

  /** AGC options forwarded to each fetch; null fetches raw amplitudes. */
  private agc: AgcOptions | null = null;

  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_DELAYS_MS = [500, 2000];

  constructor(
    private readonly cache: DataTileCache,
    private readonly onLoaded: (tile: DataTile) => void,
    private readonly getPinnedKeys?: () => Iterable<string>
  ) {}

  /**
   * Set the in-flight concurrency cap. Pumps queued fetches if the new cap
   * is higher than the previous so we use the slack immediately.
   */
  setMaxConcurrency(n: number): void {
    this.maxConcurrency = Math.max(1, n);
    this.pump();
  }

  /** Set AGC options applied to subsequent fetches (null = raw amplitudes). */
  setAgc(agc: AgcOptions | null): void {
    this.agc = agc;
  }

  /**
   * Invalidate every in-flight request and clear the queue. Results that
   * arrive after `reset` will be dropped instead of inserted into the cache.
   * Call this on file change or when the trace grid dimensions change.
   */
  reset(): void {
    this.generation++;
    this.inFlight.clear();
    this.pending.clear();
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  /**
   * Replace the desired-tile set. Tiles previously queued but no longer in
   * `specs` are dropped before they reach IPC. In-flight fetches are *not*
   * interrupted — they're cheap to let complete and their results may be
   * reused on the next viewport visit.
   *
   * Pump policy: at most MAX_CONCURRENCY fetches run at a time; remaining
   * specs wait in the queue and start as slots free up.
   */
  requestSet(filePath: string, specs: TileSpec[]): void {
    this.pending.clear();
    for (const spec of specs) {
      const key = tileKeyStr(spec.col, spec.row);
      if (this.cache.has(spec.col, spec.row)) continue;
      if (this.inFlight.has(key)) continue;
      this.pending.set(key, { spec, filePath });
    }
    this.pump();
  }

  /** Start as many queued fetches as the concurrency budget allows. */
  private pump(): void {
    while (this.inFlight.size < this.maxConcurrency) {
      const next = this.pending.entries().next();
      if (next.done) return;
      const [key, { spec, filePath }] = next.value;
      this.pending.delete(key);
      this.inFlight.set(key, { retries: 0 });
      this.doFetch(filePath, spec, key);
    }
  }

  private doFetch(filePath: string, spec: TileSpec, key: string): void {
    this.retryTimers.delete(key);
    const gen = this.generation;
    const entry = this.inFlight.get(key);
    if (!entry) return;
    const retries = entry.retries;

    void fetchTraceSamples({
      filePath,
      startTrace: spec.startTrace,
      traceCount: spec.traceCount,
      startSample: spec.startSample,
      sampleCount: spec.sampleCount,
      agc: this.agc ?? undefined,
    })
      .then(async data => {
        if (gen !== this.generation) return;
        if (this.inFlight.get(key) !== entry) return;
        if (this.cache.has(spec.col, spec.row)) {
          this.inFlight.delete(key);
          this.pump();
          return;
        }

        await yieldToMain();
        if (gen !== this.generation || this.inFlight.get(key) !== entry) return;
        const texture = buildAmplitudeTexture(data, spec.traceCount, spec.sampleCount);
        await yieldToMain();
        if (gen !== this.generation || this.inFlight.get(key) !== entry) {
          texture.destroy(true);
          return;
        }
        const tile: DataTile = {
          key,
          col: spec.col,
          row: spec.row,
          startTrace: spec.startTrace,
          traceCount: spec.traceCount,
          startSample: spec.startSample,
          sampleCount: spec.sampleCount,
          texture,
        };
        this.inFlight.delete(key);
        this.cache.set(tile, this.getPinnedKeys?.());
        this.onLoaded(tile);
        this.pump();
      })
      .catch(() => {
        if (gen !== this.generation) return;

        const currentEntry = this.inFlight.get(key);
        if (!currentEntry) return;

        if (retries < DataTileLoader.MAX_RETRIES) {
          currentEntry.retries = retries + 1;
          const delay = DataTileLoader.RETRY_DELAYS_MS[retries] ?? 2000;
          const timer = setTimeout(() => this.doFetch(filePath, spec, key), delay);
          this.retryTimers.set(key, timer);
        } else {
          this.inFlight.delete(key);
          toast.error(`Failed to load tile ${key} — check your connection`);
          this.pump();
        }
      });
  }
}
