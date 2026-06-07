import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdates } from './checkForUpdates';

const check = vi.fn();
const ask = vi.fn();
const relaunch = vi.fn();
// Attached to the resolved update object in tests, not a mocked module export.
const downloadAndInstall = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => check() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: (...a: unknown[]) => ask(...a) }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: () => relaunch() }));

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when no update is available', async () => {
    check.mockResolvedValue(null);
    await checkForUpdates();
    expect(ask).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('prompts but does not install when the user declines', async () => {
    check.mockResolvedValue({ version: '9.9.9', downloadAndInstall });
    ask.mockResolvedValue(false);
    await checkForUpdates();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('installs and relaunches when the user accepts', async () => {
    check.mockResolvedValue({ version: '9.9.9', downloadAndInstall });
    ask.mockResolvedValue(true);
    await checkForUpdates();
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('never throws if the updater errors', async () => {
    check.mockRejectedValue(new Error('network down'));
    await expect(checkForUpdates()).resolves.toBeUndefined();
  });
});
