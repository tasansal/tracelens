//! Desktop-integration commands: self-updater capability and OS "open file"
//! routing for file associations.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

/// Pending file the OS asked us to open (via CLI argv on first launch, or a
/// macOS "open document" Apple event), plus a flag tracking whether the
/// frontend has come online to receive `open-file` events directly.
#[derive(Default)]
pub struct OpenedFile {
    path: Mutex<Option<String>>,
    frontend_ready: AtomicBool,
}

impl OpenedFile {
    /// Stash a path to be drained by the frontend once it mounts. Used before
    /// the webview is ready to receive events.
    pub fn set(&self, path: String) {
        *self.path.lock().unwrap() = Some(path);
    }

    /// Whether the frontend has drained the pending file at least once, meaning
    /// it now has an `open-file` listener registered and live events should be
    /// emitted instead of stashed.
    pub fn frontend_ready(&self) -> bool {
        self.frontend_ready.load(Ordering::SeqCst)
    }
}

/// Return and clear any file the OS asked us to open before the frontend was
/// ready, and mark the frontend as ready for live `open-file` events.
#[tauri::command]
pub fn take_opened_file(state: tauri::State<'_, OpenedFile>) -> Option<String> {
    state.frontend_ready.store(true, Ordering::SeqCst);
    state.path.lock().unwrap().take()
}

/// Whether Tauri's in-app updater can actually install on this build.
///
/// macOS and Windows are always supported. On Linux only the AppImage bundle
/// self-updates — `.deb` and Flatpak installs cannot (read-only `/app` sandbox,
/// no `APPIMAGE` env), so the updater plugin's install step always fails there.
/// AppImage sets `APPIMAGE`, which we use as the discriminator.
#[tauri::command]
pub fn updater_supported() -> bool {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        true
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("APPIMAGE").is_some()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        false
    }
}
