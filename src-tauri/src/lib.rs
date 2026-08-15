//! Tauri application crate for TraceLens.
//!
//! This crate wires together the SEG-Y parser, renderer, and Tauri commands.
//! The `run` function is the single entry point used by the native binary.

#[cfg(any(target_os = "macos", target_os = "ios"))]
use tauri::Emitter;
use tauri::Manager;

/// IPC command handlers — thin adapters organized by domain.
pub mod ipc;

pub mod error;

/// I/O layer: storage backends, caching, URI routing, and binary parsing.
pub mod io;

/// Header spec layer: field specs, registry, runtime extraction, and validation.
pub mod spec;

/// SEG-Y format parsing.
pub mod segy;

/// Storage configuration for cloud backends.
pub mod storage_config;

/// Application settings for user preferences.
mod app_settings;

/// Build and run the Tauri application.
///
/// This registers plugins, shared state, and all Rust-side commands exposed to
/// the frontend. Any application-wide initialization should live here.
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
        .plugin(tauri_plugin_opener::init())
        .manage(segy::SegyReaderState::new())
        .manage(storage_config::StorageConfigState::default())
        .manage(ipc::desktop::OpenedFile::default())
        .invoke_handler(tauri::generate_handler![
            ipc::file::load_segy_file,
            ipc::headers::get_binary_header_spec,
            ipc::headers::get_trace_header_spec,
            ipc::headers::get_binary_header_data,
            ipc::headers::get_trace_header_data,
            ipc::headers::set_active_revision,
            ipc::headers::list_scalar_types,
            ipc::amplitude::scan_amplitude_range,
            ipc::amplitude::get_sample_value,
            ipc::data::fetch_trace_samples,
            ipc::custom_spec::load_custom_spec,
            ipc::custom_spec::save_custom_spec,
            ipc::custom_spec::get_custom_spec,
            ipc::custom_spec::clear_custom_spec,
            ipc::custom_spec::add_custom_field,
            ipc::custom_spec::update_custom_field,
            ipc::custom_spec::delete_custom_field,
            ipc::custom_spec::get_active_spec,
            ipc::settings::open_settings_window,
            ipc::settings::close_settings_window,
            ipc::settings::get_app_settings,
            ipc::settings::update_app_settings,
            ipc::settings::get_storage_config_settings,
            ipc::settings::update_storage_config_settings,
            ipc::desktop::take_opened_file,
            ipc::desktop::install_flavor,
            ipc::desktop::updater_supported,
        ])
        .setup(|app| {
            // Cold-start file association: on Windows/Linux the OS launches the
            // binary with the file path as argv[1]. macOS instead delivers it as
            // a RunEvent::Opened, handled below. Stash it for the frontend to
            // drain once it mounts (see ipc::desktop).
            // `args_os` (not `args`) so a non-UTF-8 path (arbitrary bytes on
            // Linux, unpaired surrogates on Windows) can't panic the iterator.
            if let Some(arg) = std::env::args_os().nth(1) {
                let arg = arg.to_string_lossy();
                let lower = arg.to_lowercase();
                if lower.ends_with(".segy") || lower.ends_with(".sgy") {
                    app.state::<ipc::desktop::OpenedFile>()
                        .set(arg.into_owned());
                }
            }

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
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // macOS delivers "open with TraceLens" / double-click as an Apple
            // event surfaced here. If the frontend is live, emit straight to it;
            // otherwise stash for it to drain on mount.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            {
                if let tauri::RunEvent::Opened { urls } = event {
                    let state = app_handle.state::<ipc::desktop::OpenedFile>();
                    for url in urls {
                        let Ok(path) = url.to_file_path() else {
                            continue;
                        };
                        let path = path.to_string_lossy().into_owned();
                        // Ready-check and stash happen under one lock inside
                        // `stash_or_emit`, so a concurrent `take_opened_file`
                        // drain can't strand this path.
                        if let Some(path) = state.stash_or_emit(path) {
                            let _ = app_handle.emit("open-file", path);
                        }
                    }
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios")))]
            {
                let _ = (app_handle, event);
            }
        });
}
