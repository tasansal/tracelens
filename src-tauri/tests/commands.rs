//! IPC command handler integration tests.
//!
//! These tests verify the Tauri command handlers using real temporary files
//! and actual state management. They test the complete IPC boundary between
//! frontend requests and Rust backend responses.

#[path = "common/mod.rs"]
mod common;

use app_lib::segy::SegyReaderState;
use app_lib::segy::parser::trace_data::TraceData;
use app_lib::storage_config::StorageConfigState;

/// Test the load_segy_file command.
#[tokio::test]
async fn test_load_segy_file_command() {
    let temp_file = common::create_minimal_segy(10);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_state = StorageConfigState::default();

    let storage_config = storage_state.get().await;

    let reader = reader_state
        .open(file_path, Some(storage_config))
        .await
        .expect("Should load SEG-Y file");

    let data = reader.data();

    assert!(data.total_traces.is_some(), "Should have trace count");
    assert!(
        data.binary_header.samples_per_trace > 0,
        "Should have samples"
    );
}

/// Test the get_binary_header_data command.
#[tokio::test]
async fn test_get_binary_header_data_command() {
    let temp_file = common::create_minimal_segy(5);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_state = StorageConfigState::default();

    let storage_config = storage_state.get().await;

    let _reader = reader_state
        .open(file_path.clone(), Some(storage_config.clone()))
        .await
        .expect("Should load file");

    let data = reader_state
        .get_or_open(file_path.clone(), Some(storage_config.clone()))
        .await
        .expect("Should get or open reader");

    let segy_data = data.data();
    let detected_revision = segy_data.detected_revision;

    let active_revision = reader_state
        .get_active_revision(&file_path, detected_revision)
        .await;

    let registry = app_lib::segy::SpecRegistry::new().expect("Should create spec registry");
    let spec = registry
        .get(active_revision)
        .unwrap_or_else(|| registry.default_spec());

    assert!(
        !spec.binary_header.fields.is_empty(),
        "Should have binary header fields"
    );
}

/// Test the get_trace_header_data command.
#[tokio::test]
async fn test_get_trace_header_data_command() {
    let temp_file = common::create_minimal_segy(3);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_state = StorageConfigState::default();

    let storage_config = storage_state.get().await;

    let _reader = reader_state
        .open(file_path.clone(), Some(storage_config.clone()))
        .await
        .expect("Should load file");

    let data = reader_state
        .get_or_open(file_path.clone(), Some(storage_config.clone()))
        .await
        .expect("Should get or open reader");

    let detected_revision = data.data().detected_revision;

    let active_revision = reader_state
        .get_active_revision(&file_path, detected_revision)
        .await;

    let registry = app_lib::segy::SpecRegistry::new().expect("Should create spec registry");
    let spec = registry
        .get(active_revision)
        .unwrap_or_else(|| registry.default_spec());

    assert!(
        !spec.trace_header.fields.is_empty(),
        "Should have trace header fields"
    );

    let trace_block = data
        .load_single_trace(0, None)
        .await
        .expect("Should load trace");
    assert!(
        !trace_block.header_bytes.is_empty(),
        "Should have trace header bytes"
    );
}

/// Test error handling for invalid file path.
#[tokio::test]
async fn test_command_invalid_file_path() {
    let reader_state = SegyReaderState::new();
    let storage_state = StorageConfigState::default();

    let storage_config = storage_state.get().await;

    let invalid_path = "/nonexistent/path/to/file.sgy".to_string();

    let result = reader_state.open(invalid_path, Some(storage_config)).await;

    assert!(result.is_err(), "Should error on invalid path");
}

/// Test error handling for corrupted file.
#[tokio::test]
async fn test_command_corrupted_file() {
    let temp_file = common::create_malformed_segy(common::MalformedKind::TruncatedBinaryHeader);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_state = StorageConfigState::default();

    let storage_config = storage_state.get().await;

    let result = reader_state.open(file_path, Some(storage_config)).await;

    assert!(result.is_err(), "Should error on corrupted file");
}

/// Test setting active revision.
#[tokio::test]
async fn test_set_active_revision() {
    let temp_file = common::create_minimal_segy(3);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_state = StorageConfigState::default();

    let storage_config = storage_state.get().await;

    let _reader = reader_state
        .open(file_path.clone(), Some(storage_config.clone()))
        .await
        .expect("Should load file");

    let revision = app_lib::segy::SegyRevision::Rev1;
    reader_state
        .set_active_revision(file_path.clone(), revision)
        .await;

    let data = reader_state
        .get_or_open(file_path.clone(), Some(storage_config))
        .await
        .expect("Should get reader");

    let detected = data.data().detected_revision;
    let active = reader_state.get_active_revision(&file_path, detected).await;

    assert_eq!(
        active,
        app_lib::segy::SegyRevision::Rev1,
        "Should set active revision"
    );
}

/// Test loading single trace.
#[tokio::test]
async fn test_load_single_trace_command() {
    let temp_file = common::create_minimal_segy(5);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_state = StorageConfigState::default();

    let storage_config = storage_state.get().await;

    let reader = reader_state
        .get_or_open(file_path, Some(storage_config))
        .await
        .expect("Should get or open reader");

    let trace = reader
        .load_single_trace(0, None)
        .await
        .expect("Should load trace 0");

    fn has_trace_data(data: &TraceData) -> bool {
        match data {
            TraceData::IbmFloat32(v) => !v.is_empty(),
            TraceData::Int32(v) => !v.is_empty(),
            TraceData::Int16(v) => !v.is_empty(),
            TraceData::FixedPointWithGain(v) => !v.is_empty(),
            TraceData::IeeeFloat32(v) => !v.is_empty(),
            TraceData::Int8(v) => !v.is_empty(),
        }
    }
    assert!(has_trace_data(&trace.data), "Trace should have samples");

    let trace = reader
        .load_single_trace(2, None)
        .await
        .expect("Should load trace 2");

    assert!(has_trace_data(&trace.data), "Trace 2 should have samples");
}

/// Test loading single trace with max_samples limit.
#[tokio::test]
async fn test_load_single_trace_with_limit() {
    let temp_file = common::create_minimal_segy(3);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_state = StorageConfigState::default();

    let storage_config = storage_state.get().await;

    let reader = reader_state
        .get_or_open(file_path, Some(storage_config))
        .await
        .expect("Should get or open reader");

    let trace = reader
        .load_single_trace(0, Some(10))
        .await
        .expect("Should load trace with limit");

    fn sample_count(data: &TraceData) -> usize {
        match data {
            TraceData::IbmFloat32(v) => v.len(),
            TraceData::Int32(v) => v.len(),
            TraceData::Int16(v) => v.len(),
            TraceData::FixedPointWithGain(v) => v.len(),
            TraceData::IeeeFloat32(v) => v.len(),
            TraceData::Int8(v) => v.len(),
        }
    }
    assert!(sample_count(&trace.data) <= 10, "Should limit samples");
}
