//! Raw sample-data access for GPU rendering.
//!
//! Returns a contiguous block of little-endian `f32` samples via Tauri's raw
//! byte response channel — no JSON encoding, no base64, no PNG round-trip.
//! The frontend wraps the returned `ArrayBuffer` directly in a `Float32Array`
//! and uploads it as a GPU texture.

use crate::segy::SegyReaderState;
use crate::segy::agc::AgcOptions;
use crate::storage_config::StorageConfigState;
use tauri::State;
use tauri::ipc::Response;

use super::CommandResult;

/// Fetch a rectangular block of amplitude samples as raw little-endian f32 bytes.
///
/// The response body is `trace_count * sample_count * 4` bytes, laid out
/// row-major by trace (trace 0's samples, then trace 1's, ...). Short traces
/// are zero-padded to `sample_count` so the frontend can upload a fixed-size
/// texture without per-row offset math.
///
/// # Arguments
/// * `file_path` — Absolute path or URI to the SEG-Y file.
/// * `start_trace` / `trace_count` — Horizontal window.
/// * `start_sample` / `sample_count` — Vertical window.
/// * `agc` — Optional AGC options; when present, returned samples are
///   gain-normalized per trace (as IEEE f32) instead of raw amplitudes.
///
/// # Errors
/// * `AppError` if the reader cannot open or the window is out of range.
// Arg count includes Tauri-injected `State` params; bundling the window fields
// into a struct would only obscure the IPC signature.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn fetch_trace_samples(
    file_path: String,
    start_trace: usize,
    trace_count: usize,
    start_sample: usize,
    sample_count: usize,
    agc: Option<AgcOptions>,
    reader_state: State<'_, SegyReaderState>,
    storage_state: State<'_, StorageConfigState>,
) -> CommandResult<Response> {
    let storage_config = storage_state.get().await;
    let reader = reader_state
        .get_or_open(file_path, Some(storage_config))
        .await
        .map_err(String::from)?;

    let traces = reader
        .load_trace_data_with_sample_range(
            start_trace,
            trace_count,
            start_sample,
            sample_count,
            agc,
        )
        .await
        .map_err(String::from)?;

    let total_f32 = trace_count * sample_count;
    let mut bytes = vec![0u8; total_f32 * 4];
    let row_stride = sample_count * 4;

    for (t_idx, trace) in traces.iter().enumerate() {
        let row = &mut bytes[t_idx * row_stride..(t_idx + 1) * row_stride];
        let mut s_idx = 0usize;
        trace.for_each_f32(|v| {
            if s_idx < sample_count {
                let off = s_idx * 4;
                row[off..off + 4].copy_from_slice(&v.to_le_bytes());
                s_idx += 1;
            }
        });
    }

    Ok(Response::new(bytes))
}
