import { describe, expect, it } from 'vitest';
import { flavorFromEnv } from './installFlavor';

describe('flavorFromEnv', () => {
  it('returns flatpak when FLATPAK_ID is set', () => {
    expect(flavorFromEnv({ flatpakId: 'com.tracelens.desktop', flatpakInfoExists: false })).toBe(
      'flatpak'
    );
  });

  it('returns flatpak when /.flatpak-info would exist', () => {
    expect(flavorFromEnv({ flatpakInfoExists: true })).toBe('flatpak');
  });

  it('returns tauri-updater when APPIMAGE is set', () => {
    expect(flavorFromEnv({ appImage: '/tmp/TraceLens.AppImage', flatpakInfoExists: false })).toBe(
      'tauri-updater'
    );
  });

  it('returns deb-or-other on bare Linux env', () => {
    expect(flavorFromEnv({ flatpakInfoExists: false })).toBe('deb-or-other');
  });

  it('prefers flatpak when both flatpak and AppImage signals are present', () => {
    expect(
      flavorFromEnv({
        flatpakId: 'com.tracelens.desktop',
        appImage: '/tmp/TraceLens.AppImage',
        flatpakInfoExists: false,
      })
    ).toBe('flatpak');
  });
});
