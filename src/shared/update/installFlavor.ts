/** Install / update channel. Detection lives in Rust (`install_flavor`). */
export type InstallFlavor = 'tauri-updater' | 'flatpak' | 'deb-or-other';
