//! Custom spec CRUD commands.

use crate::io::uri::is_remote_uri;
use crate::segy::{
    HeaderFieldSpec, HeaderType, SegyFormatSpec, SegyReaderState, SegyStorage, SpecRegistry,
};
use tauri::State;

use super::CommandResult;

/// Load a custom spec from a local file or remote URI.
///
/// # Arguments
/// * `file_path` - The SEG-Y file path this spec applies to.
/// * `uri` - Local file path or remote URI (s3://, gs://, az://, https://).
///
/// # Returns
/// * The loaded `SegyFormatSpec` or error if loading fails.
#[tauri::command]
pub async fn load_custom_spec(
    file_path: String,
    uri: String,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<SegyFormatSpec> {
    // Max spec size: 1MB (per T-02-03)
    const MAX_SPEC_SIZE: usize = 1024 * 1024;

    let storage = SegyStorage::from_uri_with_config(&uri, None)
        .await
        .map_err(|e| e.to_string())?;

    let file_size = storage.size();
    if file_size > MAX_SPEC_SIZE as u64 {
        return Err(format!(
            "Custom spec file exceeds maximum size of {} bytes",
            MAX_SPEC_SIZE
        ));
    }

    let spec_bytes = storage
        .read_range(0, file_size as usize)
        .await
        .map_err(|e| e.to_string())?;

    let spec: SegyFormatSpec =
        serde_json::from_slice(&spec_bytes).map_err(|e| format!("Invalid JSON: {}", e))?;

    // Validate structure per T-02-01
    crate::segy::validate(&spec)
        .map_err(|errors| format!("Spec validation failed: {:?}", errors))?;

    reader_state.set_custom_spec(file_path, spec.clone()).await;

    Ok(spec)
}

/// Save a custom spec to a local file or remote URI.
///
/// # Arguments
/// * `file_path` - The SEG-Y file path the spec is associated with.
/// * `uri` - Local file path or remote URI to save to.
///
/// # Returns
/// * Success or error message.
#[tauri::command]
pub async fn save_custom_spec(
    file_path: String,
    uri: String,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<()> {
    let spec = reader_state
        .get_custom_spec(&file_path)
        .await
        .ok_or_else(|| "No custom spec found for this file".to_string())?;

    let json = serde_json::to_string_pretty(&spec).map_err(|e| e.to_string())?;

    if is_remote_uri(&uri) {
        return Err(
            "Remote spec saving is not yet supported. Please save to a local file.".to_string(),
        );
    }

    tokio::fs::write(&uri, json)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get the current custom spec for a file.
///
/// # Arguments
/// * `file_path` - The SEG-Y file path.
///
/// # Returns
/// * The custom spec if one exists, null otherwise.
#[tauri::command]
pub async fn get_custom_spec(
    file_path: String,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<Option<SegyFormatSpec>> {
    Ok(reader_state.get_custom_spec(&file_path).await)
}

/// Clear the custom spec for a file.
///
/// # Arguments
/// * `file_path` - The SEG-Y file path.
#[tauri::command]
pub async fn clear_custom_spec(
    file_path: String,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<()> {
    reader_state.clear_custom_spec(&file_path).await;
    Ok(())
}

/// Apply `mutator` to the field list for `header_type` of the file's custom spec,
/// store the result, and return the updated spec.
///
/// If `seed_empty` is true and no custom spec exists yet, an empty one is seeded
/// (used by `add_custom_field`). Otherwise a missing custom spec is an error.
async fn mutate_custom_fields<F>(
    file_path: String,
    header_type: HeaderType,
    seed_empty: bool,
    reader_state: &SegyReaderState,
    mutator: F,
) -> CommandResult<SegyFormatSpec>
where
    F: FnOnce(&mut Vec<HeaderFieldSpec>),
{
    let mut spec = match reader_state.get_custom_spec(&file_path).await {
        Some(s) => s,
        None if seed_empty => {
            // Start from scratch with empty fields so we don't inherit standard-spec fields.
            let mut base = SpecRegistry::global().default_spec().clone();
            base.binary_header.fields.clear();
            base.trace_header.fields.clear();
            base
        }
        None => return Err("No custom spec found for this file".to_string()),
    };

    let fields = match header_type {
        HeaderType::Binary => &mut spec.binary_header.fields,
        HeaderType::Trace => &mut spec.trace_header.fields,
    };
    mutator(fields);

    // Validate the mutated spec just like load_custom_spec does, so an
    // out-of-bounds or overlapping field is rejected here instead of being
    // stored and later panicking/dropping during header extraction.
    crate::segy::validate(&spec)
        .map_err(|errors| format!("Spec validation failed: {:?}", errors))?;

    reader_state.set_custom_spec(file_path, spec.clone()).await;
    Ok(spec)
}

/// Add a custom field to the spec for a file.
#[tauri::command]
pub async fn add_custom_field(
    file_path: String,
    header_type: HeaderType,
    field: HeaderFieldSpec,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<SegyFormatSpec> {
    mutate_custom_fields(file_path, header_type, true, &reader_state, |fields| {
        fields.push(field);
    })
    .await
}

/// Update an existing custom field by `field_key`.
#[tauri::command]
pub async fn update_custom_field(
    file_path: String,
    header_type: HeaderType,
    field_key: String,
    field: HeaderFieldSpec,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<SegyFormatSpec> {
    mutate_custom_fields(file_path, header_type, false, &reader_state, |fields| {
        if let Some(existing) = fields.iter_mut().find(|f| f.field_key == field_key) {
            *existing = field;
        }
    })
    .await
}

/// Delete a custom field by `field_key`.
#[tauri::command]
pub async fn delete_custom_field(
    file_path: String,
    header_type: HeaderType,
    field_key: String,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<SegyFormatSpec> {
    mutate_custom_fields(file_path, header_type, false, &reader_state, |fields| {
        fields.retain(|f| f.field_key != field_key);
    })
    .await
}

/// Get the active (merged) spec for a file.
///
/// # Arguments
/// * `file_path` - The SEG-Y file path.
///
/// # Returns
/// * Merged spec (standard + custom).
#[tauri::command]
pub async fn get_active_spec(
    file_path: String,
    reader_state: State<'_, SegyReaderState>,
) -> CommandResult<SegyFormatSpec> {
    let registry = SpecRegistry::global();
    let merged = reader_state
        .get_active_spec(&file_path, registry.default_spec())
        .await;
    Ok(merged)
}
