//! Tauri command handlers for the TraceLens backend.
//!
//! These commands bridge the frontend and the SEG-Y parser/renderer, returning
//! serialized data structures or JSON-encoded error payloads.

use crate::segy::{
    FieldData, HeaderFieldSpec, RuntimeHeaderView, SegyData, SegyReaderState, SegyRevision,
    SpecRegistry, TraceBlock,
    rendering::{self, normalizer},
};
use crate::storage_config::StorageConfigState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Standard command result type for Tauri invokes.
///
/// We return `String` errors because the frontend expects JSON-serialized
/// `AppError` values (see `error.rs`).
type CommandResult<T> = Result<T, String>;

/// Load and cache SEG-Y headers so the frontend can request traces later.
///
/// # Arguments
/// * `file_path` - Absolute path or URI to the SEG-Y file.
///
/// # Returns
/// * `SegyData` with textual/binary headers and derived metadata.
///
/// # Errors
/// * `AppError` if the file cannot be read or parsed.
#[tauri::command]
pub async fn load_segy_file(
    file_path: String,
    reader_state: State<'_, SegyReaderState>,
    storage_state: State<'_, StorageConfigState>,
) -> CommandResult<SegyData> {
    let storage_config = storage_state.get();
    let reader = reader_state
        .open(file_path, Some(storage_config))
        .await
        .map_err(String::from)?;
    Ok(reader.data())
}

/// Return the SEG-Y binary header metadata for the specified revision.
///
/// # Arguments
/// * `revision` - Optional SEG-Y revision. If None, uses default (Rev 0).
///
/// # Returns
/// * Vector of `HeaderFieldSpec` entries.
#[tauri::command]
pub fn get_binary_header_spec(
    revision: Option<SegyRevision>,
) -> CommandResult<Vec<HeaderFieldSpec>> {
    let registry = SpecRegistry::new()?;
    let spec = revision
        .and_then(|r| registry.get(r))
        .unwrap_or_else(|| registry.default_spec());
    Ok(spec.get_binary_header_fields())
}

/// Return the SEG-Y trace header metadata for the specified revision.
///
/// # Arguments
/// * `revision` - Optional SEG-Y revision. If None, uses default (Rev 0).
///
/// # Returns
/// * Vector of `HeaderFieldSpec` entries.
#[tauri::command]
pub fn get_trace_header_spec(
    revision: Option<SegyRevision>,
) -> CommandResult<Vec<HeaderFieldSpec>> {
    let registry = SpecRegistry::new()?;
    let spec = revision
        .and_then(|r| registry.get(r))
        .unwrap_or_else(|| registry.default_spec());
    Ok(spec.get_trace_header_fields())
}

/// Extract binary header field values using spec-driven parsing.
///
/// # Arguments
/// * `file_path` - Absolute path or URI to the SEG-Y file.
///
/// # Returns
/// * Vector of `FieldData` with name, description, value, and resolved strings.
///
/// # Errors
/// * Returns empty vector if no file loaded.
#[tauri::command]
pub async fn get_binary_header_data(
    file_path: String,
    reader_state: State<'_, SegyReaderState>,
    storage_state: State<'_, StorageConfigState>,
) -> CommandResult<Vec<FieldData>> {
    let storage_config = storage_state.get();
    let reader = reader_state
        .get_or_open(file_path.clone(), Some(storage_config))
        .await
        .map_err(String::from)?;

    let data = reader.data();
    let detected_revision = data.detected_revision;
    let active_revision = reader_state
        .get_active_revision(&file_path, detected_revision)
        .await;

    let registry = SpecRegistry::new()?;
    let spec = registry
        .get(active_revision)
        .unwrap_or_else(|| registry.default_spec());

    let field_specs = spec.get_binary_header_fields();

    let header_bytes = data.binary_header_bytes();

    let header_spec = crate::segy::header_dynamic::HeaderSpec::from_specs(field_specs.clone(), 400)
        .map_err(|e| format!("Failed to build header spec: {}", e))?;

    let view = RuntimeHeaderView::new(header_bytes, &header_spec, data.byte_order);
    let mut fields = view.extract_all(&field_specs);

    // Normalize revision field: 256 in BigEndian files is actually value 1 (Rev 1)
    // because the raw bytes [01, 00] read as BigEndian give 256
    for field in &mut fields {
        if field.name == "SEG-Y Revision Number" && field.value == 256 {
            field.value = 1;
            field.resolved = Some("Rev 1".to_string());
        }
    }

    Ok(fields)
}

/// Extract trace header field values using spec-driven parsing.
///
/// # Arguments
/// * `file_path` - Absolute path or URI to the SEG-Y file.
/// * `trace_index` - Zero-based trace index.
///
/// # Returns
/// * Vector of `FieldData` with name, description, value, and resolved strings.
///
/// # Errors
/// * Returns error if trace index out of range or parsing fails.
#[tauri::command]
pub async fn get_trace_header_data(
    file_path: String,
    trace_index: usize,
    reader_state: State<'_, SegyReaderState>,
    storage_state: State<'_, StorageConfigState>,
) -> CommandResult<Vec<FieldData>> {
    let storage_config = storage_state.get();
    let reader = reader_state
        .get_or_open(file_path.clone(), Some(storage_config))
        .await
        .map_err(String::from)?;

    let detected_revision = reader.data().detected_revision;
    let active_revision = reader_state
        .get_active_revision(&file_path, detected_revision)
        .await;

    let registry = SpecRegistry::new()?;
    let spec = registry
        .get(active_revision)
        .unwrap_or_else(|| registry.default_spec());

    let field_specs = spec.get_trace_header_fields();

    let trace_block = reader
        .load_single_trace(trace_index, None)
        .await
        .map_err(String::from)?;

    let header_bytes = &trace_block.header_bytes;

    let header_spec = crate::segy::header_dynamic::HeaderSpec::from_specs(field_specs.clone(), 240)
        .map_err(|e| format!("Failed to build header spec: {}", e))?;

    let view = RuntimeHeaderView::new(header_bytes, &header_spec, reader.data().byte_order);
    Ok(view.extract_all(&field_specs))
}

/// Set the active revision override for a specific file.
///
/// Per D-06, the backend owns spec state per-file. This command stores
/// the user's revision choice so header data commands respect it
/// without re-opening the file.
///
/// # Arguments
/// * `file_path` - Absolute path or URI to the SEG-Y file.
/// * `revision` - The SEG-Y revision to use for header parsing.
#[tauri::command]
pub async fn set_active_revision(
    file_path: String,
    revision: SegyRevision,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<()> {
    reader_state.set_active_revision(file_path, revision).await;
    Ok(())
}

/// Load a single trace block (header + samples) from the cached reader.
///
/// # Arguments
/// * `file_path` - Absolute path or URI to the SEG-Y file.
/// * `trace_index` - Zero-based trace index.
/// * `max_samples` - Optional cap on returned samples.
///
/// # Returns
/// * `TraceBlock` for the requested index.
///
/// # Errors
/// * `AppError` if the index is out of range or parsing fails.
#[tauri::command]
pub async fn load_single_trace(
    file_path: String,
    trace_index: usize,
    max_samples: Option<usize>,
    reader_state: State<'_, SegyReaderState>,
    storage_state: State<'_, StorageConfigState>,
) -> CommandResult<TraceBlock> {
    let storage_config = storage_state.get();
    let reader = reader_state
        .get_or_open(file_path, Some(storage_config))
        .await
        .map_err(String::from)?;

    reader
        .load_single_trace(trace_index, max_samples)
        .await
        .map_err(String::from)
}

/// Render a vertical tile into a PNG-backed payload.
///
/// AGC tiles request context samples around the tile bounds so gain can cross
/// tile edges without visible seams.
///
/// # Arguments
/// * `file_path` - Absolute path or URI to the SEG-Y file.
/// * `tile_request` - Trace/sample range, output size, scaling, and render mode.
///
/// # Returns
/// * `RenderedTile` containing tile bounds and base64 PNG data.
///
/// # Errors
/// * `AppError` if loading, normalization, or rendering fails.
#[tauri::command]
pub async fn render_tile(
    file_path: String,
    tile_request: rendering::TileRequest,
    reader_state: State<'_, SegyReaderState>,
    storage_state: State<'_, StorageConfigState>,
) -> CommandResult<rendering::RenderedTile> {
    let storage_config = storage_state.get();
    let reader = reader_state
        .get_or_open(file_path, Some(storage_config))
        .await
        .map_err(String::from)?;

    let colormap = rendering::get_colormap(tile_request.colormap_type);

    let rendered_image = match &tile_request.scaling {
        rendering::AmplitudeScaling::Agc { window_size } => {
            let total_samples = reader.data().binary_header.samples_per_trace as usize;
            let half_window = window_size.unwrap_or(0) / 2;

            let context_before = tile_request.start_sample.min(half_window);
            let ext_start = tile_request.start_sample - context_before;
            let ext_end = (tile_request.start_sample + tile_request.sample_count + half_window)
                .min(total_samples);
            let ext_count = ext_end - ext_start;

            let trace_data = reader
                .load_trace_data_with_sample_range(
                    tile_request.start_trace,
                    tile_request.trace_count,
                    ext_start,
                    ext_count,
                )
                .await
                .map_err(String::from)?;

            let normalized = normalizer::normalize_agc_with_context(
                &trace_data,
                *window_size,
                context_before,
                tile_request.sample_count,
            );

            match tile_request.render_mode {
                rendering::RenderMode::VariableDensity => {
                    rendering::vd_renderer::render_tile_from_normalized(
                        normalized,
                        tile_request.output_width,
                        tile_request.output_height,
                        colormap.as_ref(),
                    )?
                }
                rendering::RenderMode::Wiggle => {
                    let wiggle_config = tile_request
                        .wiggle_config
                        .ok_or_else(|| "Wiggle config required for wiggle mode".to_string())?;
                    rendering::wiggle_renderer::render_wiggle_tile(
                        normalized,
                        tile_request.output_width,
                        tile_request.output_height,
                        &wiggle_config,
                    )?
                }
                rendering::RenderMode::WiggleVariableDensity => {
                    let wiggle_config = tile_request
                        .wiggle_config
                        .ok_or_else(|| "Wiggle config required for wiggle+VD mode".to_string())?;
                    rendering::wiggle_renderer::render_wiggle_vd_tile(
                        normalized,
                        tile_request.output_width,
                        tile_request.output_height,
                        colormap.as_ref(),
                        &wiggle_config,
                    )?
                }
            }
        }
        _ => {
            let trace_data = reader
                .load_trace_data_with_sample_range(
                    tile_request.start_trace,
                    tile_request.trace_count,
                    tile_request.start_sample,
                    tile_request.sample_count,
                )
                .await
                .map_err(String::from)?;

            match tile_request.render_mode {
                rendering::RenderMode::VariableDensity => rendering::vd_renderer::render_tile(
                    trace_data,
                    tile_request.output_width,
                    tile_request.output_height,
                    colormap.as_ref(),
                    &tile_request.scaling,
                )?,
                rendering::RenderMode::Wiggle => {
                    let wiggle_config = tile_request
                        .wiggle_config
                        .ok_or_else(|| "Wiggle config required for wiggle mode".to_string())?;
                    let normalized =
                        normalizer::normalize_traces(&trace_data, &tile_request.scaling);
                    rendering::wiggle_renderer::render_wiggle_tile(
                        normalized,
                        tile_request.output_width,
                        tile_request.output_height,
                        &wiggle_config,
                    )?
                }
                rendering::RenderMode::WiggleVariableDensity => {
                    let wiggle_config = tile_request
                        .wiggle_config
                        .ok_or_else(|| "Wiggle config required for wiggle+VD mode".to_string())?;
                    let normalized =
                        normalizer::normalize_traces(&trace_data, &tile_request.scaling);
                    rendering::wiggle_renderer::render_wiggle_vd_tile(
                        normalized,
                        tile_request.output_width,
                        tile_request.output_height,
                        colormap.as_ref(),
                        &wiggle_config,
                    )?
                }
            }
        }
    };

    Ok(rendering::RenderedTile {
        start_sample: tile_request.start_sample,
        sample_count: tile_request.sample_count,
        image: rendered_image,
    })
}

/// Statistics collected from sampled traces for amplitude normalization.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmplitudeStats {
    /// Global maximum absolute amplitude across sampled traces.
    pub max_amplitude: f32,
    /// Clip value at the requested percentile of absolute amplitudes.
    pub percentile_clip: f32,
    /// The percentile that was used (0.0-1.0).
    pub percentile_used: f32,
    /// Number of traces sampled.
    pub traces_sampled: usize,
}

/// Sample trace blocks to compute percentile clipping and max amplitudes.
///
/// # Arguments
/// * `file_path` - Absolute path or URI to the SEG-Y file.
/// * `percentile` - Optional percentile (0.0-1.0), clamped to `0.0..=1.0`.
///
/// # Returns
/// * `AmplitudeStats` with max amplitude, clip value, percentile, and trace count.
///
/// # Errors
/// * `AppError` if no traces are available or reads/parsing fail.
#[tauri::command]
pub async fn scan_amplitude_range(
    file_path: String,
    percentile: Option<f32>,
    reader_state: State<'_, SegyReaderState>,
    storage_state: State<'_, StorageConfigState>,
) -> CommandResult<AmplitudeStats> {
    const NUM_BLOCKS: usize = 10;
    const BLOCK_SIZE: usize = 50;
    let percentile = percentile.unwrap_or(0.99).clamp(0.0, 1.0);

    let storage_config = storage_state.get();
    let reader = reader_state
        .get_or_open(file_path, Some(storage_config))
        .await
        .map_err(String::from)?;

    let total_traces = reader.data().total_traces.unwrap_or(0);
    if total_traces == 0 {
        return Err("No traces available for scanning".to_string());
    }

    let effective_blocks = NUM_BLOCKS.min(total_traces.div_ceil(BLOCK_SIZE));

    let blocks: Vec<(usize, usize)> = (0..effective_blocks)
        .map(|block_index| {
            let start = if effective_blocks <= 1 {
                0
            } else {
                block_index * (total_traces.saturating_sub(BLOCK_SIZE)) / (effective_blocks - 1)
            };
            let count = BLOCK_SIZE.min(total_traces - start);
            (start, count)
        })
        .collect();

    let block_results = reader
        .load_trace_data_blocks(&blocks)
        .await
        .map_err(String::from)?;

    let mut all_abs_values: Vec<f32> = Vec::new();
    let mut traces_sampled: usize = 0;

    for (i, traces) in block_results.iter().enumerate() {
        for trace in traces {
            let samples = normalizer::trace_to_f32_slice(trace);
            all_abs_values.extend(samples.iter().map(|&value| value.abs()));
        }
        traces_sampled += blocks[i].1;
    }

    if all_abs_values.is_empty() {
        return Err("No sample data found in scanned traces".to_string());
    }

    all_abs_values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let len = all_abs_values.len();
    let max_amplitude = all_abs_values[len - 1];
    let percentile_index = ((len as f64) * percentile as f64).min((len - 1) as f64) as usize;

    Ok(AmplitudeStats {
        max_amplitude,
        percentile_clip: all_abs_values[percentile_index].max(1e-10),
        percentile_used: percentile,
        traces_sampled,
    })
}
