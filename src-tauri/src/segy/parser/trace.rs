//! SEG-Y Trace structures
//!
//! A trace consists of a 240-byte header followed by trace data samples.

use byteorder::{BigEndian, ByteOrder as ByteOrderTrait, LittleEndian};
use serde::{Deserialize, Serialize};
use std::io::{self, Read};

use super::binary_header::ByteOrder;
use super::trace_data::TraceData;

/// Trace header containing metadata for a single trace
///
/// The trace header is 240 bytes and precedes the trace data samples.
/// All values are in big-endian byte order with two's complement representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceHeader {
    /// Number of samples in this trace (bytes 115-116)
    pub num_samples: i16,

    /// Sample interval in microseconds for this trace (bytes 117-118)
    pub sample_interval_us: i16,

    /// All bytes of the trace header (1-240)
    pub unassigned: Vec<u8>,
}

impl Default for TraceHeader {
    fn default() -> Self {
        Self {
            num_samples: 0,
            sample_interval_us: 1000,
            unassigned: vec![0u8; Self::SIZE],
        }
    }
}

impl TraceHeader {
    /// Size of the trace header in bytes
    pub const SIZE: usize = 240;

    /// Parse a trace header from a reader.
    ///
    /// All values are read in big-endian byte order per SEG-Y specification.
    ///
    /// # Arguments
    ///
    /// * `reader` - A reader positioned at the start of a trace header
    ///
    /// # Errors
    ///
    /// Returns an error if reading fails or data is invalid
    pub fn from_reader<R: Read>(reader: R, byte_order: ByteOrder) -> io::Result<Self> {
        Self::from_reader_with_order(reader, byte_order)
    }

    pub(crate) fn from_reader_with_order<R: Read>(
        mut reader: R,
        byte_order: ByteOrder,
    ) -> io::Result<Self> {
        let mut buffer = [0u8; Self::SIZE];
        reader.read_exact(&mut buffer)?;

        // num_samples is at bytes 115-116 (0-indexed 114-116)
        let num_samples = match byte_order {
            ByteOrder::BigEndian => BigEndian::read_i16(&buffer[114..116]),
            ByteOrder::LittleEndian => LittleEndian::read_i16(&buffer[114..116]),
        };

        // sample_interval_us is at bytes 117-118 (0-indexed 116-118)
        let sample_interval_us = match byte_order {
            ByteOrder::BigEndian => BigEndian::read_i16(&buffer[116..118]),
            ByteOrder::LittleEndian => LittleEndian::read_i16(&buffer[116..118]),
        };

        Ok(Self {
            num_samples,
            sample_interval_us,
            unassigned: buffer.to_vec(),
        })
    }
}

/// Complete trace block: header + data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceBlock {
    /// Trace header
    pub header: TraceHeader,

    /// Trace data samples
    pub data: TraceData,

    /// Raw trace header bytes (240 bytes) for spec-driven parsing
    #[serde(skip)]
    pub header_bytes: Vec<u8>,
}

impl TraceBlock {
    /// Create a new trace block
    pub fn new(header: TraceHeader, data: TraceData) -> Self {
        let header_bytes = header.unassigned.clone();
        Self {
            header,
            data,
            header_bytes,
        }
    }

    /// Parse a complete trace block from a reader
    ///
    /// # Arguments
    ///
    /// * `reader` - Reader positioned at the start of a trace block
    /// * `sample_format` - The data sample format from the binary header
    /// * `num_samples` - Number of samples (can override header value)
    /// * `byte_order` - Byte order for reading header values
    pub fn from_reader<R: Read>(
        reader: &mut R,
        sample_format: super::binary_header::DataSampleFormat,
        num_samples: Option<i16>,
        byte_order: ByteOrder,
    ) -> io::Result<Self> {
        // First read raw header bytes
        let mut header_bytes = vec![0u8; 240];
        reader.read_exact(&mut header_bytes)?;

        // num_samples is at bytes 115-116 (0-indexed 114-116)
        let header =
            TraceHeader::from_reader_with_order(std::io::Cursor::new(&header_bytes), byte_order)?;
        let samples = num_samples.unwrap_or(header.num_samples);
        let data = TraceData::from_reader(&mut *reader, sample_format, samples as usize)?;

        Ok(Self {
            header,
            data,
            header_bytes,
        })
    }

    /// Downsample the trace to a maximum number of samples, updating the header.
    pub fn downsample(mut self, max_samples: usize) -> Self {
        if max_samples == 0 {
            return self;
        }

        let data = self.data.downsample(max_samples);
        self.header.num_samples = data.len() as i16;
        self.data = data;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::segy::DataSampleFormat;
    use std::io::Cursor;

    #[test]
    fn test_read_valid_trace_header() {
        // Generate 240 bytes with known values
        let mut buf = vec![0u8; TraceHeader::SIZE];
        // num_samples at bytes 114-115
        buf[114..116].copy_from_slice(&100i16.to_be_bytes());
        // sample_interval_us at bytes 116-117
        buf[116..118].copy_from_slice(&4000i16.to_be_bytes());

        let header =
            TraceHeader::from_reader_with_order(Cursor::new(buf), ByteOrder::BigEndian).unwrap();

        assert_eq!(header.num_samples, 100);
        assert_eq!(header.sample_interval_us, 4000);
    }

    #[test]
    fn test_read_truncated_trace_header() {
        let truncated = vec![0u8; 120]; // Half of 240
        let result =
            TraceHeader::from_reader_with_order(Cursor::new(truncated), ByteOrder::BigEndian);
        assert!(result.is_err());
    }

    #[test]
    fn test_read_trace_header_from_fixture() {
        use crate::segy::fixtures::create_minimal_segy_file;

        let file = create_minimal_segy_file(1, 100, 1);
        // Skip textual (3200) + binary (400) = 3600
        let trace_header_bytes = &file.bytes[3600..3840];
        let header = TraceHeader::from_reader_with_order(
            Cursor::new(trace_header_bytes),
            ByteOrder::BigEndian,
        )
        .unwrap();

        assert_eq!(header.num_samples, 100);
        assert_eq!(header.sample_interval_us, 4000);
    }

    #[test]
    fn test_read_empty_trace_header() {
        let empty: Vec<u8> = vec![];
        let result = TraceHeader::from_reader_with_order(Cursor::new(empty), ByteOrder::BigEndian);
        assert!(result.is_err());
    }

    #[test]
    fn test_default_trace_header() {
        let header = TraceHeader::default();
        assert_eq!(header.num_samples, 0);
        assert_eq!(header.sample_interval_us, 1000);
        assert_eq!(header.unassigned.len(), TraceHeader::SIZE);
    }

    #[test]
    fn test_trace_block_from_reader() {
        use crate::segy::fixtures::create_minimal_segy_file;

        let file = create_minimal_segy_file(1, 10, 5);
        // Skip textual (3200) + binary (400) = 3600
        let trace_data = &file.bytes[3600..];
        let block = TraceBlock::from_reader(
            &mut Cursor::new(trace_data),
            DataSampleFormat::IeeeFloat32,
            None,
            ByteOrder::BigEndian,
        )
        .unwrap();

        assert_eq!(block.header.num_samples, 10);
        assert_eq!(block.data.len(), 10);
    }

    #[test]
    fn test_trace_block_downsample() {
        let data = TraceData::IeeeFloat32((0..100).map(|i| i as f32).collect());
        let header = TraceHeader::default();
        let block = TraceBlock::new(header, data);

        let downsampled = block.downsample(10);
        assert_eq!(downsampled.data.len(), 10);
        assert_eq!(downsampled.header.num_samples, 10);
    }
}
