/**
 * Tauri command wrappers for SEG-Y parsing and rendering services.
 */
import type { HeaderFieldSpec, SegyFormatSpec } from '@/features/segy/types/headerSpec';
import type { SegyData } from '@/features/segy/types/segy';
import type { AmplitudeStats } from '@/features/trace-visualization/types/rendering';
import { invoke } from '@tauri-apps/api/core';

/**
 * SEG-Y revision types matching the backend enum.
 */
export type SegyRevision = 'Rev0' | 'Rev1' | 'Rev2' | 'Rev21' | 'Unknown';

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
 * Fetch backend spec for binary header fields.
 * @param revision Optional SEG-Y revision. If undefined, uses default (Rev 0).
 */
export async function getBinaryHeaderSpec(revision?: SegyRevision): Promise<HeaderFieldSpec[]> {
  return invoke<HeaderFieldSpec[]>('get_binary_header_spec', { revision: revision ?? null });
}

/**
 * Fetch backend spec for trace header fields.
 * @param revision Optional SEG-Y revision. If undefined, uses default (Rev 0).
 */
export async function getTraceHeaderSpec(revision?: SegyRevision): Promise<HeaderFieldSpec[]> {
  return invoke<HeaderFieldSpec[]>('get_trace_header_spec', { revision: revision ?? null });
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
 * Key, display name, and byte size for a supported scalar type.
 * Canonical source — owned by the Rust backend.
 */
export interface ScalarTypeInfo {
  key: string;
  label: string;
  size: number;
}

// Cached promise — the list is static for the lifetime of the app.
let _scalarTypesPromise: Promise<ScalarTypeInfo[]> | null = null;

/**
 * Return all supported scalar types with display names and byte sizes.
 * Result is cached after the first call — subsequent calls are free.
 */
export function listScalarTypes(): Promise<ScalarTypeInfo[]> {
  if (!_scalarTypesPromise) {
    _scalarTypesPromise = invoke<ScalarTypeInfo[]>('list_scalar_types');
  }
  return _scalarTypesPromise;
}

/**
 * Fetch a rectangular block of raw amplitude samples as a Float32Array.
 *
 * The backend returns a contiguous LE f32 byte buffer laid out row-major by
 * trace (trace 0's samples, then trace 1's, ...). Short traces are zero-padded
 * to `sampleCount` so the layout is fixed-size and uploadable as a GPU texture.
 *
 * @returns Float32Array of length traceCount * sampleCount
 */
/**
 * AGC (automatic gain control) options for {@link fetchTraceSamples}. When
 * provided, the backend returns per-trace gain-normalized samples instead of
 * raw amplitudes. `windowMs` is the sliding-window length in milliseconds;
 * `null` requests full-trace AGC (a single gain per trace).
 */
export interface AgcOptions {
  windowMs: number | null;
}

export async function fetchTraceSamples(params: {
  filePath: string;
  startTrace: number;
  traceCount: number;
  startSample: number;
  sampleCount: number;
  agc?: AgcOptions;
}): Promise<Float32Array> {
  const buffer = await invoke<ArrayBuffer>('fetch_trace_samples', {
    filePath: params.filePath,
    startTrace: params.startTrace,
    traceCount: params.traceCount,
    startSample: params.startSample,
    sampleCount: params.sampleCount,
    agc: params.agc,
  });
  return new Float32Array(buffer);
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

// ============================================================================
// Custom Spec API
// ============================================================================

/**
 * Load a custom spec from a local file or remote URI.
 * @param filePath The SEG-Y file path this spec applies to
 * @param uri Local file path or remote URI (s3://, gs://, az://, https://)
 * @returns The loaded SegyFormatSpec
 */
export async function loadCustomSpec(filePath: string, uri: string): Promise<SegyFormatSpec> {
  return invoke<SegyFormatSpec>('load_custom_spec', { filePath, uri });
}

/**
 * Save the current custom spec to a local file.
 * Remote URI saving is not yet supported.
 * @param filePath The SEG-Y file path the spec is associated with
 * @param uri Local file path to save to
 */
export async function saveCustomSpec(filePath: string, uri: string): Promise<void> {
  return invoke('save_custom_spec', { filePath, uri });
}

/**
 * Get the current custom spec for a file.
 * @param filePath The SEG-Y file path
 * @returns The custom spec if one exists, null otherwise
 */
export async function getCustomSpec(filePath: string): Promise<SegyFormatSpec | null> {
  return invoke<SegyFormatSpec | null>('get_custom_spec', { filePath });
}

/**
 * Clear the custom spec for a file.
 * @param filePath The SEG-Y file path
 */
export async function clearCustomSpec(filePath: string): Promise<void> {
  return invoke('clear_custom_spec', { filePath });
}

/**
 * Add a custom field to the spec for a file.
 * @param filePath The SEG-Y file path
 * @param headerType "binary" or "trace"
 * @param field The HeaderFieldSpec to add
 * @returns Updated spec
 */
export async function addCustomField(
  filePath: string,
  headerType: 'binary' | 'trace',
  field: HeaderFieldSpec
): Promise<SegyFormatSpec> {
  return invoke<SegyFormatSpec>('add_custom_field', { filePath, headerType, field });
}

/**
 * Update an existing custom field.
 * @param filePath The SEG-Y file path
 * @param headerType "binary" or "trace"
 * @param fieldKey The field key to update
 * @param field The new HeaderFieldSpec
 * @returns Updated spec
 */
export async function updateCustomField(
  filePath: string,
  headerType: 'binary' | 'trace',
  fieldKey: string,
  field: HeaderFieldSpec
): Promise<SegyFormatSpec> {
  return invoke<SegyFormatSpec>('update_custom_field', {
    filePath,
    headerType,
    fieldKey,
    field,
  });
}

/**
 * Delete a custom field from the spec.
 * @param filePath The SEG-Y file path
 * @param headerType "binary" or "trace"
 * @param fieldKey The field key to delete
 * @returns Updated spec
 */
export async function deleteCustomField(
  filePath: string,
  headerType: 'binary' | 'trace',
  fieldKey: string
): Promise<SegyFormatSpec> {
  return invoke<SegyFormatSpec>('delete_custom_field', { filePath, headerType, fieldKey });
}

/**
 * Get the active (merged) spec for a file.
 * @param filePath The SEG-Y file path
 * @returns Merged spec (standard + custom)
 */
export async function getActiveSpec(filePath: string): Promise<SegyFormatSpec> {
  return invoke<SegyFormatSpec>('get_active_spec', { filePath });
}

/**
 * Get the raw amplitude value for a single sample.
 *
 * Served from the window cache when the trace is within the currently cached
 * range — no additional I/O for any point visible on screen.
 *
 * @param filePath Path to the SEG-Y file
 * @param traceIndex Zero-based trace index
 * @param sampleIndex Zero-based sample index within the trace
 * @returns Raw un-normalized amplitude as a number
 */
export async function getSampleValue(
  filePath: string,
  traceIndex: number,
  sampleIndex: number
): Promise<number> {
  return invoke<number>('get_sample_value', { filePath, traceIndex, sampleIndex });
}
