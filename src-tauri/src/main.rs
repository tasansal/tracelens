//! Native executable entry point for the Tauri desktop app.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Delegates to the library entry point so the core app can be reused in tests
/// and when building the Tauri bundler.
fn main() {
    app_lib::run();
}
