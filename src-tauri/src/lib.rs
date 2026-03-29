//! Tauri application crate for TraceLens.
//!
//! This crate wires together the SEG-Y parser, renderer, and Tauri commands.
//! The `run` function is the single entry point used by the native binary.

use tauri::Manager;

mod commands;
pub mod error;

/// SEG-Y format parsing and rendering modules.
pub mod segy;

/// Storage configuration for cloud backends.
mod storage_config;

/// Application settings for user preferences.
mod app_settings;

/// Window management commands.
mod windows;

/// Build and run the Tauri application.
///
/// This registers plugins, shared state, and all Rust-side commands exposed to
/// the frontend. Any application-wide initialization should live here.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(segy::SegyReaderState::new())
        .manage(storage_config::StorageConfigState::default())
        .invoke_handler(tauri::generate_handler![
            commands::load_segy_file,
            commands::get_binary_header_spec,
            commands::get_trace_header_spec,
            commands::load_single_trace,
            commands::render_tile,
            commands::scan_amplitude_range,
            windows::open_settings_window,
            windows::close_settings_window,
            windows::get_app_settings,
            windows::update_app_settings,
            windows::get_storage_config_settings,
            windows::update_storage_config_settings
        ])
        .setup(|app| {
            // Set up main window close handler to close all child windows
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle = app.app_handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        // Destroy all other windows when main window closes
                        if let Some(settings_window) = app_handle.get_webview_window("settings") {
                            let _ = settings_window.destroy();
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
