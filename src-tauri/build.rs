// Build script entry point for Tauri.
//
// This runs Tauri's build-time code generation and embeds platform resources
// (icons, capability manifests, etc.) into the final binary.
fn main() {
    tauri_build::build()
}
