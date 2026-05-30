//! Multi-chunk cache for efficient trace loading.
//!
//! Holds a small LRU of recently-loaded chunks (`Vec<Arc<TraceChunk>>`).
//! Chunks are aligned to fixed boundaries so concurrent requests for adjacent
//! traces dedupe to the same in-flight load — critical for parallel remote
//! reads where the cache mutex must not be held across network I/O.
use crate::error::AppError;
use crate::segy::agc::{AgcSpec, apply_agc};
use crate::segy::constants::FILE_HEADER_SIZE;
use crate::segy::io;
use crate::segy::model::SegyFileConfig;
use crate::segy::parser::{TraceBlock, TraceData};
use crate::segy::storage::SegyStorage;
use bytes::Bytes;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};

/// Fallback chunk count used by tests. Production wiring derives the cap from
/// the configured read-cache budget (`read_cache_mb / chunk_size_mb`).
#[cfg(test)]
const DEFAULT_MAX_CHUNKS: usize = 4;

/// Multi-chunk cache with single-flight dedup of concurrent loads.
///
/// The outer `Mutex` is held only for fast operations (find / insert / inflight
/// registration). Network I/O happens **without** the mutex held — concurrent
/// tile fetches that would otherwise serialize through one lock now run in
/// parallel. When two tasks ask for the same chunk simultaneously, the second
/// one sees a registered `Notify` and waits instead of issuing a duplicate
/// request.
pub struct ChunkCache {
    inner: Mutex<ChunkCacheInner>,
    chunk_size_bytes: usize,
    config: SegyFileConfig,
}

struct ChunkCacheInner {
    chunks: VecDeque<Arc<TraceChunk>>,
    /// Concurrent loads keyed by chunk-aligned start trace. The first task
    /// registers a `Notify`; later tasks targeting the same chunk wait on it.
    in_flight: HashMap<usize, Arc<Notify>>,
    max_chunks: usize,
}

impl ChunkCache {
    /// Create a chunk cache.
    ///
    /// `chunk_size_mb` is the aligned read granularity; `max_chunks` caps how
    /// many chunks stay resident, so the read-cache budget is roughly
    /// `max_chunks * chunk_size_mb` MiB. `max_chunks` is floored at 1.
    pub fn with_params(config: SegyFileConfig, chunk_size_mb: usize, max_chunks: usize) -> Self {
        let max_chunks = max_chunks.max(1);
        Self {
            inner: Mutex::new(ChunkCacheInner {
                chunks: VecDeque::with_capacity(max_chunks),
                in_flight: HashMap::new(),
                max_chunks,
            }),
            chunk_size_bytes: chunk_size_mb * 1024 * 1024,
            config,
        }
    }

    /// Find a covering chunk or load one, releasing the cache lock during I/O.
    ///
    /// Hot path for tile rendering. Loads dedupe by chunk-aligned start trace,
    /// so 16 concurrent tile fetches that all need the same chunk issue a
    /// single network request and the rest wait on a `Notify`.
    pub async fn get_or_load(
        self: &Arc<Self>,
        start_trace: usize,
        count: usize,
        storage: &SegyStorage,
    ) -> Result<Arc<TraceChunk>, AppError> {
        let trace_size = self.config.trace_block_size()?;
        let chunk_traces = (self.chunk_size_bytes / trace_size).max(1);
        let chunk_start = (start_trace / chunk_traces) * chunk_traces;

        // Validate that the request fits inside the file before issuing any I/O.
        let end_trace = start_trace.saturating_add(count);
        let end_offset = FILE_HEADER_SIZE as u64 + (end_trace as u64) * (trace_size as u64);
        if end_offset > storage.size() {
            return Err(AppError::InvalidRange {
                message: format!(
                    "Requested traces {}..{} extend beyond file",
                    start_trace, end_trace
                ),
            });
        }

        // The chunk we load must cover the user's full request, which may
        // span more traces than the default chunk size when count is large.
        let needed_traces_from_chunk_start = end_trace - chunk_start;

        loop {
            // Brief lock — try cache, then either claim the load or get a
            // `Notify` to wait on.
            let action = {
                let mut inner = self.inner.lock().await;
                if let Some(w) = inner.find(start_trace, count) {
                    return Ok(w);
                }
                match inner.in_flight.get(&chunk_start) {
                    Some(n) => Action::Wait(n.clone()),
                    None => {
                        let notify = Arc::new(Notify::new());
                        inner.in_flight.insert(chunk_start, notify);
                        Action::Load
                    }
                }
            };

            match action {
                Action::Wait(notify) => {
                    notify.notified().await;
                    // Loop and re-check; the chunk should now be cached. If
                    // the loader failed, we'll register as the new loader.
                    continue;
                }
                Action::Load => {
                    let result = self
                        .load_chunk_io(
                            chunk_start,
                            needed_traces_from_chunk_start,
                            trace_size,
                            storage,
                        )
                        .await;

                    let mut inner = self.inner.lock().await;
                    let notify = inner.in_flight.remove(&chunk_start);
                    if let Some(n) = &notify {
                        n.notify_waiters();
                    }

                    match result {
                        Ok(chunk) => {
                            inner.insert(chunk.clone());
                            return Ok(chunk);
                        }
                        Err(e) => return Err(e),
                    }
                }
            }
        }
    }

    /// Read a chunk from storage. Runs without any cache lock held so multiple
    /// concurrent reads of distinct chunks issue in parallel.
    async fn load_chunk_io(
        &self,
        chunk_start: usize,
        needed_traces: usize,
        trace_size: usize,
        storage: &SegyStorage,
    ) -> Result<Arc<TraceChunk>, AppError> {
        let file_size = storage.size();
        let data_start = FILE_HEADER_SIZE as u64;

        let offset = data_start + (chunk_start as u64 * trace_size as u64);
        if offset >= file_size {
            return Err(AppError::InvalidRange {
                message: format!("Trace {} is beyond file size", chunk_start),
            });
        }

        // Read at least `needed_traces` from chunk_start, but default to
        // `chunk_size_bytes` when the user's range fits — extra data amortizes
        // the per-request cost over neighboring tiles served from the same chunk.
        let chunk_default_traces = (self.chunk_size_bytes / trace_size).max(1);
        let target_traces = chunk_default_traces.max(needed_traces);
        let target_bytes = (target_traces * trace_size) as u64;
        let remaining_bytes = file_size - offset;
        let read_bytes = remaining_bytes.min(target_bytes);

        let trace_count = (read_bytes / trace_size as u64) as usize;
        let aligned_bytes = trace_count * trace_size;

        if trace_count == 0 {
            return Err(AppError::InvalidRange {
                message: "Not enough data for even one trace".to_string(),
            });
        }

        let data = storage.read_range(offset, aligned_bytes).await?;

        Ok(Arc::new(TraceChunk {
            start_trace: chunk_start,
            trace_count,
            data,
            trace_size,
        }))
    }
}

impl ChunkCacheInner {
    /// Look up a cached chunk that fully covers `start_trace..start_trace+count`.
    ///
    /// Newest-first iteration: adjacent-tile requests typically hit the most
    /// recently loaded chunk.
    fn find(&self, start_trace: usize, count: usize) -> Option<Arc<TraceChunk>> {
        self.chunks
            .iter()
            .rev()
            .find(|c| {
                start_trace >= c.start_trace && start_trace + count <= c.start_trace + c.trace_count
            })
            .cloned()
    }

    fn insert(&mut self, chunk: Arc<TraceChunk>) {
        self.chunks.push_back(chunk);
        while self.chunks.len() > self.max_chunks {
            self.chunks.pop_front();
        }
    }
}

enum Action {
    Wait(Arc<Notify>),
    Load,
}

/// A chunk of cached trace bytes, kept alive via `Arc` so multiple tile
/// fetches can parse from the same chunk in parallel without copying.
pub struct TraceChunk {
    pub start_trace: usize,
    pub trace_count: usize,
    data: Bytes,
    trace_size: usize,
}

impl TraceChunk {
    /// Parse `count` full trace blocks (header + samples) from this chunk.
    pub fn extract_traces(
        &self,
        start_trace: usize,
        count: usize,
        config: &SegyFileConfig,
    ) -> Result<Vec<TraceBlock>, AppError> {
        if start_trace < self.start_trace
            || start_trace + count > self.start_trace + self.trace_count
        {
            return Err(AppError::InvalidRange {
                message: format!(
                    "Requested traces {}..{} outside chunk {}..{}",
                    start_trace,
                    start_trace + count,
                    self.start_trace,
                    self.start_trace + self.trace_count
                ),
            });
        }

        let offset_in_chunk = start_trace - self.start_trace;
        let start_byte = offset_in_chunk * self.trace_size;
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

    /// Parse only a sample sub-range from each of `count` traces. Optimized
    /// for viewport rendering where the user is zoomed into a vertical band.
    pub fn extract_trace_data_with_range(
        &self,
        start_trace: usize,
        count: usize,
        start_sample: usize,
        sample_count: usize,
        config: &SegyFileConfig,
        agc: Option<&AgcSpec>,
    ) -> Result<Vec<TraceData>, AppError> {
        if start_trace < self.start_trace
            || start_trace + count > self.start_trace + self.trace_count
        {
            return Err(AppError::InvalidRange {
                message: format!(
                    "Requested traces {}..{} outside chunk {}..{}",
                    start_trace,
                    start_trace + count,
                    self.start_trace,
                    self.start_trace + self.trace_count
                ),
            });
        }

        let offset_in_chunk = start_trace - self.start_trace;
        let start_byte = offset_in_chunk * self.trace_size;
        let format = config.data_sample_format_parsed()?;

        let mut trace_data = Vec::with_capacity(count);
        for i in 0..count {
            let trace_start = start_byte + (i * self.trace_size);
            let trace_end = trace_start + self.trace_size;

            let trace_bytes = &self.data[trace_start..trace_end];
            let data = match agc {
                // AGC (per-trace sliding window) needs full-trace context, so decode the
                // whole trace, normalize, and return only the requested slice.
                Some(spec) => {
                    let full = io::parse_trace_data(trace_bytes, format, config.samples_per_trace)
                        .map_err(|e| AppError::ParseError {
                            message: format!("Failed to parse trace data range: {}", e),
                        })?;
                    let mut samples = Vec::with_capacity(full.len());
                    full.for_each_f32(|v| samples.push(v));
                    // Clamp to the actual trace length so the AGC path returns
                    // the same sample count as the non-AGC path would at the
                    // end of a file (rather than zero-padding to sample_count).
                    let actual_count = sample_count
                        .min((config.samples_per_trace as usize).saturating_sub(start_sample));
                    TraceData::IeeeFloat32(apply_agc(&samples, start_sample, actual_count, spec))
                }
                // No AGC: decode only the requested sample sub-range.
                None => io::parse_trace_data_with_range(
                    trace_bytes,
                    format,
                    config.samples_per_trace,
                    start_sample,
                    sample_count,
                )
                .map_err(|e| AppError::ParseError {
                    message: format!("Failed to parse trace data range: {}", e),
                })?,
            };

            trace_data.push(data);
        }

        Ok(trace_data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::segy::fixtures::create_minimal_segy_file;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn make_file_config() -> SegyFileConfig {
        SegyFileConfig {
            samples_per_trace: 100,
            data_sample_format: crate::segy::parser::binary_header::DataSampleFormat::IeeeFloat32
                as u16,
            byte_order: crate::segy::ByteOrder::BigEndian,
        }
    }

    fn write_fixture(bytes: &[u8]) -> NamedTempFile {
        let mut f = NamedTempFile::new().expect("failed to create temp file");
        f.write_all(bytes).expect("failed to write fixture");
        f
    }

    fn open_storage(path: &std::path::Path) -> SegyStorage {
        SegyStorage::Local(crate::io::local::LocalStorage::open(path.to_str().unwrap()).unwrap())
    }

    async fn cache_len(cache: &ChunkCache) -> usize {
        cache.inner.lock().await.chunks.len()
    }

    async fn cache_has_covering(cache: &ChunkCache, start: usize, count: usize) -> bool {
        cache.inner.lock().await.find(start, count).is_some()
    }

    #[tokio::test]
    async fn test_chunk_cache_creation() {
        let cache = ChunkCache::with_params(make_file_config(), 16, DEFAULT_MAX_CHUNKS);
        assert_eq!(cache_len(&cache).await, 0);
        assert_eq!(cache.chunk_size_bytes, 16 * 1024 * 1024);
    }

    #[tokio::test]
    async fn test_chunk_cache_creation_custom_params() {
        let cache = ChunkCache::with_params(make_file_config(), 1, DEFAULT_MAX_CHUNKS);
        assert_eq!(cache.chunk_size_bytes, 1024 * 1024);
    }

    #[tokio::test]
    async fn test_get_or_load_returns_chunk() {
        let fixture = create_minimal_segy_file(10, 100, 5);
        let tmp = write_fixture(&fixture.bytes);
        let storage = open_storage(tmp.path());
        let config = make_file_config();

        let cache = Arc::new(ChunkCache::with_params(
            config.clone(),
            1,
            DEFAULT_MAX_CHUNKS,
        ));
        let chunk = cache.get_or_load(0, 5, &storage).await.unwrap();
        let traces = chunk.extract_traces(0, 5, &config).unwrap();
        assert_eq!(traces.len(), 5);
    }

    #[tokio::test]
    async fn test_get_or_load_out_of_range() {
        let fixture = create_minimal_segy_file(5, 100, 5);
        let tmp = write_fixture(&fixture.bytes);
        let storage = open_storage(tmp.path());

        let cache = Arc::new(ChunkCache::with_params(
            make_file_config(),
            1,
            DEFAULT_MAX_CHUNKS,
        ));
        let result = cache.get_or_load(100, 1, &storage).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_extract_trace_data_with_range() {
        let fixture = create_minimal_segy_file(5, 100, 5);
        let tmp = write_fixture(&fixture.bytes);
        let storage = open_storage(tmp.path());
        let config = make_file_config();

        let cache = Arc::new(ChunkCache::with_params(
            config.clone(),
            1,
            DEFAULT_MAX_CHUNKS,
        ));
        let chunk = cache.get_or_load(0, 3, &storage).await.unwrap();
        let trace_data = chunk
            .extract_trace_data_with_range(0, 3, 10, 20, &config, None)
            .unwrap();
        assert_eq!(trace_data.len(), 3);
        for td in &trace_data {
            assert_eq!(td.len(), 20);
        }
    }

    #[tokio::test]
    async fn test_repeat_request_serves_from_cache() {
        let fixture = create_minimal_segy_file(10, 100, 5);
        let tmp = write_fixture(&fixture.bytes);
        let storage = open_storage(tmp.path());

        let cache = Arc::new(ChunkCache::with_params(
            make_file_config(),
            1,
            DEFAULT_MAX_CHUNKS,
        ));
        cache.get_or_load(0, 5, &storage).await.unwrap();
        let after_first = cache_len(&cache).await;

        // Adjacent request that fits inside the same chunk must reuse it.
        cache.get_or_load(1, 3, &storage).await.unwrap();
        let after_second = cache_len(&cache).await;

        assert_eq!(after_first, after_second);
        assert_eq!(after_first, 1);
    }

    #[tokio::test]
    async fn test_lru_evicts_oldest() {
        // Trace size = 240 (header) + 100 samples * 4 bytes = 640 bytes.
        // 1 MiB chunk = ~1638 traces per chunk. Chunks align to multiples
        // of 1638, so spaced starts each map to distinct aligned chunks.
        let fixture = create_minimal_segy_file(10_000, 100, 5);
        let tmp = write_fixture(&fixture.bytes);
        let storage = open_storage(tmp.path());

        let cache = Arc::new(ChunkCache::with_params(
            make_file_config(),
            1,
            DEFAULT_MAX_CHUNKS,
        ));
        let starts = [0usize, 1700, 3400, 5100, 6800];
        for start in starts {
            cache.get_or_load(start, 1, &storage).await.unwrap();
        }
        assert_eq!(cache_len(&cache).await, DEFAULT_MAX_CHUNKS);

        // The oldest chunk (covering start=0) must have been evicted.
        assert!(!cache_has_covering(&cache, 0, 1).await);
        assert!(cache_has_covering(&cache, 6800, 1).await);
    }

    #[tokio::test]
    async fn test_concurrent_loads_dedupe() {
        // Two concurrent requests that map to the same chunk should share a
        // single I/O — only one chunk ends up cached.
        let fixture = create_minimal_segy_file(2_000, 100, 5);
        let tmp = write_fixture(&fixture.bytes);
        let storage = Arc::new(open_storage(tmp.path()));

        let cache = Arc::new(ChunkCache::with_params(
            make_file_config(),
            1,
            DEFAULT_MAX_CHUNKS,
        ));

        let c1 = cache.clone();
        let s1 = storage.clone();
        let c2 = cache.clone();
        let s2 = storage.clone();

        let (r1, r2) = tokio::join!(
            async move { c1.get_or_load(100, 5, &s1).await },
            async move { c2.get_or_load(200, 5, &s2).await },
        );

        r1.unwrap();
        r2.unwrap();
        // Both requests fit inside the first aligned chunk → exactly one chunk.
        assert_eq!(cache_len(&cache).await, 1);
    }
}
