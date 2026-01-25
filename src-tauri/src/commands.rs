//! Tauri command handlers for the TraceLens backend.
//!
//! These commands bridge the frontend and the SEG-Y parser/renderer, returning
//! serialized data structures or JSON-encoded error payloads.

use crate::error::AppError;
use crate::segy::{
    io,
    rendering::{
        self, AmplitudeScaling, ColormapType, RenderMode, RenderedImage, ViewportConfig,
        WiggleConfig,
    },
    HeaderFieldSpec, SegyData, SegyFormatSpec, SegyReaderState, TraceBlock,
};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

/// Standard command result type for Tauri invokes.
///
/// We return `String` errors because the frontend expects JSON-serialized
/// `AppError` values (see `error.rs`).
type CommandResult<T> = Result<T, String>;

/// Header-only response for a single trace.
#[derive(Debug, Serialize)]
pub struct TraceHeaderResponse {
    pub header: HashMap<String, Value>,
}

/// Load and parse a SEG-Y file asynchronously
///
/// Reads the file headers and caches a memory-mapped reader for subsequent trace loads.
/// Supports SEG-Y Rev 0/1/2 formats. Traces are loaded on-demand via load_single_trace.
///
/// # Arguments
/// * `file_path` - Absolute path to the SEG-Y file
///
/// # Returns
/// A Result containing the SegyData structure with headers only
///
/// # Errors
/// Returns AppError for:
/// - File not found or inaccessible (IoError)
/// - Invalid SEG-Y format (SegyError)
/// - Parsing failures (ParseError)
///
/// # Example TypeScript Usage
/// ```typescript
/// import { invoke } from '@tauri-apps/api/core';
///
/// try {
///   const segyData = await invoke('load_segy_file', {
///     filePath: '/path/to/seismic.sgy'
///   });
///   console.log('Sample interval:', segyData.binary_header.sample_interval_us);
///   console.log('Trace count:', segyData.total_traces);
/// } catch (error) {
///   const appError = parseAppError(error);
///   console.error('Failed to load SEG-Y:', appError.message);
/// }
/// ```
#[tauri::command]
pub async fn load_segy_file(
    file_path: String,
    state: State<'_, SegyReaderState>,
) -> CommandResult<SegyData> {
    let reader = state.open(file_path).await.map_err(String::from)?;
    Ok(reader.data())
}

/// Get binary header field specifications
///
/// Returns metadata dynamically loaded from the revision-specific SEG-Y spec
#[tauri::command]
pub fn get_binary_header_spec(segy_revision: Option<u16>) -> CommandResult<Vec<HeaderFieldSpec>> {
    let spec = SegyFormatSpec::load_for_revision(segy_revision.unwrap_or_default())?;
    Ok(spec.get_binary_header_fields())
}

/// Get trace header field specifications
///
/// Returns metadata dynamically loaded from the revision-specific SEG-Y spec
#[tauri::command]
pub fn get_trace_header_spec(segy_revision: Option<u16>) -> CommandResult<Vec<HeaderFieldSpec>> {
    let spec = SegyFormatSpec::load_for_revision(segy_revision.unwrap_or_default())?;
    Ok(spec.get_trace_header_fields())
}

/// Load a single trace by index from a SEG-Y file
///
/// # Arguments
/// * `file_path` - Absolute path to the SEG-Y file
/// * `trace_index` - Zero-based trace index
/// * `max_samples` - Optional max samples to load
///
/// # Returns
/// A Result containing the TraceBlock for the requested trace
#[tauri::command]
pub async fn load_single_trace(
    file_path: String,
    trace_index: usize,
    _max_samples: Option<usize>,
    segy_revision: Option<u16>,
    state: State<'_, SegyReaderState>,
) -> CommandResult<TraceHeaderResponse> {
    let reader = state.get_or_open(file_path).await.map_err(String::from)?;
    let revision = segy_revision.unwrap_or(reader.binary_header().segy_revision);
    let spec = SegyFormatSpec::load_for_revision(revision)?;
    let fields = spec.get_trace_header_fields();

    run_blocking(move || {
        let header_bytes = reader.load_trace_header_bytes(trace_index)?;
        let header_map =
            io::parse_trace_header_map(&header_bytes, &fields, reader.config().byte_order)?;
        Ok(TraceHeaderResponse { header: header_map })
    })
    .await
}

/// Load a range of traces from a SEG-Y file
///
/// Uses memory-mapped I/O for fast random access at any file offset.
/// More efficient than loading traces one-by-one via load_single_trace.
#[tauri::command]
pub async fn load_trace_range(
    file_path: String,
    start_index: usize,
    count: usize,
    max_samples: Option<usize>,
    state: State<'_, SegyReaderState>,
) -> CommandResult<Vec<TraceBlock>> {
    let reader = state.get_or_open(file_path).await.map_err(String::from)?;
    run_blocking(move || reader.load_trace_range(start_index, count, max_samples)).await
}

/// Render Variable Density view from SEG-Y traces
#[tauri::command]
pub async fn render_variable_density(
    file_path: String,
    viewport: ViewportConfig,
    colormap_type: ColormapType,
    scaling: AmplitudeScaling,
    render_mode: RenderMode,
    wiggle_config: Option<WiggleConfig>,
    state: State<'_, SegyReaderState>,
) -> CommandResult<RenderedImage> {
    let reader = state.get_or_open(file_path).await.map_err(String::from)?;
    let trace_data = run_blocking(move || {
        reader.load_trace_data_range(viewport.start_trace, viewport.trace_count, None)
    })
    .await?;

    rendering::render_traces(
        trace_data,
        &viewport,
        colormap_type,
        &scaling,
        render_mode,
        wiggle_config,
    )
}

/// Run a blocking SEG-Y task on the dedicated blocking thread pool.
///
/// This keeps the async runtime responsive and converts any errors into the
/// JSON string format used by the frontend.
async fn run_blocking<T, F>(task: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(task)
        .await
        .map_err(|e| AppError::IoError {
            message: format!("Background task failed: {}", e),
        })?
        .map_err(String::from)
}
