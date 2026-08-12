//! Desktop-integration commands: self-updater capability and OS "open file"
//! routing for file associations.

use std::sync::Mutex;

/// Pending file the OS asked us to open (via CLI argv on first launch, or a
/// macOS "open document" Apple event), plus a flag tracking whether the
/// frontend has come online to receive `open-file` events directly. Both fields
/// live behind one lock so the ready-check and the stash are atomic with
/// respect to the frontend's drain in [`take_opened_file`].
#[derive(Default)]
struct OpenedFileState {
    path: Option<String>,
    frontend_ready: bool,
}

#[derive(Default)]
pub struct OpenedFile {
    inner: Mutex<OpenedFileState>,
}

impl OpenedFile {
    /// Stash a path to be drained by the frontend once it mounts. Used before
    /// the webview is ready to receive events.
    pub fn set(&self, path: String) {
        self.inner.lock().unwrap().path = Some(path);
    }

    /// Hand off a freshly opened path. If the frontend is already listening,
    /// returns `Some(path)` so the caller emits it live; otherwise stashes it
    /// for the next drain and returns `None`.
    ///
    /// The ready-check and the stash happen under one lock, so a concurrent
    /// `take_opened_file` cannot observe an empty slot and then leave us
    /// stashing into an already-ready state that nothing re-drains.
    pub fn stash_or_emit(&self, path: String) -> Option<String> {
        let mut state = self.inner.lock().unwrap();
        if state.frontend_ready {
            Some(path)
        } else {
            state.path = Some(path);
            None
        }
    }
}

/// Return and clear any file the OS asked us to open before the frontend was
/// ready, and mark the frontend as ready for live `open-file` events.
#[tauri::command]
pub fn take_opened_file(state: tauri::State<'_, OpenedFile>) -> Option<String> {
    let mut state = state.inner.lock().unwrap();
    state.frontend_ready = true;
    state.path.take()
}

/// Install / update channel for this running binary.
///
/// - `tauri-updater`: macOS, Windows, or Linux AppImage (`APPIMAGE` set)
/// - `flatpak`: running inside a Flatpak sandbox
/// - `deb-or-other`: Linux native package or unknown (no Tauri self-update)
#[tauri::command]
pub fn install_flavor() -> &'static str {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        "tauri-updater"
    }
    #[cfg(target_os = "linux")]
    {
        if std::path::Path::new("/.flatpak-info").exists()
            || std::env::var_os("FLATPAK_ID").is_some()
        {
            "flatpak"
        } else if std::env::var_os("APPIMAGE").is_some() {
            "tauri-updater"
        } else {
            "deb-or-other"
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "deb-or-other"
    }
}

/// Whether Tauri's in-app updater can actually install on this build.
///
/// macOS and Windows are always supported. On Linux only the AppImage bundle
/// self-updates — `.deb` and Flatpak installs cannot (read-only `/app` sandbox,
/// no `APPIMAGE` env), so the updater plugin's install step always fails there.
/// AppImage sets `APPIMAGE`, which we use as the discriminator.
#[tauri::command]
pub fn updater_supported() -> bool {
    install_flavor() == "tauri-updater"
}

/// Run the Flatpak host's update command for TraceLens.
#[tauri::command]
pub fn try_flatpak_update() -> Result<(), String> {
    let status = std::process::Command::new("flatpak-spawn")
        .args(["--host", "flatpak", "update", "-y", "com.tracelens.desktop"])
        .status()
        .map_err(|e| format!("flatpak-spawn failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("flatpak update exited with {status}"))
    }
}
