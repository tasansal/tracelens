mod commands;
pub mod error;

// SEG-Y format parsing module
pub mod segy;

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
