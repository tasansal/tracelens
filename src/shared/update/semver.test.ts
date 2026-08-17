import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './semver';

describe('isNewerVersion', () => {
  it('is true when latest is a higher release', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
  });

  it('is false when latest equals current', () => {
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false);
  });

  it('is false when latest is older than current', () => {
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
  });

  it('does not treat a stable older release as newer than a prerelease', () => {
    expect(isNewerVersion('0.1.0', '0.2.0-beta.1')).toBe(false);
  });

  it('treats a release as newer than a prerelease of the same version', () => {
    expect(isNewerVersion('0.2.0', '0.2.0-beta.1')).toBe(true);
  });

  it('treats a higher prerelease as newer than a lower release', () => {
    expect(isNewerVersion('0.2.0-beta.1', '0.1.0')).toBe(true);
  });

  it('is false when either side is not semver', () => {
    expect(isNewerVersion('latest', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', 'dev')).toBe(false);
  });
});
