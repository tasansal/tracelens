//! SEG-Y Binary Header (400 bytes)
//!
//! The binary header contains machine-readable information about the entire reel/file.
//! Standard SEG-Y uses big-endian byte order, but some files may use little-endian.
//! Endianness is automatically detected by checking if header values are reasonable.

use byteorder::{BigEndian, ByteOrder as ByteOrderTrait, LittleEndian, ReadBytesExt};
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

/// Trace sorting code
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(i16)]
pub enum TraceSortingCode {
    /// Unknown or not specified
    Unknown = 0,
    /// As recorded (no sorting)
    AsRecorded = 1,
    /// CDP ensemble
    CdpEnsemble = 2,
    /// Single fold continuous profile
    SingleFold = 3,
    /// Horizontally stacked
    HorizontallyStacked = 4,
}

impl TraceSortingCode {
    /// Parse from a raw SEG-Y sorting code.
    pub fn from_code(code: i16) -> Result<Self, String> {
        match code {
            0 => Ok(Self::Unknown),
            1 => Ok(Self::AsRecorded),
            2 => Ok(Self::CdpEnsemble),
            3 => Ok(Self::SingleFold),
            4 => Ok(Self::HorizontallyStacked),
            _ => Err(format!("Invalid trace sorting code: {}", code)),
        }
    }
}

/// Measurement system code
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(i16)]
pub enum MeasurementSystem {
    /// Unknown or not specified
    Unknown = 0,
    /// Meters
    Meters = 1,
    /// Feet
    Feet = 2,
}

impl MeasurementSystem {
    /// Parse from a raw SEG-Y measurement system code.
    pub fn from_code(code: i16) -> Result<Self, String> {
        match code {
            0 => Ok(Self::Unknown),
            1 => Ok(Self::Meters),
            2 => Ok(Self::Feet),
            _ => Err(format!("Invalid measurement system code: {}", code)),
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

    /// Job identification number (bytes 3201-3204)
    pub job_id: i32,

    /// Line number - only one line per reel (bytes 3205-3208)
    pub line_number: i32,

    /// Reel number (bytes 3209-3212)
    pub reel_number: i32,

    /// Number of data traces per record (bytes 3213-3214)
    pub traces_per_record: i16,

    /// Number of auxiliary traces per record (bytes 3215-3216)
    pub aux_traces_per_record: i16,

    /// Sample interval in microseconds for this reel (bytes 3217-3218)
    pub sample_interval_us: i16,

    /// Sample interval in microseconds for original field recording (bytes 3219-3220)
    pub original_sample_interval_us: i16,

    /// Number of samples per data trace for this reel (bytes 3221-3222)
    pub samples_per_trace: i16,

    /// Number of samples per data trace for original field recording (bytes 3223-3224)
    pub original_samples_per_trace: i16,

    /// Data sample format code (bytes 3225-3226)
    pub data_sample_format: DataSampleFormat,

    /// CDP fold - expected number of traces per CDP ensemble (bytes 3227-3228)
    pub cdp_fold: i16,

    /// Trace sorting code (bytes 3229-3230)
    pub trace_sorting: TraceSortingCode,

    /// Vertical sum code: 1=no sum, 2=two sum, N=N sum (bytes 3231-3232)
    pub vertical_sum_code: i16,

    /// Sweep frequency at start in Hz (bytes 3233-3234)
    pub sweep_freq_start: i16,

    /// Sweep frequency at end in Hz (bytes 3235-3236)
    pub sweep_freq_end: i16,

    /// Sweep length in milliseconds (bytes 3237-3238)
    pub sweep_length_ms: i16,

    /// Sweep type code (bytes 3239-3240)
    pub sweep_type: i16,

    /// Trace number of sweep channel (bytes 3241-3242)
    pub sweep_channel: i16,

    /// Sweep trace taper length at start in ms (bytes 3243-3244)
    pub sweep_taper_start_ms: i16,

    /// Sweep trace taper length at end in ms (bytes 3245-3246)
    pub sweep_taper_end_ms: i16,

    /// Taper type (bytes 3247-3248)
    pub taper_type: i16,

    /// Correlated data traces: 1=no, 2=yes (bytes 3249-3250)
    pub correlated: i16,

    /// Binary gain recovered: 1=yes, 2=no (bytes 3251-3252)
    pub binary_gain_recovered: i16,

    /// Amplitude recovery method (bytes 3253-3254)
    pub amplitude_recovery_method: i16,

    /// Measurement system (bytes 3255-3256)
    pub measurement_system: MeasurementSystem,

    /// Impulse signal polarity (bytes 3257-3258)
    pub impulse_polarity: i16,

    /// Vibratory polarity code (bytes 3259-3260)
    pub vibratory_polarity: i16,

    /// SEG-Y revision number (bytes 3501-3502)
    pub segy_revision: u16,

    /// Fixed length trace flag (bytes 3503-3504)
    pub fixed_length_trace_flag: i16,

    /// Number of extended textual headers (bytes 3505-3506)
    pub extended_textual_headers: i16,

    /// Unassigned bytes (3261-3500 and 3507-3600)
    pub unassigned: Vec<u8>,
}

/// Byte order for reading binary data
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Endianness {
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
    fn from_reader_with_endianness<R: Read>(
        mut reader: R,
        endianness: Endianness,
    ) -> io::Result<Self> {
        // Helper macro to read with detected endianness
        macro_rules! read_i32 {
            ($reader:expr) => {
                match endianness {
                    Endianness::Big => $reader.read_i32::<BigEndian>()?,
                    Endianness::Little => $reader.read_i32::<LittleEndian>()?,
                }
            };
        }

        macro_rules! read_i16 {
            ($reader:expr) => {
                match endianness {
                    Endianness::Big => $reader.read_i16::<BigEndian>()?,
                    Endianness::Little => $reader.read_i16::<LittleEndian>()?,
                }
            };
        }

        macro_rules! read_u16 {
            ($reader:expr) => {
                match endianness {
                    Endianness::Big => $reader.read_u16::<BigEndian>()?,
                    Endianness::Little => $reader.read_u16::<LittleEndian>()?,
                }
            };
        }

        let job_id = read_i32!(reader);
        let line_number = read_i32!(reader);
        let reel_number = read_i32!(reader);
        let traces_per_record = read_i16!(reader);
        let aux_traces_per_record = read_i16!(reader);
        let sample_interval_us = read_i16!(reader);
        let original_sample_interval_us = read_i16!(reader);
        let samples_per_trace = read_i16!(reader);
        let original_samples_per_trace = read_i16!(reader);

        let format_code = read_i16!(reader);
        let data_sample_format = DataSampleFormat::from_code(format_code)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let cdp_fold = read_i16!(reader);

        let sorting_code = read_i16!(reader);
        let trace_sorting = TraceSortingCode::from_code(sorting_code)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let vertical_sum_code = read_i16!(reader);
        let sweep_freq_start = read_i16!(reader);
        let sweep_freq_end = read_i16!(reader);
        let sweep_length_ms = read_i16!(reader);
        let sweep_type = read_i16!(reader);
        let sweep_channel = read_i16!(reader);
        let sweep_taper_start_ms = read_i16!(reader);
        let sweep_taper_end_ms = read_i16!(reader);
        let taper_type = read_i16!(reader);
        let correlated = read_i16!(reader);
        let binary_gain_recovered = read_i16!(reader);
        let amplitude_recovery_method = read_i16!(reader);

        let measurement_code = read_i16!(reader);
        let measurement_system = MeasurementSystem::from_code(measurement_code)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let impulse_polarity = read_i16!(reader);
        let vibratory_polarity = read_i16!(reader);

        // Read unassigned bytes (3261-3500 = 240 bytes).
        let mut unassigned = Vec::new();
        let mut unassigned_pre_revision = vec![0u8; 240];
        reader.read_exact(&mut unassigned_pre_revision)?;

        let segy_revision = read_u16!(reader);
        let fixed_length_trace_flag = read_i16!(reader);
        let extended_textual_headers = read_i16!(reader);

        // Read unassigned bytes (3507-3600 = 94 bytes).
        let mut unassigned_post_revision = vec![0u8; 94];
        reader.read_exact(&mut unassigned_post_revision)?;

        unassigned.extend_from_slice(&unassigned_pre_revision);
        unassigned.extend_from_slice(&unassigned_post_revision);

        let byte_order = match endianness {
            Endianness::Big => ByteOrder::BigEndian,
            Endianness::Little => ByteOrder::LittleEndian,
        };

        Ok(Self {
            byte_order,
            job_id,
            line_number,
            reel_number,
            traces_per_record,
            aux_traces_per_record,
            sample_interval_us,
            original_sample_interval_us,
            samples_per_trace,
            original_samples_per_trace,
            data_sample_format,
            cdp_fold,
            trace_sorting,
            vertical_sum_code,
            sweep_freq_start,
            sweep_freq_end,
            sweep_length_ms,
            sweep_type,
            sweep_channel,
            sweep_taper_start_ms,
            sweep_taper_end_ms,
            taper_type,
            correlated,
            binary_gain_recovered,
            amplitude_recovery_method,
            measurement_system,
            impulse_polarity,
            vibratory_polarity,
            segy_revision,
            fixed_length_trace_flag,
            extended_textual_headers,
            unassigned,
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
            job_id: 0,
            line_number: 0,
            reel_number: 0,
            traces_per_record: 0,
            aux_traces_per_record: 0,
            sample_interval_us: 1000,
            original_sample_interval_us: 1000,
            samples_per_trace: 0,
            original_samples_per_trace: 0,
            data_sample_format: DataSampleFormat::IbmFloat32,
            cdp_fold: 0,
            trace_sorting: TraceSortingCode::AsRecorded,
            vertical_sum_code: 1,
            sweep_freq_start: 0,
            sweep_freq_end: 0,
            sweep_length_ms: 0,
            sweep_type: 0,
            sweep_channel: 0,
            sweep_taper_start_ms: 0,
            sweep_taper_end_ms: 0,
            taper_type: 0,
            correlated: 1,
            binary_gain_recovered: 2,
            amplitude_recovery_method: 0,
            measurement_system: MeasurementSystem::Meters,
            impulse_polarity: 0,
            vibratory_polarity: 0,
            segy_revision: 0,
            fixed_length_trace_flag: 0,
            extended_textual_headers: 0,
            unassigned: vec![0u8; 334],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_data_sample_format_bytes() {
        assert_eq!(DataSampleFormat::IbmFloat32.bytes_per_sample(), 4);
        assert_eq!(DataSampleFormat::Int32.bytes_per_sample(), 4);
        assert_eq!(DataSampleFormat::Int16.bytes_per_sample(), 2);
        assert_eq!(DataSampleFormat::FixedPointWithGain.bytes_per_sample(), 4);
    }

    #[test]
    fn test_trace_block_size() {
        let header = BinaryHeader {
            samples_per_trace: 1000,
            data_sample_format: DataSampleFormat::IbmFloat32,
            ..Default::default()
        };

        assert_eq!(header.trace_block_size(), 240 + 1000 * 4);
    }
}
