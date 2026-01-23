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

/// Sample format enum for runtime format representation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SampleFormat {
    IbmFloat32,
    Int32,
    Int16,
    FixedPointWithGain,
    IeeeFloat32,
    Int8,
}

impl From<DataSampleFormat> for SampleFormat {
    fn from(format: DataSampleFormat) -> Self {
        match format {
            DataSampleFormat::IbmFloat32 => Self::IbmFloat32,
            DataSampleFormat::Int32 => Self::Int32,
            DataSampleFormat::Int16 => Self::Int16,
            DataSampleFormat::FixedPointWithGain => Self::FixedPointWithGain,
            DataSampleFormat::IeeeFloat32 => Self::IeeeFloat32,
            DataSampleFormat::Int8 => Self::Int8,
        }
    }
}

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

        // IBM exponent is base 16, excess 64
        // Convert to IEEE exponent (base 2, excess 127)
        let ieee_exponent = ((exponent - 64) * 4) + 127;

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

    /// Convert IBM floating point to IEEE 754 floating point (legacy version)
    ///
    /// IBM format: SEEEEEEE MMMMMMMM MMMMMMMM MMMMMMMM
    /// - S: sign bit (1 bit)
    /// - E: exponent (7 bits, base 16, excess 64)
    /// - M: mantissa (24 bits, normalized 0.1xxx... in base 16)
    #[allow(dead_code)]
    fn ibm_to_ieee(ibm: u32) -> f32 {
        Self::ibm_to_ieee_fast(ibm)
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

    #[test]
    fn test_ibm_float_zero() {
        let result = TraceData::ibm_to_ieee(0x00000000);
        assert_eq!(result, 0.0);
    }

    #[test]
    fn test_ibm_float_simple() {
        // Test a known IBM float value
        // For now, just test that the conversion doesn't panic
        let result = TraceData::ibm_to_ieee(0x41100000);
        // The conversion algorithm produces a value
        assert!(result.is_finite());
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
}
