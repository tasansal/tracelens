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
 * SEG-Y revision types matching the backend enum.
 */
export type SegyRevision = 'Rev0' | 'Rev1' | 'Rev2' | 'Rev21' | 'Unknown';

/**
 * Header-only payload for an individual trace.
 */
export interface SingleTrace {
  header: Record<string, unknown>;
}

/**
 * Schema validation error matching the Rust SchemaValidationError struct.
 */
export interface SchemaValidationError {
  field_name: string;
  byte_range: string;
  issue: string;
}

/**
 * Header field data with resolved values.
 */
export interface HeaderFieldData {
  name: string;
  description: string;
  value: number;
  resolved?: string;
  byte_start: number;
  byte_end: number;
  data_type: string;
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
 * @param revision Optional SEG-Y revision. If undefined, uses default (Rev 0).
 */
export async function getBinaryHeaderSpec(revision?: SegyRevision): Promise<HeaderFieldSpec[]> {
  return revision
    ? invoke<HeaderFieldSpec[]>('get_binary_header_spec', { revision })
    : invoke<HeaderFieldSpec[]>('get_binary_header_spec', { revision: null });
}

/**
 * Fetch backend spec for trace header fields.
 * @param revision Optional SEG-Y revision. If undefined, uses default (Rev 0).
 */
export async function getTraceHeaderSpec(revision?: SegyRevision): Promise<HeaderFieldSpec[]> {
  return revision
    ? invoke<HeaderFieldSpec[]>('get_trace_header_spec', { revision })
    : invoke<HeaderFieldSpec[]>('get_trace_header_spec', { revision: null });
}

/**
 * Fetch binary header field values using spec-driven parsing.
 * @param filePath Path to the SEG-Y file
 */
export async function getBinaryHeaderData(filePath: string): Promise<HeaderFieldData[]> {
  return invoke<HeaderFieldData[]>('get_binary_header_data', { filePath });
}

/**
 * Fetch trace header field values using spec-driven parsing.
 * @param filePath Path to the SEG-Y file
 * @param traceIndex Zero-based trace index
 */
export async function getTraceHeaderData(
  filePath: string,
  traceIndex: number
): Promise<HeaderFieldData[]> {
  return invoke<HeaderFieldData[]>('get_trace_header_data', { filePath, traceIndex });
}

/**
 * Set the active revision for a loaded SEG-Y file.
 * Overrides the detected revision for header data queries.
 * @param filePath Path to the SEG-Y file
 * @param revision SEG-Y revision to activate
 */
export async function setActiveRevision(filePath: string, revision: SegyRevision): Promise<void> {
  return invoke('set_active_revision', { filePath, revision });
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
