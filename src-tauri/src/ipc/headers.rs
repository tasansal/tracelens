//! Header spec and data query commands.

use crate::segy::{
    FieldData, HeaderFieldSpec, RuntimeHeaderView, SegyFormatSpec, SegyReaderState, SegyRevision,
    SpecRegistry,
};
use crate::spec::runtime::ScalarType;
use crate::storage_config::StorageConfigState;
use serde::Serialize;
use tauri::State;

use super::CommandResult;

/// Key, display name, and byte size for a single scalar type.
#[derive(Debug, Serialize)]
pub struct ScalarTypeInfo {
    pub key: String,
    pub label: String,
    pub size: usize,
}

/// Resolve the standard spec for an optional revision, falling back to the default.
fn resolve_spec(revision: Option<SegyRevision>) -> &'static SegyFormatSpec {
    let registry = SpecRegistry::global();
    revision
        .and_then(|r| registry.get(r))
        .unwrap_or_else(|| registry.default_spec())
}

/// Resolve the merged (standard + custom) spec for `file_path`.
///
/// Looks up the active revision override (or falls back to detected), fetches
/// the corresponding standard spec from the global registry, then merges any
/// custom fields stored for this file.
pub(super) async fn active_spec_for(
    file_path: &str,
    detected_revision: SegyRevision,
    reader_state: &SegyReaderState,
) -> SegyFormatSpec {
    let active_revision = reader_state
        .get_active_revision(file_path, detected_revision)
        .await;
    let standard_spec = resolve_spec(Some(active_revision));
    reader_state.get_active_spec(file_path, standard_spec).await
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
    Ok(resolve_spec(revision).binary_header.fields.clone())
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
    Ok(resolve_spec(revision).trace_header.fields.clone())
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
    let storage_config = storage_state.get().await;
    let reader = reader_state
        .get_or_open(file_path.clone(), Some(storage_config))
        .await
        .map_err(String::from)?;

    let data = reader.data();
    let active_spec = active_spec_for(&file_path, data.detected_revision, &reader_state).await;
    let field_specs = &active_spec.binary_header.fields;
    let header_bytes = data.binary_header_bytes();

    let header_spec = crate::segy::header_dynamic::HeaderSpec::from_specs(field_specs, 400)
        .map_err(|e| format!("Failed to build header spec: {}", e))?;

    let view = RuntimeHeaderView::new(header_bytes, &header_spec, data.byte_order);
    let mut fields = view.extract_all(field_specs);

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
    let storage_config = storage_state.get().await;
    let reader = reader_state
        .get_or_open(file_path.clone(), Some(storage_config))
        .await
        .map_err(String::from)?;

    let data = reader.data();
    let active_spec = active_spec_for(&file_path, data.detected_revision, &reader_state).await;
    let field_specs = &active_spec.trace_header.fields;

    let trace_block = reader
        .load_single_trace(trace_index, None)
        .await
        .map_err(String::from)?;

    let header_spec = crate::segy::header_dynamic::HeaderSpec::from_specs(field_specs, 240)
        .map_err(|e| format!("Failed to build header spec: {}", e))?;

    let view = RuntimeHeaderView::new(&trace_block.header_bytes, &header_spec, data.byte_order);
    Ok(view.extract_all(field_specs))
}

/// Return all supported scalar types with their display names.
///
/// The list is ordered for display in a selector (signed before unsigned,
/// then floats). Use `key` as the spec value and `label` for the UI.
#[tauri::command]
pub fn list_scalar_types() -> Vec<ScalarTypeInfo> {
    ScalarType::all()
        .iter()
        .map(|t| ScalarTypeInfo {
            key: t.key().to_string(),
            label: t.display_name().to_string(),
            size: t.size(),
        })
        .collect()
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
