//! SEG-Y reader implementation with storage abstraction.
//!
//! `SegyReader` uses the storage abstraction layer to support both local (memory-mapped)
//! and remote (S3, GCS, Azure, HTTP) SEG-Y files. The WindowCache enables efficient chunked
//! loading for remote storage. `SegyReaderState` caches the latest reader for Tauri commands.

use crate::error::AppError;
use crate::segy::constants::FILE_HEADER_SIZE;
use crate::segy::io;
use crate::segy::storage::SegyStorage;
use crate::segy::window_cache::WindowCache;
use crate::segy::{BinaryHeader, SegyData, SegyFileConfig, TextualHeader, TraceBlock, TraceData};
use crate::storage_config;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

/// SEG-Y reader with storage abstraction and windowed caching.
pub struct SegyReader {
    uri: String,
    file_size: u64,
    textual_header: TextualHeader,
    binary_header: BinaryHeader,
    total_traces: Option<usize>,
    config: SegyFileConfig,
    storage: SegyStorage,
    window_cache: Arc<Mutex<WindowCache>>,
}

impl SegyReader {
    /// Open and parse a SEG-Y file from a URI with optional storage configuration.
    ///
    /// Supports both local file paths and remote URIs (s3://, gs://, az://, http://, https://).
    /// For remote storage, only reads the headers (bytes 0-3599) during initialization.
    pub async fn open_with_config(
        uri: &str,
        config: Option<storage_config::StorageConfig>,
    ) -> Result<Self, AppError> {
        // Validate URI is non-empty
        if uri.is_empty() {
            return Err(AppError::ValidationError {
                message: "URI cannot be empty".to_string(),
            });
        }

        // Resolve storage config once so auth and performance use the same settings snapshot.
        let storage_config = config.unwrap_or_default();
        let performance_config = storage_config.performance.clone();

        // Create storage backend from URI with config
        let storage = SegyStorage::from_uri_with_config(uri, Some(storage_config)).await?;
        let file_size = storage.size();

        // For remote storage, read only the headers (3200 + 400 = 3600 bytes)
        // For local storage, this is essentially free due to memory mapping
        let header_size = 3600_u64;
        if file_size < header_size {
            return Err(AppError::SegyError {
                message: format!(
                    "File too small to be valid SEG-Y ({} bytes, minimum {} bytes)",
                    file_size, header_size
                ),
            });
        }

        // Read header bytes from storage
        let header_bytes = storage.read_range(0, header_size as usize).await?;

        // Parse textual header (first 3200 bytes)
        let textual_bytes = &header_bytes[0..3200];
        let mut textual_cursor = std::io::Cursor::new(textual_bytes);
        let textual_header =
            TextualHeader::from_reader(&mut textual_cursor).map_err(|e| AppError::SegyError {
                message: format!("Failed to read textual header: {}", e),
            })?;

        // Parse binary header (next 400 bytes)
        let binary_bytes = &header_bytes[3200..3600];
        let mut binary_cursor = std::io::Cursor::new(binary_bytes);
        let binary_header =
            BinaryHeader::from_reader(&mut binary_cursor).map_err(|e| AppError::SegyError {
                message: format!("Failed to parse binary header: {}", e),
            })?;

        // Build file configuration
        let config = SegyFileConfig::from_binary_header(&binary_header)?;

        // Calculate total traces
        let trace_block_size = config.trace_block_size().ok();
        let total_traces =
            trace_block_size.and_then(|size| io::compute_total_traces(file_size, size));

        // Initialize window cache with user-configured parameters.
        let window_cache = Arc::new(Mutex::new(WindowCache::with_params(
            config.clone(),
            performance_config.chunk_size_mb,
            performance_config.sparse_threshold,
        )));

        Ok(Self {
            uri: uri.to_string(),
            file_size,
            textual_header,
            binary_header,
            total_traces,
            config,
            storage,
            window_cache,
        })
    }

    /// Open and parse a SEG-Y file from a URI (convenience wrapper).
    ///
    /// Uses default provider credential chain (env vars, IAM roles, etc.)
    pub async fn open(uri: &str) -> Result<Self, AppError> {
        Self::open_with_config(uri, None).await
    }

    /// Open a SEG-Y file on a blocking thread to avoid stalling the async runtime.
    ///
    /// This is a transitional wrapper that will be removed once all callers are fully async.
    pub async fn open_async(
        uri: String,
        config: Option<storage_config::StorageConfig>,
    ) -> Result<Self, AppError> {
        tokio::task::spawn_blocking(move || {
            tokio::runtime::Handle::current().block_on(Self::open_with_config(&uri, config))
        })
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

    /// Return the URI for the opened SEG-Y resource.
    pub fn file_path(&self) -> &str {
        &self.uri
    }

    /// Return the derived configuration used for trace access.
    pub fn config(&self) -> &SegyFileConfig {
        &self.config
    }

    /// Load a single trace block (header + data) by index.
    ///
    /// Uses sparse vectored I/O for efficient single-trace access on remote storage.
    pub async fn load_single_trace(
        &self,
        trace_index: usize,
        max_samples: Option<usize>,
    ) -> Result<TraceBlock, AppError> {
        // Validate trace index
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

        // Use window cache to fetch the single trace (uses vectored I/O for remote)
        let mut cache = self.window_cache.lock().await;
        let mut traces = cache
            .get_sparse_traces(&[trace_index], &self.storage)
            .await?;

        if traces.is_empty() {
            return Err(AppError::SegyError {
                message: format!("Failed to load trace {}", trace_index),
            });
        }

        let trace = traces.remove(0);
        Ok(apply_trace_limit(trace, max_samples))
    }

    /// Load only trace sample data for a contiguous range of traces.
    ///
    /// More efficient than loading full `TraceBlock` values when only sample
    /// data is needed.
    pub async fn load_trace_data_range(
        &self,
        start_index: usize,
        count: usize,
        max_samples: Option<usize>,
    ) -> Result<Vec<TraceData>, AppError> {
        io::validate_trace_range(&self.config, start_index, count, self.total_traces)?;
        if count == 0 {
            return Ok(Vec::new());
        }

        // Load full traces from window cache
        let mut cache = self.window_cache.lock().await;
        let traces = cache.get_traces(start_index, count, &self.storage).await?;

        // Extract just the data portion
        Ok(traces
            .into_iter()
            .map(|trace| apply_data_limit(trace.data, max_samples))
            .collect())
    }

    /// Load trace data from multiple disjoint blocks concurrently.
    ///
    /// Each block is described by a `(start_index, count)` pair. All byte ranges
    /// are fetched in a single vectored-I/O call (`read_ranges`), which allows
    /// remote stores to issue the requests concurrently instead of sequentially.
    /// The results are returned in the same order as the input blocks.
    pub async fn load_trace_data_blocks(
        &self,
        blocks: &[(usize, usize)],
    ) -> Result<Vec<Vec<TraceData>>, AppError> {
        if blocks.is_empty() {
            return Ok(Vec::new());
        }

        let trace_size = self.config.trace_block_size()?;
        let data_start = FILE_HEADER_SIZE as u64;
        let format = self.config.data_sample_format_parsed()?;

        // Build one byte range per block
        let ranges: Vec<std::ops::Range<u64>> = blocks
            .iter()
            .map(|&(start, count)| {
                let offset = data_start + (start as u64 * trace_size as u64);
                let length = count as u64 * trace_size as u64;
                offset..offset + length
            })
            .collect();

        // Fetch all blocks in one vectored call (concurrent for remote stores)
        let chunks = self.storage.read_ranges(&ranges).await?;

        // Parse each block into trace data
        let mut result = Vec::with_capacity(blocks.len());
        for (i, chunk) in chunks.into_iter().enumerate() {
            let count = blocks[i].1;
            let mut traces = Vec::with_capacity(count);
            for j in 0..count {
                let start = j * trace_size;
                let end = start + trace_size;
                let trace_bytes = &chunk[start..end];
                let data = io::parse_trace_data(trace_bytes, format, self.config.samples_per_trace)
                    .map_err(|e| AppError::ParseError {
                        message: format!("Failed to parse trace data in block {}: {}", i, e),
                    })?;
                traces.push(data);
            }
            result.push(traces);
        }

        Ok(result)
    }

    /// Load trace sample data with sample range filtering.
    ///
    /// Optimized for viewport rendering - only parses the requested sample range from each trace.
    /// This is significantly faster and uses less memory than loading full traces when the viewport
    /// is zoomed into a subset of samples.
    pub async fn load_trace_data_with_sample_range(
        &self,
        start_trace: usize,
        trace_count: usize,
        start_sample: usize,
        sample_count: usize,
    ) -> Result<Vec<TraceData>, AppError> {
        io::validate_trace_range(&self.config, start_trace, trace_count, self.total_traces)?;
        if trace_count == 0 {
            return Ok(Vec::new());
        }

        // Validate sample range
        let total_samples = usize::from(self.config.samples_per_trace);
        if start_sample >= total_samples {
            return Err(AppError::ValidationError {
                message: format!(
                    "start_sample {} >= total_samples {}",
                    start_sample, total_samples
                ),
            });
        }

        // Load trace data with sample range filtering
        let mut cache = self.window_cache.lock().await;
        cache
            .get_trace_data_with_range(
                start_trace,
                trace_count,
                start_sample,
                sample_count,
                &self.storage,
            )
            .await
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
    pub async fn open(
        &self,
        uri: String,
        config: Option<storage_config::StorageConfig>,
    ) -> Result<Arc<SegyReader>, AppError> {
        let reader = SegyReader::open_async(uri.clone(), config).await?;
        let reader = Arc::new(reader);

        let mut guard = self.reader.write().await;
        *guard = Some(reader.clone());

        Ok(reader)
    }

    /// Return the cached reader if it matches the path, otherwise open a new one.
    pub async fn get_or_open(
        &self,
        uri: String,
        config: Option<storage_config::StorageConfig>,
    ) -> Result<Arc<SegyReader>, AppError> {
        if uri.is_empty() {
            return Err(AppError::ValidationError {
                message: "URI cannot be empty".to_string(),
            });
        }

        if let Some(reader) = self.reader.read().await.as_ref() {
            if reader.file_path() == uri {
                return Ok(reader.clone());
            }
        }

        self.open(uri, config).await
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
