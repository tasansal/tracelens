//! SEG-Y Binary Header (400 bytes)
//!
//! The binary header contains machine-readable information about the entire reel/file.
//! Standard SEG-Y uses big-endian byte order, but some files may use little-endian.
//! Endianness is automatically detected by checking if header values are reasonable.

use byteorder::{BigEndian, ByteOrder as ByteOrderTrait, LittleEndian};
use serde::{Deserialize, Serialize};
use std::io::{self, Cursor, Read};

/// Data sample format codes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(i16)]
pub enum DataSampleFormat {
    /// 32-bit IBM floating point
    IbmFloat32 = 1,
    /// 32-bit two's complement integer
    Int32 = 2,
    /// 16-bit two's complement integer
    Int16 = 3,
    /// 32-bit fixed point with gain (obsolete)
    FixedPointWithGain = 4,
    /// 32-bit IEEE floating point
    IeeeFloat32 = 5,
    /// 8-bit two's complement integer
    Int8 = 8,
}

impl DataSampleFormat {
    /// Get the size in bytes for this sample format
    pub fn bytes_per_sample(self) -> usize {
        match self {
            Self::IbmFloat32 => 4,
            Self::Int32 => 4,
            Self::Int16 => 2,
            Self::FixedPointWithGain => 4,
            Self::IeeeFloat32 => 4,
            Self::Int8 => 1,
        }
    }

    /// Parse from a raw SEG-Y format code.
    pub fn from_code(code: i16) -> Result<Self, String> {
        match code {
            1 => Ok(Self::IbmFloat32),
            2 => Ok(Self::Int32),
            3 => Ok(Self::Int16),
            4 => Ok(Self::FixedPointWithGain),
            5 => Ok(Self::IeeeFloat32),
            8 => Ok(Self::Int8),
            _ => Err(format!("Invalid data sample format code: {}", code)),
        }
    }
}

/// Byte order (endianness) of binary data
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum ByteOrder {
    /// Big-endian (standard SEG-Y)
    #[default]
    BigEndian,
    /// Little-endian (non-standard)
    LittleEndian,
}

/// Binary header containing reel/file-level metadata
///
/// The binary header is 400 bytes and follows the 3200-byte textual header.
/// It contains critical information about the data format, sample rates,
/// and acquisition parameters.
///
/// Endianness is automatically detected by validating key fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryHeader {
    /// Detected byte order
    #[serde(skip)]
    pub byte_order: ByteOrder,

    /// Sample interval in microseconds for this reel (bytes 3217-3218)
    pub sample_interval_us: i16,

    /// Number of samples per data trace for this reel (bytes 3221-3222)
    pub samples_per_trace: i16,

    /// Data sample format code (bytes 3225-3226)
    pub data_sample_format: DataSampleFormat,

    /// All bytes of the binary header (3201-3600)
    pub unassigned: Vec<u8>,
}

/// Byte order for reading binary data
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Endianness {
    Big,
    Little,
}

/// Detect endianness by checking if key binary header fields are reasonable.
///
/// Tries both big and little endian interpretations and picks the one
/// where key fields (samples_per_trace, sample_interval_us) are more reasonable.
fn detect_endianness(data: &[u8]) -> Endianness {
    // Read critical fields at their known positions (0-indexed from start of binary header)
    // samples_per_trace is at byte 20-21 (i16)
    // sample_interval_us is at byte 16-17 (i16)

    if data.len() < 22 {
        return Endianness::Big; // Default to standard
    }

    let samples_be = BigEndian::read_i16(&data[20..22]);
    let samples_le = LittleEndian::read_i16(&data[20..22]);
    let interval_be = BigEndian::read_i16(&data[16..18]);
    let interval_le = LittleEndian::read_i16(&data[16..18]);

    // Reasonable ranges for validation:
    // samples_per_trace: 1 to 32,000 (i16 max is 32,767)
    // sample_interval_us: 1 to 32,000 (1 microsecond to 32ms)

    let be_valid = samples_be > 0 && samples_be < 32_000 && interval_be > 0 && interval_be < 32_000;
    let le_valid = samples_le > 0 && samples_le < 32_000 && interval_le > 0 && interval_le < 32_000;

    match (be_valid, le_valid) {
        (true, false) => Endianness::Big,
        (false, true) => Endianness::Little,
        (true, true) => Endianness::Big, // Both valid, prefer standard big-endian
        (false, false) => Endianness::Big, // Neither valid, default to standard
    }
}

impl BinaryHeader {
    /// Size of the binary header in bytes
    pub const SIZE: usize = 400;

    /// Parse a binary header from a reader with automatic endianness detection
    ///
    /// Automatically detects whether data is big-endian (standard) or little-endian.
    ///
    /// # Arguments
    ///
    /// * `reader` - A reader positioned at the start of the binary header
    ///
    /// # Errors
    ///
    /// Returns an error if reading fails or data is invalid
    pub fn from_reader<R: Read>(mut reader: R) -> io::Result<Self> {
        // Read all 400 bytes into buffer for endianness detection
        let mut buffer = vec![0u8; Self::SIZE];
        reader.read_exact(&mut buffer)?;

        // Detect endianness
        let endianness = detect_endianness(&buffer);

        // Parse with detected endianness
        let mut cursor = Cursor::new(&buffer);
        Self::from_reader_with_endianness(&mut cursor, endianness)
    }

    /// Parse a binary header from a reader with specified endianness
    ///
    /// This is split out to allow an endianness probe before decoding fields.
    pub(crate) fn from_reader_with_endianness<R: Read>(
        mut reader: R,
        endianness: Endianness,
    ) -> io::Result<Self> {
        let mut buffer = [0u8; Self::SIZE];
        reader.read_exact(&mut buffer)?;

        let byte_order = match endianness {
            Endianness::Big => ByteOrder::BigEndian,
            Endianness::Little => ByteOrder::LittleEndian,
        };

        // Extract essential fields from the buffer
        let sample_interval_us = match byte_order {
            ByteOrder::BigEndian => BigEndian::read_i16(&buffer[16..18]),
            ByteOrder::LittleEndian => LittleEndian::read_i16(&buffer[16..18]),
        };

        let samples_per_trace = match byte_order {
            ByteOrder::BigEndian => BigEndian::read_i16(&buffer[20..22]),
            ByteOrder::LittleEndian => LittleEndian::read_i16(&buffer[20..22]),
        };

        let format_code = match byte_order {
            ByteOrder::BigEndian => BigEndian::read_i16(&buffer[24..26]),
            ByteOrder::LittleEndian => LittleEndian::read_i16(&buffer[24..26]),
        };

        let data_sample_format = DataSampleFormat::from_code(format_code)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        Ok(Self {
            byte_order,
            sample_interval_us,
            samples_per_trace,
            data_sample_format,
            unassigned: buffer.to_vec(),
        })
    }

    /// Get bytes per sample based on the data format
    pub fn bytes_per_sample(&self) -> usize {
        self.data_sample_format.bytes_per_sample()
    }

    /// Calculate the expected size of a trace data block in bytes
    ///
    /// This is the trace header (240 bytes) plus the trace data
    pub fn trace_block_size(&self) -> usize {
        240 + (self.samples_per_trace as usize * self.bytes_per_sample())
    }
}

impl Default for BinaryHeader {
    fn default() -> Self {
        Self {
            byte_order: ByteOrder::BigEndian,
            sample_interval_us: 1000,
            samples_per_trace: 0,
            data_sample_format: DataSampleFormat::IbmFloat32,
            unassigned: vec![0u8; Self::SIZE],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_trace_block_size() {
        let header = BinaryHeader {
            samples_per_trace: 1000,
            data_sample_format: DataSampleFormat::IbmFloat32,
            ..Default::default()
        };

        assert_eq!(header.trace_block_size(), 240 + 1000 * 4);
    }

    #[test]
    fn test_trace_block_size_int16_format() {
        let header = BinaryHeader {
            samples_per_trace: 500,
            data_sample_format: DataSampleFormat::Int16,
            ..Default::default()
        };

        assert_eq!(header.trace_block_size(), 240 + 500 * 2);
    }

    #[test]
    fn test_trace_block_size_int8_format() {
        let header = BinaryHeader {
            samples_per_trace: 1000,
            data_sample_format: DataSampleFormat::Int8,
            ..Default::default()
        };

        assert_eq!(header.trace_block_size(), 240 + 1000);
    }

    #[test]
    fn test_read_valid_binary_header() {
        use crate::segy::fixtures::create_minimal_segy_file;

        let file = create_minimal_segy_file(10, 100, 5);
        // Skip textual header (3200 bytes) to get binary header
        let binary_bytes = &file.bytes[3200..3600];
        let header = BinaryHeader::from_reader(Cursor::new(binary_bytes)).unwrap();

        assert_eq!(header.samples_per_trace, 100);
        assert_eq!(header.data_sample_format, DataSampleFormat::IeeeFloat32);
        assert_eq!(header.sample_interval_us, 4000);
    }

    #[test]
    fn test_read_valid_all_formats() {
        use crate::segy::fixtures::create_segy_file_all_formats;

        let files = create_segy_file_all_formats();
        let expected_formats = [
            DataSampleFormat::IbmFloat32,
            DataSampleFormat::Int32,
            DataSampleFormat::Int16,
            DataSampleFormat::FixedPointWithGain,
            DataSampleFormat::IeeeFloat32,
            DataSampleFormat::Int8,
        ];

        for (file, expected) in files.iter().zip(expected_formats.iter()) {
            let binary_bytes = &file.bytes[3200..3600];
            let header = BinaryHeader::from_reader(Cursor::new(binary_bytes)).unwrap();
            assert_eq!(
                header.data_sample_format, *expected,
                "Format mismatch for file with expected_format={}",
                file.expected_format
            );
        }
    }

    #[test]
    fn test_read_truncated_binary_header() {
        use crate::segy::fixtures::{MalformedVariant, create_malformed_segy};

        let bytes = create_malformed_segy(MalformedVariant::TruncatedBinaryHeader);
        // Skip textual header (3200 bytes), try to read truncated binary header
        let truncated = &bytes[3200..];
        let result = BinaryHeader::from_reader(Cursor::new(truncated));
        assert!(result.is_err());
    }

    #[test]
    fn test_read_empty_input() {
        let empty: Vec<u8> = vec![];
        let result = BinaryHeader::from_reader(Cursor::new(empty));
        assert!(result.is_err());
    }

    #[test]
    fn test_read_too_short_input() {
        let short = vec![0u8; 100]; // Less than 400 bytes
        let result = BinaryHeader::from_reader(Cursor::new(short));
        assert!(result.is_err());
    }

    #[test]
    fn test_read_invalid_format_code() {
        use crate::segy::fixtures::{MalformedVariant, create_malformed_segy};

        let bytes = create_malformed_segy(MalformedVariant::InvalidFormatCode);
        let binary_bytes = &bytes[3200..3600];
        let result = BinaryHeader::from_reader(Cursor::new(binary_bytes));
        assert!(result.is_err());
    }

    #[test]
    fn test_bytes_per_sample() {
        let header = BinaryHeader {
            data_sample_format: DataSampleFormat::IbmFloat32,
            ..Default::default()
        };
        assert_eq!(header.bytes_per_sample(), 4);

        let header = BinaryHeader {
            data_sample_format: DataSampleFormat::Int32,
            ..Default::default()
        };
        assert_eq!(header.bytes_per_sample(), 4);

        let header = BinaryHeader {
            data_sample_format: DataSampleFormat::Int16,
            ..Default::default()
        };
        assert_eq!(header.bytes_per_sample(), 2);

        let header = BinaryHeader {
            data_sample_format: DataSampleFormat::FixedPointWithGain,
            ..Default::default()
        };
        assert_eq!(header.bytes_per_sample(), 4);

        let header = BinaryHeader {
            data_sample_format: DataSampleFormat::IeeeFloat32,
            ..Default::default()
        };
        assert_eq!(header.bytes_per_sample(), 4);

        let header = BinaryHeader {
            data_sample_format: DataSampleFormat::Int8,
            ..Default::default()
        };
        assert_eq!(header.bytes_per_sample(), 1);
    }

    #[test]
    fn test_data_sample_format_from_code() {
        assert_eq!(
            DataSampleFormat::from_code(1),
            Ok(DataSampleFormat::IbmFloat32)
        );
        assert_eq!(DataSampleFormat::from_code(2), Ok(DataSampleFormat::Int32));
        assert_eq!(DataSampleFormat::from_code(3), Ok(DataSampleFormat::Int16));
        assert_eq!(
            DataSampleFormat::from_code(4),
            Ok(DataSampleFormat::FixedPointWithGain)
        );
        assert_eq!(
            DataSampleFormat::from_code(5),
            Ok(DataSampleFormat::IeeeFloat32)
        );
        assert_eq!(DataSampleFormat::from_code(8), Ok(DataSampleFormat::Int8));
        assert!(DataSampleFormat::from_code(99).is_err());
        assert!(DataSampleFormat::from_code(0).is_err());
    }

    #[test]
    fn test_default_binary_header() {
        let header = BinaryHeader::default();
        assert_eq!(header.sample_interval_us, 1000);
        assert_eq!(header.samples_per_trace, 0);
        assert_eq!(header.data_sample_format, DataSampleFormat::IbmFloat32);
        assert_eq!(header.byte_order, ByteOrder::BigEndian);
        assert_eq!(header.unassigned.len(), BinaryHeader::SIZE);
    }
}
