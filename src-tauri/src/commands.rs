use crate::error::AppError;
use crate::segy::{
    BinaryHeader, ByteOrder, HeaderFieldSpec, SegyFormatSpec, TextEncoding, TextualHeader,
    TraceBlock,
};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tokio::io::AsyncReadExt;

/// SEG-Y file data structure containing headers only (no traces loaded eagerly)
///
/// This structure is optimized for fast loading - traces are loaded on demand
/// using the load_single_trace command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegyData {
    /// Textual file header (3200 bytes EBCDIC converted to ASCII)
    pub textual_header: TextualHeader,

    /// Binary file header (400 bytes with metadata)
    pub binary_header: BinaryHeader,

    /// Total number of traces in file (if determinable)
    pub total_traces: Option<usize>,

    /// File size in bytes
    pub file_size: u64,

    /// Detected text encoding for textual header
    pub text_encoding: TextEncoding,

    /// Detected byte order for binary data
    pub byte_order: ByteOrder,
}

/// Load and parse a SEG-Y file asynchronously
///
/// Reads the file headers using buffered I/O for optimal performance with large files.
/// Supports SEG-Y Rev 0 format. Traces are loaded on-demand via load_single_trace.
///
/// # Arguments
/// * `file_path` - Absolute path to the SEG-Y file
///
/// # Returns
/// A Result containing the SegyData structure with headers only
///
/// # Errors
/// Returns AppError for:
/// - File not found or inaccessible (IoError)
/// - Invalid SEG-Y format (SegyError)
/// - Parsing failures (ParseError)
///
/// # Example TypeScript Usage
/// ```typescript
/// import { invoke } from '@tauri-apps/api/core';
///
/// try {
///   const segyData = await invoke('loadSegyFile', {
///     filePath: '/path/to/seismic.sgy'
///   });
///   console.log('Sample interval:', segyData.binary_header.sample_interval_us);
///   console.log('Traces loaded:', segyData.traces.length);
/// } catch (error) {
///   const appError = parseAppError(error);
///   console.error('Failed to load SEG-Y:', appError.message);
/// }
/// ```
#[tauri::command]
pub async fn load_segy_file(file_path: String) -> Result<SegyData, String> {
    // Validate file path
    if file_path.is_empty() {
        return Err(AppError::ValidationError {
            message: "File path cannot be empty".to_string(),
        }
        .into());
    }

    // Open file asynchronously
    let file = tokio::fs::File::open(&file_path)
        .await
        .map_err(|e| AppError::IoError {
            message: format!("Failed to open file '{}': {}", file_path, e),
        })?;

    // Get file metadata for size and validation
    let metadata = file.metadata().await.map_err(|e| AppError::IoError {
        message: format!("Failed to read file metadata: {}", e),
    })?;
    let file_size = metadata.len();

    // Minimum SEG-Y file size: 3200 (textual) + 400 (binary) = 3600 bytes
    const MIN_SEGY_SIZE: u64 = 3600;
    if file_size < MIN_SEGY_SIZE {
        return Err(AppError::SegyError {
            message: format!(
                "File too small to be valid SEG-Y ({}  bytes, minimum {} bytes)",
                file_size, MIN_SEGY_SIZE
            ),
        }
        .into());
    }

    // Use buffered reading with 64KB buffer for optimal I/O performance
    const BUFFER_SIZE: usize = 65536;
    let mut buffered_file = tokio::io::BufReader::with_capacity(BUFFER_SIZE, file);

    // Read textual header (3200 bytes)
    let mut textual_buffer = vec![0u8; TextualHeader::SIZE];
    buffered_file
        .read_exact(&mut textual_buffer)
        .await
        .map_err(|e| AppError::SegyError {
            message: format!("Failed to read textual header: {}", e),
        })?;

    let textual_header = TextualHeader::new(textual_buffer).map_err(|e| AppError::SegyError {
        message: format!("Invalid textual header: {}", e),
    })?;

    // Read binary header (400 bytes)
    let mut binary_buffer = vec![0u8; BinaryHeader::SIZE];
    buffered_file
        .read_exact(&mut binary_buffer)
        .await
        .map_err(|e| AppError::SegyError {
            message: format!("Failed to read binary header: {}", e),
        })?;

    let binary_header = BinaryHeader::from_reader(Cursor::new(&binary_buffer)).map_err(|e| {
        AppError::SegyError {
            message: format!("Failed to parse binary header: {}", e),
        }
    })?;

    // Calculate trace block size from binary header
    let trace_block_size = binary_header.trace_block_size();

    // Calculate total number of traces in file
    let header_size = TextualHeader::SIZE + BinaryHeader::SIZE;
    let data_size = file_size.saturating_sub(header_size as u64);
    let total_traces = if trace_block_size > 0 {
        Some((data_size / trace_block_size as u64) as usize)
    } else {
        None
    };

    // Don't load any traces eagerly - they'll be loaded on demand
    let text_encoding = textual_header.encoding();
    let byte_order = binary_header.byte_order;

    Ok(SegyData {
        textual_header,
        binary_header,
        total_traces,
        file_size,
        text_encoding,
        byte_order,
    })
}

/// Get binary header field specifications
///
/// Returns metadata dynamically loaded from canonical SEG-Y Rev 0 spec
#[tauri::command]
pub fn get_binary_header_spec() -> Result<Vec<HeaderFieldSpec>, String> {
    let spec = SegyFormatSpec::load_rev0()?;
    Ok(spec.get_binary_header_fields())
}

/// Get trace header field specifications
///
/// Returns metadata dynamically loaded from canonical SEG-Y Rev 0 spec
#[tauri::command]
pub fn get_trace_header_spec() -> Result<Vec<HeaderFieldSpec>, String> {
    let spec = SegyFormatSpec::load_rev0()?;
    Ok(spec.get_trace_header_fields())
}

/// Load a single trace by index from a SEG-Y file
///
/// # Arguments
/// * `file_path` - Absolute path to the SEG-Y file
/// * `trace_index` - Zero-based trace index
/// * `samples_per_trace` - Number of samples per trace from binary header
/// * `data_sample_format` - Data format code from binary header
/// * `byte_order` - Byte order from binary header
/// * `max_samples` - Optional max samples to load
///
/// # Returns
/// A Result containing the TraceBlock for the requested trace
#[tauri::command]
pub async fn load_single_trace(
    file_path: String,
    trace_index: usize,
    samples_per_trace: u16,
    data_sample_format: u16,
    byte_order: ByteOrder,
    max_samples: Option<usize>,
) -> Result<TraceBlock, String> {
    use crate::segy::binary_header::DataSampleFormat;

    // Open file asynchronously
    let mut file = tokio::fs::File::open(&file_path)
        .await
        .map_err(|e| AppError::IoError {
            message: format!("Failed to open file '{}': {}", file_path, e),
        })?;

    // Parse data sample format
    let format = DataSampleFormat::from_code(data_sample_format as i16)
        .map_err(|e| AppError::ValidationError { message: e })?;

    // Calculate trace block size
    let trace_header_size = 240;
    let sample_size = format.bytes_per_sample();
    let trace_data_size = samples_per_trace as usize * sample_size;
    let trace_block_size = trace_header_size + trace_data_size;

    // Calculate file position
    let header_size = 3600; // textual (3200) + binary (400)
    let trace_position = header_size + (trace_index * trace_block_size);

    // Seek to trace position
    use tokio::io::AsyncSeekExt;
    file.seek(std::io::SeekFrom::Start(trace_position as u64))
        .await
        .map_err(|e| AppError::IoError {
            message: format!("Failed to seek to trace {}: {}", trace_index, e),
        })?;

    // Read trace block
    let mut trace_buffer = vec![0u8; trace_block_size];
    file.read_exact(&mut trace_buffer)
        .await
        .map_err(|e| AppError::SegyError {
            message: format!("Failed to read trace {}: {}", trace_index, e),
        })?;

    // Parse trace
    let mut cursor = Cursor::new(&trace_buffer);
    let trace = TraceBlock::from_reader(
        &mut cursor,
        format,
        Some(samples_per_trace as i16),
        byte_order,
    )
    .map_err(|e| AppError::SegyError {
        message: format!("Failed to parse trace {}: {}", trace_index, e),
    })?;

    let trace = if let Some(limit) = max_samples {
        trace.downsample(limit)
    } else {
        trace
    };

    Ok(trace)
}
