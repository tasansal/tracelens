/**
 * Tauri command wrappers for SEG-Y parsing and rendering services.
 */
import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import type { SegyData } from '@/features/segy/types/segy';
import type {
  AmplitudeScaling,
  ColormapType,
  RenderedImage,
  RenderMode,
  ViewportConfig,
  WiggleConfig,
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
  segyRevision?: number | null;
}): Promise<SingleTrace> {
  return invoke<SingleTrace>('load_single_trace', {
    filePath: params.filePath,
    traceIndex: params.traceIndex,
    maxSamples: params.maxSamples,
    segyRevision: params.segyRevision ?? 0,
  });
}

/**
 * Fetch backend spec for binary header fields.
 */
export async function getBinaryHeaderSpec(
  segyRevision: number | null,
): Promise<HeaderFieldSpec[]> {
  return invoke<HeaderFieldSpec[]>('get_binary_header_spec', {
    segyRevision: segyRevision ?? 0,
  });
}

/**
 * Fetch backend spec for trace header fields.
 */
export async function getTraceHeaderSpec(
  segyRevision: number | null,
): Promise<HeaderFieldSpec[]> {
  return invoke<HeaderFieldSpec[]>('get_trace_header_spec', {
    segyRevision: segyRevision ?? 0,
  });
}

/**
 * Render trace visualization with the selected render mode and scaling.
 */
export async function renderVariableDensity(params: {
  filePath: string;
  viewport: ViewportConfig;
  colormapType: ColormapType;
  scaling: AmplitudeScaling;
  renderMode: RenderMode;
  wiggleConfig: WiggleConfig;
}): Promise<RenderedImage> {
  return invoke<RenderedImage>('render_variable_density', {
    filePath: params.filePath,
    viewport: params.viewport,
    colormapType: params.colormapType,
    scaling: params.scaling,
    renderMode: params.renderMode,
    wiggleConfig: params.renderMode !== 'variable-density' ? params.wiggleConfig : null,
  });
}
