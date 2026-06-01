//! Synthetic in-memory SEG-Y fixture generation for tests.
//!
//! Provides helpers to generate valid and malformed SEG-Y byte sequences
//! entirely in memory using `Vec<u8>`. No file I/O or external dependencies.
//!
//! SEG-Y file layout:
//! 1. Textual header: 3200 bytes (EBCDIC card images)
//! 2. Binary header: 400 bytes
//! 3. N traces, each: 240-byte trace header + sample data

use std::io::Cursor;

use crate::segy::parser::{
    binary_header::BinaryHeader, binary_header::ByteOrder, textual_header::TextualHeader,
    trace::TraceHeader,
};

/// Holds a generated SEG-Y byte sequence and its ground-truth metadata.
pub struct TestFile {
    /// Raw SEG-Y bytes (textual header + binary header + traces)
    pub bytes: Vec<u8>,
    /// Number of traces encoded in the file
    pub expected_num_traces: i16,
    /// Samples per trace encoded in the file
    pub expected_num_samples: i16,
    /// Data sample format code (1=IBM float32, 2=Int32, 3=Int16, 4=FixedPoint, 5=IEEE float32, 8=Int8)
    pub expected_format: i16,
}

/// Variants of malformed SEG-Y files for error-path testing.
pub enum MalformedVariant {
    /// Zero bytes
    Empty,
    /// Fewer than 400 bytes for the binary header (truncated after textual header)
    TruncatedBinaryHeader,
    /// Fewer than 240 bytes for a trace header
    TruncatedTraceHeader,
    /// Fewer bytes than needed for trace data
    TruncatedTraceData,
    /// Valid headers but invalid format code (99) in binary header
    InvalidFormatCode,
    /// Binary header declares zero samples per trace
    ZeroSamples,
}

// ── Byte-writing helpers ──────────────────────────────────────────────

/// Write a single f32 as big-endian IEEE 754.
fn write_f32_be(buf: &mut Vec<u8>, val: f32) {
    buf.extend_from_slice(&val.to_be_bytes());
}

/// Write a single f32 as IBM float32 (big-endian).
///
/// Converts IEEE 754 f32 → IBM/370 32-bit float.
fn write_f32_ibm(buf: &mut Vec<u8>, val: f32) {
    let bits = ieee_to_ibm(val.to_bits());
    buf.extend_from_slice(&bits.to_be_bytes());
}

/// Convert IEEE 754 bit pattern to IBM/370 32-bit float.
fn ieee_to_ibm(ieee: u32) -> u32 {
    if ieee == 0 {
        return 0;
    }

    let sign = (ieee >> 31) & 0x1;
    let ieee_exp = ((ieee >> 23) & 0xFF) as i32;
    let ieee_mantissa = ieee & 0x007FFFFF;

    // Reconstruct the full mantissa with implicit leading 1
    let mut mantissa = (ieee_mantissa | 0x00800000) as u64;

    // IEEE exponent is base 2, bias 127
    // IBM exponent is base 16, bias 64
    // We need to find ibm_exp and shift such that:
    //   mantissa * 2^(ieee_exp - 127) = mantissa' * 16^(ibm_exp - 64)
    //   = mantissa' * 2^(4*(ibm_exp - 64))
    // So: ieee_exp - 127 = 4*(ibm_exp - 64) + shift
    // where 0 <= shift < 4

    let exp_diff = ieee_exp - 127;
    // We want: exp_diff = 4 * q + r, where 0 <= r < 4
    // Rust's rem_euclid gives us the positive remainder
    let r = exp_diff.rem_euclid(4);
    let q = (exp_diff - r) / 4;
    let ibm_exp = q + 64;
    let shift = r as u32;

    // Shift mantissa left to convert from base-2 to base-16 normalization
    mantissa <<= shift;

    // Remove implicit leading 1 (IBM uses 0.xxxx normalization)
    // The mantissa should be 24 bits (top nibble non-zero for normalized)
    mantissa &= 0x00FFFFFF;

    // Handle edge case where mantissa became zero after masking
    if mantissa == 0 {
        return (sign << 31) | ((ibm_exp as u32) << 24);
    }

    // Ensure mantissa is normalized (top nibble non-zero)
    let mut ibm_exp = ibm_exp;
    while (mantissa & 0x00F00000) == 0 {
        mantissa <<= 4;
        ibm_exp -= 1;
    }

    (sign << 31) | ((ibm_exp as u32) << 24) | (mantissa as u32)
}

// ── Textual header generation ─────────────────────────────────────────

/// Generate 3200 bytes of EBCDIC textual header (ASCII-safe).
/// Each of the 40 lines is 80 chars, padded with EBCDIC spaces (0x40).
fn generate_textual_header() -> Vec<u8> {
    let mut buf = vec![0x40u8; TextualHeader::SIZE];
    // Write ASCII card headers (EBCDIC 'C' = 0xC3)
    for i in 0..40 {
        let offset = i * 80;
        buf[offset] = 0xC3; // EBCDIC 'C'
        // Write line number as ASCII digits
        let line_num = format!("{:03}", i + 1);
        for (j, ch) in line_num.chars().enumerate() {
            buf[offset + 5 + j] = ch as u8; // ASCII digits are same in EBCDIC
        }
    }
    buf
}

// ── Binary header generation ──────────────────────────────────────────

/// Generate 400 bytes of binary header with the given parameters.
/// Big-endian byte order.
fn generate_binary_header(_num_traces: i16, num_samples: i16, format_code: i16) -> Vec<u8> {
    let mut buf = vec![0u8; BinaryHeader::SIZE];

    // sample_interval_us at bytes 16-17 (0-indexed)
    write_i16_be_slice(&mut buf, 16, 4000);
    // samples_per_trace at bytes 20-21
    write_i16_be_slice(&mut buf, 20, num_samples);
    // data_sample_format at bytes 24-25
    write_i16_be_slice(&mut buf, 24, format_code);

    buf
}

fn write_i16_be_slice(buf: &mut [u8], offset: usize, val: i16) {
    buf[offset..offset + 2].copy_from_slice(&val.to_be_bytes());
}

// ── Trace header generation ───────────────────────────────────────────

/// Generate 240 bytes of trace header with the given parameters.
fn generate_trace_header(
    trace_seq: i32,
    num_samples: i16,
    sample_interval: i16,
    trace_id: i16,
) -> Vec<u8> {
    let mut buf = vec![0u8; TraceHeader::SIZE];

    // trace_sequence_number at bytes 0-3
    buf[0..4].copy_from_slice(&trace_seq.to_be_bytes());
    // num_samples at bytes 114-115
    buf[114..116].copy_from_slice(&num_samples.to_be_bytes());
    // sample_interval_us at bytes 116-117
    buf[116..118].copy_from_slice(&sample_interval.to_be_bytes());
    // trace_identification_code at bytes 154-155
    buf[154..156].copy_from_slice(&trace_id.to_be_bytes());

    buf
}

// ── Trace data generation ─────────────────────────────────────────────

/// Generate trace data bytes for the given format and sample values.
fn generate_trace_data(samples_f32: &[f32], format_code: i16) -> Vec<u8> {
    let mut buf = Vec::new();
    match format_code {
        1 => {
            // IBM float32
            for &val in samples_f32 {
                write_f32_ibm(&mut buf, val);
            }
        }
        2 => {
            // Int32
            for &val in samples_f32 {
                buf.extend_from_slice(&(val as i32).to_be_bytes());
            }
        }
        3 => {
            // Int16
            for &val in samples_f32 {
                buf.extend_from_slice(&(val as i16).to_be_bytes());
            }
        }
        4 => {
            // Fixed point with gain — write as 4 bytes per sample: 0x00, gain=0, value as i16
            for &val in samples_f32 {
                buf.push(0x00);
                buf.push(0x00);
                buf.extend_from_slice(&(val as i16).to_be_bytes());
            }
        }
        5 => {
            // IEEE float32
            for &val in samples_f32 {
                write_f32_be(&mut buf, val);
            }
        }
        8 => {
            // Int8
            for &val in samples_f32 {
                buf.push(val as i8 as u8);
            }
        }
        _ => {}
    }
    buf
}

// ── Public API ────────────────────────────────────────────────────────

/// Create a minimal in-memory SEG-Y file with the given parameters.
///
/// Uses IEEE float32 (format code 5) for trace data by default.
///
/// # Arguments
///
/// * `num_traces` — number of traces to generate
/// * `num_samples` — samples per trace
/// * `format` — data sample format code (1, 2, 3, 4, 5, or 8)
pub fn create_minimal_segy_file(num_traces: i16, num_samples: i16, format: i16) -> TestFile {
    let mut bytes = Vec::new();

    // 1. Textual header (3200 bytes)
    bytes.extend(generate_textual_header());

    // 2. Binary header (400 bytes)
    bytes.extend(generate_binary_header(num_traces, num_samples, format));

    // 3. Traces
    let sample_values: Vec<f32> = (0..num_samples as usize)
        .map(|i| (i as f32) * 0.1)
        .collect();

    for trace_idx in 0..num_traces {
        // Trace header (240 bytes)
        bytes.extend(generate_trace_header(
            (trace_idx + 1) as i32,
            num_samples,
            4000,
            1,
        ));

        // Trace data
        bytes.extend(generate_trace_data(&sample_values, format));
    }

    TestFile {
        bytes,
        expected_num_traces: num_traces,
        expected_num_samples: num_samples,
        expected_format: format,
    }
}

/// Create SEG-Y files for all 6 supported sample formats.
///
/// Returns a `Vec<TestFile>` with one file per format code:
/// 1=IBM float32, 2=Int32, 3=Int16, 4=FixedPoint, 5=IEEE float32, 8=Int8
pub fn create_segy_file_all_formats() -> Vec<TestFile> {
    let formats = [1, 2, 3, 4, 5, 8];
    formats
        .iter()
        .map(|&f| create_minimal_segy_file(3, 10, f))
        .collect()
}

/// Create a malformed SEG-Y byte sequence for error-path testing.
pub fn create_malformed_segy(variant: MalformedVariant) -> Vec<u8> {
    match variant {
        MalformedVariant::Empty => {
            vec![]
        }
        MalformedVariant::TruncatedBinaryHeader => {
            let mut bytes = generate_textual_header();
            // Only write 200 bytes of the 400-byte binary header
            bytes.extend(vec![0u8; 200]);
            bytes
        }
        MalformedVariant::TruncatedTraceHeader => {
            let mut bytes = generate_textual_header();
            bytes.extend(generate_binary_header(1, 10, 1));
            // Only write 120 bytes of the 240-byte trace header
            bytes.extend(vec![0u8; 120]);
            bytes
        }
        MalformedVariant::TruncatedTraceData => {
            let mut bytes = generate_textual_header();
            bytes.extend(generate_binary_header(1, 10, 1));
            // Full trace header but only 4 bytes of data (need 40 for 10 f32 samples)
            bytes.extend(generate_trace_header(1, 10, 4000, 1));
            bytes.extend(vec![0u8; 4]);
            bytes
        }
        MalformedVariant::InvalidFormatCode => {
            let mut bytes = generate_textual_header();
            bytes.extend(generate_binary_header(1, 10, 99)); // invalid format
            bytes.extend(generate_trace_header(1, 10, 4000, 1));
            bytes.extend(generate_trace_data(&[0.0], 1));
            bytes
        }
        MalformedVariant::ZeroSamples => {
            let mut bytes = generate_textual_header();
            bytes.extend(generate_binary_header(1, 0, 1)); // zero samples
            bytes
        }
    }
}

/// Generate a valid 3200-byte textual header for testing.
/// Uses EBCDIC encoding with standard card-image format.
pub fn generate_valid_textual_header_bytes() -> Vec<u8> {
    generate_textual_header()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_minimal_segy_file_has_correct_size() {
        let file = create_minimal_segy_file(2, 10, 5);
        // 3200 (textual) + 400 (binary) + 2 * (240 (trace header) + 10 * 4 (IEEE f32))
        let expected = 3200 + 400 + 2 * (240 + 40);
        assert_eq!(file.bytes.len(), expected);
        assert_eq!(file.expected_num_traces, 2);
        assert_eq!(file.expected_num_samples, 10);
        assert_eq!(file.expected_format, 5);
    }

    #[test]
    fn test_create_segy_file_all_formats_returns_six_files() {
        let files = create_segy_file_all_formats();
        assert_eq!(files.len(), 6);
        let expected_formats = [1, 2, 3, 4, 5, 8];
        for (file, &expected) in files.iter().zip(expected_formats.iter()) {
            assert_eq!(file.expected_format, expected);
        }
    }

    #[test]
    fn test_create_malformed_segy_empty() {
        let bytes = create_malformed_segy(MalformedVariant::Empty);
        assert!(bytes.is_empty());
    }

    #[test]
    fn test_create_malformed_segy_truncated_binary_header() {
        let bytes = create_malformed_segy(MalformedVariant::TruncatedBinaryHeader);
        // 3200 textual + 200 truncated binary
        assert_eq!(bytes.len(), 3400);
    }

    #[test]
    fn test_create_malformed_segy_invalid_format_code() {
        let bytes = create_malformed_segy(MalformedVariant::InvalidFormatCode);
        // Should have valid headers but format code 99
        assert!(bytes.len() > 3600);
    }

    #[test]
    fn test_textual_header_roundtrip() {
        let header_bytes = generate_valid_textual_header_bytes();
        assert_eq!(header_bytes.len(), 3200);
        let header = TextualHeader::new(header_bytes).unwrap();
        assert_eq!(header.lines.len(), 40);
        for line in &header.lines {
            assert_eq!(line.len(), 80);
        }
    }

    #[test]
    fn test_binary_header_roundtrip() {
        let file = create_minimal_segy_file(5, 200, 5);
        // Skip textual header (3200 bytes)
        let binary_bytes = &file.bytes[3200..3600];
        let header = BinaryHeader::from_reader(Cursor::new(binary_bytes)).unwrap();
        assert_eq!(header.samples_per_trace, 200);
        assert_eq!(header.data_sample_format as i16, 5);
    }

    #[test]
    fn test_trace_header_roundtrip() {
        let file = create_minimal_segy_file(1, 100, 5);
        // Skip textual (3200) + binary (400) = 3600
        let trace_header_bytes = &file.bytes[3600..3840];
        let header =
            TraceHeader::from_reader(Cursor::new(trace_header_bytes), ByteOrder::BigEndian)
                .unwrap();
        assert_eq!(header.num_samples, 100);
        assert_eq!(header.sample_interval_us, 4000);
    }
}
