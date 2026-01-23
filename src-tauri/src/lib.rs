//! Tauri application crate for TraceLens.
//!
//! This crate wires together the SEG-Y parser, renderer, and Tauri commands.
//! The `run` function is the single entry point used by the native binary.

mod commands;
pub mod error;

/// SEG-Y format parsing and rendering modules.
pub mod segy;

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
        .invoke_handler(tauri::generate_handler![
            commands::load_segy_file,
            commands::get_binary_header_spec,
            commands::get_trace_header_spec,
            commands::load_single_trace,
            commands::load_trace_range,
            commands::render_variable_density
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
