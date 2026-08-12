import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdates } from './checkForUpdates';

const check = vi.fn();
const ask = vi.fn();
const message = vi.fn();
const relaunch = vi.fn();
const getFlavor = vi.fn();
const getVersion = vi.fn();
const openUrl = vi.fn();
const tryFlatpak = vi.fn();
// Attached to the resolved update object in tests, not a mocked module export.
const downloadAndInstall = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => check() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: (...a: unknown[]) => ask(...a),
  message: (...a: unknown[]) => message(...a),
}));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: () => relaunch() }));
vi.mock('@/shared/api/tauri/desktop', () => ({
  getInstallFlavor: () => getFlavor(),
  tryFlatpakUpdate: () => tryFlatpak(),
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => getVersion() }));
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...a: unknown[]) => openUrl(...a),
}));

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFlavor.mockResolvedValue('tauri-updater');
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

  it('on flatpak, prompts and runs host flatpak update when a newer tag exists', async () => {
    getFlavor.mockResolvedValue('flatpak');
    getVersion.mockResolvedValue('0.1.0');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v0.2.0' }),
    });
    ask.mockResolvedValue(true);
    tryFlatpak.mockResolvedValue(undefined);

    await checkForUpdates();

    expect(tryFlatpak).toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  it('on deb-or-other, opens Releases when user accepts', async () => {
    getFlavor.mockResolvedValue('deb-or-other');
    getVersion.mockResolvedValue('0.1.0');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v0.2.0' }),
    });
    ask.mockResolvedValue(true);

    await checkForUpdates();

    expect(openUrl).toHaveBeenCalledWith('https://github.com/tasansal/tracelens/releases/latest');
    expect(check).not.toHaveBeenCalled();
  });
});
