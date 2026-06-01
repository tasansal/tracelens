import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeSettingsWindow,
  getAppSettings,
  getStorageConfigSettings,
  openSettingsWindow,
  updateAppSettings,
  updateStorageConfigSettings,
} from './settings';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openSettingsWindow', () => {
  it('should call invoke with correct command name', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await openSettingsWindow();
    expect(invoke).toHaveBeenCalledWith('open_settings_window', { initialTab: undefined });
  });

  it('should call invoke with initialTab when provided', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await openSettingsWindow('storage');
    expect(invoke).toHaveBeenCalledWith('open_settings_window', { initialTab: 'storage' });
  });

  it('should resolve on success', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await expect(openSettingsWindow()).resolves.toBeUndefined();
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('window creation failed'));
    await expect(openSettingsWindow()).rejects.toThrow('window creation failed');
  });
});

describe('closeSettingsWindow', () => {
  it('should call invoke with correct command name', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await closeSettingsWindow();
    expect(invoke).toHaveBeenCalledWith('close_settings_window');
  });

  it('should resolve on success', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await expect(closeSettingsWindow()).resolves.toBeUndefined();
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('window close failed'));
    await expect(closeSettingsWindow()).rejects.toThrow('window close failed');
  });
});

describe('getAppSettings', () => {
  it('should call invoke with correct command name', async () => {
    mockedInvoke.mockResolvedValueOnce({ theme: 'system' } as never);
    await getAppSettings();
    expect(invoke).toHaveBeenCalledWith('get_app_settings');
  });

  it('should return response on success', async () => {
    const mockSettings = { theme: 'dark' };
    mockedInvoke.mockResolvedValueOnce(mockSettings as never);
    const result = await getAppSettings();
    expect(result).toEqual(mockSettings);
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('settings not found'));
    await expect(getAppSettings()).rejects.toThrow('settings not found');
  });
});

describe('updateAppSettings', () => {
  it('should call invoke with correct command name and settings', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await updateAppSettings({ theme: 'light', density: 'compact' });
    expect(invoke).toHaveBeenCalledWith('update_app_settings', {
      settings: { theme: 'light', density: 'compact' },
    });
  });

  it('should resolve on success', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await expect(
      updateAppSettings({ theme: 'dark', density: 'standard' })
    ).resolves.toBeUndefined();
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('invalid settings'));
    await expect(
      updateAppSettings({ theme: 'invalid' as never, density: 'compact' } as never)
    ).rejects.toThrow('invalid settings');
  });
});

describe('getStorageConfigSettings', () => {
  it('should call invoke with correct command name', async () => {
    mockedInvoke.mockResolvedValueOnce({
      performance: { chunkSizeMb: 1, renderChunkTraces: 100 },
    } as never);
    await getStorageConfigSettings();
    expect(invoke).toHaveBeenCalledWith('get_storage_config_settings');
  });

  it('should return response on success', async () => {
    const mockConfig = {
      performance: { chunkSizeMb: 8, renderChunkTraces: 100 },
    };
    mockedInvoke.mockResolvedValueOnce(mockConfig as never);
    const result = await getStorageConfigSettings();
    expect(result).toEqual(mockConfig);
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('config not found'));
    await expect(getStorageConfigSettings()).rejects.toThrow('config not found');
  });
});

describe('updateStorageConfigSettings', () => {
  it('should call invoke with correct command name and config', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    const config = {
      performance: { chunkSizeMb: 16, readCacheMb: 64, renderChunkTraces: 200 },
    };
    await updateStorageConfigSettings(config);
    expect(invoke).toHaveBeenCalledWith('update_storage_config_settings', { config });
  });

  it('should resolve on success', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    const config = {
      performance: { chunkSizeMb: 4, readCacheMb: 32, renderChunkTraces: 50 },
    };
    await expect(updateStorageConfigSettings(config)).resolves.toBeUndefined();
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('invalid config'));
    const config = {
      performance: { chunkSizeMb: -1, readCacheMb: 32, renderChunkTraces: 0 },
    };
    await expect(updateStorageConfigSettings(config)).rejects.toThrow('invalid config');
  });
});
