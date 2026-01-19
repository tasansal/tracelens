use crate::error::AppError;
use crate::segy::{
    rendering::{
        self, AmplitudeScaling, ColormapType, ImageFormat, RenderMode, RenderedImage,
        ViewportConfig, WiggleConfig,
    },
    BinaryHeader, ByteOrder, HeaderFieldSpec, SegyFileConfig, SegyFormatSpec, TextEncoding,
    TextualHeader, TraceBlock,
};
use image::RgbImage;
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
/// * `segy_config` - SEG-Y file configuration (samples, format, byte order)
/// * `max_samples` - Optional max samples to load
///
/// # Returns
/// A Result containing the TraceBlock for the requested trace
#[tauri::command]
pub async fn load_single_trace(
    file_path: String,
    trace_index: usize,
    segy_config: SegyFileConfig,
    max_samples: Option<usize>,
) -> Result<TraceBlock, String> {
    // Open file asynchronously
    let mut file = tokio::fs::File::open(&file_path)
        .await
        .map_err(|e| AppError::IoError {
            message: format!("Failed to open file '{}': {}", file_path, e),
        })?;

    // Parse data sample format and calculate sizes using helper methods
    let format = segy_config.data_sample_format_parsed()?;
    let trace_block_size = segy_config.trace_block_size()?;
    let trace_position = segy_config.calculate_trace_position(trace_index)?;

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
        Some(segy_config.samples_per_trace as i16),
        segy_config.byte_order,
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

/// Load a range of traces from a SEG-Y file
///
/// Uses memory-mapped I/O for fast random access at any file offset.
/// More efficient than loading traces one-by-one via load_single_trace.
#[tauri::command]
pub async fn load_trace_range(
    file_path: String,
    start_index: usize,
    count: usize,
    segy_config: SegyFileConfig,
    max_samples: Option<usize>,
) -> Result<Vec<TraceBlock>, String> {
    // Parse data sample format and calculate sizes using helper methods
    let format = segy_config.data_sample_format_parsed()?;
    let trace_block_size = segy_config.trace_block_size()?;
    let start_position = segy_config.calculate_trace_position(start_index)?;
    let total_bytes = trace_block_size * count;

    // Open file synchronously for mmap (mmap requires sync file handle)
    let file = std::fs::File::open(&file_path).map_err(|e| AppError::IoError {
        message: format!("Failed to open file '{}': {}", file_path, e),
    })?;

    // Memory-map the file for fast random access
    // SAFETY: We have exclusive access to the file and it won't be modified during the lifetime of the mmap
    let mmap = unsafe { memmap2::Mmap::map(&file) }.map_err(|e| AppError::IoError {
        message: format!("Failed to memory-map file: {}", e),
    })?;

    // Verify we have enough data
    if start_position + total_bytes > mmap.len() {
        return Err(AppError::SegyError {
            message: format!(
                "Requested traces exceed file size (need {} bytes, file has {} bytes)",
                start_position + total_bytes,
                mmap.len()
            ),
        }
        .into());
    }

    // Parse traces directly from memory-mapped region
    let mut traces = Vec::with_capacity(count);
    for i in 0..count {
        let offset = start_position + (i * trace_block_size);
        let trace_bytes = &mmap[offset..offset + trace_block_size];
        let mut cursor = Cursor::new(trace_bytes);

        let trace = TraceBlock::from_reader(
            &mut cursor,
            format,
            Some(segy_config.samples_per_trace as i16),
            segy_config.byte_order,
        )
        .map_err(|e| AppError::SegyError {
            message: format!("Failed to parse trace {}: {}", start_index + i, e),
        })?;

        let trace = if let Some(limit) = max_samples {
            trace.downsample(limit)
        } else {
            trace
        };

        traces.push(trace);
    }

    Ok(traces)
}

/// Render Variable Density view from SEG-Y traces
#[tauri::command]
pub async fn render_variable_density(
    file_path: String,
    viewport: ViewportConfig,
    colormap_type: ColormapType,
    scaling: AmplitudeScaling,
    render_mode: RenderMode,
    wiggle_config: Option<WiggleConfig>,
    segy_config: SegyFileConfig,
) -> Result<RenderedImage, String> {
    use crate::segy::rendering::{normalizer, render_wiggle, render_wiggle_vd};

    // 1. Load trace range - always load full traces (no sample limiting)
    let traces = load_trace_range(
        file_path,
        viewport.start_trace,
        viewport.trace_count,
        segy_config,
        None, // Load all samples
    )
    .await?;

    // 2. Extract trace data (pre-allocate capacity)
    let mut trace_data = Vec::with_capacity(traces.len());
    for trace in traces {
        trace_data.push(trace.data);
    }

    // 3. Normalize traces (shared across all render modes)
    let normalized = normalizer::normalize_traces(&trace_data, &scaling);

    // 4. Render based on mode
    match render_mode {
        RenderMode::VariableDensity => {
            // Classic VD rendering - use existing function
            let colormap = rendering::create_colormap(colormap_type);
            rendering::render_variable_density(trace_data, &viewport, colormap.as_ref(), &scaling)
        }
        RenderMode::Wiggle => {
            // Wiggle traces only
            let config = wiggle_config.unwrap_or(WiggleConfig {
                line_width: 1.0,
                line_color: [0, 0, 0],
                fill_positive: true,
                fill_negative: false,
                positive_fill_color: [0, 0, 0],
                negative_fill_color: [255, 0, 0],
            });
            let img = render_wiggle(trace_data, &viewport, &config, &normalized)?;

            // Encode to PNG in parallel
            encode_png_parallel(img)
        }
        RenderMode::WiggleVariableDensity => {
            // Combined wiggle + VD
            let colormap = rendering::create_colormap(colormap_type);
            let config = wiggle_config.unwrap_or(WiggleConfig {
                line_width: 1.0,
                line_color: [0, 0, 0],
                fill_positive: false,
                fill_negative: false,
                positive_fill_color: [0, 0, 0],
                negative_fill_color: [255, 0, 0],
            });
            let img = render_wiggle_vd(
                trace_data,
                &viewport,
                colormap.as_ref(),
                &config,
                &normalized,
            )?;

            // Encode to PNG in parallel
            encode_png_parallel(img)
        }
    }
}

/// Encode PNG with fast compression settings
fn encode_png_parallel(img: RgbImage) -> Result<RenderedImage, String> {
    let (width, height) = img.dimensions();
    let raw_pixels = img.into_raw();

    // Encode using png crate with best speed compression
    let mut png_bytes = Vec::with_capacity((width * height * 3) as usize);
    let mut encoder = png::Encoder::new(std::io::Cursor::new(&mut png_bytes), width, height);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast); // Use fast compression for better performance

    let mut writer = encoder
        .write_header()
        .map_err(|e| format!("PNG header write failed: {}", e))?;

    writer
        .write_image_data(&raw_pixels)
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    drop(writer); // Finalize encoding

    Ok(RenderedImage {
        width,
        height,
        data: png_bytes,
        format: ImageFormat::Png,
    })
}
