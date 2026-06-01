//! Object-store remote storage backend (S3, GCS, Azure, HTTP).

use crate::error::AppError;
use bytes::Bytes;
use object_store::{ObjectStore, ObjectStoreExt};
use std::ops::Range;
use std::sync::Arc;

/// Remote SEG-Y file accessed via [`object_store`].
///
/// Caches the file size from the initial `HEAD` request so `size()` is free
/// after construction.
pub struct RemoteStorage {
    pub(super) store: Arc<dyn ObjectStore>,
    pub(super) path: object_store::path::Path,
    pub(super) file_size: u64,
}

impl RemoteStorage {
    /// Read a single byte range from remote storage.
    pub async fn read_range(&self, offset: u64, length: usize) -> Result<Bytes, AppError> {
        let end = offset + length as u64;

        self.store
            .get_range(&self.path, offset..end)
            .await
            .map_err(|e| AppError::IoError {
                message: format!("Failed to read from remote storage: {}", e),
            })
    }

    /// Read multiple byte ranges, coalesced by `object_store`'s vectored I/O.
    ///
    /// `object_store` automatically merges nearby ranges into fewer HTTP
    /// requests, so callers should not bother pre-coalescing.
    pub async fn read_ranges(&self, ranges: &[Range<u64>]) -> Result<Vec<Bytes>, AppError> {
        if ranges.is_empty() {
            return Ok(Vec::new());
        }

        self.store
            .get_ranges(&self.path, ranges)
            .await
            .map_err(|e| AppError::IoError {
                message: format!("Failed to read ranges from remote storage: {}", e),
            })
    }

    /// Cached file size (set at construction from the `HEAD` response).
    pub fn size(&self) -> u64 {
        self.file_size
    }
}
