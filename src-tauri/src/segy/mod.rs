//! SEG-Y format data structures and parsing
//!
//! This module implements the SEG-Y Rev 0 specification with support for:
//! - Textual Header (3200 bytes EBCDIC)
//! - Binary Header (400 bytes)
//! - Trace Header (240 bytes)
//! - Trace Data (multiple formats)

pub mod binary_header;
pub mod header_spec;
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
