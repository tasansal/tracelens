//! Shared test fixtures for SEG-Y integration tests.
//!
//! Generates real temporary SEG-Y files used by both the commands and
//! file-loading integration test suites.

use byteorder::{BigEndian, WriteBytesExt};
use std::io::Write;
use tempfile::NamedTempFile;

/// Kind of malformed SEG-Y file for error testing.
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum MalformedKind {
    /// Binary header truncated to 200 bytes (half of 400).
    TruncatedBinaryHeader,
    /// Invalid format code (99 is not a valid SEG-Y format).
    InvalidFormatCode,
    /// Wrong byte order (little endian instead of big endian).
    WrongByteOrder,
    /// Empty file (no data at all).
    EmptyFile,
}

/// Create a minimal valid SEG-Y Rev 0 file with the specified number of traces.
pub fn create_minimal_segy(trace_count: u32) -> NamedTempFile {
    let samples_per_trace = 100u16;

    // Create textual header (3200 bytes - all spaces for simplicity)
    let textual_header = vec![b' '; 3200];

    let mut binary_header = vec![0u8; 400];
    let mut cursor = std::io::Cursor::new(&mut binary_header);
    cursor.write_i32::<BigEndian>(1).unwrap();
    cursor.write_i32::<BigEndian>(0).unwrap();
    cursor.write_i32::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(4000).unwrap();
    cursor.write_i16::<BigEndian>(4000).unwrap();
    cursor
        .write_i16::<BigEndian>(samples_per_trace as i16)
        .unwrap();
    cursor
        .write_i16::<BigEndian>(samples_per_trace as i16)
        .unwrap();
    cursor.write_i16::<BigEndian>(1).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(1).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_u8(0).unwrap();

    let mut temp_file = tempfile::Builder::new()
        .prefix("test_segy_")
        .suffix(".sgy")
        .tempfile()
        .expect("Failed to create temp file");

    temp_file
        .write_all(&textual_header)
        .expect("Failed to write textual header");
    temp_file
        .write_all(&binary_header)
        .expect("Failed to write binary header");

    for trace_idx in 0..trace_count {
        let mut trace_header = vec![0u8; 240];
        let mut cursor = std::io::Cursor::new(&mut trace_header);
        cursor.write_i32::<BigEndian>(trace_idx as i32 + 1).unwrap();
        cursor.write_i32::<BigEndian>(1).unwrap();
        cursor
            .write_i32::<BigEndian>(samples_per_trace as i32)
            .unwrap();
        cursor.write_i32::<BigEndian>(4000).unwrap();

        temp_file
            .write_all(&trace_header)
            .expect("Failed to write trace header");

        let samples: Vec<u8> = (0..samples_per_trace)
            .flat_map(|i| {
                let value = ((i as f32 / 10.0).sin() * 1000.0) as i32;
                ibm_float_to_bytes(value)
            })
            .collect();

        temp_file
            .write_all(&samples)
            .expect("Failed to write trace data");
    }

    temp_file.flush().expect("Failed to flush temp file");
    temp_file
}

fn ibm_float_to_bytes(value: i32) -> [u8; 4] {
    if value == 0 {
        return [0, 0, 0, 0];
    }

    let sign = if value < 0 { 1u8 } else { 0u8 };
    let mut abs_value = value.unsigned_abs();
    let mut exponent: i32 = 0;

    if abs_value > 0 {
        while abs_value >= 0x1000000 {
            abs_value >>= 4;
            exponent += 1;
        }
        while abs_value < 0x100000 && exponent > 0 {
            abs_value <<= 4;
            exponent -= 1;
        }
    }

    let mantissa = (sign << 7) | (exponent as u8 & 0x7F);

    [
        mantissa,
        (abs_value >> 16) as u8,
        (abs_value >> 8) as u8,
        abs_value as u8,
    ]
}

/// Create a malformed SEG-Y file for error handling tests.
pub fn create_malformed_segy(kind: MalformedKind) -> NamedTempFile {
    let mut temp_file = tempfile::Builder::new()
        .prefix("malformed_segy_")
        .suffix(".sgy")
        .tempfile()
        .expect("Failed to create temp file");

    match kind {
        MalformedKind::EmptyFile => {}
        MalformedKind::TruncatedBinaryHeader => {
            temp_file
                .write_all(&vec![b' '; 3200])
                .expect("Failed to write textual header");
            temp_file
                .write_all(&[0u8; 200])
                .expect("Failed to write truncated binary header");
        }
        MalformedKind::InvalidFormatCode => {
            temp_file
                .write_all(&vec![b' '; 3200])
                .expect("Failed to write textual header");

            let mut binary_header = vec![0u8; 400];
            let mut cursor = std::io::Cursor::new(&mut binary_header);
            cursor.write_i32::<BigEndian>(1).unwrap();
            cursor.write_i16::<BigEndian>(4000).unwrap();
            cursor.write_i16::<BigEndian>(100).unwrap();
            cursor.write_i16::<BigEndian>(99).unwrap();

            temp_file
                .write_all(&binary_header)
                .expect("Failed to write binary header");
        }
        MalformedKind::WrongByteOrder => {
            use byteorder::LittleEndian;

            temp_file
                .write_all(&vec![b' '; 3200])
                .expect("Failed to write textual header");

            let mut binary_header = vec![0u8; 400];
            let mut cursor = std::io::Cursor::new(&mut binary_header);
            cursor.write_i32::<LittleEndian>(1).unwrap();
            cursor.write_i16::<LittleEndian>(4000).unwrap();
            cursor.write_i16::<LittleEndian>(100).unwrap();
            cursor.write_i16::<LittleEndian>(1).unwrap();

            temp_file
                .write_all(&binary_header)
                .expect("Failed to write binary header");
        }
    }

    temp_file.flush().expect("Failed to flush temp file");
    temp_file
}

/// Create a minimal SEG-Y Rev 1 file.
#[allow(dead_code)]
pub fn create_rev1_segy(trace_count: u32) -> NamedTempFile {
    let samples_per_trace = 100u16;

    // Create textual header (3200 bytes - all spaces for simplicity)
    let textual_header = vec![b' '; 3200];

    let mut binary_header = vec![0u8; 400];
    let mut cursor = std::io::Cursor::new(&mut binary_header);
    cursor.write_i32::<BigEndian>(1).unwrap();
    cursor.write_i32::<BigEndian>(0).unwrap();
    cursor.write_i32::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(4000).unwrap();
    cursor.write_i16::<BigEndian>(4000).unwrap();
    cursor
        .write_i16::<BigEndian>(samples_per_trace as i16)
        .unwrap();
    cursor
        .write_i16::<BigEndian>(samples_per_trace as i16)
        .unwrap();
    cursor.write_i16::<BigEndian>(1).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(1).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_i16::<BigEndian>(0).unwrap();
    cursor.write_u8(0).unwrap();

    let rev_pos = 350;
    binary_header[rev_pos..rev_pos + 2].copy_from_slice(&1i16.to_be_bytes());

    let mut temp_file = tempfile::Builder::new()
        .prefix("test_segy_rev1_")
        .suffix(".sgy")
        .tempfile()
        .expect("Failed to create temp file");

    temp_file
        .write_all(&textual_header)
        .expect("Failed to write textual header");
    temp_file
        .write_all(&binary_header)
        .expect("Failed to write binary header");

    for trace_idx in 0..trace_count {
        let mut trace_header = vec![0u8; 240];
        let mut cursor = std::io::Cursor::new(&mut trace_header);
        cursor.write_i32::<BigEndian>(trace_idx as i32 + 1).unwrap();
        cursor.write_i32::<BigEndian>(1).unwrap();
        cursor
            .write_i32::<BigEndian>(samples_per_trace as i32)
            .unwrap();
        cursor.write_i32::<BigEndian>(4000).unwrap();

        temp_file
            .write_all(&trace_header)
            .expect("Failed to write trace header");

        let samples: Vec<u8> = (0..samples_per_trace)
            .flat_map(|i| {
                let value = ((i as f32 / 10.0).sin() * 1000.0) as i32;
                ibm_float_to_bytes(value)
            })
            .collect();

        temp_file
            .write_all(&samples)
            .expect("Failed to write trace data");
    }

    temp_file.flush().expect("Failed to flush temp file");
    temp_file
}
