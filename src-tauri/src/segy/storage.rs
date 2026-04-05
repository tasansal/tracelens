use crate::error::AppError;
use crate::storage_config;
use bytes::Bytes;
use memmap2::Mmap;
use object_store::{GetOptions, GetRange, ObjectStore, parse_url_opts};
use std::fs::File;
use std::ops::Range;
use std::sync::Arc;
use url::Url;

// ============================================================================
// URL Conversion Helpers
// ============================================================================

/// Convert HTTP(S) S3 URLs to s3:// scheme
/// e.g., http://s3.amazonaws.com/bucket/key -> s3://bucket/key
fn try_convert_s3_url(url: &Url) -> Option<Url> {
    if let Some(host) = url.host_str()
        && (host == "s3.amazonaws.com"
            || (host.starts_with("s3.") && host.ends_with(".amazonaws.com")))
        && let Some(path_without_slash) = url.path().strip_prefix('/')
    {
        return Url::parse(&format!("s3://{}", path_without_slash)).ok();
    }
    None
}

/// Convert HTTP(S) GCS URLs to gs:// scheme
/// e.g., https://storage.googleapis.com/bucket/object -> gs://bucket/object
fn try_convert_gcs_url(url: &Url) -> Option<Url> {
    if let Some(host) = url.host_str() {
        // Path-style: storage.googleapis.com/<bucket>/<object>
        // and browser-facing form: storage.cloud.google.com/<bucket>/<object>
        if (host == "storage.googleapis.com" || host == "storage.cloud.google.com")
            && let Some(path_without_slash) = url.path().strip_prefix('/')
        {
            return Url::parse(&format!("gs://{}", path_without_slash)).ok();
        }

        // Virtual-hosted style: <bucket>.storage.googleapis.com/<object>
        if let Some(bucket) = host.strip_suffix(".storage.googleapis.com")
            && !bucket.is_empty()
        {
            let object = url.path().strip_prefix('/').unwrap_or_default();
            return Url::parse(&format!("gs://{}/{}", bucket, object)).ok();
        }
    }
    None
}

/// Convert HTTP(S) Azure URLs to az:// scheme and extract account/SAS
/// e.g., https://account.blob.core.windows.net/container/blob?sas -> (az://container/blob, account, sas)
fn try_convert_azure_url(url: &Url) -> Option<(Url, String, Option<String>)> {
    if let Some(host) = url.host_str()
        && host.ends_with(".blob.core.windows.net")
        && let Some(account) = host.strip_suffix(".blob.core.windows.net")
    {
        let account_name = account.to_string();
        let sas_token = url.query().and_then(normalize_azure_sas_token);

        if let Some(path_without_slash) = url.path().strip_prefix('/')
            && let Ok(az_url) = Url::parse(&format!("az://{}", path_without_slash))
        {
            return Some((az_url, account_name, sas_token));
        }
    }
    None
}

// ============================================================================
// Config Option Builders
// ============================================================================

fn normalize_optional(value: Option<&String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn is_supported_aws_env_key(key: &str) -> bool {
    matches!(
        key,
        "aws_access_key_id"
            | "aws_secret_access_key"
            | "aws_session_token"
            | "aws_region"
            | "aws_default_region"
            | "aws_endpoint"
            | "aws_endpoint_url"
            | "aws_imdsv1_fallback"
            | "aws_metadata_endpoint"
            | "aws_container_credentials_relative_uri"
            | "aws_container_credentials_full_uri"
            | "aws_container_authorization_token_file"
            | "aws_web_identity_token_file"
            | "aws_role_arn"
            | "aws_role_session_name"
            | "aws_endpoint_url_sts"
    )
}

fn build_s3_env_options() -> Vec<(String, String)> {
    std::env::vars()
        .filter_map(|(raw_key, raw_value)| {
            if !raw_key.starts_with("AWS_") {
                return None;
            }

            let key = raw_key.to_ascii_lowercase();
            if !is_supported_aws_env_key(&key) {
                return None;
            }

            let value = raw_value.trim();
            if value.is_empty() {
                return None;
            }

            Some((key, value.to_string()))
        })
        .collect()
}

/// Normalize an Azure SAS token so users can paste either
/// `sv=...&sig=...` or `?sv=...&sig=...`.
fn normalize_azure_sas_token(token: &str) -> Option<String> {
    let trimmed = token.trim().trim_start_matches('?');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Build S3 configuration options
fn build_s3_options(config: &Option<storage_config::S3Config>) -> Vec<(String, String)> {
    // Start from ambient AWS_* env vars so explicit UI inputs can override them.
    let mut options = build_s3_env_options();

    if let Some(s3_config) = config {
        if let Some(region) = normalize_optional(Some(&s3_config.region)) {
            options.push(("aws_region".to_string(), region));
        }
        if let Some(key_id) = normalize_optional(s3_config.access_key_id.as_ref()) {
            options.push(("aws_access_key_id".to_string(), key_id));
        }
        if let Some(secret) = normalize_optional(s3_config.secret_access_key.as_ref()) {
            options.push(("aws_secret_access_key".to_string(), secret));
        }
        if let Some(token) = normalize_optional(s3_config.session_token.as_ref()) {
            options.push(("aws_session_token".to_string(), token));
        }
        if let Some(endpoint) = normalize_optional(s3_config.endpoint.as_ref()) {
            options.push(("aws_endpoint".to_string(), endpoint));
        }

        // Anonymous mode is explicit: only enable unsigned requests when selected.
        if s3_config.skip_signature {
            options.push(("aws_skip_signature".to_string(), "true".to_string()));
        }
    }

    options
}

/// Build GCS configuration options
fn build_gcs_options(config: &Option<storage_config::GcsConfig>) -> Vec<(String, String)> {
    let mut options = Vec::new();

    if let Some(gcs_config) = config {
        if gcs_config.skip_signature {
            options.push(("google_skip_signature".to_string(), "true".to_string()));
            return options;
        }

        // Keep precedence explicit and deterministic:
        // 1) inline service account JSON
        // 2) service account key path
        // 3) explicit ADC file path
        // 4) fallback to ambient ADC chain
        if let Some(key) = normalize_optional(gcs_config.service_account_key.as_ref()) {
            options.push(("google_service_account_key".to_string(), key));
        } else if let Some(path) = normalize_optional(gcs_config.service_account_key_path.as_ref())
        {
            options.push(("google_service_account".to_string(), path));
        } else if let Some(path) =
            normalize_optional(gcs_config.application_credentials_path.as_ref())
        {
            options.push(("google_application_credentials".to_string(), path));
        }
    }

    options
}

/// Build Azure configuration options
/// If account_name or sas_token are provided from URL, they can override empty config values
fn build_azure_options(
    config: &Option<storage_config::AzureConfig>,
    url_account: Option<String>,
    url_sas: Option<String>,
) -> Vec<(String, String)> {
    let mut options = Vec::new();
    let normalized_url_account = url_account.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });
    let normalized_url_sas = url_sas.and_then(|token| normalize_azure_sas_token(&token));

    match config {
        Some(azure_config) => {
            // Prefer explicit account in settings, then infer from URL when available.
            let account = normalize_optional(Some(&azure_config.account_name))
                .or(normalized_url_account.clone());

            if let Some(acc) = account {
                options.push(("azure_storage_account_name".to_string(), acc));
            }

            // Credential precedence:
            // 1) Explicit SAS token (recommended for short-lived access)
            // 2) Explicit account key
            // 3) SAS token embedded in the URL
            if let Some(token) = normalize_optional(azure_config.sas_token.as_ref())
                .and_then(|token| normalize_azure_sas_token(&token))
            {
                options.push(("azure_storage_sas_token".to_string(), token));
            } else if let Some(key) = normalize_optional(azure_config.access_key.as_ref()) {
                options.push(("azure_storage_account_key".to_string(), key));
            } else if let Some(sas) = normalized_url_sas.clone() {
                // No explicit credential configured, use URL SAS if available.
                options.push(("azure_storage_sas_token".to_string(), sas));
            }

            if let Some(endpoint) = normalize_optional(azure_config.endpoint.as_ref()) {
                options.push(("azure_storage_endpoint".to_string(), endpoint));
            }
        }
        None => {
            // No config - use URL-extracted values
            if let Some(account) = normalized_url_account {
                options.push(("azure_storage_account_name".to_string(), account));
            }
            if let Some(sas) = normalized_url_sas {
                options.push(("azure_storage_sas_token".to_string(), sas));
            }
        }
    }

    options
}

/// Build HTTP configuration options
fn build_http_options(config: &Option<storage_config::HttpConfig>) -> Vec<(String, String)> {
    let mut options = Vec::new();

    if let Some(http_config) = config {
        options.push((
            "timeout".to_string(),
            format!("{}s", http_config.timeout_secs),
        ));
        for (key, value) in &http_config.headers {
            options.push((key.clone(), value.clone()));
        }
    }

    options
}

// ============================================================================
// Storage Backend
// ============================================================================

/// Storage backend abstraction for SEG-Y files
///
/// Supports both local files (memory-mapped for performance) and remote storage
/// (S3, GCS, Azure, HTTP via object_store crate).
pub enum SegyStorage {
    /// Local file storage using memory mapping for zero-copy access
    Local(LocalStorage),
    /// Remote storage using object_store for cloud/HTTP access
    Remote(RemoteStorage),
}

impl SegyStorage {
    /// Create storage backend from URI
    ///
    /// Detects storage type from URI scheme:
    /// - s3://, gs://, az://, http://, https:// -> Remote
    /// - Everything else -> Local (memory-mapped file)
    ///
    /// Also detects S3 by hostname (s3.amazonaws.com, s3-*.amazonaws.com, *.s3.amazonaws.com)
    /// For S3, uses configured credentials or falls back to provider default chain.
    ///
    /// # Arguments
    /// * `uri` - The URI to open
    /// * `config` - Optional storage configuration. If None, uses provider default chain.
    pub async fn from_uri_with_config(
        uri: &str,
        config: Option<storage_config::StorageConfig>,
    ) -> Result<Self, AppError> {
        let config = config.unwrap_or_default();

        // Check if URI is a remote storage scheme
        if uri.starts_with("s3://")
            || uri.starts_with("gs://")
            || uri.starts_with("az://")
            || uri.starts_with("azure://")
            || uri.starts_with("http://")
            || uri.starts_with("https://")
        {
            let mut url =
                Url::parse(uri).map_err(|e| AppError::InvalidUri(format!("Invalid URI: {}", e)))?;

            // Try to convert HTTP(S) cloud storage URLs to native schemes
            let (url_account, url_sas) = if url.scheme() == "http" || url.scheme() == "https" {
                // Try S3 conversion
                if let Some(s3_url) = try_convert_s3_url(&url) {
                    url = s3_url;
                    (None, None)
                }
                // Try GCS conversion
                else if let Some(gcs_url) = try_convert_gcs_url(&url) {
                    url = gcs_url;
                    (None, None)
                }
                // Try Azure conversion (also extracts account and SAS)
                else if let Some((az_url, account, sas)) = try_convert_azure_url(&url) {
                    url = az_url;
                    (Some(account), sas)
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            };

            // Build options based on URL scheme
            let options = match url.scheme() {
                "s3" => build_s3_options(&config.aws_s3),
                "gs" => build_gcs_options(&config.gcp_gcs),
                "az" | "azure" => build_azure_options(&config.azure_blob, url_account, url_sas),
                "http" | "https" => build_http_options(&config.http),
                _ => Vec::new(),
            };

            let (store, path) =
                parse_url_opts(&url, options.iter().map(|(k, v)| (k.as_str(), v.as_str())))
                    .map_err(|e| {
                        AppError::InvalidUri(format!("Failed to parse object store URI: {}", e))
                    })?;

            // Fetch file metadata to get size
            let metadata = store.head(&path).await.map_err(|e| AppError::IoError {
                message: format!("Failed to fetch remote file metadata: {}", e),
            })?;

            Ok(SegyStorage::Remote(RemoteStorage {
                store: Arc::from(store),
                path,
                file_size: metadata.size as u64,
            }))
        } else {
            // Local file path
            Ok(SegyStorage::Local(LocalStorage::open(uri)?))
        }
    }

    /// Read a single byte range from storage
    pub async fn read_range(&self, offset: u64, length: usize) -> Result<Bytes, AppError> {
        match self {
            SegyStorage::Local(local) => local.read_range(offset, length),
            SegyStorage::Remote(remote) => remote.read_range(offset, length).await,
        }
    }

    /// Read multiple byte ranges from storage
    ///
    /// For remote storage, this uses vectored I/O which automatically coalesces
    /// nearby ranges into fewer requests.
    pub async fn read_ranges(&self, ranges: &[Range<u64>]) -> Result<Vec<Bytes>, AppError> {
        match self {
            SegyStorage::Local(local) => local.read_ranges(ranges),
            SegyStorage::Remote(remote) => remote.read_ranges(ranges).await,
        }
    }

    /// Get total file size
    pub fn size(&self) -> u64 {
        match self {
            SegyStorage::Local(local) => local.size(),
            SegyStorage::Remote(remote) => remote.size(),
        }
    }
}

/// Local file storage using memory mapping
pub struct LocalStorage {
    mmap: Mmap,
    _file: File,
}

impl LocalStorage {
    /// Open a local file with memory mapping
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

    /// Read a byte range (zero-copy slice from mmap)
    pub fn read_range(&self, offset: u64, length: usize) -> Result<Bytes, AppError> {
        let start = offset as usize;
        let end = start + length;

        if end > self.mmap.len() {
            return Err(AppError::InvalidRange(format!(
                "Range {}..{} exceeds file size {}",
                start,
                end,
                self.mmap.len()
            )));
        }

        // Zero-copy: just slice the mmap and copy to Bytes
        Ok(Bytes::copy_from_slice(&self.mmap[start..end]))
    }

    /// Read multiple byte ranges
    pub fn read_ranges(&self, ranges: &[Range<u64>]) -> Result<Vec<Bytes>, AppError> {
        ranges
            .iter()
            .map(|range| self.read_range(range.start, (range.end - range.start) as usize))
            .collect()
    }

    /// Get file size
    pub fn size(&self) -> u64 {
        self.mmap.len() as u64
    }
}

/// Remote storage using object_store
pub struct RemoteStorage {
    store: Arc<dyn ObjectStore>,
    path: object_store::path::Path,
    file_size: u64,
}

impl RemoteStorage {
    /// Read a byte range from remote storage
    pub async fn read_range(&self, offset: u64, length: usize) -> Result<Bytes, AppError> {
        let end = offset + length as u64;
        let range = GetRange::Bounded(offset..end);

        let opts = GetOptions {
            range: Some(range),
            ..Default::default()
        };

        let result =
            self.store
                .get_opts(&self.path, opts)
                .await
                .map_err(|e| AppError::IoError {
                    message: format!("Failed to read from remote storage: {}", e),
                })?;

        let bytes = result.bytes().await.map_err(|e| AppError::IoError {
            message: format!("Failed to get bytes from remote storage: {}", e),
        })?;

        Ok(bytes)
    }

    /// Read multiple byte ranges from remote storage
    ///
    /// Uses vectored I/O for efficiency - object_store automatically coalesces
    /// nearby ranges into fewer requests.
    pub async fn read_ranges(&self, ranges: &[Range<u64>]) -> Result<Vec<Bytes>, AppError> {
        if ranges.is_empty() {
            return Ok(Vec::new());
        }

        let bytes_vec = self
            .store
            .get_ranges(&self.path, ranges)
            .await
            .map_err(|e| AppError::IoError {
                message: format!("Failed to read ranges from remote storage: {}", e),
            })?;

        Ok(bytes_vec)
    }

    /// Get cached file size
    pub fn size(&self) -> u64 {
        self.file_size
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn options_to_map(options: Vec<(String, String)>) -> HashMap<String, String> {
        options.into_iter().collect()
    }

    #[test]
    fn test_try_convert_azure_url_extracts_account_and_sas() {
        let url = Url::parse(
            "https://myaccount.blob.core.windows.net/my-container/path/file.sgy?sv=2024&sig=abc",
        )
        .unwrap();
        let (converted, account, sas) = try_convert_azure_url(&url).unwrap();

        assert_eq!(converted.as_str(), "az://my-container/path/file.sgy");
        assert_eq!(account, "myaccount");
        assert_eq!(sas.as_deref(), Some("sv=2024&sig=abc"));
    }

    #[test]
    fn test_build_s3_options_prefers_explicit_auth_settings() {
        let config = Some(storage_config::S3Config {
            region: "us-west-2".to_string(),
            access_key_id: Some("AKIA_EXPLICIT".to_string()),
            secret_access_key: Some("SECRET_EXPLICIT".to_string()),
            session_token: Some("TOKEN_EXPLICIT".to_string()),
            endpoint: Some("https://s3.us-west-2.amazonaws.com".to_string()),
            skip_signature: false,
        });

        let options = options_to_map(build_s3_options(&config));
        assert_eq!(options.get("aws_region"), Some(&"us-west-2".to_string()));
        assert_eq!(
            options.get("aws_access_key_id"),
            Some(&"AKIA_EXPLICIT".to_string())
        );
        assert_eq!(
            options.get("aws_secret_access_key"),
            Some(&"SECRET_EXPLICIT".to_string())
        );
        assert_eq!(
            options.get("aws_session_token"),
            Some(&"TOKEN_EXPLICIT".to_string())
        );
        assert_eq!(
            options.get("aws_endpoint"),
            Some(&"https://s3.us-west-2.amazonaws.com".to_string())
        );
        assert!(!options.contains_key("aws_skip_signature"));
    }

    #[test]
    fn test_build_s3_options_respects_anonymous_mode() {
        let config = Some(storage_config::S3Config {
            region: "us-east-1".to_string(),
            access_key_id: None,
            secret_access_key: None,
            session_token: None,
            endpoint: None,
            skip_signature: true,
        });

        let options = options_to_map(build_s3_options(&config));
        assert_eq!(options.get("aws_skip_signature"), Some(&"true".to_string()));
    }

    #[test]
    fn test_build_s3_options_does_not_force_anonymous_by_default() {
        let options = options_to_map(build_s3_options(&None));
        assert!(!options.contains_key("aws_skip_signature"));
    }

    #[test]
    fn test_build_azure_options_prefers_explicit_sas_token() {
        let config = Some(storage_config::AzureConfig {
            account_name: "settingsacct".to_string(),
            access_key: Some("account-key".to_string()),
            sas_token: Some("?sv=settings&sig=secret".to_string()),
            endpoint: None,
        });

        let options = options_to_map(build_azure_options(
            &config,
            Some("urlacct".to_string()),
            Some("sv=url&sig=urlsig".to_string()),
        ));

        assert_eq!(
            options.get("azure_storage_account_name"),
            Some(&"settingsacct".to_string())
        );
        assert_eq!(
            options.get("azure_storage_sas_token"),
            Some(&"sv=settings&sig=secret".to_string())
        );
        assert!(!options.contains_key("azure_storage_account_key"));
    }

    #[test]
    fn test_build_azure_options_falls_back_to_url_values() {
        let config = Some(storage_config::AzureConfig {
            account_name: "   ".to_string(),
            access_key: None,
            sas_token: None,
            endpoint: None,
        });

        let options = options_to_map(build_azure_options(
            &config,
            Some("urlacct".to_string()),
            Some("?sv=url&sig=urlsig".to_string()),
        ));

        assert_eq!(
            options.get("azure_storage_account_name"),
            Some(&"urlacct".to_string())
        );
        assert_eq!(
            options.get("azure_storage_sas_token"),
            Some(&"sv=url&sig=urlsig".to_string())
        );
    }
}
