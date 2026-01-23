//! SEG-Y reader implementation with memory-mapped IO.
//!
//! `SegyReader` owns the memory map and provides safe, validated access to
//! trace headers and samples. `SegyReaderState` caches the latest reader for
//! Tauri commands.

use crate::error::AppError;
use crate::segy::io;
use crate::segy::{BinaryHeader, SegyData, SegyFileConfig, TextualHeader, TraceBlock, TraceData};
use std::fs::File;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Memory-mapped SEG-Y reader with cached headers and configuration.
pub struct SegyReader {
    file_path: String,
    file_size: u64,
    textual_header: TextualHeader,
    binary_header: BinaryHeader,
    total_traces: Option<usize>,
    config: SegyFileConfig,
    mmap: memmap2::Mmap,
    // Keep the file handle alive for the mmap lifetime (notably on Windows).
    _file: File,
}

impl SegyReader {
    /// Open and parse a SEG-Y file from disk.
    pub fn open(file_path: &str) -> Result<Self, AppError> {
        io::validate_file_path(file_path)?;

        let mut file = File::open(file_path).map_err(|e| AppError::IoError {
            message: format!("Failed to open file '{}': {}", file_path, e),
        })?;

        let header_bundle = io::read_headers(&mut file)?;
        let config = SegyFileConfig::from_binary_header(&header_bundle.binary_header)?;

        let trace_block_size = config.trace_block_size().ok();
        let total_traces = trace_block_size
            .and_then(|size| io::compute_total_traces(header_bundle.file_size, size));

        let mmap = unsafe { memmap2::Mmap::map(&file) }.map_err(|e| AppError::IoError {
            message: format!("Failed to memory-map file: {}", e),
        })?;

        Ok(Self {
            file_path: file_path.to_string(),
            file_size: header_bundle.file_size,
            textual_header: header_bundle.textual_header,
            binary_header: header_bundle.binary_header,
            total_traces,
            config,
            mmap,
            _file: file,
        })
    }

    /// Open a SEG-Y file on a blocking thread to avoid stalling the async runtime.
    pub async fn open_async(file_path: String) -> Result<Self, AppError> {
        tokio::task::spawn_blocking(move || Self::open(&file_path))
            .await
            .map_err(|e| AppError::IoError {
                message: format!("SEG-Y open task failed: {}", e),
            })?
    }

    /// Create a lightweight data summary for frontend consumption.
    pub fn data(&self) -> SegyData {
        SegyData {
            textual_header: self.textual_header.clone(),
            binary_header: self.binary_header.clone(),
            total_traces: self.total_traces,
            file_size: self.file_size,
            text_encoding: self.textual_header.encoding(),
            byte_order: self.binary_header.byte_order,
        }
    }

    /// Return the absolute file path for the opened SEG-Y file.
    pub fn file_path(&self) -> &str {
        &self.file_path
    }

    /// Return the derived configuration used for trace access.
    pub fn config(&self) -> &SegyFileConfig {
        &self.config
    }

    /// Load a single trace block (header + data) by index.
    pub fn load_single_trace(
        &self,
        trace_index: usize,
        max_samples: Option<usize>,
    ) -> Result<TraceBlock, AppError> {
        let trace_bytes = self.trace_slice(trace_index)?;
        let format = self.config.data_sample_format_parsed()?;

        let trace = io::parse_trace_block(
            trace_bytes,
            format,
            self.config.samples_per_trace,
            self.config.byte_order,
        )
        .map_err(|e| AppError::SegyError {
            message: format!("Failed to parse trace {}: {}", trace_index, e),
        })?;

        Ok(apply_trace_limit(trace, max_samples))
    }

    /// Load a contiguous range of trace blocks.
    pub fn load_trace_range(
        &self,
        start_index: usize,
        count: usize,
        max_samples: Option<usize>,
    ) -> Result<Vec<TraceBlock>, AppError> {
        io::validate_trace_range(&self.config, start_index, count, self.total_traces)?;
        if count == 0 {
            return Ok(Vec::new());
        }

        let format = self.config.data_sample_format_parsed()?;
        let trace_block_size = self.config.trace_block_size()?;
        let start_position = self.config.calculate_trace_position(start_index)?;
        let end_position = start_position
            .checked_add(trace_block_size.checked_mul(count).ok_or_else(|| {
                AppError::ValidationError {
                    message: "Requested trace range is too large".to_string(),
                }
            })?)
            .ok_or_else(|| AppError::ValidationError {
                message: "Requested trace range exceeds addressable space".to_string(),
            })?;

        if end_position > self.mmap.len() {
            return Err(AppError::SegyError {
                message: format!(
                    "Requested traces exceed file size (need {} bytes, file has {} bytes)",
                    end_position,
                    self.mmap.len()
                ),
            });
        }

        let mut traces = Vec::with_capacity(count);
        for i in 0..count {
            let offset = start_position + (i * trace_block_size);
            let trace_bytes = &self.mmap[offset..offset + trace_block_size];
            let trace = io::parse_trace_block(
                trace_bytes,
                format,
                self.config.samples_per_trace,
                self.config.byte_order,
            )
            .map_err(|e| AppError::SegyError {
                message: format!("Failed to parse trace {}: {}", start_index + i, e),
            })?;

            traces.push(apply_trace_limit(trace, max_samples));
        }

        Ok(traces)
    }

    /// Load only trace sample data for a contiguous range of traces.
    pub fn load_trace_data_range(
        &self,
        start_index: usize,
        count: usize,
        max_samples: Option<usize>,
    ) -> Result<Vec<TraceData>, AppError> {
        io::validate_trace_range(&self.config, start_index, count, self.total_traces)?;
        if count == 0 {
            return Ok(Vec::new());
        }

        let format = self.config.data_sample_format_parsed()?;
        let trace_block_size = self.config.trace_block_size()?;
        let start_position = self.config.calculate_trace_position(start_index)?;
        let end_position = start_position
            .checked_add(trace_block_size.checked_mul(count).ok_or_else(|| {
                AppError::ValidationError {
                    message: "Requested trace range is too large".to_string(),
                }
            })?)
            .ok_or_else(|| AppError::ValidationError {
                message: "Requested trace range exceeds addressable space".to_string(),
            })?;

        if end_position > self.mmap.len() {
            return Err(AppError::SegyError {
                message: format!(
                    "Requested traces exceed file size (need {} bytes, file has {} bytes)",
                    end_position,
                    self.mmap.len()
                ),
            });
        }

        let mut traces = Vec::with_capacity(count);
        for i in 0..count {
            let offset = start_position + (i * trace_block_size);
            let trace_bytes = &self.mmap[offset..offset + trace_block_size];
            let data = io::parse_trace_data(trace_bytes, format, self.config.samples_per_trace)
                .map_err(|e| AppError::SegyError {
                    message: format!("Failed to parse trace data {}: {}", start_index + i, e),
                })?;

            traces.push(apply_data_limit(data, max_samples));
        }

        Ok(traces)
    }

    /// Return the byte slice for a single trace block within the memory map.
    fn trace_slice(&self, trace_index: usize) -> Result<&[u8], AppError> {
        if let Some(total_traces) = self.total_traces {
            if trace_index >= total_traces {
                return Err(AppError::ValidationError {
                    message: format!(
                        "Trace index {} out of range (total {})",
                        trace_index, total_traces
                    ),
                });
            }
        }

        let trace_block_size = self.config.trace_block_size()?;
        let start = self.config.calculate_trace_position(trace_index)?;
        let end = start
            .checked_add(trace_block_size)
            .ok_or_else(|| AppError::ValidationError {
                message: "Trace slice end overflow".to_string(),
            })?;

        if end > self.mmap.len() {
            return Err(AppError::SegyError {
                message: format!(
                    "Trace {} exceeds file size (end {} bytes, file has {} bytes)",
                    trace_index,
                    end,
                    self.mmap.len()
                ),
            });
        }

        Ok(&self.mmap[start..end])
    }
}

/// Shared, async-safe state that caches the most recent SEG-Y reader.
pub struct SegyReaderState {
    reader: RwLock<Option<Arc<SegyReader>>>,
}

impl Default for SegyReaderState {
    fn default() -> Self {
        Self {
            reader: RwLock::new(None),
        }
    }
}

impl SegyReaderState {
    /// Create a new empty reader state.
    pub fn new() -> Self {
        Self::default()
    }

    /// Open a new reader and cache it, replacing any previous reader.
    pub async fn open(&self, file_path: String) -> Result<Arc<SegyReader>, AppError> {
        let reader = SegyReader::open_async(file_path.clone()).await?;
        let reader = Arc::new(reader);

        let mut guard = self.reader.write().await;
        *guard = Some(reader.clone());

        Ok(reader)
    }

    /// Return the cached reader if it matches the path, otherwise open a new one.
    pub async fn get_or_open(&self, file_path: String) -> Result<Arc<SegyReader>, AppError> {
        if file_path.is_empty() {
            return Err(AppError::ValidationError {
                message: "File path cannot be empty".to_string(),
            });
        }

        if let Some(reader) = self.reader.read().await.as_ref() {
            if reader.file_path() == file_path {
                return Ok(reader.clone());
            }
        }

        self.open(file_path).await
    }
}

/// Apply a sample limit to a trace block, preserving header consistency.
fn apply_trace_limit(trace: TraceBlock, max_samples: Option<usize>) -> TraceBlock {
    match max_samples {
        Some(limit) => trace.downsample(limit),
        None => trace,
    }
}

/// Apply a sample limit to raw trace data.
fn apply_data_limit(data: TraceData, max_samples: Option<usize>) -> TraceData {
    match max_samples {
        Some(limit) => data.downsample(limit),
        None => data,
    }
}
