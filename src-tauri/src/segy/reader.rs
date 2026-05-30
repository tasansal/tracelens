//! SEG-Y reader implementation with storage abstraction.
//!
//! `SegyReader` uses the storage abstraction layer to support both local (memory-mapped)
//! and remote (S3, GCS, Azure, HTTP) SEG-Y files. The ChunkCache enables efficient chunked
//! loading for remote storage. `SegyReaderState` caches the latest reader for Tauri commands.

use crate::error::AppError;
use crate::segy::agc::{AgcOptions, AgcSpec, resolve as resolve_agc};
use crate::segy::chunk_cache::{ChunkCache, TraceChunk};
use crate::segy::constants::FILE_HEADER_SIZE;
use crate::segy::header_spec::SegyFormatSpec;
use crate::segy::io;
use crate::segy::storage::SegyStorage;
use crate::segy::{
    BinaryHeader, SegyData, SegyFileConfig, SegyRevision, TextualHeader, TraceBlock, TraceData,
};
use crate::storage_config;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// SEG-Y reader with storage abstraction and windowed caching.
pub struct SegyReader {
    uri: String,
    file_size: u64,
    textual_header: TextualHeader,
    binary_header: BinaryHeader,
    binary_header_bytes: Vec<u8>,
    total_traces: Option<usize>,
    config: SegyFileConfig,
    storage: SegyStorage,
    chunk_cache: Arc<ChunkCache>,
    detected_revision: SegyRevision,
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
        let binary_header_bytes = binary_bytes.to_vec();
        let mut binary_cursor = std::io::Cursor::new(binary_bytes);
        let binary_header =
            BinaryHeader::from_reader(&mut binary_cursor).map_err(|e| AppError::SegyError {
                message: format!("Failed to parse binary header: {}", e),
            })?;

        // Auto-detect SEG-Y revision from binary header bytes 3501-3502 (AUTO-01)
        let detected_revision = crate::segy::revision::detect_revision_from_binary_header(
            &binary_header.unassigned,
            binary_header.byte_order,
        );

        // Build file configuration
        let config = SegyFileConfig::from_binary_header(&binary_header)?;

        // Calculate total traces
        let trace_block_size = config.trace_block_size().ok();
        let total_traces =
            trace_block_size.and_then(|size| io::compute_total_traces(file_size, size));

        // Initialize the chunk cache. Its read-cache budget (MiB) divided by
        // the chunk size gives the number of resident chunks, floored at 1 so
        // at least one chunk is always available. When chunk_size_mb exceeds
        // read_cache_mb the cache will hold one chunk that is larger than the
        // stated budget — unavoidable since we always need room for one read.
        let max_chunks =
            (performance_config.read_cache_mb / performance_config.chunk_size_mb.max(1)).max(1);
        if performance_config.chunk_size_mb == 0 {
            log::warn!(
                "chunk_size_mb is 0; clamped to 1 MiB for chunk-size calculation — \
                 set a positive value to avoid excessive cache fragmentation"
            );
        } else if performance_config.chunk_size_mb >= performance_config.read_cache_mb {
            log::warn!(
                "chunk_size_mb ({}) equals or exceeds read_cache_mb ({}); cache will hold 1 chunk ({} MiB)",
                performance_config.chunk_size_mb,
                performance_config.read_cache_mb,
                performance_config.chunk_size_mb,
            );
        }
        let chunk_cache = Arc::new(ChunkCache::with_params(
            config.clone(),
            performance_config.chunk_size_mb.max(1),
            max_chunks,
        ));

        Ok(Self {
            uri: uri.to_string(),
            file_size,
            textual_header,
            binary_header,
            binary_header_bytes,
            total_traces,
            config,
            storage,
            chunk_cache,
            detected_revision,
        })
    }

    /// Open and parse a SEG-Y file from a URI (convenience wrapper).
    ///
    /// Uses default provider credential chain (env vars, IAM roles, etc.)
    pub async fn open(uri: &str) -> Result<Self, AppError> {
        Self::open_with_config(uri, None).await
    }

    /// Create a lightweight data summary for frontend consumption.
    pub fn data(&self) -> SegyData {
        SegyData {
            textual_header: self.textual_header.clone(),
            binary_header: self.binary_header.clone(),
            binary_header_bytes: self.binary_header_bytes.clone(),
            total_traces: self.total_traces,
            file_size: self.file_size,
            text_encoding: self.textual_header.encoding(),
            byte_order: self.binary_header.byte_order,
            detected_revision: self.detected_revision,
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
    /// Reads the trace directly from storage with a single ranged fetch — the
    /// chunk cache is intentionally bypassed so hover/readout queries don't
    /// perturb the LRU during pan/zoom.
    pub async fn load_single_trace(
        &self,
        trace_index: usize,
        max_samples: Option<usize>,
    ) -> Result<TraceBlock, AppError> {
        if let Some(total_traces) = self.total_traces
            && trace_index >= total_traces
        {
            return Err(AppError::ValidationError {
                message: format!(
                    "Trace index {} out of range (total {})",
                    trace_index, total_traces
                ),
            });
        }

        let trace_size = self.config.trace_block_size()?;
        let format = self.config.data_sample_format_parsed()?;
        let offset = FILE_HEADER_SIZE as u64 + trace_index as u64 * trace_size as u64;
        let bytes = self.storage.read_range(offset, trace_size).await?;

        let trace = io::parse_trace_block(
            &bytes,
            format,
            self.config.samples_per_trace,
            self.config.byte_order,
        )
        .map_err(|e| AppError::ParseError {
            message: format!("Failed to parse trace {}: {}", trace_index, e),
        })?;

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

        let window = self.get_or_load_window(start_index, count).await?;
        // Parse outside the cache lock so other tile fetches can proceed.
        let traces = window.extract_traces(start_index, count, &self.config)?;
        Ok(traces
            .into_iter()
            .map(|trace| apply_data_limit(trace.data, max_samples))
            .collect())
    }

    /// Acquire a covering window. The cache does its own internal locking and
    /// runs network I/O lock-free, so concurrent fetches parallelize naturally.
    async fn get_or_load_window(
        &self,
        start_trace: usize,
        count: usize,
    ) -> Result<Arc<TraceChunk>, AppError> {
        self.chunk_cache
            .get_or_load(start_trace, count, &self.storage)
            .await
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
        agc: Option<AgcOptions>,
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
        if sample_count == 0 {
            return Ok(Vec::new());
        }

        // Resolve the AGC window (ms → samples) using this file's sample
        // interval; `None` leaves samples un-normalized.
        let agc_spec: Option<AgcSpec> =
            agc.map(|opts| resolve_agc(opts, self.binary_header.sample_interval_us));

        let window = self.get_or_load_window(start_trace, trace_count).await?;
        // Parse outside the cache lock so other tile fetches can proceed in
        // parallel against the same (or different) cached windows.
        window.extract_trace_data_with_range(
            start_trace,
            trace_count,
            start_sample,
            sample_count,
            &self.config,
            agc_spec.as_ref(),
        )
    }
}

/// Shared, async-safe state that caches the most recent SEG-Y reader.
pub struct SegyReaderState {
    reader: RwLock<Option<Arc<SegyReader>>>,
    overrides: RwLock<HashMap<String, SegyRevision>>,
    custom_specs: RwLock<HashMap<String, SegyFormatSpec>>,
}

impl Default for SegyReaderState {
    fn default() -> Self {
        Self {
            reader: RwLock::new(None),
            overrides: RwLock::new(HashMap::new()),
            custom_specs: RwLock::new(HashMap::new()),
        }
    }
}

impl SegyReaderState {
    /// Create a new empty reader state.
    pub fn new() -> Self {
        Self::default()
    }

    /// Store a user-chosen revision override for a specific file.
    ///
    /// Per D-06, the backend owns spec state per-file. This method records
    /// the user's revision choice so header data commands can respect it
    /// without re-opening the file.
    pub async fn set_active_revision(&self, file_path: String, revision: SegyRevision) {
        let mut overrides = self.overrides.write().await;
        overrides.insert(file_path, revision);
    }

    /// Return the active revision for a file, checking override first.
    ///
    /// Per D-06 D-08, returns the user's override if present, otherwise
    /// falls back to the auto-detected revision.
    pub async fn get_active_revision(
        &self,
        file_path: &str,
        detected: SegyRevision,
    ) -> SegyRevision {
        let overrides = self.overrides.read().await;
        overrides.get(file_path).copied().unwrap_or(detected)
    }

    /// Store a custom spec for a specific file path.
    ///
    /// Per D-12c, custom spec persists in memory for the session and survives
    /// file close/reopen.
    pub async fn set_custom_spec(&self, file_path: String, spec: SegyFormatSpec) {
        let mut specs = self.custom_specs.write().await;
        specs.insert(file_path, spec);
    }

    /// Retrieve a custom spec for a file, if one exists.
    pub async fn get_custom_spec(&self, file_path: &str) -> Option<SegyFormatSpec> {
        let specs = self.custom_specs.read().await;
        specs.get(file_path).cloned()
    }

    /// Remove a custom spec for a file.
    pub async fn clear_custom_spec(&self, file_path: &str) {
        let mut specs = self.custom_specs.write().await;
        specs.remove(file_path);
    }

    /// Check if a custom spec exists for a file.
    pub async fn has_custom_spec(&self, file_path: &str) -> bool {
        let specs = self.custom_specs.read().await;
        specs.contains_key(file_path)
    }

    /// Get or create a merged spec (standard + custom) for a file.
    ///
    /// If a custom spec exists, merge its fields with the standard spec.
    /// Custom fields override standard fields at the same byte position.
    ///
    /// Now invoked by `get_binary_header_data` and `get_trace_header_data`
    /// (Phase 02.1) so that custom fields appear in UI header tables.
    pub async fn get_active_spec(
        &self,
        file_path: &str,
        standard_spec: &SegyFormatSpec,
    ) -> SegyFormatSpec {
        let custom = self.get_custom_spec(file_path).await;
        match custom {
            Some(custom_spec) => merge_specs(standard_spec, &custom_spec),
            None => standard_spec.clone(),
        }
    }

    /// Open a new reader and cache it, replacing any previous reader.
    pub async fn open(
        &self,
        uri: String,
        config: Option<storage_config::StorageConfig>,
    ) -> Result<Arc<SegyReader>, AppError> {
        let reader = SegyReader::open_with_config(&uri, config).await?;
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

        if let Some(reader) = self.reader.read().await.as_ref()
            && reader.file_path() == uri
        {
            return Ok(reader.clone());
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

/// Merge a standard spec with a custom spec.
///
/// Custom fields override standard fields at the same byte position.
/// Custom-only fields are added to the appropriate header section.
fn merge_specs(standard: &SegyFormatSpec, custom: &SegyFormatSpec) -> SegyFormatSpec {
    use std::collections::HashSet;

    // All fields use 1-based local offsets relative to their header block: binary 1–400,
    // trace 1–240. No offset translation needed.
    let custom_binary_map: HashSet<u16> = custom
        .binary_header
        .fields
        .iter()
        .map(|f| f.byte_start)
        .collect();
    let custom_trace_map: HashSet<u16> = custom
        .trace_header
        .fields
        .iter()
        .map(|f| f.byte_start)
        .collect();

    let binary_fields: Vec<_> = standard
        .binary_header
        .fields
        .iter()
        .filter(|f| !custom_binary_map.contains(&f.byte_start))
        .cloned()
        .chain(custom.binary_header.fields.iter().cloned())
        .collect();

    // Trace header: start with standard fields, replace with custom fields
    let trace_fields: Vec<_> = standard
        .trace_header
        .fields
        .iter()
        .filter(|f| !custom_trace_map.contains(&f.byte_start))
        .chain(custom.trace_header.fields.iter())
        .cloned()
        .collect();

    SegyFormatSpec {
        version: format!("{} + Custom", standard.version),
        reference: standard.reference.clone(),
        binary_header: crate::segy::header_spec::BinaryHeaderSpec {
            size: standard.binary_header.size,
            fields: binary_fields,
        },
        trace_header: crate::segy::header_spec::TraceHeaderSpec {
            size: standard.trace_header.size,
            fields: trace_fields,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_set_active_revision_stores_override() {
        let state = SegyReaderState::new();
        state
            .set_active_revision("/path/to/file.segy".to_string(), SegyRevision::Rev1)
            .await;

        let overrides = state.overrides.read().await;
        assert_eq!(
            overrides.get("/path/to/file.segy"),
            Some(&SegyRevision::Rev1)
        );
    }

    #[tokio::test]
    async fn test_get_active_revision_returns_override_when_present() {
        let state = SegyReaderState::new();
        state
            .set_active_revision("/path/to/file.segy".to_string(), SegyRevision::Rev1)
            .await;

        let result = state
            .get_active_revision("/path/to/file.segy", SegyRevision::Rev0)
            .await;
        assert_eq!(result, SegyRevision::Rev1);
    }

    #[tokio::test]
    async fn test_get_active_revision_falls_back_to_detected_when_no_override() {
        let state = SegyReaderState::new();

        let result = state
            .get_active_revision("/path/to/file.segy", SegyRevision::Rev0)
            .await;
        assert_eq!(result, SegyRevision::Rev0);

        let result = state
            .get_active_revision("/path/to/file.segy", SegyRevision::Rev1)
            .await;
        assert_eq!(result, SegyRevision::Rev1);
    }

    #[tokio::test]
    async fn test_multiple_files_have_independent_overrides() {
        let state = SegyReaderState::new();
        state
            .set_active_revision("/path/to/file_a.segy".to_string(), SegyRevision::Rev0)
            .await;
        state
            .set_active_revision("/path/to/file_b.segy".to_string(), SegyRevision::Rev1)
            .await;

        let result_a = state
            .get_active_revision("/path/to/file_a.segy", SegyRevision::Rev1)
            .await;
        let result_b = state
            .get_active_revision("/path/to/file_b.segy", SegyRevision::Rev0)
            .await;

        assert_eq!(result_a, SegyRevision::Rev0);
        assert_eq!(result_b, SegyRevision::Rev1);
    }

    #[tokio::test]
    async fn test_override_can_be_changed() {
        let state = SegyReaderState::new();
        state
            .set_active_revision("/path/to/file.segy".to_string(), SegyRevision::Rev0)
            .await;
        let result = state
            .get_active_revision("/path/to/file.segy", SegyRevision::Rev1)
            .await;
        assert_eq!(result, SegyRevision::Rev0);

        state
            .set_active_revision("/path/to/file.segy".to_string(), SegyRevision::Rev1)
            .await;
        let result = state
            .get_active_revision("/path/to/file.segy", SegyRevision::Rev0)
            .await;
        assert_eq!(result, SegyRevision::Rev1);
    }
}
