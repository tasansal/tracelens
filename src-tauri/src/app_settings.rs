//! Application settings for user preferences.
//!
//! Manages app-level settings like theme preference, separate from storage configuration.
//! Settings are stored in user's home directory and can be updated via Tauri commands.

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Theme preference setting
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    Light,
    Dark,
    #[default]
    System,
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    /// Theme preference (light, dark, or system)
    #[serde(default)]
    pub theme: ThemePreference,
}

/// Build the file path where app settings are stored in the user profile.
///
/// # Returns
/// * `PathBuf` pointing to `~/.tracelens/app_settings.json`.
///
/// # Errors
/// * `AppError::IoError` when the home directory or config directory cannot be created.
fn settings_file_path() -> Result<PathBuf, AppError> {
    let home_dir = dirs::home_dir().ok_or_else(|| AppError::IoError {
        message: "Could not determine home directory".to_string(),
    })?;

    let config_dir = home_dir.join(".tracelens");
    fs::create_dir_all(&config_dir).map_err(|e| AppError::IoError {
        message: format!("Failed to create config directory: {}", e),
    })?;

    Ok(config_dir.join("app_settings.json"))
}

/// Read app settings from disk, returning defaults if the file is missing.
///
/// # Returns
/// * `AppSettings` populated from disk or default values.
///
/// # Errors
/// * `AppError` if the file cannot be read or parsed.
pub fn load_settings() -> Result<AppSettings, AppError> {
    let settings_path = settings_file_path()?;

    if !settings_path.exists() {
        // Return default settings if file doesn't exist
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&settings_path).map_err(|e| AppError::IoError {
        message: format!("Failed to read settings file: {}", e),
    })?;

    serde_json::from_str(&content).map_err(|e| AppError::ParseError {
        message: format!("Failed to parse settings file: {}", e),
    })
}

/// Persist the provided app settings to disk in pretty JSON.
///
/// # Arguments
/// * `settings` - The settings struct to serialize.
///
/// # Returns
/// * `()` when the file write succeeds.
///
/// # Errors
/// * `AppError` if serialization fails or the file cannot be written.
pub fn save_settings(settings: &AppSettings) -> Result<(), AppError> {
    let settings_path = settings_file_path()?;

    let content = serde_json::to_string_pretty(settings).map_err(|e| AppError::ParseError {
        message: format!("Failed to serialize settings: {}", e),
    })?;

    fs::write(&settings_path, content).map_err(|e| AppError::IoError {
        message: format!("Failed to write settings file: {}", e),
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = AppSettings::default();
        assert_eq!(settings.theme, ThemePreference::System);
    }

    #[test]
    fn test_serialize_settings() {
        let settings = AppSettings {
            theme: ThemePreference::Dark,
        };

        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("dark"));
    }

    #[test]
    fn test_deserialize_settings() {
        let json = r#"{"theme":"light"}"#;
        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.theme, ThemePreference::Light);
    }
}
