//! SEG-Y format constants derived from header types.
//!
//! Using the header types as the source of truth keeps sizes consistent with
//! the parsers and reduces the risk of drift from the spec.

use super::{BinaryHeader, TextualHeader, TraceHeader};

/// Size of textual header in bytes (EBCDIC)
pub const TEXTUAL_HEADER_SIZE: usize = TextualHeader::SIZE;

/// Size of binary header in bytes
pub const BINARY_HEADER_SIZE: usize = BinaryHeader::SIZE;

/// Combined size of file headers (textual + binary)
pub const FILE_HEADER_SIZE: usize = TEXTUAL_HEADER_SIZE + BINARY_HEADER_SIZE;

/// Size of trace header in bytes
pub const TRACE_HEADER_SIZE: usize = TraceHeader::SIZE;
