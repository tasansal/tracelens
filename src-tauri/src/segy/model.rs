//! High-level SEG-Y data models and derived configuration.
//!
//! These types are serialized to the frontend and used to compute trace offsets
//! and sizes during on-demand loading.

use crate::error::AppError;
use crate::segy::parser::binary_header::DataSampleFormat;
use crate::segy::{constants, BinaryHeader, ByteOrder, TextEncoding, TextualHeader};

/// SEG-Y file data structure containing headers only (no traces loaded eagerly)
///
/// This structure is optimized for fast loading - traces are loaded on demand
/// using the load_single_trace command.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SegyData {
    /// Textual file header (3200 bytes EBCDIC converted to ASCII)
    pub textual_header: TextualHeader,

    /// Binary file header (400 bytes with metadata)
    pub binary_header: BinaryHeader,

    /// Total number of traces in file (if determinable)
    pub total_traces: Option<usize>,

    /// File size in bytes
    pub file_size: u64,

    /// Detected text encoding for textual header
    pub text_encoding: TextEncoding,

    /// Detected byte order for binary data
    pub byte_order: ByteOrder,
}

/// Configuration for SEG-Y file parameters used across trace loading operations
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegyFileConfig {
    /// Samples per trace as reported by the binary header.
    pub samples_per_trace: u16,
    /// Raw sample format code from the binary header.
    pub data_sample_format: u16,
    /// Detected byte order for the file.
    pub byte_order: ByteOrder,
}

impl SegyFileConfig {
    /// Build a configuration object from a parsed binary header.
    pub fn from_binary_header(header: &BinaryHeader) -> Result<Self, AppError> {
        let samples_per_trace =
            u16::try_from(header.samples_per_trace).map_err(|_| AppError::ValidationError {
                message: format!("Invalid samples per trace: {}", header.samples_per_trace),
            })?;

        Ok(Self {
            samples_per_trace,
            data_sample_format: header.data_sample_format as i16 as u16,
            byte_order: header.byte_order,
        })
    }

    /// Convert samples per trace into a signed integer for trace parsing APIs.
    pub fn samples_per_trace_i16(&self) -> Result<i16, AppError> {
        i16::try_from(self.samples_per_trace).map_err(|_| AppError::ValidationError {
            message: format!(
                "Samples per trace exceeds supported range: {}",
                self.samples_per_trace
            ),
        })
    }

    /// Calculate the total size of a trace block (header + data)
    pub fn trace_block_size(&self) -> Result<usize, AppError> {
        if self.samples_per_trace == 0 {
            return Err(AppError::ValidationError {
                message: "Samples per trace must be greater than 0".to_string(),
            });
        }

        let format = DataSampleFormat::from_code(self.data_sample_format as i16).map_err(|e| {
            AppError::ValidationError {
                message: format!("Invalid data sample format: {}", e),
            }
        })?;

        let sample_size = format.bytes_per_sample();
        let trace_data_size = usize::from(self.samples_per_trace)
            .checked_mul(sample_size)
            .ok_or_else(|| AppError::ValidationError {
                message: "Trace data size overflow".to_string(),
            })?;

        constants::TRACE_HEADER_SIZE
            .checked_add(trace_data_size)
            .ok_or_else(|| AppError::ValidationError {
                message: "Trace block size overflow".to_string(),
            })
    }

    /// Calculate the file position of a specific trace
    pub fn calculate_trace_position(&self, trace_index: usize) -> Result<usize, AppError> {
        let block_size = self.trace_block_size()?;
        let offset =
            trace_index
                .checked_mul(block_size)
                .ok_or_else(|| AppError::ValidationError {
                    message: "Trace offset overflow".to_string(),
                })?;

        constants::FILE_HEADER_SIZE
            .checked_add(offset)
            .ok_or_else(|| AppError::ValidationError {
                message: "Trace position overflow".to_string(),
            })
    }

    /// Get the parsed DataSampleFormat
    pub fn data_sample_format_parsed(&self) -> Result<DataSampleFormat, AppError> {
        DataSampleFormat::from_code(self.data_sample_format as i16).map_err(|e| {
            AppError::ValidationError {
                message: format!("Invalid data sample format: {}", e),
            }
        })
    }
}
