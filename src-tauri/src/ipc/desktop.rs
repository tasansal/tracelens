//! Desktop-integration commands: self-updater capability and OS "open file"
//! routing for file associations.

use std::ffi::OsStr;
use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Pending file the OS asked us to open (via CLI argv on first launch, or a
/// macOS "open document" Apple event), plus a
/// flag tracking whether the frontend has come online to receive `open-file`
/// events directly. Both fields live behind one lock so the ready-check and
/// the stash are atomic with respect to the frontend's drain in
/// [`take_opened_file`].
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

    /// Clear the ready latch so a remounted webview must drain again.
    /// Without this, a reload (or React Strict Mode remount) can drop a live
    /// `open-file` emit that had no subscriber.
    pub fn mark_frontend_not_ready(&self) {
        self.inner.lock().unwrap().frontend_ready = false;
    }
}

/// True when `path` looks like a SEG-Y file the app can open.
pub fn is_segy_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".segy") || lower.ends_with(".sgy")
}

/// UTF-8 SEG-Y path from an `OsStr`. Non-UTF-8 is rejected rather than
/// lossily converted to a path that cannot exist on disk.
pub fn utf8_segy_path(arg: &OsStr) -> Option<String> {
    let path = arg.to_str()?;
    is_segy_path(path).then(|| path.to_owned())
}

/// Stash or emit `path`, then (when the frontend is live) fire `open-file`.
pub fn route_open_path(app: &tauri::AppHandle, path: String) {
    let state = app.state::<OpenedFile>();
    if let Some(path) = state.stash_or_emit(path) {
        let _ = app.emit("open-file", path);
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

/// Called from the frontend listener's unmount so a remounted webview can
/// stash again instead of emitting into a dead listener.
#[tauri::command]
pub fn release_opened_file_listener(state: tauri::State<'_, OpenedFile>) {
    state.mark_frontend_not_ready();
}

/// Linux install-channel discriminator. Flatpak wins over AppImage so a
/// nested or unusual environment cannot be classified as self-updating.
#[cfg(any(test, target_os = "linux"))]
fn linux_install_flavor(
    flatpak_info_exists: bool,
    has_flatpak_id: bool,
    has_appimage: bool,
) -> &'static str {
    if flatpak_info_exists || has_flatpak_id {
        "flatpak"
    } else if has_appimage {
        "tauri-updater"
    } else {
        "deb-or-other"
    }
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
        linux_install_flavor(
            std::path::Path::new("/.flatpak-info").exists(),
            std::env::var_os("FLATPAK_ID").is_some(),
            std::env::var_os("APPIMAGE").is_some(),
        )
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "deb-or-other"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_segy_path_accepts_both_extensions() {
        assert!(is_segy_path("/tmp/line.segy"));
        assert!(is_segy_path("/tmp/line.SGY"));
        assert!(!is_segy_path("/tmp/line.segy.bak"));
        assert!(!is_segy_path("/tmp/readme.txt"));
    }

    #[test]
    fn utf8_segy_path_rejects_non_segy_and_non_utf8() {
        assert_eq!(
            utf8_segy_path(OsStr::new("/data/shot.sgy")).as_deref(),
            Some("/data/shot.sgy")
        );
        assert_eq!(utf8_segy_path(OsStr::new("/data/notes.txt")), None);
        #[cfg(unix)]
        {
            use std::ffi::OsString;
            use std::os::unix::ffi::OsStringExt;
            let invalid = OsString::from_vec(vec![0xff, b'.', b's', b'g', b'y']);
            assert_eq!(utf8_segy_path(&invalid), None);
        }
    }

    #[test]
    fn stash_until_ready_then_emit() {
        let opened = OpenedFile::default();
        assert_eq!(opened.stash_or_emit("first.segy".into()), None);
        {
            let mut state = opened.inner.lock().unwrap();
            state.frontend_ready = true;
            assert_eq!(state.path.as_deref(), Some("first.segy"));
        }
        assert_eq!(
            opened.stash_or_emit("second.segy".into()).as_deref(),
            Some("second.segy")
        );
    }

    #[test]
    fn remount_resets_ready_so_paths_stash_again() {
        let opened = OpenedFile::default();
        opened.inner.lock().unwrap().frontend_ready = true;
        opened.mark_frontend_not_ready();
        assert_eq!(opened.stash_or_emit("after-reload.segy".into()), None);
        assert_eq!(
            opened.inner.lock().unwrap().path.as_deref(),
            Some("after-reload.segy")
        );
    }

    #[test]
    fn linux_flavor_prefers_flatpak_over_appimage() {
        assert_eq!(linux_install_flavor(true, false, true), "flatpak");
        assert_eq!(linux_install_flavor(false, true, true), "flatpak");
        assert_eq!(linux_install_flavor(false, false, true), "tauri-updater");
        assert_eq!(linux_install_flavor(false, false, false), "deb-or-other");
    }
}
