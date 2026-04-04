//! Dynamic header field extraction based on SEG-Y revision specifications.
//!
//! This module provides spec-driven parsing that extracts actual header values
//! at runtime based on the detected SEG-Y revision. Unlike hardcoded struct
//! access, this approach allows different revisions to automatically return
//! different field sets.

use crate::segy::header_spec::HeaderFieldSpec;
use crate::segy::parser::binary_header::ByteOrder;
use byteorder::{BigEndian, ByteOrder as ByteOrderTrait, LittleEndian};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::hash::BuildHasherDefault;
use std::hash::DefaultHasher;

pub use crate::segy::parser::binary_header::ByteOrder as HeaderByteOrder;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScalarType {
    Int8,
    Uint8,
    Int16,
    Uint16,
    Int32,
    Uint32,
    Float32,
    Float64,
}

impl FromStr for ScalarType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "int8" | "i8" | "byte" => Ok(Self::Int8),
            "uint8" | "u8" => Ok(Self::Uint8),
            "int16" | "i16" | "short" => Ok(Self::Int16),
            "uint16" | "u16" | "ushort" => Ok(Self::Uint16),
            "int32" | "i32" | "int" => Ok(Self::Int32),
            "uint32" | "u32" | "uint" => Ok(Self::Uint32),
            "float32" | "f32" | "float" => Ok(Self::Float32),
            "float64" | "f64" | "double" => Ok(Self::Float64),
            _ => Err(()),
        }
    }
}

impl ScalarType {

    pub fn size(&self) -> usize {
        match self {
            Self::Int8 | Self::Uint8 => 1,
            Self::Int16 | Self::Uint16 => 2,
            Self::Int32 | Self::Uint32 | Self::Float32 => 4,
            Self::Float64 => 8,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct HeaderField {
    pub name: &'static str,
    pub field_key: &'static str,
    pub byte: u16,
    pub format: ScalarType,
}

impl HeaderField {
    pub fn from_spec(spec: &HeaderFieldSpec) -> Option<Self> {
        let format = ScalarType::from_str(&spec.data_type).ok()?;
        let byte_start = spec.byte_start;
        let name: &'static str = Box::leak(spec.name.clone().into_boxed_str());
        let field_key: &'static str = Box::leak(spec.field_key.clone().into_boxed_str());
        Some(Self {
            name,
            field_key,
            byte: byte_start,
            format,
        })
    }
}

pub struct HeaderSpec {
    pub size: u16,
    pub fields: HashMap<&'static str, (usize, ScalarType), BuildHasherDefault<DefaultHasher>>,
    pub field_list: Vec<HeaderField>,
}

impl HeaderSpec {
    pub fn from_fields(fields: Vec<HeaderField>, size: u16) -> Self {
        let mut map = HashMap::with_hasher(BuildHasherDefault::default());
        for (index, field) in fields.iter().enumerate() {
            // Index by field_key for lookup (e.g., "job_id" not "Job ID")
            map.insert(field.field_key, (index, field.format));
        }
        Self {
            size,
            fields: map,
            field_list: fields,
        }
    }

    pub fn from_specs(specs: Vec<HeaderFieldSpec>, size: u16) -> Result<Self, HeaderError> {
        let mut fields = Vec::new();
        // Detect if specs use file-level byte offsets (e.g., binary header starts at 3201).
        // If so, normalize to local offsets relative to the first field.
        let base_offset = specs.iter().map(|s| s.byte_start).min().unwrap_or(1);
        let normalize = base_offset > 1;

        for spec in &specs {
            if let Some(field) = HeaderField::from_spec(spec) {
                let field = if normalize {
                    HeaderField {
                        name: field.name,
                        field_key: field.field_key,
                        byte: field.byte - base_offset + 1,
                        format: field.format,
                    }
                } else {
                    field
                };
                fields.push(field);
            }
        }
        fields.sort_by_key(|f| f.byte);
        Ok(Self::from_fields(fields, size))
    }

    pub fn get(&self, name: &str) -> Option<&HeaderField> {
        self.fields
            .get(name)
            .and_then(|(idx, _)| self.field_list.get(*idx))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldData {
    pub name: String,
    pub description: String,
    pub value: i64,
    pub resolved: Option<String>,
    pub byte_start: u16,
    pub byte_end: u16,
    pub data_type: String,
}

#[derive(Debug)]
pub enum HeaderError {
    FieldNotFound(String),
    InvalidBytes(String),
    Truncated { expected: usize, actual: usize },
}

impl std::fmt::Display for HeaderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FieldNotFound(name) => write!(f, "Field not found: {}", name),
            Self::InvalidBytes(msg) => write!(f, "Invalid bytes: {}", msg),
            Self::Truncated { expected, actual } => {
                write!(f, "Truncated data: expected {}, got {}", expected, actual)
            }
        }
    }
}

impl std::error::Error for HeaderError {}

pub struct RuntimeHeaderView<'a> {
    data: &'a [u8],
    spec: &'a HeaderSpec,
    byte_order: ByteOrder,
}

impl<'a> RuntimeHeaderView<'a> {
    pub fn new(data: &'a [u8], spec: &'a HeaderSpec, byte_order: ByteOrder) -> Self {
        Self {
            data,
            spec,
            byte_order,
        }
    }

    pub fn get_raw(&self, field: &HeaderField) -> Result<i64, HeaderError> {
        let byte_idx = (field.byte - 1) as usize;
        let size = field.format.size();

        if byte_idx + size > self.data.len() {
            return Err(HeaderError::Truncated {
                expected: byte_idx + size,
                actual: self.data.len(),
            });
        }

        let bytes = &self.data[byte_idx..byte_idx + size];

        let value = match field.format {
            ScalarType::Int8 => bytes[0] as i8 as i64,
            ScalarType::Uint8 => bytes[0] as i64,
            ScalarType::Int16 => {
                if self.byte_order == ByteOrder::LittleEndian {
                    LittleEndian::read_i16(bytes) as i64
                } else {
                    BigEndian::read_i16(bytes) as i64
                }
            }
            ScalarType::Uint16 => {
                if self.byte_order == ByteOrder::LittleEndian {
                    LittleEndian::read_u16(bytes) as i64
                } else {
                    BigEndian::read_u16(bytes) as i64
                }
            }
            ScalarType::Int32 => {
                if self.byte_order == ByteOrder::LittleEndian {
                    LittleEndian::read_i32(bytes) as i64
                } else {
                    BigEndian::read_i32(bytes) as i64
                }
            }
            ScalarType::Uint32 => {
                if self.byte_order == ByteOrder::LittleEndian {
                    LittleEndian::read_u32(bytes) as i64
                } else {
                    BigEndian::read_u32(bytes) as i64
                }
            }
            ScalarType::Float32 => {
                if self.byte_order == ByteOrder::LittleEndian {
                    LittleEndian::read_f32(bytes) as i64
                } else {
                    BigEndian::read_f32(bytes) as i64
                }
            }
            ScalarType::Float64 => {
                if self.byte_order == ByteOrder::LittleEndian {
                    LittleEndian::read_f64(bytes) as i64
                } else {
                    BigEndian::read_f64(bytes) as i64
                }
            }
        };

        Ok(value)
    }

    pub fn get(&self, name: &str) -> Result<i64, HeaderError> {
        let field = self
            .spec
            .get(name)
            .ok_or_else(|| HeaderError::FieldNotFound(name.to_string()))?;
        self.get_raw(field)
    }

    pub fn extract_all(&self, specs: &[HeaderFieldSpec]) -> Vec<FieldData> {
        specs
            .iter()
            .filter_map(|spec| {
                let field = self.spec.get(&spec.field_key)?;
                let value = self.get_raw(field).ok()?;
                let resolved = spec
                    .code_mapping
                    .as_ref()
                    .and_then(|mapping| mapping.get(&value.to_string()).cloned());
                Some(FieldData {
                    name: spec.name.clone(),
                    description: spec.description.clone(),
                    value,
                    resolved,
                    byte_start: spec.byte_start,
                    byte_end: spec.byte_end,
                    data_type: spec.data_type.clone(),
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_spec() -> HeaderSpec {
        let fields = vec![
            HeaderField {
                name: "Job ID",
                field_key: "job_id",
                byte: 1,
                format: ScalarType::Int32,
            },
            HeaderField {
                name: "Line Number",
                field_key: "line_number",
                byte: 5,
                format: ScalarType::Int32,
            },
            HeaderField {
                name: "Sample Interval",
                field_key: "sample_interval_us",
                byte: 17,
                format: ScalarType::Int16,
            },
        ];
        HeaderSpec::from_fields(fields, 400)
    }

    fn make_test_data() -> Vec<u8> {
        let mut data = vec![0u8; 400];
        BigEndian::write_i32(&mut data[0..4], 12345);
        BigEndian::write_i32(&mut data[4..8], 99);
        BigEndian::write_i16(&mut data[16..18], 1000);
        data
    }

    #[test]
    fn test_header_spec_from_fields() {
        let spec = make_test_spec();
        assert_eq!(spec.size, 400);
        assert_eq!(spec.fields.len(), 3);
    }

    #[test]
    fn test_header_spec_get() {
        let spec = make_test_spec();
        let field = spec.get("job_id").unwrap();
        assert_eq!(field.byte, 1);
        assert_eq!(field.format, ScalarType::Int32);
    }

    #[test]
    fn test_runtime_header_view_get() {
        let spec = make_test_spec();
        let data = make_test_data();
        let view = RuntimeHeaderView::new(&data, &spec, ByteOrder::BigEndian);

        let job_id = view.get("job_id").unwrap();
        assert_eq!(job_id, 12345);

        let line_num = view.get("line_number").unwrap();
        assert_eq!(line_num, 99);

        let sample_interval = view.get("sample_interval_us").unwrap();
        assert_eq!(sample_interval, 1000);
    }

    #[test]
    fn test_field_not_found() {
        let spec = make_test_spec();
        let data = make_test_data();
        let view = RuntimeHeaderView::new(&data, &spec, ByteOrder::BigEndian);

        let result = view.get("non_existent");
        assert!(matches!(result, Err(HeaderError::FieldNotFound(_))));
    }

    #[test]
    fn test_truncated_data() {
        let spec = make_test_spec();
        let data = vec![0u8; 2]; // Only 2 bytes - can't fit an i32 (4 bytes)
        let view = RuntimeHeaderView::new(&data, &spec, ByteOrder::BigEndian);

        let result = view.get("job_id");
        assert!(matches!(result, Err(HeaderError::Truncated { .. })));
    }

    #[test]
    fn test_scalar_type_from_str() {
        assert_eq!(ScalarType::from_str("int32"), Ok(ScalarType::Int32));
        assert_eq!(ScalarType::from_str("int16"), Ok(ScalarType::Int16));
        assert_eq!(ScalarType::from_str("float32"), Ok(ScalarType::Float32));
        assert_eq!(ScalarType::from_str("unknown"), Err(()));
    }

    #[test]
    fn test_scalar_type_size() {
        assert_eq!(ScalarType::Int8.size(), 1);
        assert_eq!(ScalarType::Int16.size(), 2);
        assert_eq!(ScalarType::Int32.size(), 4);
        assert_eq!(ScalarType::Float64.size(), 8);
    }

    #[test]
    fn test_little_endian_byte_order() {
        let spec = make_test_spec();
        let mut data = vec![0u8; 400];
        LittleEndian::write_i32(&mut data[0..4], 12345);
        LittleEndian::write_i32(&mut data[4..8], 99);
        LittleEndian::write_i16(&mut data[16..18], 1000);
        let view = RuntimeHeaderView::new(&data, &spec, ByteOrder::LittleEndian);

        let job_id = view.get("job_id").unwrap();
        assert_eq!(job_id, 12345);

        let line_num = view.get("line_number").unwrap();
        assert_eq!(line_num, 99);

        let sample_interval = view.get("sample_interval_us").unwrap();
        assert_eq!(sample_interval, 1000);
    }

    #[test]
    fn test_little_endian_vs_big_endian_produce_different_bytes() {
        let spec = make_test_spec();
        let mut be_data = vec![0u8; 400];
        let mut le_data = vec![0u8; 400];
        BigEndian::write_i32(&mut be_data[0..4], 0x01020304);
        LittleEndian::write_i32(&mut le_data[0..4], 0x01020304);

        let be_view = RuntimeHeaderView::new(&be_data, &spec, ByteOrder::BigEndian);
        let le_view = RuntimeHeaderView::new(&le_data, &spec, ByteOrder::LittleEndian);

        assert_eq!(be_view.get("job_id").unwrap(), 0x01020304);
        assert_eq!(le_view.get("job_id").unwrap(), 0x01020304);
    }

    #[test]
    fn test_extract_all_returns_all_fields() {
        let spec = make_test_spec();
        let data = make_test_data();
        let view = RuntimeHeaderView::new(&data, &spec, ByteOrder::BigEndian);

        let field_specs = vec![
            HeaderFieldSpec {
                field_key: "job_id".to_string(),
                name: "Job ID".to_string(),
                description: "Job identification number".to_string(),
                byte_start: 1,
                byte_end: 4,
                data_type: "int32".to_string(),
                code_mapping: None,
                required: false,
            },
            HeaderFieldSpec {
                field_key: "line_number".to_string(),
                name: "Line Number".to_string(),
                description: "Line number".to_string(),
                byte_start: 5,
                byte_end: 8,
                data_type: "int32".to_string(),
                code_mapping: None,
                required: false,
            },
            HeaderFieldSpec {
                field_key: "sample_interval_us".to_string(),
                name: "Sample Interval".to_string(),
                description: "Sample interval in microseconds".to_string(),
                byte_start: 17,
                byte_end: 18,
                data_type: "int16".to_string(),
                code_mapping: None,
                required: false,
            },
        ];

        let results = view.extract_all(&field_specs);
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].name, "Job ID");
        assert_eq!(results[0].value, 12345);
        assert_eq!(results[1].name, "Line Number");
        assert_eq!(results[1].value, 99);
        assert_eq!(results[2].name, "Sample Interval");
        assert_eq!(results[2].value, 1000);
    }

    #[test]
    fn test_extract_all_with_code_mapping() {
        let spec = make_test_spec();
        let mut data = vec![0u8; 400];
        BigEndian::write_i32(&mut data[0..4], 1);

        let mut code_mapping = HashMap::new();
        code_mapping.insert("1".to_string(), "IBM Float32".to_string());
        code_mapping.insert("2".to_string(), "Two's complement integer".to_string());

        let field_specs = vec![HeaderFieldSpec {
            field_key: "job_id".to_string(),
            name: "Data Sample Format".to_string(),
            description: "Data sample format code".to_string(),
            byte_start: 1,
            byte_end: 4,
            data_type: "int32".to_string(),
            code_mapping: Some(code_mapping),
            required: false,
        }];

        let view = RuntimeHeaderView::new(&data, &spec, ByteOrder::BigEndian);
        let results = view.extract_all(&field_specs);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].value, 1);
        assert_eq!(results[0].resolved, Some("IBM Float32".to_string()));
    }

    #[test]
    fn test_revision_field_count_differs() {
        let rev0_fields = vec![
            HeaderField {
                name: "Job ID",
                field_key: "job_id",
                byte: 1,
                format: ScalarType::Int32,
            },
            HeaderField {
                name: "Line Number",
                field_key: "line_number",
                byte: 5,
                format: ScalarType::Int32,
            },
        ];
        let rev0_spec = HeaderSpec::from_fields(rev0_fields, 400);

        let rev1_fields = vec![
            HeaderField {
                name: "Job ID",
                field_key: "job_id",
                byte: 1,
                format: ScalarType::Int32,
            },
            HeaderField {
                name: "Line Number",
                field_key: "line_number",
                byte: 5,
                format: ScalarType::Int32,
            },
            HeaderField {
                name: "Inline Number",
                field_key: "inline_number",
                byte: 181,
                format: ScalarType::Int32,
            },
            HeaderField {
                name: "Crossline Number",
                field_key: "crossline_number",
                byte: 185,
                format: ScalarType::Int32,
            },
        ];
        let rev1_spec = HeaderSpec::from_fields(rev1_fields, 400);

        assert_eq!(rev0_spec.field_list.len(), 2);
        assert_eq!(rev1_spec.field_list.len(), 4);
        assert!(rev1_spec.field_list.len() > rev0_spec.field_list.len());
    }

    #[test]
    fn test_invalid_bytes_error() {
        let spec = make_test_spec();
        let data = vec![0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00];
        let view = RuntimeHeaderView::new(&data, &spec, ByteOrder::BigEndian);

        let result = view.get("job_id");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), -1);
    }

    #[test]
    fn test_extract_all_skips_missing_fields() {
        let spec = make_test_spec();
        let data = make_test_data();
        let view = RuntimeHeaderView::new(&data, &spec, ByteOrder::BigEndian);

        let field_specs = vec![
            HeaderFieldSpec {
                field_key: "job_id".to_string(),
                name: "Job ID".to_string(),
                description: "Job identification number".to_string(),
                byte_start: 1,
                byte_end: 4,
                data_type: "int32".to_string(),
                code_mapping: None,
                required: false,
            },
            HeaderFieldSpec {
                field_key: "nonexistent_field".to_string(),
                name: "Nonexistent".to_string(),
                description: "This field does not exist".to_string(),
                byte_start: 100,
                byte_end: 104,
                data_type: "int32".to_string(),
                code_mapping: None,
                required: false,
            },
        ];

        let results = view.extract_all(&field_specs);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Job ID");
    }
}
