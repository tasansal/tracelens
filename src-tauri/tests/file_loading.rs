//! File loading integration tests.
//!
//! These tests verify end-to-end file loading using real temporary SEG-Y files.
//! They test both successful loading and error handling for malformed files.

#[path = "common/mod.rs"]
mod common;

use app_lib::segy::SegyReaderState;
use app_lib::segy::parser::trace_data::TraceData;

/// Test loading a minimal valid SEG-Y file.
#[tokio::test]
async fn test_load_minimal_valid_segy() {
    let temp_file = common::create_minimal_segy(10);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_config = None;

    let reader = reader_state
        .open(file_path, storage_config)
        .await
        .expect("Should successfully open valid SEG-Y file");

    let data = reader.data();

    assert_eq!(data.total_traces, Some(10), "Should have 10 traces");

    assert_eq!(
        data.binary_header.samples_per_trace, 100,
        "Should have 100 samples per trace"
    );

    assert_eq!(
        data.binary_header.data_sample_format as u16, 1,
        "Format code should be 1 (IBM Float)"
    );
}

/// Test loading a file with 1000 traces.
#[tokio::test]
async fn test_load_large_file() {
    let temp_file = common::create_minimal_segy(1000);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_config = None;

    let reader = reader_state
        .open(file_path, storage_config)
        .await
        .expect("Should successfully open large SEG-Y file");

    let data = reader.data();

    assert_eq!(data.total_traces, Some(1000), "Should have 1000 traces");
}

/// Test loading a truncated (malformed) file.
#[tokio::test]
async fn test_load_truncated_file() {
    let temp_file = common::create_malformed_segy(common::MalformedKind::TruncatedBinaryHeader);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_config = None;

    let result = reader_state.open(file_path, storage_config).await;

    assert!(result.is_err(), "Should return error for truncated file");
}

/// Test loading a file with invalid format code.
#[tokio::test]
async fn test_load_invalid_format_file() {
    let temp_file = common::create_malformed_segy(common::MalformedKind::InvalidFormatCode);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_config = None;

    let result = reader_state.open(file_path, storage_config).await;

    assert!(
        result.is_err(),
        "Should return error for invalid format code"
    );
}

/// Test loading an empty file.
#[tokio::test]
async fn test_load_empty_file() {
    let temp_file = common::create_malformed_segy(common::MalformedKind::EmptyFile);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_config = None;

    let result = reader_state.open(file_path, storage_config).await;

    assert!(result.is_err(), "Should return error for empty file");
}

/// Test loading a file with wrong byte order.
#[tokio::test]
async fn test_load_wrong_byte_order() {
    let temp_file = common::create_malformed_segy(common::MalformedKind::WrongByteOrder);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_config = None;

    let _ = reader_state.open(file_path, storage_config).await;
}

/// Test loading a Rev 1 SEG-Y file.
#[tokio::test]
async fn test_load_rev1_segy() {
    let temp_file = common::create_rev1_segy(5);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_config = None;

    let reader = reader_state
        .open(file_path, storage_config)
        .await
        .expect("Should successfully open Rev 1 SEG-Y file");

    let data = reader.data();

    assert_eq!(data.total_traces, Some(5), "Should have 5 traces");
}

/// Test that sample data can be loaded from a file.
#[tokio::test]
async fn test_load_trace_data() {
    let temp_file = common::create_minimal_segy(3);
    let file_path = temp_file.path().to_string_lossy().to_string();

    let reader_state = SegyReaderState::new();
    let storage_config = None;

    let reader = reader_state
        .open(file_path, storage_config)
        .await
        .expect("Should successfully open file");

    let trace = reader
        .load_single_trace(0, None)
        .await
        .expect("Should load first trace");

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
    assert!(has_trace_data(&trace.data), "Trace should have sample data");
}
