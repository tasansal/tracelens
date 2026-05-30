//! `SegyStorage` — unified read interface over local and remote backends.
//!
//! Dispatches `read_range` / `read_ranges` / `size` to either
//! [`LocalStorage`] (memory-mapped file) or [`RemoteStorage`] (object_store)
//! based on the URI scheme detected at construction.

use crate::error::AppError;
use crate::io::credentials::{azure, gcs, http, s3};
use crate::io::local::LocalStorage;
use crate::io::remote::RemoteStorage;
use crate::io::uri::{
    is_remote_uri, try_convert_azure_url, try_convert_gcs_url, try_convert_s3_url,
};
use crate::storage_config;
use bytes::Bytes;
use object_store::{ObjectStoreExt, parse_url_opts};
use std::ops::Range;
use std::sync::Arc;
use url::Url;

/// Unified storage backend for SEG-Y files.
pub enum SegyStorage {
    /// Local file storage using memory mapping for zero-copy access.
    Local(LocalStorage),
    /// Remote storage using `object_store` for cloud/HTTP access.
    Remote(RemoteStorage),
}

impl SegyStorage {
    /// Open a storage backend from a URI.
    ///
    /// Scheme routing:
    /// - `s3://`, `gs://`, `az://`, `azure://`, `http://`, `https://` → Remote
    /// - Everything else → Local (memory-mapped file)
    ///
    /// HTTP(S) URLs pointing at known cloud-vendor hostnames are converted to
    /// their native schemes (`s3://`, `gs://`, `az://`) before dispatch.
    ///
    /// # Errors
    ///
    /// Returns [`AppError`] if the URI cannot be parsed, the object-store
    /// client cannot be constructed, or the remote `HEAD` request fails.
    pub async fn from_uri_with_config(
        uri: &str,
        config: Option<storage_config::StorageConfig>,
    ) -> Result<Self, AppError> {
        let config = config.unwrap_or_default();

        if !is_remote_uri(uri) {
            return Ok(SegyStorage::Local(LocalStorage::open(uri)?));
        }

        let mut url = Url::parse(uri).map_err(|e| AppError::InvalidUri {
            message: format!("Invalid URI: {}", e),
        })?;

        // Convert HTTP(S) cloud-vendor URLs to native schemes.
        let (url_account, url_sas) = if url.scheme() == "http" || url.scheme() == "https" {
            if let Some(s3_url) = try_convert_s3_url(&url) {
                url = s3_url;
                (None, None)
            } else if let Some(gcs_url) = try_convert_gcs_url(&url) {
                url = gcs_url;
                (None, None)
            } else if let Some((az_url, account, sas)) = try_convert_azure_url(&url) {
                url = az_url;
                (Some(account), sas)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        let options: Vec<(String, String)> = match url.scheme() {
            "s3" => s3::build_s3_options(&config.aws_s3),
            "gs" => gcs::build_gcs_options(&config.gcp_gcs),
            "az" | "azure" => azure::build_azure_options(&config.azure_blob, url_account, url_sas),
            "http" | "https" => http::build_http_options(&config.http),
            _ => Vec::new(),
        };

        let (store, path) =
            parse_url_opts(&url, options.iter().map(|(k, v)| (k.as_str(), v.as_str()))).map_err(
                |e| AppError::InvalidUri {
                    message: format!("Failed to parse object store URI: {}", e),
                },
            )?;

        let metadata = store.head(&path).await.map_err(|e| AppError::IoError {
            message: format!("Failed to fetch remote file metadata: {}", e),
        })?;

        Ok(SegyStorage::Remote(RemoteStorage {
            store: Arc::from(store),
            path,
            file_size: metadata.size as u64,
        }))
    }

    /// Read a single byte range.
    pub async fn read_range(&self, offset: u64, length: usize) -> Result<Bytes, AppError> {
        match self {
            SegyStorage::Local(local) => local.read_range(offset, length),
            SegyStorage::Remote(remote) => remote.read_range(offset, length).await,
        }
    }

    /// Read multiple byte ranges.
    ///
    /// Remote storage coalesces nearby ranges via vectored I/O automatically.
    pub async fn read_ranges(&self, ranges: &[Range<u64>]) -> Result<Vec<Bytes>, AppError> {
        match self {
            SegyStorage::Local(local) => local.read_ranges(ranges),
            SegyStorage::Remote(remote) => remote.read_ranges(ranges).await,
        }
    }

    /// Total file size in bytes.
    pub fn size(&self) -> u64 {
        match self {
            SegyStorage::Local(local) => local.size(),
            SegyStorage::Remote(remote) => remote.size(),
        }
    }
}
