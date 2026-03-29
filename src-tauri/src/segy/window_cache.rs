use crate::error::AppError;
use crate::segy::constants::FILE_HEADER_SIZE;
use crate::segy::io;
use crate::segy::model::SegyFileConfig;
use crate::segy::parser::{TraceBlock, TraceData};
use crate::segy::storage::SegyStorage;
use bytes::Bytes;

/// Chunked window cache for efficient trace loading from remote storage
///
/// Maintains a sliding window of traces in memory, serving viewport operations
/// from the cached window. Uses 16 MiB chunks by default.
pub struct WindowCache {
    /// Current cached window of trace data
    current_window: Option<TraceWindow>,
    /// Chunk size for loading (default 16 MiB)
    chunk_size_bytes: usize,
    /// Threshold for sparse vs chunked access (default 64 traces)
    sparse_threshold: usize,
    /// File configuration (trace size, samples, etc.)
    config: SegyFileConfig,
}

impl WindowCache {
    /// Create a window cache with custom parameters
    pub fn with_params(
        config: SegyFileConfig,
        chunk_size_mb: usize,
        sparse_threshold: usize,
    ) -> Self {
        WindowCache {
            current_window: None,
            chunk_size_bytes: chunk_size_mb * 1024 * 1024,
            sparse_threshold,
            config,
        }
    }

    /// Get traces from cache or load new chunk
    ///
    /// If requested traces are within current window, returns from cache.
    /// Otherwise, loads a new chunk starting at the requested position.
    pub async fn get_traces(
        &mut self,
        start_trace: usize,
        count: usize,
        storage: &SegyStorage,
    ) -> Result<Vec<TraceBlock>, AppError> {
        // Check if we can serve from current window
        if let Some(window) = &self.current_window {
            if start_trace >= window.start_trace
                && start_trace + count <= window.start_trace + window.trace_count
            {
                // Request fits in current window
                return window.extract_traces(start_trace, count, &self.config);
            }
        }

        // Need to load new chunk - pass the requested count to ensure chunk is large enough
        self.load_chunk_for_count(start_trace, count, storage)
            .await?;

        // Extract from newly loaded window
        self.current_window
            .as_ref()
            .unwrap()
            .extract_traces(start_trace, count, &self.config)
    }

    /// Get trace data with sample range filtering from cache or load new chunk
    ///
    /// Only parses the specified sample range from each trace. If requested traces are
    /// within the current window, returns from cache. Otherwise, loads a new chunk.
    pub async fn get_trace_data_with_range(
        &mut self,
        start_trace: usize,
        trace_count: usize,
        start_sample: usize,
        sample_count: usize,
        storage: &SegyStorage,
    ) -> Result<Vec<TraceData>, AppError> {
        // Check if we can serve from current window
        if let Some(window) = &self.current_window {
            if start_trace >= window.start_trace
                && start_trace + trace_count <= window.start_trace + window.trace_count
            {
                // Request fits in current window
                return window.extract_trace_data_with_range(
                    start_trace,
                    trace_count,
                    start_sample,
                    sample_count,
                    &self.config,
                );
            }
        }

        // Need to load new chunk
        self.load_chunk_for_count(start_trace, trace_count, storage)
            .await?;

        // Extract from newly loaded window
        self.current_window
            .as_ref()
            .unwrap()
            .extract_trace_data_with_range(
                start_trace,
                trace_count,
                start_sample,
                sample_count,
                &self.config,
            )
    }

    /// Load a new chunk starting at the given trace, ensuring it fits the requested count
    ///
    /// Loads a chunk of size max(chunk_size_bytes, required_bytes_for_count), aligned to trace boundaries.
    async fn load_chunk_for_count(
        &mut self,
        start_trace: usize,
        requested_count: usize,
        storage: &SegyStorage,
    ) -> Result<(), AppError> {
        let trace_size = self.config.trace_block_size()?;
        let file_size = storage.size();
        let data_start = FILE_HEADER_SIZE as u64;

        // Calculate byte offset for start trace
        let offset = data_start + (start_trace as u64 * trace_size as u64);

        if offset >= file_size {
            return Err(AppError::InvalidRange(format!(
                "Trace {} is beyond file size",
                start_trace
            )));
        }

        // Calculate how many bytes we need for the requested count
        let requested_bytes = requested_count as u64 * trace_size as u64;

        // Use the larger of: default chunk size OR requested size
        let target_chunk_size = self.chunk_size_bytes.max(requested_bytes as usize) as u64;

        // Calculate how many bytes we can read
        let remaining_bytes = file_size - offset;
        let read_bytes = remaining_bytes.min(target_chunk_size);

        // Round down to whole traces
        let trace_count = (read_bytes / trace_size as u64) as usize;
        let aligned_bytes = trace_count * trace_size;

        if trace_count == 0 {
            return Err(AppError::InvalidRange(
                "Not enough data for even one trace".to_string(),
            ));
        }

        // Load chunk from storage
        let data = storage.read_range(offset, aligned_bytes).await?;

        // Update window
        self.current_window = Some(TraceWindow {
            start_trace,
            trace_count,
            data,
            trace_size,
        });

        Ok(())
    }

    /// Get sparse traces using vectored I/O
    ///
    /// For small numbers of non-contiguous traces, uses get_ranges() for efficiency.
    /// Falls back to chunk loading if number of traces exceeds sparse_threshold.
    pub async fn get_sparse_traces(
        &mut self,
        indices: &[usize],
        storage: &SegyStorage,
    ) -> Result<Vec<TraceBlock>, AppError> {
        if indices.is_empty() {
            return Ok(Vec::new());
        }

        // If too many traces, fall back to chunk loading
        if indices.len() >= self.sparse_threshold {
            let min_idx = *indices.iter().min().unwrap();
            let max_idx = *indices.iter().max().unwrap();
            let all_traces = self
                .get_traces(min_idx, max_idx - min_idx + 1, storage)
                .await?;

            // Filter to requested indices
            return Ok(indices
                .iter()
                .filter_map(|&idx| {
                    if idx >= min_idx && idx <= max_idx {
                        Some(all_traces[idx - min_idx].clone())
                    } else {
                        None
                    }
                })
                .collect());
        }

        // Use vectored I/O for sparse access
        let trace_size = self.config.trace_block_size()?;
        let data_start = FILE_HEADER_SIZE as u64;
        let format = self.config.data_sample_format_parsed()?;

        let ranges: Vec<_> = indices
            .iter()
            .map(|&idx| {
                let start = data_start + (idx as u64 * trace_size as u64);
                let end = start + trace_size as u64;
                start..end
            })
            .collect();

        let data_chunks = storage.read_ranges(&ranges).await?;

        // Parse each trace
        data_chunks
            .into_iter()
            .map(|chunk| {
                io::parse_trace_block(
                    &chunk,
                    format,
                    self.config.samples_per_trace,
                    self.config.byte_order,
                )
                .map_err(|e| AppError::ParseError {
                    message: format!("Failed to parse trace: {}", e),
                })
            })
            .collect()
    }
}

/// A window of cached trace data
struct TraceWindow {
    /// Index of first trace in window
    start_trace: usize,
    /// Number of traces in window
    trace_count: usize,
    /// Raw trace data (aligned to trace boundaries)
    data: Bytes,
    /// Size of each trace in bytes
    trace_size: usize,
}

impl TraceWindow {
    /// Extract traces from the window
    fn extract_traces(
        &self,
        start_trace: usize,
        count: usize,
        config: &SegyFileConfig,
    ) -> Result<Vec<TraceBlock>, AppError> {
        if start_trace < self.start_trace
            || start_trace + count > self.start_trace + self.trace_count
        {
            return Err(AppError::InvalidRange(format!(
                "Requested traces {}..{} outside window {}..{}",
                start_trace,
                start_trace + count,
                self.start_trace,
                self.start_trace + self.trace_count
            )));
        }

        let offset_in_window = start_trace - self.start_trace;
        let start_byte = offset_in_window * self.trace_size;
        let format = config.data_sample_format_parsed()?;

        let mut traces = Vec::with_capacity(count);

        for i in 0..count {
            let trace_start = start_byte + (i * self.trace_size);
            let trace_end = trace_start + self.trace_size;

            let trace_bytes = &self.data[trace_start..trace_end];
            let trace = io::parse_trace_block(
                trace_bytes,
                format,
                config.samples_per_trace,
                config.byte_order,
            )
            .map_err(|e| AppError::ParseError {
                message: format!("Failed to parse trace: {}", e),
            })?;

            traces.push(trace);
        }

        Ok(traces)
    }

    /// Extract trace data with sample range filtering from the window
    ///
    /// Only parses the specified sample range from each trace, optimizing for viewport rendering.
    fn extract_trace_data_with_range(
        &self,
        start_trace: usize,
        count: usize,
        start_sample: usize,
        sample_count: usize,
        config: &SegyFileConfig,
    ) -> Result<Vec<TraceData>, AppError> {
        if start_trace < self.start_trace
            || start_trace + count > self.start_trace + self.trace_count
        {
            return Err(AppError::InvalidRange(format!(
                "Requested traces {}..{} outside window {}..{}",
                start_trace,
                start_trace + count,
                self.start_trace,
                self.start_trace + self.trace_count
            )));
        }

        let offset_in_window = start_trace - self.start_trace;
        let start_byte = offset_in_window * self.trace_size;
        let format = config.data_sample_format_parsed()?;

        let mut trace_data = Vec::with_capacity(count);

        for i in 0..count {
            let trace_start = start_byte + (i * self.trace_size);
            let trace_end = trace_start + self.trace_size;

            let trace_bytes = &self.data[trace_start..trace_end];
            let data = io::parse_trace_data_with_range(
                trace_bytes,
                format,
                config.samples_per_trace,
                start_sample,
                sample_count,
            )
            .map_err(|e| AppError::ParseError {
                message: format!("Failed to parse trace data range: {}", e),
            })?;

            trace_data.push(data);
        }

        Ok(trace_data)
    }
}
