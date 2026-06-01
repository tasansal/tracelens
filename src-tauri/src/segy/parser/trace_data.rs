//! SEG-Y Trace Data parsing
//!
//! Supports all data sample formats defined in SEG-Y:
//! - 32-bit IBM floating point
//! - 32-bit two's complement integer
//! - 16-bit two's complement integer
//! - 32-bit fixed point with gain
//! - 32-bit IEEE floating point
//! - 8-bit two's complement integer

use byteorder::{BigEndian, ReadBytesExt};
use serde::{Deserialize, Serialize};
use std::io::{self, Read};

use super::binary_header::DataSampleFormat;

/// Trace data samples in various formats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TraceData {
    /// 32-bit IBM floating point samples
    IbmFloat32(Vec<f32>),

    /// 32-bit two's complement integer samples
    Int32(Vec<i32>),

    /// 16-bit two's complement integer samples
    Int16(Vec<i16>),

    /// 32-bit fixed point with gain (obsolete format)
    /// Stored as (gain_code, value) pairs
    FixedPointWithGain(Vec<(u8, i16)>),

    /// 32-bit IEEE floating point samples
    IeeeFloat32(Vec<f32>),

    /// 8-bit two's complement integer samples
    Int8(Vec<i8>),
}

impl TraceData {
    /// Parse trace data from a reader based on the sample format
    ///
    /// # Arguments
    ///
    /// * `reader` - Reader positioned at the start of trace data
    /// * `format` - The data sample format
    /// * `num_samples` - Number of samples to read
    ///
    /// # Errors
    ///
    /// Returns an error if reading fails
    pub fn from_reader<R: Read>(
        reader: &mut R,
        format: DataSampleFormat,
        num_samples: usize,
    ) -> io::Result<Self> {
        match format {
            DataSampleFormat::IbmFloat32 => {
                let samples = Self::read_ibm_float32(reader, num_samples)?;
                Ok(Self::IbmFloat32(samples))
            }
            DataSampleFormat::Int32 => {
                let samples = Self::read_int32(reader, num_samples)?;
                Ok(Self::Int32(samples))
            }
            DataSampleFormat::Int16 => {
                let samples = Self::read_int16(reader, num_samples)?;
                Ok(Self::Int16(samples))
            }
            DataSampleFormat::FixedPointWithGain => {
                let samples = Self::read_fixed_point_with_gain(reader, num_samples)?;
                Ok(Self::FixedPointWithGain(samples))
            }
            DataSampleFormat::IeeeFloat32 => {
                let samples = Self::read_ieee_float32(reader, num_samples)?;
                Ok(Self::IeeeFloat32(samples))
            }
            DataSampleFormat::Int8 => {
                let samples = Self::read_int8(reader, num_samples)?;
                Ok(Self::Int8(samples))
            }
        }
    }

    /// Read IBM 32-bit floating point samples
    ///
    /// IBM floating point format:
    /// - 1 bit sign (S)
    /// - 7 bits characteristic (C) - power of 16 in excess-64 notation
    /// - 24 bits fraction (F) - 6 hexadecimal digits
    ///
    /// Value = S × 16^(C-64) × F
    ///
    /// Optimized with batch reading and vectorized conversion
    fn read_ibm_float32<R: Read>(reader: &mut R, count: usize) -> io::Result<Vec<f32>> {
        // Batch read all bytes at once (major optimization)
        let byte_count = count * 4;
        let mut raw_bytes = vec![0u8; byte_count];
        reader.read_exact(&mut raw_bytes)?;

        // Convert using iterator - compiler optimizes this well
        let samples = raw_bytes
            .chunks_exact(4)
            .map(|chunk| {
                let raw = u32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                Self::ibm_to_ieee_fast(raw)
            })
            .collect();

        Ok(samples)
    }

    /// Convert IBM floating point to IEEE 754 floating point (optimized version)
    ///
    /// IBM format: SEEEEEEE MMMMMMMM MMMMMMMM MMMMMMMM
    /// - S: sign bit (1 bit)
    /// - E: exponent (7 bits, base 16, excess 64)
    /// - M: mantissa (24 bits, normalized 0.1xxx... in base 16)
    ///
    /// Optimized with inlining - uses proven algorithm with better performance
    #[inline(always)]
    fn ibm_to_ieee_fast(ibm: u32) -> f32 {
        // Fast path for zero
        if ibm == 0 {
            return 0.0;
        }

        // Extract IBM components
        let sign = (ibm >> 31) & 0x1;
        let exponent = ((ibm >> 24) & 0x7F) as i32;
        let mantissa = ibm & 0x00FFFFFF;

        // IBM exponent is base 16, excess 64; the 24-bit mantissa is a fraction
        // with weight 2^-24. Converting to a normalized IEEE 1.f mantissa moves
        // one factor of two into the exponent, so the bias is 126 (not 127);
        // using 127 yields values that are exactly 2x too large.
        let ieee_exponent = ((exponent - 64) * 4) + 126;

        // Normalize mantissa
        // IBM mantissa has implicit radix point: 0.MMMMMM (base 16)
        // Need to shift to get 1.MMMMMM (base 2) for IEEE
        let mut ieee_mantissa = mantissa;
        let mut ieee_exp = ieee_exponent;

        // Find the first set bit in mantissa to normalize
        if ieee_mantissa != 0 {
            while (ieee_mantissa & 0x00800000) == 0 {
                ieee_mantissa <<= 1;
                ieee_exp -= 1;
            }
            // Remove the implicit leading 1
            ieee_mantissa &= 0x007FFFFF;
        }

        // Handle underflow/overflow
        if ieee_exp <= 0 {
            return if sign == 1 { -0.0 } else { 0.0 };
        }
        if ieee_exp >= 255 {
            return if sign == 1 {
                f32::NEG_INFINITY
            } else {
                f32::INFINITY
            };
        }

        // Construct IEEE 754 float
        let ieee_bits = (sign << 31) | ((ieee_exp as u32) << 23) | ieee_mantissa;
        f32::from_bits(ieee_bits)
    }

    /// Read 32-bit two's complement integer samples (optimized with batch read)
    fn read_int32<R: Read>(reader: &mut R, count: usize) -> io::Result<Vec<i32>> {
        let byte_count = count * 4;
        let mut raw_bytes = vec![0u8; byte_count];
        reader.read_exact(&mut raw_bytes)?;

        let samples = raw_bytes
            .chunks_exact(4)
            .map(|chunk| i32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();

        Ok(samples)
    }

    /// Read 16-bit two's complement integer samples (optimized with batch read)
    fn read_int16<R: Read>(reader: &mut R, count: usize) -> io::Result<Vec<i16>> {
        let byte_count = count * 2;
        let mut raw_bytes = vec![0u8; byte_count];
        reader.read_exact(&mut raw_bytes)?;

        let samples = raw_bytes
            .chunks_exact(2)
            .map(|chunk| i16::from_be_bytes([chunk[0], chunk[1]]))
            .collect();

        Ok(samples)
    }

    /// Read IEEE 32-bit floating point samples (optimized with batch read)
    fn read_ieee_float32<R: Read>(reader: &mut R, count: usize) -> io::Result<Vec<f32>> {
        let byte_count = count * 4;
        let mut raw_bytes = vec![0u8; byte_count];
        reader.read_exact(&mut raw_bytes)?;

        let samples = raw_bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();

        Ok(samples)
    }

    /// Read 8-bit two's complement integer samples (optimized with batch read)
    fn read_int8<R: Read>(reader: &mut R, count: usize) -> io::Result<Vec<i8>> {
        let mut raw_bytes = vec![0u8; count];
        reader.read_exact(&mut raw_bytes)?;

        // i8 has same bit representation as u8, safe to transmute
        let samples = raw_bytes.into_iter().map(|b| b as i8).collect();

        Ok(samples)
    }

    /// Read 32-bit fixed point with gain samples
    ///
    /// Format (4 bytes):
    /// - Byte 1: all zeros
    /// - Byte 2: gain code (8 bits, 2^0 to 2^7)
    /// - Bytes 3-4: 16-bit two's complement data
    fn read_fixed_point_with_gain<R: Read>(
        reader: &mut R,
        count: usize,
    ) -> io::Result<Vec<(u8, i16)>> {
        let mut samples = Vec::with_capacity(count);

        for _ in 0..count {
            let _zeros = reader.read_u8()?; // First byte (should be zero)
            let gain = reader.read_u8()?; // Gain code
            let value = reader.read_i16::<BigEndian>()?; // Data value

            samples.push((gain, value));
        }

        Ok(samples)
    }

    /// Get the number of samples in this trace
    pub fn len(&self) -> usize {
        match self {
            Self::IbmFloat32(v) => v.len(),
            Self::Int32(v) => v.len(),
            Self::Int16(v) => v.len(),
            Self::FixedPointWithGain(v) => v.len(),
            Self::IeeeFloat32(v) => v.len(),
            Self::Int8(v) => v.len(),
        }
    }

    /// Check if trace data is empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Stream samples as `f32` regardless of the underlying storage format.
    ///
    /// Avoids the per-trace `Vec<f32>` allocation a "to_f32_vec" accessor would
    /// require — callers that just need to push, scan, or copy each value can
    /// do so in one pass.
    pub fn for_each_f32(&self, mut f: impl FnMut(f32)) {
        match self {
            Self::IbmFloat32(samples) | Self::IeeeFloat32(samples) => {
                samples.iter().copied().for_each(&mut f);
            }
            Self::Int32(samples) => samples.iter().for_each(|&v| f(v as f32)),
            Self::Int16(samples) => samples.iter().for_each(|&v| f(v as f32)),
            Self::Int8(samples) => samples.iter().for_each(|&v| f(v as f32)),
            Self::FixedPointWithGain(samples) => samples
                .iter()
                .for_each(|&(gain, value)| f((value as f32) * 2.0_f32.powi(gain as i32))),
        }
    }

    /// First sample as `f32`, or `None` for an empty trace.
    pub fn first_f32(&self) -> Option<f32> {
        match self {
            Self::IbmFloat32(s) | Self::IeeeFloat32(s) => s.first().copied(),
            Self::Int32(s) => s.first().map(|&v| v as f32),
            Self::Int16(s) => s.first().map(|&v| v as f32),
            Self::Int8(s) => s.first().map(|&v| v as f32),
            Self::FixedPointWithGain(s) => s
                .first()
                .map(|&(gain, value)| (value as f32) * 2.0_f32.powi(gain as i32)),
        }
    }

    /// Downsample to a maximum number of samples, keeping relative spacing.
    pub fn downsample(self, max_samples: usize) -> Self {
        if max_samples == 0 {
            return self;
        }

        match self {
            Self::IbmFloat32(samples) => Self::IbmFloat32(downsample_vec(samples, max_samples)),
            Self::Int32(samples) => Self::Int32(downsample_vec(samples, max_samples)),
            Self::Int16(samples) => Self::Int16(downsample_vec(samples, max_samples)),
            Self::FixedPointWithGain(samples) => {
                Self::FixedPointWithGain(downsample_vec(samples, max_samples))
            }
            Self::IeeeFloat32(samples) => Self::IeeeFloat32(downsample_vec(samples, max_samples)),
            Self::Int8(samples) => Self::Int8(downsample_vec(samples, max_samples)),
        }
    }
}

/// Downsample a vector using a fixed stride derived from the target length.
fn downsample_vec<T>(samples: Vec<T>, max_samples: usize) -> Vec<T> {
    let len = samples.len();
    if len <= max_samples {
        return samples;
    }

    let stride = len.div_ceil(max_samples);
    let mut downsampled = Vec::with_capacity(len.div_ceil(stride));
    for (idx, sample) in samples.into_iter().enumerate() {
        if idx % stride == 0 {
            downsampled.push(sample);
        }
    }
    downsampled
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_ibm_float_zero() {
        let result = TraceData::ibm_to_ieee_fast(0x00000000);
        assert_eq!(result, 0.0);
    }

    #[test]
    fn test_ibm_float_simple() {
        // 0x41100000 is the canonical IBM-hex-float encoding of 1.0:
        // 16^(0x41-64) * (0x100000 / 2^24) = 16 * (1/16) = 1.0.
        let result = TraceData::ibm_to_ieee_fast(0x41100000);
        assert!((result - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_trace_data_len() {
        let data = TraceData::Int16(vec![1, 2, 3, 4, 5]);
        assert_eq!(data.len(), 5);
        assert!(!data.is_empty());
    }

    #[test]
    fn test_trace_data_downsample() {
        let data = TraceData::Int16(vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        let downsampled = data.downsample(4);
        match downsampled {
            TraceData::Int16(samples) => {
                assert_eq!(samples, vec![1, 4, 7, 10]);
            }
            _ => panic!("Unexpected trace data variant"),
        }
    }

    #[test]
    fn test_read_trace_data_ieee_float32() {
        let values: Vec<f32> = vec![
            0.0,
            1.0,
            -1.0,
            0.5,
            100.0,
            -50.5,
            std::f32::consts::PI,
            -2.72,
            42.0,
            0.001,
        ];
        let mut buf = Vec::new();
        for &v in &values {
            buf.extend_from_slice(&v.to_be_bytes());
        }

        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::IeeeFloat32, 10)
                .unwrap();

        match result {
            TraceData::IeeeFloat32(samples) => {
                assert_eq!(samples.len(), 10);
                for (actual, expected) in samples.iter().zip(values.iter()) {
                    assert!(
                        (actual - expected).abs() < 0.001,
                        "expected {}, got {}",
                        expected,
                        actual
                    );
                }
            }
            _ => panic!("Expected IeeeFloat32 variant"),
        }
    }

    #[test]
    fn test_read_trace_data_ibm_float32() {
        // Write known IBM float32 bytes and verify roundtrip conversion.
        // True IBM-hex-float values: value = 16^(exp-64) * (mantissa / 2^24).
        // 0x41100000 → 1.0, 0xC1100000 → -1.0, 0x42040000 → 4.0, 0x41A00000 → 10.0
        let ibm_values: Vec<u32> = vec![
            0x00000000, // 0.0
            0x41100000, // 1.0
            0xC1100000, // -1.0
            0x42040000, // 4.0
            0x41A00000, // 10.0
            0x00000000, // 0.0
            0x41100000, // 1.0
            0xC1100000, // -1.0
            0x00000000, // 0.0
            0x41100000, // 1.0
        ];

        let mut buf = Vec::new();
        for &v in &ibm_values {
            buf.extend_from_slice(&v.to_be_bytes());
        }

        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::IbmFloat32, 10)
                .unwrap();

        match result {
            TraceData::IbmFloat32(samples) => {
                assert_eq!(samples.len(), 10);
                // Verify known values from the conversion algorithm
                assert_eq!(samples[0], 0.0);
                assert!((samples[1] - 1.0).abs() < 0.01);
                assert!((samples[2] - (-1.0)).abs() < 0.01);
                assert!((samples[3] - 4.0).abs() < 0.01);
                assert!((samples[4] - 10.0).abs() < 0.01);
            }
            _ => panic!("Expected IbmFloat32 variant"),
        }
    }

    #[test]
    fn test_read_trace_data_int32() {
        let values: Vec<i32> = vec![0, 1, -1, 100, -50, 32767, -32768, 2147483647, -1000, 42];
        let mut buf = Vec::new();
        for &v in &values {
            buf.extend_from_slice(&v.to_be_bytes());
        }

        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::Int32, 10).unwrap();

        match result {
            TraceData::Int32(samples) => {
                assert_eq!(samples, values);
            }
            _ => panic!("Expected Int32 variant"),
        }
    }

    #[test]
    fn test_read_trace_data_int16() {
        let values: Vec<i16> = vec![0, 1, -1, 100, -50, 32767, -32768, 255, -1000, 42];
        let mut buf = Vec::new();
        for &v in &values {
            buf.extend_from_slice(&v.to_be_bytes());
        }

        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::Int16, 10).unwrap();

        match result {
            TraceData::Int16(samples) => {
                assert_eq!(samples, values);
            }
            _ => panic!("Expected Int16 variant"),
        }
    }

    #[test]
    fn test_read_trace_data_int8() {
        let values: Vec<i8> = vec![0, 1, -1, 100, -50, 127, -128, 64, -100, 42];
        let buf: Vec<u8> = values.iter().map(|&v| v as u8).collect();

        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::Int8, 10).unwrap();

        match result {
            TraceData::Int8(samples) => {
                assert_eq!(samples, values);
            }
            _ => panic!("Expected Int8 variant"),
        }
    }

    #[test]
    fn test_read_trace_data_invalid_format() {
        // Format code 99 is not valid — but DataSampleFormat::from_code returns Err
        // which gets converted to io::Error before from_reader is called.
        // We test this by using the enum directly with an impossible scenario.
        // Since the enum only has valid variants, we test via the error path
        // by providing too few bytes for a valid format (which is the closest
        // we can get to testing "invalid format" at this level).
        let buf = vec![0u8; 4];
        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::IeeeFloat32, 100);
        assert!(result.is_err());
    }

    #[test]
    fn test_read_trace_data_zero_samples() {
        let buf: Vec<u8> = vec![];
        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::IeeeFloat32, 0)
                .unwrap();

        match result {
            TraceData::IeeeFloat32(samples) => {
                assert!(samples.is_empty());
            }
            _ => panic!("Expected IeeeFloat32 variant"),
        }
    }

    #[test]
    fn test_read_trace_data_truncated() {
        // Provide only 4 bytes but request 10 f32 samples (need 40 bytes)
        let buf = vec![0u8; 4];
        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::IeeeFloat32, 10);
        assert!(result.is_err());
    }

    #[test]
    fn test_read_trace_data_empty_buffer() {
        let buf: Vec<u8> = vec![];
        let result =
            TraceData::from_reader(&mut Cursor::new(buf), DataSampleFormat::IeeeFloat32, 1);
        assert!(result.is_err());
    }

    #[test]
    fn test_read_trace_data_fixed_point_with_gain() {
        // Format: 1 byte zero + 1 byte gain + 2 bytes value = 4 bytes per sample
        let mut buf = Vec::new();
        // Sample 1: gain=0, value=100
        buf.push(0x00);
        buf.push(0x00);
        buf.extend_from_slice(&100i16.to_be_bytes());
        // Sample 2: gain=1, value=-50
        buf.push(0x00);
        buf.push(0x01);
        buf.extend_from_slice(&(-50i16).to_be_bytes());

        let result = TraceData::from_reader(
            &mut Cursor::new(buf),
            DataSampleFormat::FixedPointWithGain,
            2,
        )
        .unwrap();

        match result {
            TraceData::FixedPointWithGain(samples) => {
                assert_eq!(samples.len(), 2);
                assert_eq!(samples[0], (0, 100));
                assert_eq!(samples[1], (1, -50));
            }
            _ => panic!("Expected FixedPointWithGain variant"),
        }
    }

    #[test]
    fn test_trace_data_is_empty() {
        let data = TraceData::IeeeFloat32(vec![]);
        assert!(data.is_empty());

        let data = TraceData::Int8(vec![1]);
        assert!(!data.is_empty());
    }

}
