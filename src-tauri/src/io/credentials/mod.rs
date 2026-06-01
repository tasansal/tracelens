//! Credential and option builders for each cloud storage provider.
//!
//! Each submodule produces a `Vec<(String, String)>` option list consumed by
//! `object_store::parse_url_opts`. Options are ordered so later entries win
//! (provider chain < explicit config), matching `object_store` semantics.

pub mod azure;
pub mod gcs;
pub mod http;
pub mod s3;

/// Trim a config string value; return `None` if blank.
///
/// Used by every provider to strip accidental whitespace from pasted credentials.
pub(super) fn normalize_optional(value: Option<&String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}
