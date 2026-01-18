//! SEG-Y Header Specification Parser
//!
//! Loads and parses canonical header definitions from JSON spec file.
//! This eliminates duplication and enables easy extension for Rev1 or custom formats.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Header field specification metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderFieldSpec {
    pub name: String,
    pub field_key: String,
    pub byte_start: u16,
    pub byte_end: u16,
    pub data_type: String,
    pub description: String,
    #[serde(default)]
    pub required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_mapping: Option<HashMap<String, String>>,
}

/// Binary header specification
#[derive(Debug, Clone, Deserialize)]
pub struct BinaryHeaderSpec {
    pub size: usize,
    pub byte_offset: usize,
    pub fields: Vec<HeaderFieldSpec>,
}

/// Trace header specification
#[derive(Debug, Clone, Deserialize)]
pub struct TraceHeaderSpec {
    pub size: usize,
    pub fields: Vec<HeaderFieldSpec>,
}

/// Complete SEG-Y format specification
#[derive(Debug, Clone, Deserialize)]
pub struct SegyFormatSpec {
    pub version: String,
    pub reference: String,
    pub binary_header: BinaryHeaderSpec,
    pub trace_header: TraceHeaderSpec,
}

impl SegyFormatSpec {
    /// Load SEG-Y Rev 0 specification from embedded JSON
    pub fn load_rev0() -> Result<Self, String> {
        const SPEC_JSON: &str = include_str!("../../segy_rev0_spec.json");
        serde_json::from_str(SPEC_JSON).map_err(|e| format!("Failed to parse SEG-Y spec: {}", e))
    }

    /// Get binary header field specifications
    pub fn get_binary_header_fields(&self) -> Vec<HeaderFieldSpec> {
        self.binary_header.fields.clone()
    }

    /// Get trace header field specifications
    pub fn get_trace_header_fields(&self) -> Vec<HeaderFieldSpec> {
        self.trace_header.fields.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_spec() {
        let spec = SegyFormatSpec::load_rev0().expect("Failed to load spec");
        assert_eq!(spec.version, "SEG-Y Rev 0 (1975)");
        assert!(!spec.binary_header.fields.is_empty());
        assert!(!spec.trace_header.fields.is_empty());
    }

    #[test]
    fn test_binary_header_fields() {
        let spec = SegyFormatSpec::load_rev0().unwrap();
        let fields = spec.get_binary_header_fields();

        // Check job_id field exists
        let job_id = fields.iter().find(|f| f.field_key == "job_id").unwrap();
        assert_eq!(job_id.byte_start, 3201);
        assert_eq!(job_id.byte_end, 3204);
        assert_eq!(job_id.data_type, "int32");
    }

    #[test]
    fn test_code_mappings() {
        let spec = SegyFormatSpec::load_rev0().unwrap();
        let fields = spec.get_binary_header_fields();

        // Check data_sample_format has code mappings
        let format_field = fields
            .iter()
            .find(|f| f.field_key == "data_sample_format")
            .unwrap();

        assert!(format_field.code_mapping.is_some());
        let codes = format_field.code_mapping.as_ref().unwrap();
        assert_eq!(codes.get("1"), Some(&"IBM Float32".to_string()));
    }
}
