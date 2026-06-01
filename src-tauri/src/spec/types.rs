//! SEG-Y header specification parser.
//!
//! Loads canonical header definitions from a JSON spec file and exposes them
//! for the frontend to render field metadata. Keeping this in data makes it
//! easy to update or extend to Rev 1 or custom formats without code changes.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Header field specification metadata used by the UI and validators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderFieldSpec {
    /// Human-friendly label for display.
    pub name: String,
    /// Stable key used in serialized payloads and UI lookups.
    pub field_key: String,
    /// Inclusive 1-based starting byte within the header block (1–400 for binary, 1–240 for trace).
    pub byte_start: u16,
    /// Inclusive 1-based ending byte within the header block (1–400 for binary, 1–240 for trace).
    pub byte_end: u16,
    /// String representation of the expected data type (ex: int16, int32).
    pub data_type: String,
    /// Specification description of the field.
    pub description: String,
    /// Whether the field is required by the spec (defaults to false).
    #[serde(default)]
    pub required: bool,
    /// Optional mapping of coded values to human-friendly labels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_mapping: Option<HashMap<String, String>>,
}

/// Binary header specification block loaded from the JSON spec.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryHeaderSpec {
    /// Total size of the header in bytes (400).
    pub size: usize,
    /// Field definitions for the binary header. All byte positions are 1-based local offsets (1–400).
    pub fields: Vec<HeaderFieldSpec>,
}

/// Trace header specification block loaded from the JSON spec.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceHeaderSpec {
    /// Total size of the header in bytes.
    pub size: usize,
    /// Field definitions for the trace header.
    pub fields: Vec<HeaderFieldSpec>,
}

/// Complete SEG-Y format specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegyFormatSpec {
    /// Version string provided by the spec file.
    pub version: String,
    /// Reference or citation for the spec source.
    pub reference: String,
    /// Binary header metadata.
    pub binary_header: BinaryHeaderSpec,
    /// Trace header metadata.
    pub trace_header: TraceHeaderSpec,
}

/// Discriminates between binary and trace header sections.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HeaderType {
    Binary,
    Trace,
}

#[cfg(test)]
mod tests {
    use crate::spec::registry::SpecRegistry;

    #[test]
    fn test_load_spec() {
        let spec = SpecRegistry::global().default_spec();
        assert_eq!(spec.version, "SEG-Y Rev 0 (1975)");
        assert!(!spec.binary_header.fields.is_empty());
        assert!(!spec.trace_header.fields.is_empty());
    }

    #[test]
    fn test_binary_header_fields() {
        let spec = SpecRegistry::global().default_spec();
        let job_id = spec
            .binary_header
            .fields
            .iter()
            .find(|f| f.field_key == "job_id")
            .unwrap();
        assert_eq!(job_id.byte_start, 1);
        assert_eq!(job_id.byte_end, 4);
        assert_eq!(job_id.data_type, "int32");
    }

    #[test]
    fn test_code_mappings() {
        let spec = SpecRegistry::global().default_spec();
        let format_field = spec
            .binary_header
            .fields
            .iter()
            .find(|f| f.field_key == "data_sample_format")
            .unwrap();

        let codes = format_field
            .code_mapping
            .as_ref()
            .expect("data_sample_format should have code mapping");
        assert_eq!(codes.get("1"), Some(&"IBM Float32".to_string()));
    }
}
