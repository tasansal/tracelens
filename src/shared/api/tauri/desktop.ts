/**
 * Tauri command wrappers for desktop integration: OS file-open routing and
 * install-channel detection.
 */
import type { InstallFlavor } from '@/shared/update/installFlavor';
import { invoke } from '@tauri-apps/api/core';

/**
 * Drain any file the OS asked us to open before the frontend was ready (CLI
 * argv on first launch, or a macOS "open document"
 * event). Also marks the frontend ready so subsequent opens arrive as live
 * `open-file` events.
 */
export async function takeOpenedFile(): Promise<string | null> {
  return invoke<string | null>('take_opened_file');
}

/**
 * Drop the ready latch when the open-file listener unmounts so a remounted
 * webview stashes again instead of emitting into a dead listener.
 */
export async function releaseOpenedFileListener(): Promise<void> {
  return invoke('release_opened_file_listener');
}

/** Detection itself lives in Rust (`install_flavor`). */
export async function getInstallFlavor(): Promise<InstallFlavor> {
  return invoke('install_flavor');
}
