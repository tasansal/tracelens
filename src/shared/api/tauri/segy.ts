/**
 * Tauri command wrappers for SEG-Y parsing and rendering services.
 */
import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import type { SegyData } from '@/features/segy/types/segy';
import type {
  AmplitudeStats,
  RenderedTile,
  TileRequest,
} from '@/features/trace-visualization/types/rendering';
import { invoke } from '@tauri-apps/api/core';

/**
 * Header-only payload for an individual trace.
 */
export interface SingleTrace {
  header: Record<string, unknown>;
}

/**
 * Load SEG-Y metadata and headers from disk.
 */
export async function loadSegyFile(filePath: string): Promise<SegyData> {
  return invoke<SegyData>('load_segy_file', { filePath });
}

/**
 * Load a single trace header with optional sample cap for preview.
 */
export async function loadSingleTrace(params: {
  filePath: string;
  traceIndex: number;
  maxSamples: number;
}): Promise<SingleTrace> {
  return invoke<SingleTrace>('load_single_trace', {
    filePath: params.filePath,
    traceIndex: params.traceIndex,
    maxSamples: params.maxSamples,
  });
}

/**
 * Fetch backend spec for binary header fields.
 */
export async function getBinaryHeaderSpec(): Promise<HeaderFieldSpec[]> {
  return invoke<HeaderFieldSpec[]>('get_binary_header_spec');
}

/**
 * Fetch backend spec for trace header fields.
 */
export async function getTraceHeaderSpec(): Promise<HeaderFieldSpec[]> {
  return invoke<HeaderFieldSpec[]>('get_trace_header_spec');
}

/**
 * Render a 2D tile with Lanczos3 interpolation.
 *
 * This enables continuous tiled rendering for performance:
 * - 2D tiles: trace columns × sample rows
 * - Viewport-based fetching — only visible tiles are rendered
 * - Always uses Lanczos3 for scientific accuracy
 *
 * @param filePath Path to the SEG-Y file
 * @param tileRequest Tile configuration (trace range, sample range, output size)
 * @returns Rendered tile with positioning metadata
 */
export async function renderTile(
  filePath: string,
  tileRequest: TileRequest
): Promise<RenderedTile> {
  return invoke<RenderedTile>('render_tile', {
    filePath,
    tileRequest,
  });
}

/**
 * Scan traces to compute global amplitude statistics.
 *
 * Samples contiguous blocks from evenly spaced positions in the file and
 * computes the clip value at the requested percentile.  Should be called
 * once after file open so tile rendering can use pre-computed normalization
 * values instead of recomputing per-tile.
 *
 * @param filePath Path to the SEG-Y file
 * @param percentile Optional percentile (0.0–1.0). Defaults to 0.99.
 * @returns Amplitude statistics with the percentile clip value
 */
export async function scanAmplitudeRange(
  filePath: string,
  percentile?: number
): Promise<AmplitudeStats> {
  return invoke<AmplitudeStats>('scan_amplitude_range', {
    filePath,
    percentile: percentile ?? null,
  });
}
