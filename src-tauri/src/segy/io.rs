//! Low-level IO helpers for SEG-Y parsing.
//!
//! This module contains file validation, header parsing, and trace slicing
//! helpers used by `SegyReader`.

use crate::error::AppError;
use crate::segy::parser::binary_header::DataSampleFormat;
use crate::segy::{ByteOrder, SegyFileConfig, TraceBlock, TraceData, constants};

/// Compute total trace count from file size and per-trace block size.
///
/// Returns `None` when the size is invalid or the calculation would overflow.
pub(crate) fn compute_total_traces(file_size: u64, trace_block_size: usize) -> Option<usize> {
    if trace_block_size == 0 || trace_block_size as u64 > file_size {
        return None;
    }

    let data_size = file_size.saturating_sub(constants::FILE_HEADER_SIZE as u64);
    Some((data_size / trace_block_size as u64) as usize)
}

/// Parse a full trace block (header + samples) from raw bytes.
pub(crate) fn parse_trace_block(
    trace_bytes: &[u8],
    format: DataSampleFormat,
    samples_per_trace: u16,
    byte_order: ByteOrder,
) -> Result<TraceBlock, AppError> {
    let samples = i16::try_from(samples_per_trace).map_err(|_| AppError::ValidationError {
        message: format!(
            "Samples per trace exceeds supported range: {}",
            samples_per_trace
        ),
    })?;

    let mut cursor = std::io::Cursor::new(trace_bytes);
    TraceBlock::from_reader(&mut cursor, format, Some(samples), byte_order).map_err(|e| {
        AppError::SegyError {
            message: format!("Trace parse failed: {}", e),
        }
    })
}

/// Parse trace samples only (skip header) from raw bytes.
pub(crate) fn parse_trace_data(
    trace_bytes: &[u8],
    format: DataSampleFormat,
    samples_per_trace: u16,
) -> Result<TraceData, AppError> {
    let data_offset = constants::TRACE_HEADER_SIZE;
    let samples = usize::from(samples_per_trace);
    let data_size = samples
        .checked_mul(format.bytes_per_sample())
        .ok_or_else(|| AppError::ValidationError {
            message: "Trace data size overflow".to_string(),
        })?;

    let end = data_offset
        .checked_add(data_size)
        .ok_or_else(|| AppError::ValidationError {
            message: "Trace data end overflow".to_string(),
        })?;

    let data_bytes = trace_bytes
        .get(data_offset..end)
        .ok_or_else(|| AppError::SegyError {
            message: "Trace data slice out of bounds".to_string(),
        })?;

    let mut cursor = std::io::Cursor::new(data_bytes);
    TraceData::from_reader(&mut cursor, format, samples).map_err(|e| AppError::SegyError {
        message: format!("Trace data parse failed: {}", e),
    })
}

/// Parse trace samples with sample range filtering (skip header) from raw bytes.
///
/// Only parses the specified sample range, optimizing memory and CPU usage for viewport rendering.
pub(crate) fn parse_trace_data_with_range(
    trace_bytes: &[u8],
    format: DataSampleFormat,
    total_samples: u16,
    start_sample: usize,
    sample_count: usize,
) -> Result<TraceData, AppError> {
    let data_offset = constants::TRACE_HEADER_SIZE;
    let total_samples_usize = usize::from(total_samples);

    // Validate range
    if start_sample >= total_samples_usize {
        return Err(AppError::ValidationError {
            message: format!(
                "start_sample {} >= total_samples {}",
                start_sample, total_samples
            ),
        });
    }

    let end_sample = (start_sample + sample_count).min(total_samples_usize);
    let actual_count = end_sample - start_sample;

    if actual_count == 0 {
        return Err(AppError::ValidationError {
            message: "sample_count must result in at least one sample".to_string(),
        });
    }

    // Calculate byte offsets within the trace data section
    let bytes_per_sample = format.bytes_per_sample();
    let range_start_byte = data_offset + (start_sample * bytes_per_sample);
    let range_end_byte = data_offset + (end_sample * bytes_per_sample);

    // Extract the sample range bytes
    let range_bytes = trace_bytes
        .get(range_start_byte..range_end_byte)
        .ok_or_else(|| AppError::SegyError {
            message: format!(
                "Sample range [{}, {}) out of bounds for trace data",
                start_sample, end_sample
            ),
        })?;

    // Parse only the requested samples
    let mut cursor = std::io::Cursor::new(range_bytes);
    TraceData::from_reader(&mut cursor, format, actual_count).map_err(|e| AppError::SegyError {
        message: format!("Trace data range parse failed: {}", e),
    })
}

/// Validate the requested trace range and ensure the configuration is usable.
pub(crate) fn validate_trace_range(
    config: &SegyFileConfig,
    start_index: usize,
    count: usize,
    total_traces: Option<usize>,
) -> Result<(), AppError> {
    if count == 0 {
        return Ok(());
    }

    if let Some(total) = total_traces {
        let end_index =
            start_index
                .checked_add(count)
                .ok_or_else(|| AppError::ValidationError {
                    message: "Trace range end overflow".to_string(),
                })?;
        if start_index >= total || end_index > total {
            return Err(AppError::ValidationError {
                message: format!(
                    "Trace range [{}..{}) exceeds total traces {}",
                    start_index, end_index, total
                ),
            });
        }
    }

    config.trace_block_size().map(|_| ())
}
