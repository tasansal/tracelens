/**
 * Tauri command wrappers for settings window management and app settings.
 */
import { invoke } from '@tauri-apps/api/core';
import type { StorageConfig } from './storage';

/**
 * Theme preference options
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * UI Density presets (power-user density control).
 * Affects text sizes and spacing across the entire app (both windows).
 */
export type UiDensity = 'compact' | 'standard' | 'spacious';

/**
 * Application settings
 */
export interface AppSettings {
  theme: ThemePreference;
  density: UiDensity;
}

/**
 * Open or show the settings window
 */
export async function openSettingsWindow(initialTab?: string): Promise<void> {
  return invoke<void>('open_settings_window', { initialTab });
}

/**
 * Close/hide the settings window
 */
export async function closeSettingsWindow(): Promise<void> {
  return invoke<void>('close_settings_window');
}

/**
 * Get app settings
 */
export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_app_settings');
}

/**
 * Update app settings
 */
export async function updateAppSettings(settings: AppSettings): Promise<void> {
  return invoke<void>('update_app_settings', { settings });
}

/**
 * Get storage configuration (for settings window)
 */
export async function getStorageConfigSettings(): Promise<StorageConfig> {
  return invoke<StorageConfig>('get_storage_config_settings');
}

/**
 * Update storage configuration (for settings window)
 */
export async function updateStorageConfigSettings(config: StorageConfig): Promise<void> {
  return invoke<void>('update_storage_config_settings', { config });
}
