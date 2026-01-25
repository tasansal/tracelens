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
    /// Inclusive 1-based starting byte offset from the SEG-Y file start.
    pub byte_start: u16,
    /// Inclusive 1-based ending byte offset from the SEG-Y file start.
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
#[derive(Debug, Clone, Deserialize)]
pub struct BinaryHeaderSpec {
    /// Total size of the header in bytes.
    pub size: usize,
    /// Byte offset where the header begins in the file.
    pub byte_offset: usize,
    /// Field definitions for the binary header.
    pub fields: Vec<HeaderFieldSpec>,
}

/// Trace header specification block loaded from the JSON spec.
#[derive(Debug, Clone, Deserialize)]
pub struct TraceHeaderSpec {
    /// Total size of the header in bytes.
    pub size: usize,
    /// Field definitions for the trace header.
    pub fields: Vec<HeaderFieldSpec>,
}

/// Complete SEG-Y format specification.
#[derive(Debug, Clone, Deserialize)]
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

#[derive(Debug, Deserialize)]
struct BinaryHeaderPatch {
    size: Option<usize>,
    byte_offset: Option<usize>,
    fields: Option<Vec<HeaderFieldSpec>>,
    overrides: Option<Vec<HeaderFieldSpec>>,
}

#[derive(Debug, Deserialize)]
struct TraceHeaderPatch {
    size: Option<usize>,
    fields: Option<Vec<HeaderFieldSpec>>,
    overrides: Option<Vec<HeaderFieldSpec>>,
}

#[derive(Debug, Deserialize)]
struct SegySpecDefinition {
    version: String,
    reference: String,
    #[serde(default)]
    extends: Option<String>,
    binary_header: Option<BinaryHeaderPatch>,
    trace_header: Option<TraceHeaderPatch>,
}

impl SegyFormatSpec {
    /// Load SEG-Y Rev 0 specification from embedded JSON.
    pub fn load_rev0() -> Result<Self, String> {
        Self::load_spec_definition("segy_rev0_spec.json")
    }

    /// Load SEG-Y Rev 1 specification from embedded JSON.
    pub fn load_rev1() -> Result<Self, String> {
        Self::load_spec_definition("segy_rev1_spec.json")
    }

    /// Load SEG-Y Rev 2 specification from embedded JSON.
    pub fn load_rev2() -> Result<Self, String> {
        Self::load_spec_definition("segy_rev2_spec.json")
    }

    /// Load SEG-Y Rev 2.1 specification from embedded JSON.
    pub fn load_rev21() -> Result<Self, String> {
        Self::load_spec_definition("segy_rev21_spec.json")
    }

    fn load_spec_definition(spec_name: &str) -> Result<Self, String> {
        let spec_json = match spec_name {
            "segy_rev0_spec.json" => include_str!("../../segy_rev0_spec.json"),
            "segy_rev1_spec.json" => include_str!("../../segy_rev1_spec.json"),
            "segy_rev2_spec.json" => include_str!("../../segy_rev2_spec.json"),
            "segy_rev21_spec.json" => include_str!("../../segy_rev21_spec.json"),
            _ => return Err(format!("Unknown SEG-Y spec: {}", spec_name)),
        };

        let definition: SegySpecDefinition = serde_json::from_str(spec_json)
            .map_err(|e| format!("Failed to parse SEG-Y spec: {}", e))?;
        Self::materialize_definition(definition)
    }

    fn materialize_definition(mut definition: SegySpecDefinition) -> Result<Self, String> {
        let mut spec = if let Some(extends) = definition.extends.as_deref() {
            Self::load_spec_definition(extends)?
        } else {
            let binary_patch = definition
                .binary_header
                .take()
                .ok_or_else(|| "Base SEG-Y spec missing binary header".to_string())?;
            let trace_patch = definition
                .trace_header
                .take()
                .ok_or_else(|| "Base SEG-Y spec missing trace header".to_string())?;

            let binary_header = BinaryHeaderSpec {
                size: binary_patch
                    .size
                    .ok_or_else(|| "Base SEG-Y spec missing binary header size".to_string())?,
                byte_offset: binary_patch
                    .byte_offset
                    .ok_or_else(|| "Base SEG-Y spec missing binary header byte offset".to_string())?,
                fields: binary_patch.fields.ok_or_else(|| {
                    "Base SEG-Y spec missing binary header fields".to_string()
                })?,
            };
            let trace_header = TraceHeaderSpec {
                size: trace_patch
                    .size
                    .ok_or_else(|| "Base SEG-Y spec missing trace header size".to_string())?,
                fields: trace_patch.fields.ok_or_else(|| {
                    "Base SEG-Y spec missing trace header fields".to_string()
                })?,
            };

            SegyFormatSpec {
                version: definition.version.clone(),
                reference: definition.reference.clone(),
                binary_header,
                trace_header,
            }
        };

        spec.version = definition.version;
        spec.reference = definition.reference;

        if definition.extends.is_some() {
            if let Some(binary_patch) = definition.binary_header.take() {
                apply_binary_patch(&mut spec.binary_header, binary_patch);
            }

            if let Some(trace_patch) = definition.trace_header.take() {
                apply_trace_patch(&mut spec.trace_header, trace_patch);
            }
        }

        Ok(spec)
    }

    /// Load a SEG-Y specification based on the revision code in the binary header.
    pub fn load_for_revision(raw_revision: u16) -> Result<Self, String> {
        let major = (raw_revision >> 8) as u8;

        match major {
            0 => match raw_revision {
                1 => Self::load_rev1(),
                2 => Self::load_rev2(),
                _ => Self::load_rev0(),
            },
            1 => Self::load_rev1(),
            2 => match raw_revision {
                0x0201 => Self::load_rev21(),
                _ => Self::load_rev2(),
            },
            _ => Self::load_rev0(),
        }
    }

    /// Get binary header field specifications.
    pub fn get_binary_header_fields(&self) -> Vec<HeaderFieldSpec> {
        self.binary_header.fields.clone()
    }

    /// Get trace header field specifications.
    pub fn get_trace_header_fields(&self) -> Vec<HeaderFieldSpec> {
        self.trace_header.fields.clone()
    }
}

fn apply_binary_patch(target: &mut BinaryHeaderSpec, patch: BinaryHeaderPatch) {
    if let Some(size) = patch.size {
        target.size = size;
    }
    if let Some(byte_offset) = patch.byte_offset {
        target.byte_offset = byte_offset;
    }
    if let Some(fields) = patch.fields {
        target.fields.extend(fields);
    }
    if let Some(overrides) = patch.overrides {
        for field in overrides {
            match target
                .fields
                .iter_mut()
                .find(|existing| existing.field_key == field.field_key)
            {
                Some(existing) => *existing = field,
                None => target.fields.push(field),
            }
        }
    }
}

fn apply_trace_patch(target: &mut TraceHeaderSpec, patch: TraceHeaderPatch) {
    if let Some(size) = patch.size {
        target.size = size;
    }
    if let Some(fields) = patch.fields {
        target.fields.extend(fields);
    }
    if let Some(overrides) = patch.overrides {
        for field in overrides {
            match target
                .fields
                .iter_mut()
                .find(|existing| existing.field_key == field.field_key)
            {
                Some(existing) => *existing = field,
                None => target.fields.push(field),
            }
        }
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

    #[test]
    fn test_load_revision_spec() {
        let rev1 = SegyFormatSpec::load_for_revision(0x0100).unwrap();
        assert_eq!(rev1.version, "SEG-Y Rev 1.0 (2002)");

        let rev2 = SegyFormatSpec::load_for_revision(0x0201).unwrap();
        assert_eq!(rev2.version, "SEG-Y Rev 2.1 (2023)");
    }

    #[test]
    fn test_rev21_overrides() {
        let spec = SegyFormatSpec::load_rev21().unwrap();
        let max_ext = spec
            .binary_header
            .fields
            .iter()
            .find(|field| field.field_key == "max_extended_trace_headers")
            .unwrap();
        assert_eq!(max_ext.byte_start, 3507);
        assert_eq!(max_ext.byte_end, 3508);
        assert_eq!(max_ext.data_type, "int16");

        let survey = spec
            .binary_header
            .fields
            .iter()
            .find(|field| field.field_key == "survey_type")
            .unwrap();
        assert_eq!(survey.byte_start, 3509);
    }
}
