//! AWS S3 credential and option builder.

use crate::io::credentials::normalize_optional;
use crate::storage_config;

/// AWS environment variable keys accepted by `object_store`.
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

/// Collect `AWS_*` environment variables accepted by `object_store` as base options.
///
/// Loaded first so explicit UI inputs pushed after can override them.
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

/// Build S3 option list for `parse_url_opts`.
///
/// Starts from ambient `AWS_*` env vars so that EC2/ECS instance-profile
/// credentials work out of the box, then appends explicit UI-configured values
/// so they take precedence.
pub fn build_s3_options(config: &Option<storage_config::S3Config>) -> Vec<(String, String)> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn options_to_map(options: Vec<(String, String)>) -> HashMap<String, String> {
        options.into_iter().collect()
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
}
