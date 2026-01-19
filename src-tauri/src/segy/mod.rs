//! SEG-Y format data structures and parsing
//!
//! This module implements the SEG-Y Rev 0 specification with support for:
//! - Textual Header (3200 bytes EBCDIC)
//! - Binary Header (400 bytes)
//! - Trace Header (240 bytes)
//! - Trace Data (multiple formats)

pub mod binary_header;
pub mod header_spec;
pub mod rendering;
pub mod textual_header;
pub mod trace;
pub mod trace_data;
pub mod utils;

pub use binary_header::{BinaryHeader, ByteOrder};
pub use header_spec::{HeaderFieldSpec, SegyFormatSpec};
pub use textual_header::TextualHeader;
pub use trace::{TraceBlock, TraceHeader};
pub use trace_data::{SampleFormat, TraceData};
pub use utils::TextEncoding;

/// SEG-Y format constants
pub mod constants {
    /// Size of textual header in bytes (EBCDIC)
    pub const TEXTUAL_HEADER_SIZE: usize = 3200;

    /// Size of binary header in bytes
    pub const BINARY_HEADER_SIZE: usize = 400;

    /// Combined size of file headers (textual + binary)
    pub const FILE_HEADER_SIZE: usize = TEXTUAL_HEADER_SIZE + BINARY_HEADER_SIZE;

    /// Size of trace header in bytes
    pub const TRACE_HEADER_SIZE: usize = 240;
}

/// Configuration for SEG-Y file parameters used across trace loading operations
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegyFileConfig {
    pub samples_per_trace: u16,
    pub data_sample_format: u16,
    pub byte_order: ByteOrder,
}

impl SegyFileConfig {
    /// Calculate the total size of a trace block (header + data)
    pub fn trace_block_size(&self) -> Result<usize, String> {
        use crate::segy::binary_header::DataSampleFormat;

        let format = DataSampleFormat::from_code(self.data_sample_format as i16)
            .map_err(|e| format!("Invalid data sample format: {}", e))?;

        let sample_size = format.bytes_per_sample();
        let trace_data_size = self.samples_per_trace as usize * sample_size;

        Ok(constants::TRACE_HEADER_SIZE + trace_data_size)
    }

    /// Calculate the file position of a specific trace
    pub fn calculate_trace_position(&self, trace_index: usize) -> Result<usize, String> {
        let block_size = self.trace_block_size()?;
        Ok(constants::FILE_HEADER_SIZE + (trace_index * block_size))
    }

    /// Get the parsed DataSampleFormat
    pub fn data_sample_format_parsed(&self) -> Result<binary_header::DataSampleFormat, String> {
        use crate::segy::binary_header::DataSampleFormat;
        DataSampleFormat::from_code(self.data_sample_format as i16)
            .map_err(|e| format!("Invalid data sample format: {}", e))
    }
}
