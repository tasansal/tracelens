//! Google Cloud Storage credential and option builder.

use crate::io::credentials::normalize_optional;
use crate::storage_config;

/// Build GCS option list for `parse_url_opts`.
///
/// Credential precedence (first match wins):
/// 1. Inline service-account JSON (`google_service_account_key`)
/// 2. Path to service-account key file (`google_service_account`)
/// 3. Explicit ADC file path (`google_application_credentials`)
/// 4. Ambient ADC chain — falls through when no explicit option is set
pub fn build_gcs_options(config: &Option<storage_config::GcsConfig>) -> Vec<(String, String)> {
    let mut options = Vec::new();

    if let Some(gcs_config) = config {
        if gcs_config.skip_signature {
            options.push(("google_skip_signature".to_string(), "true".to_string()));
            return options;
        }

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
