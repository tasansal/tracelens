//! SEG-Y parsing modules for headers and trace data.
//!
//! This module provides low-level parsers for all SEG-Y data structures:
//! - Textual header (EBCDIC/ASCII card images)
//! - Binary header (file-level metadata)
//! - Trace headers (per-trace metadata)
//! - Trace data (sample parsing for all SEG-Y formats)
//!
//! All parsers handle byte-order detection and support both big-endian
//! (standard) and little-endian (non-standard) files.

#[macro_use]
pub mod byte_order_macros;
pub mod binary_header;
pub mod textual_header;
pub mod trace;
pub mod trace_data;

pub use binary_header::{
    BinaryHeader, ByteOrder, DataSampleFormat, MeasurementSystem, TraceSortingCode,
};
pub use textual_header::TextualHeader;
pub use trace::{CoordinateUnits, TraceBlock, TraceHeader, TraceIdentificationCode};
pub use trace_data::{SampleFormat, TraceData};
