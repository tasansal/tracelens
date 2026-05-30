import { describe, expect, it } from 'vitest';
import { agcClip } from './rendering';

describe('agcClip', () => {
  it('returns 1.0 at 0 dB (full scale)', () => {
    expect(agcClip(0)).toBeCloseTo(1.0, 5);
  });

  it('returns ~2.0 at -6 dB (default — half scale)', () => {
    expect(agcClip(-6)).toBeCloseTo(1.995, 2);
  });

  it('returns ~0.5 at +6 dB (hotter)', () => {
    expect(agcClip(6)).toBeCloseTo(0.501, 2);
  });

  it('is monotonic decreasing: higher gain → smaller clip', () => {
    expect(agcClip(-12)).toBeGreaterThan(agcClip(-6));
    expect(agcClip(-6)).toBeGreaterThan(agcClip(0));
    expect(agcClip(0)).toBeGreaterThan(agcClip(6));
    expect(agcClip(6)).toBeGreaterThan(agcClip(12));
  });
});
