/**
 * Tauri command wrappers for desktop integration: OS file-open routing and
 * self-updater capability detection.
 */
import { invoke } from '@tauri-apps/api/core';

/**
 * Drain any file the OS asked us to open before the frontend was ready (CLI
 * argv on first launch, or a macOS "open document" event). Also marks the
 * frontend ready so subsequent opens arrive as live `open-file` events.
 */
export async function takeOpenedFile(): Promise<string | null> {
  return invoke<string | null>('take_opened_file');
}

/**
 * Whether Tauri's in-app updater can actually install on this build. False for
 * Linux `.deb`/Flatpak installs, where the updater cannot self-replace the
 * binary.
 */
export async function updaterSupported(): Promise<boolean> {
  return invoke<boolean>('updater_supported');
}

export async function getInstallFlavor(): Promise<
  'tauri-updater' | 'flatpak' | 'deb-or-other'
> {
  return invoke('install_flavor');
}
