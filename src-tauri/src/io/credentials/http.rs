//! HTTP storage credential and option builder.

use crate::storage_config;

/// Build HTTP option list for `parse_url_opts`.
///
/// Injects a `timeout` value and any custom headers configured by the user.
pub fn build_http_options(config: &Option<storage_config::HttpConfig>) -> Vec<(String, String)> {
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
