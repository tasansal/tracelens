//! Low-level IO helpers for SEG-Y parsing.
//!
//! This module contains file validation, header parsing, and trace slicing
//! helpers used by `SegyReader`.

use crate::error::AppError;
use crate::segy::binary_header::DataSampleFormat;
use byteorder::{BigEndian, LittleEndian, ReadBytesExt};
use crate::segy::{
    constants, BinaryHeader, ByteOrder, HeaderFieldSpec, SegyFileConfig, TextualHeader, TraceBlock,
    TraceData,
};
use serde_json::Value;
use std::collections::HashMap;
use std::io::Cursor;
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

/// Parse a trace header into a field-keyed map using the provided spec.
pub(crate) fn parse_trace_header_map(
    header_bytes: &[u8],
    fields: &[HeaderFieldSpec],
    byte_order: ByteOrder,
) -> Result<HashMap<String, Value>, AppError> {
    if header_bytes.len() < constants::TRACE_HEADER_SIZE {
        return Err(AppError::SegyError {
            message: "Trace header bytes are incomplete".to_string(),
        });
    }

    let mut values = HashMap::new();
    for field in fields {
        let start = field.byte_start.saturating_sub(1) as usize;
        let end = field.byte_end as usize;
        let slice = header_bytes
            .get(start..end)
            .ok_or_else(|| AppError::SegyError {
                message: format!(
                    "Trace header slice out of bounds for {}",
                    field.field_key
                ),
            })?;

        let value = parse_field_value(slice, &field.data_type, byte_order)?;
        values.insert(field.field_key.clone(), value);
    }

    Ok(values)
}

fn parse_field_value(
    bytes: &[u8],
    data_type: &str,
    byte_order: ByteOrder,
) -> Result<Value, AppError> {
    let kind = data_type.to_lowercase();
    let mut cursor = Cursor::new(bytes);

    let value = match kind.as_str() {
        "int16" => Value::from(read_i16(&mut cursor, byte_order)? as i64),
        "int32" => Value::from(read_i32(&mut cursor, byte_order)? as i64),
        "uint16" => Value::from(read_u16(&mut cursor, byte_order)? as u64),
        "uint32" => Value::from(read_u32(&mut cursor, byte_order)? as u64),
        "uint64" => Value::from(read_u64(&mut cursor, byte_order)?),
        "float64" => Value::from(read_f64(&mut cursor, byte_order)?),
        "string" | "s8" => {
            let text = String::from_utf8_lossy(bytes).trim_matches(['\0', ' ']).to_string();
            Value::from(text)
        }
        _ => {
            let text = String::from_utf8_lossy(bytes).trim_matches(['\0', ' ']).to_string();
            Value::from(text)
        }
    };

    Ok(value)
}

fn read_i16(cursor: &mut Cursor<&[u8]>, byte_order: ByteOrder) -> Result<i16, AppError> {
    match byte_order {
        ByteOrder::BigEndian => cursor.read_i16::<BigEndian>().map_err(to_io_error),
        ByteOrder::LittleEndian => cursor.read_i16::<LittleEndian>().map_err(to_io_error),
    }
}

fn read_i32(cursor: &mut Cursor<&[u8]>, byte_order: ByteOrder) -> Result<i32, AppError> {
    match byte_order {
        ByteOrder::BigEndian => cursor.read_i32::<BigEndian>().map_err(to_io_error),
        ByteOrder::LittleEndian => cursor.read_i32::<LittleEndian>().map_err(to_io_error),
    }
}

fn read_u16(cursor: &mut Cursor<&[u8]>, byte_order: ByteOrder) -> Result<u16, AppError> {
    match byte_order {
        ByteOrder::BigEndian => cursor.read_u16::<BigEndian>().map_err(to_io_error),
        ByteOrder::LittleEndian => cursor.read_u16::<LittleEndian>().map_err(to_io_error),
    }
}

fn read_u32(cursor: &mut Cursor<&[u8]>, byte_order: ByteOrder) -> Result<u32, AppError> {
    match byte_order {
        ByteOrder::BigEndian => cursor.read_u32::<BigEndian>().map_err(to_io_error),
        ByteOrder::LittleEndian => cursor.read_u32::<LittleEndian>().map_err(to_io_error),
    }
}

fn read_u64(cursor: &mut Cursor<&[u8]>, byte_order: ByteOrder) -> Result<u64, AppError> {
    match byte_order {
        ByteOrder::BigEndian => cursor.read_u64::<BigEndian>().map_err(to_io_error),
        ByteOrder::LittleEndian => cursor.read_u64::<LittleEndian>().map_err(to_io_error),
    }
}

fn read_f64(cursor: &mut Cursor<&[u8]>, byte_order: ByteOrder) -> Result<f64, AppError> {
    match byte_order {
        ByteOrder::BigEndian => cursor.read_f64::<BigEndian>().map_err(to_io_error),
        ByteOrder::LittleEndian => cursor.read_f64::<LittleEndian>().map_err(to_io_error),
    }
}

fn to_io_error(err: std::io::Error) -> AppError {
    AppError::SegyError {
        message: format!("Header parse failed: {}", err),
    }
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
