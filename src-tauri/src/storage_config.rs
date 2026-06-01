//! Storage configuration for cloud backends.
//!
//! Manages ephemeral (session-only) configuration for S3, GCS, Azure, and HTTP storage backends.
//! Configuration uses provider credential chains by default and can be customized per-session.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::RwLock;

/// Complete storage configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    /// AWS S3 configuration
    #[serde(skip_serializing_if = "Option::is_none", alias = "aws_s3")]
    pub aws_s3: Option<S3Config>,
    /// Google Cloud Storage configuration
    #[serde(skip_serializing_if = "Option::is_none", alias = "gcp_gcs")]
    pub gcp_gcs: Option<GcsConfig>,
    /// Azure Blob Storage configuration
    #[serde(skip_serializing_if = "Option::is_none", alias = "azure_blob")]
    pub azure_blob: Option<AzureConfig>,
    /// HTTP configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http: Option<HttpConfig>,
    /// Performance tuning parameters
    #[serde(default)]
    pub performance: PerformanceConfig,
}

/// AWS S3 configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3Config {
    /// AWS region
    pub region: String,
    /// Access key ID (optional, uses environment if not set)
    #[serde(skip_serializing_if = "Option::is_none", alias = "access_key_id")]
    pub access_key_id: Option<String>,
    /// Secret access key (optional, uses environment if not set)
    #[serde(skip_serializing_if = "Option::is_none", alias = "secret_access_key")]
    pub secret_access_key: Option<String>,
    /// Session token (optional, uses environment if not set)
    #[serde(skip_serializing_if = "Option::is_none", alias = "session_token")]
    pub session_token: Option<String>,
    /// Custom endpoint for S3-compatible services (MinIO, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    /// Skip request signing for anonymous access to public buckets (default: false)
    #[serde(default, alias = "skip_signature")]
    pub skip_signature: bool,
}

/// Google Cloud Storage configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcsConfig {
    /// Service account key JSON path
    #[serde(
        skip_serializing_if = "Option::is_none",
        alias = "service_account_key_path"
    )]
    pub service_account_key_path: Option<String>,
    /// Service account key JSON contents
    #[serde(skip_serializing_if = "Option::is_none", alias = "service_account_key")]
    pub service_account_key: Option<String>,
    /// Application default credentials path
    #[serde(
        skip_serializing_if = "Option::is_none",
        alias = "application_credentials_path"
    )]
    pub application_credentials_path: Option<String>,
    /// Skip signing requests for anonymous access to public buckets.
    #[serde(default, alias = "skip_signature")]
    pub skip_signature: bool,
}

/// Azure Blob Storage configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureConfig {
    /// Storage account name
    #[serde(alias = "account_name")]
    pub account_name: String,
    /// Access key (optional, uses environment if not set)
    #[serde(skip_serializing_if = "Option::is_none", alias = "access_key")]
    pub access_key: Option<String>,
    /// SAS token (optional)
    #[serde(skip_serializing_if = "Option::is_none", alias = "sas_token")]
    pub sas_token: Option<String>,
    /// Custom endpoint (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
}

/// HTTP configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpConfig {
    /// Custom headers for HTTP requests
    #[serde(default)]
    pub headers: HashMap<String, String>,
    /// Request timeout in seconds
    #[serde(default = "default_timeout", alias = "timeout_secs")]
    pub timeout_secs: u64,
}

/// Performance tuning configuration.
///
/// These defaults were chosen empirically and should only be changed if
/// profiling data justifies the deviation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceConfig {
    /// Chunk size in MiB for remote sliding-window reads (default 16).
    ///
    /// 16 MiB is the crossover point where S3 GET latency (~50 ms) amortizes
    /// to < 1 % overhead at common broadband speeds. Smaller values increase
    /// request count; larger values waste bandwidth on seeks.
    #[serde(default = "default_chunk_size", alias = "chunk_size_mb")]
    pub chunk_size_mb: usize,
    /// Resident read-cache budget in MiB for the raw-byte chunk cache (default
    /// 32). Divided by `chunk_size_mb` to cap how many chunks stay in memory.
    /// Larger values keep more of a wide viewport hot across pan/zoom and AGC
    /// window changes, at the cost of host memory.
    #[serde(default = "default_read_cache_mb", alias = "read_cache_mb")]
    pub read_cache_mb: usize,
    /// Traces loaded per render pass for progressive display (default 128).
    ///
    /// 128 matches the tile width; halving it doubles the IPC round-trips with
    /// no visible quality improvement. Doubling it delays the first-pixel time
    /// on slow links.
    #[serde(default = "default_render_chunk_traces", alias = "render_chunk_traces")]
    pub render_chunk_traces: usize,
}

impl Default for PerformanceConfig {
    fn default() -> Self {
        PerformanceConfig {
            chunk_size_mb: default_chunk_size(),
            read_cache_mb: default_read_cache_mb(),
            render_chunk_traces: default_render_chunk_traces(),
        }
    }
}

fn default_chunk_size() -> usize {
    8
}

fn default_read_cache_mb() -> usize {
    32
}

fn default_render_chunk_traces() -> usize {
    128
}

fn default_timeout() -> u64 {
    30
}

/// Managed state for ephemeral storage configuration
pub struct StorageConfigState {
    config: RwLock<StorageConfig>,
}

impl Default for StorageConfigState {
    fn default() -> Self {
        Self {
            config: RwLock::new(StorageConfig::default()),
        }
    }
}

impl StorageConfigState {
    /// Get a copy of the current configuration
    pub async fn get(&self) -> StorageConfig {
        self.config.read().await.clone()
    }

    /// Update the configuration
    pub async fn set(&self, config: StorageConfig) {
        *self.config.write().await = config;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = StorageConfig::default();
        assert!(config.aws_s3.is_none());
        assert!(config.gcp_gcs.is_none());
        assert!(config.azure_blob.is_none());
        assert_eq!(config.performance.chunk_size_mb, 8);
    }

    #[test]
    fn test_serialize_config() {
        let config = StorageConfig {
            aws_s3: Some(S3Config {
                region: "us-east-1".to_string(),
                access_key_id: None,
                secret_access_key: None,
                session_token: None,
                endpoint: None,
                skip_signature: true,
            }),
            ..Default::default()
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("us-east-1"));
        assert!(json.contains("skipSignature"));
        assert!(json.contains("awsS3"));
        assert!(!json.contains("aws_s3"));
    }

    #[test]
    fn test_deserialize_camel_case_config() {
        let json = r#"{
            "awsS3": {
                "region": "us-east-1",
                "accessKeyId": "AKIA...",
                "secretAccessKey": "secret",
                "skipSignature": false
            },
            "azureBlob": {
                "accountName": "storageacct",
                "sasToken": "sv=2024-..."
            },
            "performance": {
                "chunkSizeMb": 24,
                "renderChunkTraces": 192
            }
        }"#;

        let config: StorageConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.aws_s3.as_ref().unwrap().region, "us-east-1");
        assert_eq!(
            config.azure_blob.as_ref().unwrap().account_name,
            "storageacct"
        );
        assert_eq!(config.performance.chunk_size_mb, 24);
        assert_eq!(config.performance.render_chunk_traces, 192);
    }

    #[test]
    fn test_deserialize_gcs_auth_config() {
        let json = r#"{
            "gcpGcs": {
                "serviceAccountKeyPath": "/tmp/gcs.json",
                "skipSignature": false
            },
            "performance": {
                "chunkSizeMb": 16,
                "renderChunkTraces": 128
            }
        }"#;

        let config: StorageConfig = serde_json::from_str(json).unwrap();
        let gcs = config.gcp_gcs.unwrap();
        assert_eq!(
            gcs.service_account_key_path.as_deref(),
            Some("/tmp/gcs.json")
        );
        assert!(!gcs.skip_signature);
    }

    #[test]
    fn test_deserialize_legacy_snake_case_config() {
        let json = r#"{
            "aws_s3": {
                "region": "us-east-1",
                "access_key_id": "AKIA_LEGACY",
                "secret_access_key": "secret-legacy",
                "skip_signature": true
            },
            "performance": {
                "chunk_size_mb": 20,
                "render_chunk_traces": 160
            }
        }"#;

        let config: StorageConfig = serde_json::from_str(json).unwrap();
        let s3 = config.aws_s3.unwrap();
        assert_eq!(s3.access_key_id.as_deref(), Some("AKIA_LEGACY"));
        assert!(s3.skip_signature);
        assert_eq!(config.performance.chunk_size_mb, 20);
        assert_eq!(config.performance.render_chunk_traces, 160);
    }

    #[test]
    fn test_storage_config_roundtrip() {
        let original = StorageConfig {
            aws_s3: Some(S3Config {
                region: "eu-west-1".to_string(),
                access_key_id: Some("AKIA_TEST".to_string()),
                secret_access_key: Some("secret".to_string()),
                session_token: None,
                endpoint: Some("https://minio.local".to_string()),
                skip_signature: false,
            }),
            gcp_gcs: None,
            azure_blob: None,
            http: None,
            performance: PerformanceConfig::default(),
        };
        let json = serde_json::to_string(&original).unwrap();
        let restored: StorageConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.aws_s3.as_ref().unwrap().region, "eu-west-1");
        assert_eq!(
            restored.aws_s3.as_ref().unwrap().endpoint.as_deref(),
            Some("https://minio.local")
        );
    }

    #[test]
    fn test_storage_config_invalid_json() {
        let malformed = r#"{"awsS3": {broken}"#;
        let result: Result<StorageConfig, _> = serde_json::from_str(malformed);
        assert!(result.is_err());
    }

    #[test]
    fn test_http_config_default_timeout() {
        let config = HttpConfig {
            headers: std::collections::HashMap::new(),
            timeout_secs: 30,
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("timeoutSecs"));
    }

    #[test]
    fn test_performance_config_defaults() {
        let perf = PerformanceConfig::default();
        assert_eq!(perf.chunk_size_mb, 8);
        assert_eq!(perf.read_cache_mb, 32);
        assert_eq!(perf.render_chunk_traces, 128);
    }

    #[test]
    fn test_storage_config_state_get_set() {
        let state = StorageConfigState::default();
        let config = state.config.blocking_read().clone();
        assert!(config.aws_s3.is_none());

        let new_config = StorageConfig {
            aws_s3: Some(S3Config {
                region: "us-west-2".to_string(),
                access_key_id: None,
                secret_access_key: None,
                session_token: None,
                endpoint: None,
                skip_signature: false,
            }),
            ..Default::default()
        };
        state.config.blocking_write().clone_from(&new_config);
        let retrieved = state.config.blocking_read().clone();
        assert_eq!(retrieved.aws_s3.as_ref().unwrap().region, "us-west-2");
    }

    #[test]
    fn test_azure_config_serialization() {
        let config = AzureConfig {
            account_name: "myaccount".to_string(),
            access_key: Some("key123".to_string()),
            sas_token: None,
            endpoint: None,
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("myaccount"));
        assert!(json.contains("key123"));
    }

    #[test]
    fn test_gcs_config_serialization() {
        let config = GcsConfig {
            service_account_key_path: Some("/path/to/key.json".to_string()),
            service_account_key: None,
            application_credentials_path: None,
            skip_signature: false,
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("/path/to/key.json"));
    }
}
