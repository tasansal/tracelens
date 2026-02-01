//! SEG-Y format data structures and parsing.
//!
//! This module implements the SEG-Y Rev 0 specification with support for:
//! - Textual header (3200 bytes, EBCDIC or ASCII)
//! - Binary header (400 bytes)
//! - Trace header (240 bytes)
//! - Trace data in multiple sample formats
//!
//! The high-level flow is:
//! 1. Read textual and binary headers to determine file configuration.
//! 2. Memory-map the file for fast random access.
//! 3. Parse trace headers and data on demand.
//! 4. Render traces into variable-density or wiggle views.

mod constants;
pub mod header_spec;
mod io;
mod model;
mod reader;
pub mod rendering;
pub mod parser;
pub mod utils;

/// Binary header definition and byte-order detection.
pub use parser::{BinaryHeader, ByteOrder, TextualHeader, TraceBlock, TraceHeader, TraceIdentificationCode, CoordinateUnits, SampleFormat, TraceData, DataSampleFormat, TraceSortingCode, MeasurementSystem};
/// Size constants for SEG-Y structures.
pub use constants::*;

/// Header specification structures loaded from the JSON spec.
pub use header_spec::{HeaderFieldSpec, SegyFormatSpec};
/// High-level data models and derived file configuration.
pub use model::{SegyData, SegyFileConfig};
/// SEG-Y reader and cacheable state for Tauri commands.
pub use reader::{SegyReader, SegyReaderState};
/// Detected textual header encoding.
pub use utils::TextEncoding;
