//! Schema validation for SEG-Y format specifications.
//!
//! Validates structural integrity of [`SegyFormatSpec`] definitions loaded
//! from JSON, catching overlapping byte ranges, invalid data types, reversed
//! ranges, and duplicate field keys. Called at [`SpecRegistry`](super::SpecRegistry)
//! construction to prevent silent corruption from bad JSON specs.

use std::fmt;

use super::header_spec::SegyFormatSpec;

/// Accepted data type strings in header field specifications.
const VALID_DATA_TYPES: &[&str] = &[
    "int8",
    "int16",
    "int32",
    "uint16",
    "uint32",
    "float32",
    "float64",
    "ebcdic(3200)",
];

/// A single structural validation error found in a spec file.
#[derive(Debug, Clone)]
pub struct SchemaValidationError {
    /// Name of the offending field (if identifiable).
    pub field_name: String,
    /// Byte range as "start-end" (e.g. "3201-3204").
    pub byte_range: String,
    /// Human-readable description of the problem.
    pub issue: String,
}

impl fmt::Display for SchemaValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Schema validation error: {} ({} [{}])",
            self.issue, self.field_name, self.byte_range
        )
    }
}

/// Validate a [`SegyFormatSpec`] for structural correctness.
///
/// Collects **all** errors across binary and trace headers rather than
/// short-circuiting on the first problem. Returns `Ok(())` if the spec
/// is clean, or `Err(Vec<SchemaValidationError>)` with every issue found.
pub fn validate(spec: &SegyFormatSpec) -> Result<(), Vec<SchemaValidationError>> {
    let mut errors = Vec::new();

    // Binary header validation.
    validate_header_fields(
        &spec.binary_header.fields,
        "binary",
        spec.binary_header.byte_offset as u16,
        (spec.binary_header.byte_offset + spec.binary_header.size) as u16,
        &mut errors,
    );

    // Trace header validation — 1-based offsets, max = size.
    validate_header_fields(
        &spec.trace_header.fields,
        "trace",
        1,
        spec.trace_header.size as u16,
        &mut errors,
    );

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

/// Shared validation logic for a list of header fields.
fn validate_header_fields(
    fields: &[super::header_spec::HeaderFieldSpec],
    header_label: &str,
    min_byte: u16,
    max_byte: u16,
    errors: &mut Vec<SchemaValidationError>,
) {
    for field in fields {
        let range_str = format!("{}-{}", field.byte_start, field.byte_end);

        // Reversed range.
        if field.byte_end < field.byte_start {
            errors.push(SchemaValidationError {
                field_name: field.field_key.clone(),
                byte_range: range_str.clone(),
                issue: format!(
                    "byte_end ({}) < byte_start ({}) in {} header",
                    field.byte_end, field.byte_start, header_label
                ),
            });
            continue; // Skip further checks for this field.
        }

        // Out-of-bounds: start before header region.
        if field.byte_start < min_byte {
            errors.push(SchemaValidationError {
                field_name: field.field_key.clone(),
                byte_range: range_str.clone(),
                issue: format!(
                    "byte_start ({}) < minimum ({}) in {} header",
                    field.byte_start, min_byte, header_label
                ),
            });
        }

        // Out-of-bounds: end past header region.
        if field.byte_end > max_byte {
            errors.push(SchemaValidationError {
                field_name: field.field_key.clone(),
                byte_range: range_str.clone(),
                issue: format!(
                    "byte_end ({}) > maximum ({}) in {} header",
                    field.byte_end, max_byte, header_label
                ),
            });
        }

        // Invalid data type.
        if !VALID_DATA_TYPES.contains(&field.data_type.as_str()) {
            errors.push(SchemaValidationError {
                field_name: field.field_key.clone(),
                byte_range: range_str.clone(),
                issue: format!(
                    "unknown data_type '{}' in {} header",
                    field.data_type, header_label
                ),
            });
        }
    }

    // Sort by byte_start for overlap and ordering checks.
    let mut sorted: Vec<_> = fields.iter().collect();
    sorted.sort_by_key(|f| f.byte_start);

    let mut seen_keys: std::collections::HashSet<&str> = std::collections::HashSet::new();

    for (i, field) in sorted.iter().enumerate() {
        let range_str = format!("{}-{}", field.byte_start, field.byte_end);

        // Ascending order check — compare with previous field.
        if i > 0 {
            let prev = sorted[i - 1];
            if field.byte_start == prev.byte_start {
                errors.push(SchemaValidationError {
                    field_name: field.field_key.clone(),
                    byte_range: range_str.clone(),
                    issue: format!(
                        "same byte_start ({}) as field '{}' — not in ascending order",
                        field.byte_start, prev.field_key
                    ),
                });
            }
        }

        // Overlap check — against all later fields.
        for later in &sorted[(i + 1)..] {
            if later.byte_start <= field.byte_end && later.byte_start > field.byte_start {
                errors.push(SchemaValidationError {
                    field_name: field.field_key.clone(),
                    byte_range: range_str.clone(),
                    issue: format!(
                        "overlaps with field '{}' at {}-{} in {} header",
                        later.field_key, later.byte_start, later.byte_end, header_label
                    ),
                });
            }
        }

        // Duplicate field_key within the same header.
        if !seen_keys.insert(field.field_key.as_str()) {
            errors.push(SchemaValidationError {
                field_name: field.field_key.clone(),
                byte_range: range_str,
                issue: format!(
                    "duplicate field_key '{}' in {} header",
                    field.field_key, header_label
                ),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::segy::header_spec::*;

    /// Helper: build a minimal valid spec from Rev 0 JSON.
    fn valid_spec() -> SegyFormatSpec {
        SegyFormatSpec::load_rev0().expect("Rev 0 spec should load")
    }

    #[test]
    fn test_valid_spec_passes() {
        let spec = valid_spec();
        assert!(validate(&spec).is_ok());
    }

    #[test]
    fn test_overlapping_bytes_detected() {
        let mut spec = valid_spec();
        // Force an overlap: set job_id end to overlap with line_number start.
        spec.binary_header.fields[0].byte_end = 3208; // overlaps line_number at 3205-3208

        let errors = validate(&spec).unwrap_err();
        assert!(
            errors.iter().any(|e| e.issue.contains("overlaps")),
            "Expected overlap error, got: {:?}",
            errors
        );
    }

    #[test]
    fn test_invalid_type_detected() {
        let mut spec = valid_spec();
        spec.binary_header.fields[0].data_type = "foobar".to_string();

        let errors = validate(&spec).unwrap_err();
        assert!(
            errors.iter().any(|e| e.issue.contains("unknown data_type")),
            "Expected unknown data_type error, got: {:?}",
            errors
        );
    }

    #[test]
    fn test_reversed_range_detected() {
        let mut spec = valid_spec();
        spec.binary_header.fields[0].byte_start = 3210;
        spec.binary_header.fields[0].byte_end = 3204; // reversed

        let errors = validate(&spec).unwrap_err();
        assert!(
            errors.iter().any(|e| e.issue.contains("byte_end")),
            "Expected reversed range error, got: {:?}",
            errors
        );
    }

    #[test]
    fn test_duplicate_key_detected() {
        let mut spec = valid_spec();
        // Duplicate the first field with same field_key but different byte range.
        let mut dup = spec.binary_header.fields[0].clone();
        dup.byte_start = 3297;
        dup.byte_end = 3300;
        spec.binary_header.fields.push(dup);

        let errors = validate(&spec).unwrap_err();
        assert!(
            errors
                .iter()
                .any(|e| e.issue.contains("duplicate field_key")),
            "Expected duplicate key error, got: {:?}",
            errors
        );
    }
}
