//! Low-level IO helpers for SEG-Y parsing.
//!
//! This module contains file validation, header parsing, and trace slicing
//! helpers used by `SegyReader`.

use crate::error::AppError;
use crate::segy::binary_header::DataSampleFormat;
use crate::segy::{
    constants, BinaryHeader, ByteOrder, SegyFileConfig, TextualHeader, TraceBlock, TraceData,
};
use std::fs::File;
use std::io::{Seek, SeekFrom};

/// Minimum file size for a valid SEG-Y file (textual + binary headers only).
const MIN_SEGY_SIZE: u64 = constants::FILE_HEADER_SIZE as u64;

/// Parsed header bundle and file metadata.
pub(crate) struct HeaderBundle {
    /// Parsed textual header.
    pub textual_header: TextualHeader,
    /// Parsed binary header.
    pub binary_header: BinaryHeader,
    /// Total header size in bytes (textual + binary + extended textual headers).
    pub file_header_size: usize,
    /// File size in bytes.
    pub file_size: u64,
}

/// Read textual and binary headers and validate file size.
pub(crate) fn read_headers(file: &mut File) -> Result<HeaderBundle, AppError> {
    let metadata = file.metadata().map_err(|e| AppError::IoError {
        message: format!("Failed to read file metadata: {}", e),
    })?;
    let file_size = metadata.len();
    ensure_min_file_size(file_size)?;

    // Reset reader to the file start to read the headers.
    file.seek(SeekFrom::Start(0))
        .map_err(|e| AppError::IoError {
            message: format!("Failed to seek to file start: {}", e),
        })?;

    let mut textual_header =
        TextualHeader::from_reader(&mut *file).map_err(|e| AppError::SegyError {
            message: format!("Failed to read textual header: {}", e),
        })?;

    let binary_header = BinaryHeader::from_reader(&mut *file).map_err(|e| AppError::SegyError {
        message: format!("Failed to parse binary header: {}", e),
    })?;

    let extended_header_count = extended_textual_header_count(&binary_header)?;
    let file_header_size = resolve_file_header_size(&binary_header)?;
    if file_size < file_header_size as u64 {
        return Err(AppError::SegyError {
            message: format!(
                "File too small for declared headers ({} bytes, need {} bytes)",
                file_size, file_header_size
            ),
        });
    }

    for _ in 0..extended_header_count {
        let extended_header =
            TextualHeader::from_reader(&mut *file).map_err(|e| AppError::SegyError {
            message: format!("Failed to read extended textual header: {}", e),
        })?;
        textual_header.append_lines(extended_header.lines);
    }

    Ok(HeaderBundle {
        textual_header,
        binary_header,
        file_header_size,
        file_size,
    })
}

/// Compute total trace count from file size and per-trace block size.
///
/// Returns `None` when the size is invalid or the calculation would overflow.
pub(crate) fn compute_total_traces(
    file_size: u64,
    trace_block_size: usize,
    file_header_size: usize,
) -> Option<usize> {
    if trace_block_size == 0 || trace_block_size as u64 > file_size {
        return None;
    }

    let data_size = file_size.saturating_sub(file_header_size as u64);
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

/// Validate that a file path is non-empty and well-formed enough to attempt IO.
pub(crate) fn validate_file_path(file_path: &str) -> Result<(), AppError> {
    if file_path.is_empty() {
        return Err(AppError::ValidationError {
            message: "File path cannot be empty".to_string(),
        });
    }
    Ok(())
}

/// Ensure the file is large enough to contain the SEG-Y headers.
fn ensure_min_file_size(file_size: u64) -> Result<(), AppError> {
    if file_size < MIN_SEGY_SIZE {
        return Err(AppError::SegyError {
            message: format!(
                "File too small to be valid SEG-Y ({} bytes, minimum {} bytes)",
                file_size, MIN_SEGY_SIZE
            ),
        });
    }
    Ok(())
}

fn resolve_file_header_size(header: &BinaryHeader) -> Result<usize, AppError> {
    let extended_count = extended_textual_header_count(header)?;

    constants::FILE_HEADER_SIZE
        .checked_add(
            constants::TEXTUAL_HEADER_SIZE
                .checked_mul(extended_count)
                .ok_or_else(|| AppError::ValidationError {
                    message: "Extended textual header size overflow".to_string(),
                })?,
        )
        .ok_or_else(|| AppError::ValidationError {
            message: "File header size overflow".to_string(),
        })
}

fn extended_textual_header_count(header: &BinaryHeader) -> Result<usize, AppError> {
    let extended_textual_headers = header.extended_textual_headers;
    if extended_textual_headers <= 0 {
        return Ok(0);
    }

    usize::try_from(extended_textual_headers).map_err(|_| AppError::ValidationError {
        message: format!(
            "Invalid extended textual header count: {}",
            extended_textual_headers
        ),
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
