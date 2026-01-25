//! SEG-Y format data structures and parsing.
//!
//! This module implements the SEG-Y format with support for:
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

pub mod binary_header;
mod constants;
pub mod header_spec;
mod io;
mod model;
mod reader;
pub mod rendering;
pub mod textual_header;
pub mod trace;
pub mod trace_data;
pub mod utils;

/// Binary header definition and byte-order detection.
pub use binary_header::{BinaryHeader, ByteOrder};
/// Size constants for SEG-Y structures.
pub use constants::*;
/// Header specification structures loaded from the JSON spec.
pub use header_spec::{HeaderFieldSpec, SegyFormatSpec};
/// High-level data models and derived file configuration.
pub use model::{SegyData, SegyFileConfig};
/// SEG-Y reader and cacheable state for Tauri commands.
pub use reader::{SegyReader, SegyReaderState};
/// Parsed textual header and encoding helpers.
pub use textual_header::TextualHeader;
/// Parsed trace header and combined trace blocks.
pub use trace::{TraceBlock, TraceHeader};
/// Trace data formats and runtime sample representation.
pub use trace_data::{SampleFormat, TraceData};
/// Detected textual header encoding.
pub use utils::TextEncoding;
