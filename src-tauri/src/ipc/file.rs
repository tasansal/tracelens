//! SEG-Y file lifecycle commands.

use crate::segy::{SegyData, SegyReaderState, TraceBlock};
use crate::storage_config::StorageConfigState;
use tauri::State;

use super::CommandResult;

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
    let storage_config = storage_state.get().await;
    let reader = reader_state
        .open(file_path, Some(storage_config))
        .await
        .map_err(String::from)?;
    Ok(reader.data())
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
    let storage_config = storage_state.get().await;
    let reader = reader_state
        .get_or_open(file_path, Some(storage_config))
        .await
        .map_err(String::from)?;

    reader
        .load_single_trace(trace_index, max_samples)
        .await
        .map_err(String::from)
}
