//! Window management commands for the settings window.
//!
//! Provides commands to open, close, and manage the settings window lifecycle.

use crate::app_settings::{self, AppSettings};
use crate::error::AppError;
use crate::storage_config::{StorageConfig, StorageConfigState};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

/// Standard command result type for Tauri invokes.
type CommandResult<T> = Result<T, String>;

/// Show the settings window, creating it if needed and optionally targeting a tab.
///
/// # Arguments
/// * `app` - Handle to the running Tauri application.
/// * `initial_tab` - Optional tab name to pre-select when showing.
///
/// # Returns
/// * `()` when the window was shown or already visible.
///
/// # Errors
/// * Returns `AppError` if the window cannot be shown, focused, or its events emitted.
#[tauri::command]
pub async fn open_settings_window(
    app: AppHandle,
    initial_tab: Option<String>,
) -> CommandResult<()> {
    const SETTINGS_LABEL: &str = "settings";

    // Check if settings window already exists
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        // Window exists, just show and focus it
        window.show().map_err(|e| {
            AppError::IoError {
                message: format!("Failed to show settings window: {}", e),
            }
            .to_string()
        })?;
        window.set_focus().map_err(|e| {
            AppError::IoError {
                message: format!("Failed to focus settings window: {}", e),
            }
            .to_string()
        })?;

        // Emit event to set initial tab if provided
        if let Some(tab) = initial_tab {
            window.emit("settings:set-tab", tab).map_err(|e| {
                AppError::IoError {
                    message: format!("Failed to emit tab change event: {}", e),
                }
                .to_string()
            })?;
        }

        return Ok(());
    }

    // Create new settings window
    // Note: We let it show immediately on first creation for simplicity.
    // The window remains hidden after close (via .hide()) and is reshown via .show() above.
    let url = if let Some(tab) = initial_tab {
        WebviewUrl::App(format!("settings.html?tab={}", tab).into())
    } else {
        WebviewUrl::App("settings.html".into())
    };

    WebviewWindowBuilder::new(&app, SETTINGS_LABEL, url)
        .title("Settings - TraceLens")
        .inner_size(800.0, 600.0)
        .min_inner_size(600.0, 400.0)
        .max_inner_size(1200.0, 800.0)
        .center()
        .resizable(true)
        .decorations(false)
        .build()
        .map_err(|e| {
            AppError::IoError {
                message: format!("Failed to create settings window: {}", e),
            }
            .to_string()
        })?;

    Ok(())
}

/// Hide the settings window if it exists.
///
/// # Arguments
/// * `app` - Handle to the running Tauri application.
///
/// # Returns
/// * `()` when the window was hidden or not present.
///
/// # Errors
/// * Returns `AppError` if the window cannot be hidden.
#[tauri::command]
pub async fn close_settings_window(app: AppHandle) -> CommandResult<()> {
    const SETTINGS_LABEL: &str = "settings";

    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        window.hide().map_err(|e| {
            AppError::IoError {
                message: format!("Failed to hide settings window: {}", e),
            }
            .to_string()
        })?;
    }

    Ok(())
}

/// Load the persisted application settings.
///
/// # Returns
/// * `AppSettings` read from disk (defaults if missing).
///
/// # Errors
/// * `AppError` is mapped to `String`.
#[tauri::command]
pub fn get_app_settings() -> CommandResult<AppSettings> {
    app_settings::load_settings().map_err(String::from)
}

/// Persist new app settings and notify listeners.
///
/// # Arguments
/// * `app` - Handle to the Tauri app used to emit events.
/// * `settings` - New `AppSettings` to write.
///
/// # Returns
/// * `()` when settings are persisted and listeners notified.
///
/// # Errors
/// * Returns `AppError` if the file write or event emission fails.
#[tauri::command]
pub fn update_app_settings(app: AppHandle, settings: AppSettings) -> CommandResult<()> {
    app_settings::save_settings(&settings).map_err(String::from)?;

    // Emit event to notify all windows of settings change
    app.emit("settings:changed", &settings).map_err(|e| {
        AppError::IoError {
            message: format!("Failed to emit settings change event: {}", e),
        }
        .to_string()
    })?;

    Ok(())
}

/// Return the current in-memory storage configuration.
///
/// # Arguments
/// * `state` - Tauri state that wraps `StorageConfigState`.
///
/// # Returns
/// * Clone of the stored `StorageConfig`.
#[tauri::command]
pub async fn get_storage_config_settings(
    state: State<'_, StorageConfigState>,
) -> CommandResult<StorageConfig> {
    Ok(state.get().await)
}

/// Replace the in-memory storage configuration snapshot.
///
/// # Arguments
/// * `config` - New storage configuration provided by the frontend.
/// * `state` - Shared `StorageConfigState` to update.
///
/// # Returns
/// * `()` after the new configuration is stored.
#[tauri::command]
pub async fn update_storage_config_settings(
    config: StorageConfig,
    state: State<'_, StorageConfigState>,
) -> CommandResult<()> {
    state.set(config).await;
    Ok(())
}
