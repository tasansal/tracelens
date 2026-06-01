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
//! 4. Serve raw samples to the GPU renderer in the frontend.

pub mod agc;
mod chunk_cache;
mod constants;
mod io;
mod model;
pub mod parser;
mod reader;
pub mod revision;
mod utils;

/// Forwarding module — storage has moved to crate::io.
pub mod storage {
    pub use crate::io::local::LocalStorage;
    pub use crate::io::remote::RemoteStorage;
    pub use crate::io::storage::*;
}

/// Forwarding module — header spec types have moved to crate::spec::types.
pub mod header_spec {
    pub use crate::spec::types::*;
}

/// Forwarding module — header dynamic extraction has moved to crate::spec::runtime.
pub mod header_dynamic {
    pub use crate::spec::runtime::*;
}

/// Forwarding module — spec registry has moved to crate::spec::registry.
pub mod spec_registry {
    pub use crate::spec::registry::*;
}

/// Forwarding module — schema validator has moved to crate::spec::validator.
pub mod schema_validator {
    pub use crate::spec::validator::*;
}

#[cfg(test)]
pub mod fixtures;

/// Size constants for SEG-Y structures.
pub use constants::*;
/// Binary header definition and byte-order detection.
pub use parser::{
    BinaryHeader, ByteOrder, DataSampleFormat, TextualHeader, TraceBlock, TraceData, TraceHeader,
};

/// Dynamic header field extraction types.
pub use header_dynamic::{
    FieldData, HeaderError, HeaderField, HeaderSpec, RuntimeHeaderView, ScalarType,
};
/// Header specification structures loaded from the JSON spec.
pub use header_spec::{HeaderFieldSpec, HeaderType, SegyFormatSpec};
/// High-level data models and derived file configuration.
pub use model::{SegyData, SegyFileConfig};
/// SEG-Y reader and cacheable state for Tauri commands.
pub use reader::{SegyReader, SegyReaderState};
/// SEG-Y revision identifiers.
pub use revision::SegyRevision;
/// Schema validation errors for spec integrity checks.
pub use schema_validator::{SchemaValidationError, validate};
/// Schema registry mapping revisions to format specifications.
pub use spec_registry::SpecRegistry;
/// Storage abstraction for local and remote SEG-Y files.
pub use storage::SegyStorage;
/// Detected textual header encoding.
pub use utils::TextEncoding;
