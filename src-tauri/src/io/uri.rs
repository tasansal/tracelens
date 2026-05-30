//! URL parsing and scheme normalization for cloud storage URIs.
//!
//! Converts HTTP(S) cloud-vendor URLs to their native object-store schemes
//! (`s3://`, `gs://`, `az://`) so the rest of the I/O layer can dispatch
//! on scheme without caring about URL style.

use url::Url;

/// Return `true` if `uri` should be handled by the remote storage backend.
///
/// Covers all native object-store schemes (`s3://`, `gs://`, `az://`,
/// `azure://`) and plain HTTP(S) URLs that may be cloud-vendor URLs.
pub fn is_remote_uri(uri: &str) -> bool {
    uri.starts_with("s3://")
        || uri.starts_with("gs://")
        || uri.starts_with("az://")
        || uri.starts_with("azure://")
        || uri.starts_with("http://")
        || uri.starts_with("https://")
}

/// Convert an HTTP(S) S3 URL to the `s3://` scheme.
///
/// Accepts path-style (`s3.amazonaws.com/<bucket>/<key>`) and regional
/// path-style (`s3.<region>.amazonaws.com/<bucket>/<key>`) forms.
pub fn try_convert_s3_url(url: &Url) -> Option<Url> {
    if let Some(host) = url.host_str()
        && (host == "s3.amazonaws.com"
            || (host.starts_with("s3.") && host.ends_with(".amazonaws.com")))
        && let Some(path_without_slash) = url.path().strip_prefix('/')
    {
        return Url::parse(&format!("s3://{}", path_without_slash)).ok();
    }
    None
}

/// Convert an HTTP(S) GCS URL to the `gs://` scheme.
///
/// Accepts path-style (`storage.googleapis.com/<bucket>/<object>`),
/// browser-facing (`storage.cloud.google.com/<bucket>/<object>`), and
/// virtual-hosted (`<bucket>.storage.googleapis.com/<object>`) forms.
pub fn try_convert_gcs_url(url: &Url) -> Option<Url> {
    if let Some(host) = url.host_str() {
        if (host == "storage.googleapis.com" || host == "storage.cloud.google.com")
            && let Some(path_without_slash) = url.path().strip_prefix('/')
        {
            return Url::parse(&format!("gs://{}", path_without_slash)).ok();
        }

        if let Some(bucket) = host.strip_suffix(".storage.googleapis.com")
            && !bucket.is_empty()
        {
            let object = url.path().strip_prefix('/').unwrap_or_default();
            return Url::parse(&format!("gs://{}/{}", bucket, object)).ok();
        }
    }
    None
}

/// Convert an HTTP(S) Azure Blob URL to the `az://` scheme.
///
/// Returns `(az_url, account_name, sas_token)` so callers can inject
/// the account and SAS into the credential options without re-parsing.
///
/// Accepts HTTPS URLs of the form
/// `https://<account>.blob.core.windows.net/<container>/<blob>?<sas>`.
pub fn try_convert_azure_url(url: &Url) -> Option<(Url, String, Option<String>)> {
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

/// Normalize an Azure SAS token so users can paste either
/// `sv=...&sig=...` or `?sv=...&sig=...`.
///
/// Returns `None` for empty or whitespace-only tokens.
pub(crate) fn normalize_azure_sas_token(token: &str) -> Option<String> {
    let trimmed = token.trim().trim_start_matches('?');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_try_convert_s3_path_style() {
        let url = Url::parse("https://s3.amazonaws.com/my-bucket/path/file.sgy").unwrap();
        let converted = try_convert_s3_url(&url).unwrap();
        assert_eq!(converted.as_str(), "s3://my-bucket/path/file.sgy");
    }

    #[test]
    fn test_try_convert_gcs_path_style() {
        let url = Url::parse("https://storage.googleapis.com/my-bucket/path/file.sgy").unwrap();
        let converted = try_convert_gcs_url(&url).unwrap();
        assert_eq!(converted.as_str(), "gs://my-bucket/path/file.sgy");
    }

    #[test]
    fn test_normalize_azure_sas_token_strips_leading_question_mark() {
        assert_eq!(
            normalize_azure_sas_token("?sv=2024&sig=abc"),
            Some("sv=2024&sig=abc".to_string())
        );
    }

    #[test]
    fn test_normalize_azure_sas_token_empty_returns_none() {
        assert_eq!(normalize_azure_sas_token(""), None);
        assert_eq!(normalize_azure_sas_token("  "), None);
    }
}
