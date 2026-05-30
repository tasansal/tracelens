//! Memory-mapped local file storage backend.

use crate::error::AppError;
use bytes::Bytes;
use memmap2::Mmap;
use std::fs::File;
use std::ops::Range;

/// Local SEG-Y file accessed via memory mapping.
///
/// The mmap gives zero-copy random reads at the cost of one `mmap(2)` syscall
/// on open. The OS handles read-ahead and page eviction transparently.
pub struct LocalStorage {
    pub(super) mmap: Mmap,
    /// Kept alive so the file descriptor stays open for the lifetime of the mmap.
    _file: File,
}

impl LocalStorage {
    /// Open `path` and memory-map its contents.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::IoError`] if the file cannot be opened or mapped.
    pub fn open(path: &str) -> Result<Self, AppError> {
        let file = File::open(path).map_err(|e| AppError::IoError {
            message: format!("Failed to open file: {}", e),
        })?;

        let mmap = unsafe {
            Mmap::map(&file).map_err(|e| AppError::IoError {
                message: format!("Failed to memory map file: {}", e),
            })?
        };

        Ok(LocalStorage { mmap, _file: file })
    }

    /// Read a single byte range — zero-copy slice from the mmap.
    pub fn read_range(&self, offset: u64, length: usize) -> Result<Bytes, AppError> {
        let start = offset as usize;
        let end = start + length;

        if end > self.mmap.len() {
            return Err(AppError::InvalidRange {
                message: format!(
                    "Range {}..{} exceeds file size {}",
                    start,
                    end,
                    self.mmap.len()
                ),
            });
        }

        Ok(Bytes::copy_from_slice(&self.mmap[start..end]))
    }

    /// Read multiple byte ranges.
    pub fn read_ranges(&self, ranges: &[Range<u64>]) -> Result<Vec<Bytes>, AppError> {
        ranges
            .iter()
            .map(|range| self.read_range(range.start, (range.end - range.start) as usize))
            .collect()
    }

    /// Total mapped file size in bytes.
    pub fn size(&self) -> u64 {
        self.mmap.len() as u64
    }
}
