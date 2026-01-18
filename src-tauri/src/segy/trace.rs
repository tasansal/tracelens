//! SEG-Y Trace structures
//!
//! A trace consists of a 240-byte header followed by trace data samples.

use byteorder::{BigEndian, LittleEndian, ReadBytesExt};
use serde::{Deserialize, Serialize};
use std::io::{self, Read};

use super::binary_header::ByteOrder;
use super::trace_data::TraceData;

/// Trace identification code
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(i16)]
pub enum TraceIdentificationCode {
    /// Seismic data
    SeismicData = 1,
    /// Dead trace
    Dead = 2,
    /// Dummy trace
    Dummy = 3,
    /// Time break
    TimeBreak = 4,
    /// Uphole
    Uphole = 5,
    /// Sweep
    Sweep = 6,
    /// Timing
    Timing = 7,
    /// Water break
    WaterBreak = 8,
    /// Optional use (9-32767)
    Optional(i16),
}

impl TraceIdentificationCode {
    pub fn from_code(code: i16) -> Self {
        match code {
            1 => Self::SeismicData,
            2 => Self::Dead,
            3 => Self::Dummy,
            4 => Self::TimeBreak,
            5 => Self::Uphole,
            6 => Self::Sweep,
            7 => Self::Timing,
            8 => Self::WaterBreak,
            n @ 9..=32767 => Self::Optional(n),
            _ => Self::SeismicData, // Default to seismic data for invalid codes
        }
    }
}

/// Coordinate units
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(i16)]
pub enum CoordinateUnits {
    /// Unknown or not specified
    Unknown = 0,
    /// Length (meters or feet)
    Length = 1,
    /// Seconds of arc (latitude/longitude)
    SecondsOfArc = 2,
}

impl CoordinateUnits {
    pub fn from_code(code: i16) -> Result<Self, String> {
        match code {
            0 => Ok(Self::Unknown),
            1 => Ok(Self::Length),
            2 => Ok(Self::SecondsOfArc),
            _ => Err(format!("Invalid coordinate units code: {}", code)),
        }
    }
}

/// Trace header containing metadata for a single trace
///
/// The trace header is 240 bytes and precedes the trace data samples.
/// All values are in big-endian byte order with two's complement representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceHeader {
    /// Trace sequence number within line (bytes 1-4)
    pub trace_seq_line: i32,

    /// Trace sequence number within reel (bytes 5-8)
    pub trace_seq_reel: i32,

    /// Original field record number (bytes 9-12)
    pub field_record_number: i32,

    /// Trace number within original field record (bytes 13-16)
    pub trace_number: i32,

    /// Energy source point number (bytes 17-20)
    pub source_point_number: i32,

    /// CDP ensemble number (bytes 21-24)
    pub cdp_ensemble_number: i32,

    /// Trace number within CDP ensemble (bytes 25-28)
    pub trace_number_in_ensemble: i32,

    /// Trace identification code (bytes 29-30)
    pub trace_id_code: TraceIdentificationCode,

    /// Number of vertically summed traces (bytes 31-32)
    pub num_vert_summed: i16,

    /// Number of horizontally stacked traces (bytes 33-34)
    pub num_horz_stacked: i16,

    /// Data use: 1=production, 2=test (bytes 35-36)
    pub data_use: i16,

    /// Distance from source to receiver group (bytes 37-40)
    pub source_to_group_distance: i32,

    /// Receiver group elevation (bytes 41-44)
    pub receiver_elevation: i32,

    /// Surface elevation at source (bytes 45-48)
    pub surface_elevation_at_source: i32,

    /// Source depth below surface (bytes 49-52)
    pub source_depth: i32,

    /// Datum elevation at receiver group (bytes 53-56)
    pub datum_elevation_at_receiver: i32,

    /// Datum elevation at source (bytes 57-60)
    pub datum_elevation_at_source: i32,

    /// Water depth at source (bytes 61-64)
    pub water_depth_at_source: i32,

    /// Water depth at receiver group (bytes 65-68)
    pub water_depth_at_receiver: i32,

    /// Scaler for elevations and depths (bytes 69-70)
    pub elevation_scaler: i16,

    /// Scaler for coordinates (bytes 71-72)
    pub coordinate_scaler: i16,

    /// Source coordinate X (bytes 73-76)
    pub source_x: i32,

    /// Source coordinate Y (bytes 77-80)
    pub source_y: i32,

    /// Group coordinate X (bytes 81-84)
    pub group_x: i32,

    /// Group coordinate Y (bytes 85-88)
    pub group_y: i32,

    /// Coordinate units (bytes 89-90)
    pub coordinate_units: CoordinateUnits,

    /// Weathering velocity (bytes 91-92)
    pub weathering_velocity: i16,

    /// Subweathering velocity (bytes 93-94)
    pub subweathering_velocity: i16,

    /// Uphole time at source in ms (bytes 95-96)
    pub uphole_time_at_source: i16,

    /// Uphole time at group in ms (bytes 97-98)
    pub uphole_time_at_group: i16,

    /// Source static correction in ms (bytes 99-100)
    pub source_static_correction: i16,

    /// Group static correction in ms (bytes 101-102)
    pub group_static_correction: i16,

    /// Total static applied in ms (bytes 103-104)
    pub total_static: i16,

    /// Lag time A in ms (bytes 105-106)
    pub lag_time_a: i16,

    /// Lag time B in ms (bytes 107-108)
    pub lag_time_b: i16,

    /// Delay recording time in ms (bytes 109-110)
    pub delay_recording_time: i16,

    /// Mute time start in ms (bytes 111-112)
    pub mute_time_start: i16,

    /// Mute time end in ms (bytes 113-114)
    pub mute_time_end: i16,

    /// Number of samples in this trace (bytes 115-116)
    pub num_samples: i16,

    /// Sample interval in microseconds for this trace (bytes 117-118)
    pub sample_interval_us: i16,

    /// Gain type of field instruments (bytes 119-120)
    pub gain_type: i16,

    /// Instrument gain constant (bytes 121-122)
    pub instrument_gain_constant: i16,

    /// Instrument early/initial gain in dB (bytes 123-124)
    pub instrument_initial_gain: i16,

    /// Correlated: 1=no, 2=yes (bytes 125-126)
    pub correlated: i16,

    /// Sweep frequency at start in Hz (bytes 127-128)
    pub sweep_freq_start: i16,

    /// Sweep frequency at end in Hz (bytes 129-130)
    pub sweep_freq_end: i16,

    /// Sweep length in ms (bytes 131-132)
    pub sweep_length_ms: i16,

    /// Sweep type (bytes 133-134)
    pub sweep_type: i16,

    /// Sweep trace taper length at start in ms (bytes 135-136)
    pub sweep_taper_start_ms: i16,

    /// Sweep trace taper length at end in ms (bytes 137-138)
    pub sweep_taper_end_ms: i16,

    /// Taper type (bytes 139-140)
    pub taper_type: i16,

    /// Alias filter frequency in Hz (bytes 141-142)
    pub alias_filter_freq: i16,

    /// Alias filter slope in dB/octave (bytes 143-144)
    pub alias_filter_slope: i16,

    /// Notch filter frequency in Hz (bytes 145-146)
    pub notch_filter_freq: i16,

    /// Notch filter slope in dB/octave (bytes 147-148)
    pub notch_filter_slope: i16,

    /// Low cut frequency in Hz (bytes 149-150)
    pub low_cut_freq: i16,

    /// High cut frequency in Hz (bytes 151-152)
    pub high_cut_freq: i16,

    /// Low cut slope in dB/octave (bytes 153-154)
    pub low_cut_slope: i16,

    /// High cut slope in dB/octave (bytes 155-156)
    pub high_cut_slope: i16,

    /// Year data recorded (bytes 157-158)
    pub year: i16,

    /// Day of year (bytes 159-160)
    pub day_of_year: i16,

    /// Hour of day (bytes 161-162)
    pub hour: i16,

    /// Minute of hour (bytes 163-164)
    pub minute: i16,

    /// Second of minute (bytes 165-166)
    pub second: i16,

    /// Time basis code: 1=local, 2=GMT, 3=other (bytes 167-168)
    pub time_basis_code: i16,

    /// Trace weighting factor (bytes 169-170)
    pub trace_weighting_factor: i16,

    /// Geophone group number of roll switch position one (bytes 171-172)
    pub geophone_group_num_roll_pos1: i16,

    /// Geophone group number of first trace (bytes 173-174)
    pub geophone_group_num_first_trace: i16,

    /// Geophone group number of last trace (bytes 175-176)
    pub geophone_group_num_last_trace: i16,

    /// Gap size (bytes 177-178)
    pub gap_size: i16,

    /// Overtravel code: 1=down/behind, 2=up/ahead (bytes 179-180)
    pub overtravel: i16,

    /// Unassigned bytes (181-240)
    pub unassigned: Vec<u8>,
}

impl TraceHeader {
    /// Size of the trace header in bytes
    pub const SIZE: usize = 240;

    /// Parse a trace header from a reader
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

    fn from_reader_with_order<R: Read>(mut reader: R, byte_order: ByteOrder) -> io::Result<Self> {
        // Helper macros for reading with byte order
        macro_rules! read_i32 {
            ($reader:expr) => {
                match byte_order {
                    ByteOrder::BigEndian => $reader.read_i32::<BigEndian>()?,
                    ByteOrder::LittleEndian => $reader.read_i32::<LittleEndian>()?,
                }
            };
        }

        macro_rules! read_i16 {
            ($reader:expr) => {
                match byte_order {
                    ByteOrder::BigEndian => $reader.read_i16::<BigEndian>()?,
                    ByteOrder::LittleEndian => $reader.read_i16::<LittleEndian>()?,
                }
            };
        }
        let trace_seq_line = read_i32!(reader);
        let trace_seq_reel = read_i32!(reader);
        let field_record_number = read_i32!(reader);
        let trace_number = read_i32!(reader);
        let source_point_number = read_i32!(reader);
        let cdp_ensemble_number = read_i32!(reader);
        let trace_number_in_ensemble = read_i32!(reader);

        let trace_id_code = TraceIdentificationCode::from_code(read_i16!(reader));

        let num_vert_summed = read_i16!(reader);
        let num_horz_stacked = read_i16!(reader);
        let data_use = read_i16!(reader);
        let source_to_group_distance = read_i32!(reader);
        let receiver_elevation = read_i32!(reader);
        let surface_elevation_at_source = read_i32!(reader);
        let source_depth = read_i32!(reader);
        let datum_elevation_at_receiver = read_i32!(reader);
        let datum_elevation_at_source = read_i32!(reader);
        let water_depth_at_source = read_i32!(reader);
        let water_depth_at_receiver = read_i32!(reader);
        let elevation_scaler = read_i16!(reader);
        let coordinate_scaler = read_i16!(reader);
        let source_x = read_i32!(reader);
        let source_y = read_i32!(reader);
        let group_x = read_i32!(reader);
        let group_y = read_i32!(reader);

        let coord_units_code = read_i16!(reader);
        let coordinate_units = CoordinateUnits::from_code(coord_units_code)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let weathering_velocity = read_i16!(reader);
        let subweathering_velocity = read_i16!(reader);
        let uphole_time_at_source = read_i16!(reader);
        let uphole_time_at_group = read_i16!(reader);
        let source_static_correction = read_i16!(reader);
        let group_static_correction = read_i16!(reader);
        let total_static = read_i16!(reader);
        let lag_time_a = read_i16!(reader);
        let lag_time_b = read_i16!(reader);
        let delay_recording_time = read_i16!(reader);
        let mute_time_start = read_i16!(reader);
        let mute_time_end = read_i16!(reader);
        let num_samples = read_i16!(reader);
        let sample_interval_us = read_i16!(reader);
        let gain_type = read_i16!(reader);
        let instrument_gain_constant = read_i16!(reader);
        let instrument_initial_gain = read_i16!(reader);
        let correlated = read_i16!(reader);
        let sweep_freq_start = read_i16!(reader);
        let sweep_freq_end = read_i16!(reader);
        let sweep_length_ms = read_i16!(reader);
        let sweep_type = read_i16!(reader);
        let sweep_taper_start_ms = read_i16!(reader);
        let sweep_taper_end_ms = read_i16!(reader);
        let taper_type = read_i16!(reader);
        let alias_filter_freq = read_i16!(reader);
        let alias_filter_slope = read_i16!(reader);
        let notch_filter_freq = read_i16!(reader);
        let notch_filter_slope = read_i16!(reader);
        let low_cut_freq = read_i16!(reader);
        let high_cut_freq = read_i16!(reader);
        let low_cut_slope = read_i16!(reader);
        let high_cut_slope = read_i16!(reader);
        let year = read_i16!(reader);
        let day_of_year = read_i16!(reader);
        let hour = read_i16!(reader);
        let minute = read_i16!(reader);
        let second = read_i16!(reader);
        let time_basis_code = read_i16!(reader);
        let trace_weighting_factor = read_i16!(reader);
        let geophone_group_num_roll_pos1 = read_i16!(reader);
        let geophone_group_num_first_trace = read_i16!(reader);
        let geophone_group_num_last_trace = read_i16!(reader);
        let gap_size = read_i16!(reader);
        let overtravel = read_i16!(reader);

        // Read unassigned bytes (181-240 = 60 bytes)
        let bytes_read = 180;
        let unassigned_size = Self::SIZE - bytes_read;
        let mut unassigned = vec![0u8; unassigned_size];
        reader.read_exact(&mut unassigned)?;

        Ok(Self {
            trace_seq_line,
            trace_seq_reel,
            field_record_number,
            trace_number,
            source_point_number,
            cdp_ensemble_number,
            trace_number_in_ensemble,
            trace_id_code,
            num_vert_summed,
            num_horz_stacked,
            data_use,
            source_to_group_distance,
            receiver_elevation,
            surface_elevation_at_source,
            source_depth,
            datum_elevation_at_receiver,
            datum_elevation_at_source,
            water_depth_at_source,
            water_depth_at_receiver,
            elevation_scaler,
            coordinate_scaler,
            source_x,
            source_y,
            group_x,
            group_y,
            coordinate_units,
            weathering_velocity,
            subweathering_velocity,
            uphole_time_at_source,
            uphole_time_at_group,
            source_static_correction,
            group_static_correction,
            total_static,
            lag_time_a,
            lag_time_b,
            delay_recording_time,
            mute_time_start,
            mute_time_end,
            num_samples,
            sample_interval_us,
            gain_type,
            instrument_gain_constant,
            instrument_initial_gain,
            correlated,
            sweep_freq_start,
            sweep_freq_end,
            sweep_length_ms,
            sweep_type,
            sweep_taper_start_ms,
            sweep_taper_end_ms,
            taper_type,
            alias_filter_freq,
            alias_filter_slope,
            notch_filter_freq,
            notch_filter_slope,
            low_cut_freq,
            high_cut_freq,
            low_cut_slope,
            high_cut_slope,
            year,
            day_of_year,
            hour,
            minute,
            second,
            time_basis_code,
            trace_weighting_factor,
            geophone_group_num_roll_pos1,
            geophone_group_num_first_trace,
            geophone_group_num_last_trace,
            gap_size,
            overtravel,
            unassigned,
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
}

impl TraceBlock {
    /// Create a new trace block
    pub fn new(header: TraceHeader, data: TraceData) -> Self {
        Self { header, data }
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
        sample_format: crate::segy::binary_header::DataSampleFormat,
        num_samples: Option<i16>,
        byte_order: ByteOrder,
    ) -> io::Result<Self> {
        let header = TraceHeader::from_reader(&mut *reader, byte_order)?;
        let samples = num_samples.unwrap_or(header.num_samples);
        let data = TraceData::from_reader(&mut *reader, sample_format, samples as usize)?;

        Ok(Self { header, data })
    }

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
