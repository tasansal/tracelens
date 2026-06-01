//! SEG-Y file lifecycle commands.

use crate::segy::{SegyData, SegyReaderState};
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
