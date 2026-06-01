//! Azure Blob Storage credential and option builder.

use crate::io::credentials::normalize_optional;
use crate::io::uri::normalize_azure_sas_token;
use crate::storage_config;

/// Build Azure option list for `parse_url_opts`.
///
/// `url_account` and `url_sas` carry values extracted from the URL by
/// [`crate::io::uri::try_convert_azure_url`]; they act as fallbacks when
/// the user has not configured explicit credentials in settings.
///
/// Credential precedence:
/// 1. Explicit SAS token in settings (recommended for short-lived access)
/// 2. Explicit account key in settings
/// 3. SAS token embedded in the URL
/// 4. Ambient Azure credential chain (no option pushed)
pub fn build_azure_options(
    config: &Option<storage_config::AzureConfig>,
    url_account: Option<String>,
    url_sas: Option<String>,
) -> Vec<(String, String)> {
    let mut options = Vec::new();

    let normalized_url_account = normalize_optional(url_account.as_ref());
    let normalized_url_sas = url_sas.and_then(|token| normalize_azure_sas_token(&token));

    match config {
        Some(azure_config) => {
            // Prefer explicit account in settings, then infer from URL.
            let account = normalize_optional(Some(&azure_config.account_name))
                .or(normalized_url_account.clone());

            if let Some(acc) = account {
                options.push(("azure_storage_account_name".to_string(), acc));
            }

            if let Some(token) = normalize_optional(azure_config.sas_token.as_ref())
                .and_then(|t| normalize_azure_sas_token(&t))
            {
                options.push(("azure_storage_sas_token".to_string(), token));
            } else if let Some(key) = normalize_optional(azure_config.access_key.as_ref()) {
                options.push(("azure_storage_account_key".to_string(), key));
            } else if let Some(sas) = normalized_url_sas.clone() {
                options.push(("azure_storage_sas_token".to_string(), sas));
            }

            if let Some(endpoint) = normalize_optional(azure_config.endpoint.as_ref()) {
                options.push(("azure_storage_endpoint".to_string(), endpoint));
            }
        }
        None => {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn options_to_map(options: Vec<(String, String)>) -> HashMap<String, String> {
        options.into_iter().collect()
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
