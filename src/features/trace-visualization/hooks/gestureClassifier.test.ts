import { describe, expect, it } from 'vitest';
import {
  applyZoomUniform,
  applyZoomX,
  applyZoomY,
  checkDecay,
  classifyDevice,
  classifyIntent,
  classifySwipeIntent,
  extractMagnitude,
  normalizeDelta,
} from './gestureClassifier';

// Helper to build a minimal WheelEvent-like object
function mockWheel(
  overrides: Partial<{
    deltaX: number;
    deltaY: number;
    deltaMode: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }> = {}
): WheelEvent {
  return {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as unknown as WheelEvent;
}

describe('normalizeDelta', () => {
  it('passes pixel mode (0) unchanged', () => {
    expect(normalizeDelta(mockWheel({ deltaX: 3, deltaY: 7, deltaMode: 0 }))).toEqual({
      dx: 3,
      dy: 7,
    });
  });

  it('multiplies line mode (1) by 16', () => {
    expect(normalizeDelta(mockWheel({ deltaX: 3, deltaY: 3, deltaMode: 1 }))).toEqual({
      dx: 48,
      dy: 48,
    });
  });

  it('multiplies page mode (2) by 100', () => {
    expect(normalizeDelta(mockWheel({ deltaY: 1, deltaMode: 2 }))).toEqual({ dx: 0, dy: 100 });
  });
});

describe('classifyDevice', () => {
  const smallSamples = [
    { dx: 0, dy: 2 },
    { dx: 0, dy: 1.5 },
    { dx: 0, dy: 2.5 },
  ];
  const largeSamples = [
    { dx: 0, dy: 100 },
    { dx: 0, dy: 120 },
    { dx: 0, dy: 110 },
  ];
  // macOS smooth-scroll: small initial event grows into a peak (~4 → 38 → 157)
  const macosSmoothScrollNotch = [
    { dx: 0, dy: 4 },
    { dx: 0, dy: 38 },
    { dx: 0, dy: 157 },
  ];

  it('detects trackpad pinch: ctrlKey + uniformly small magnitudes', () => {
    expect(classifyDevice(smallSamples, true, false)).toBe('trackpad-pinch');
  });

  it('detects mouse+ctrl: ctrlKey + large magnitude', () => {
    expect(classifyDevice(largeSamples, true, false)).toBe('mouse-ctrl');
  });

  it('detects trackpad swipe: no ctrlKey + uniformly small magnitudes', () => {
    expect(classifyDevice(smallSamples, false, false)).toBe('trackpad-swipe');
  });

  it('detects mouse scroll: no ctrlKey + large magnitude', () => {
    expect(classifyDevice(largeSamples, false, false)).toBe('mouse-scroll');
  });

  it('treats 1 sample as discrete mouse-like input regardless of magnitude', () => {
    expect(classifyDevice([{ dx: 0, dy: 100 }], false, false)).toBe('mouse-scroll');
    expect(classifyDevice([{ dx: 0, dy: 2 }], false, false)).toBe('mouse-scroll');
    expect(classifyDevice([{ dx: 0, dy: 2 }], true, false)).toBe('mouse-ctrl');
    expect(classifyDevice([{ dx: 0, dy: 100 }], true, false)).toBe('mouse-ctrl');
  });

  it('treats 2 samples as discrete mouse-like input regardless of magnitude', () => {
    const twoSmall = [
      { dx: 0, dy: 4 },
      { dx: 0, dy: 20 },
    ];
    expect(classifyDevice(twoSmall, false, false)).toBe('mouse-scroll');
    expect(classifyDevice(twoSmall, true, false)).toBe('mouse-ctrl');
  });

  it('uses peak magnitude (not average) for 3+ samples — catches smooth-scroll bursts', () => {
    // macOS smooth-scroll has acceleration curve (4 → 38 → 157). Average is 66
    // but peak is 157. Both indicate mouse, but only peak is reliable across
    // medium-speed bursts where average could be small.
    expect(classifyDevice(macosSmoothScrollNotch, false, false)).toBe('mouse-scroll');
    expect(classifyDevice(macosSmoothScrollNotch, true, false)).toBe('mouse-ctrl');
  });

  it('treats Shift/Alt held as mouse-scroll regardless of count/magnitude', () => {
    // Browsers don't inject Shift or Alt for trackpad gestures. If these
    // modifiers are present, the user is on a physical input device.
    expect(classifyDevice(smallSamples, false, true)).toBe('mouse-scroll');
    expect(classifyDevice([{ dx: 0, dy: 1 }], false, true)).toBe('mouse-scroll');
    // Even with hasCtrl (e.g. Ctrl+Alt+wheel), shift/alt presence pins to mouse-ctrl
    expect(classifyDevice(smallSamples, true, true)).toBe('mouse-ctrl');
  });
});

describe('classifySwipeIntent', () => {
  it('returns pan-horizontal for purely horizontal swipe', () => {
    expect(classifySwipeIntent(10, 0)).toBe('pan-horizontal');
  });

  it('returns pan-vertical for purely vertical swipe', () => {
    expect(classifySwipeIntent(0, 10)).toBe('pan-vertical');
  });

  it('returns pan-free for 45-degree diagonal', () => {
    expect(classifySwipeIntent(10, 10)).toBe('pan-free');
  });

  it('returns pan-horizontal when angle is within 15° of horizontal', () => {
    // 10° from horizontal: dy/dx = tan(10°) ≈ 0.176
    expect(classifySwipeIntent(10, 1.76)).toBe('pan-horizontal');
  });

  it('returns pan-vertical when angle is within 15° of vertical', () => {
    // 10° from vertical: dx/dy = tan(10°) ≈ 0.176
    expect(classifySwipeIntent(1.76, 10)).toBe('pan-vertical');
  });

  it('returns pan-free when angle is 20° from horizontal', () => {
    // 20° from horizontal: dy/dx = tan(20°) ≈ 0.364
    expect(classifySwipeIntent(10, 3.64)).toBe('pan-free');
  });

  it('handles zero-zero input gracefully', () => {
    expect(classifySwipeIntent(0, 0)).toBe('pan-free');
  });
});

describe('classifyIntent', () => {
  it('trackpad-pinch → zoom-uniform regardless of modifiers', () => {
    expect(classifyIntent('trackpad-pinch', { shiftKey: false, altKey: false }, 0, 0)).toBe(
      'zoom-uniform'
    );
  });

  it('mouse-ctrl + altKey → pan-vertical', () => {
    expect(classifyIntent('mouse-ctrl', { shiftKey: false, altKey: true }, 0, 0)).toBe(
      'pan-vertical'
    );
  });

  it('mouse-ctrl (no alt) → pan-horizontal', () => {
    expect(classifyIntent('mouse-ctrl', { shiftKey: false, altKey: false }, 0, 0)).toBe(
      'pan-horizontal'
    );
  });

  it('mouse-scroll + shiftKey → zoom-vertical', () => {
    expect(classifyIntent('mouse-scroll', { shiftKey: true, altKey: false }, 0, 0)).toBe(
      'zoom-vertical'
    );
  });

  it('mouse-scroll + altKey → zoom-horizontal', () => {
    expect(classifyIntent('mouse-scroll', { shiftKey: false, altKey: true }, 0, 0)).toBe(
      'zoom-horizontal'
    );
  });

  it('mouse-scroll (no modifier) → zoom-uniform', () => {
    expect(classifyIntent('mouse-scroll', { shiftKey: false, altKey: false }, 0, 0)).toBe(
      'zoom-uniform'
    );
  });

  it('trackpad-swipe intent comes from angle', () => {
    // Horizontal swipe
    expect(classifyIntent('trackpad-swipe', { shiftKey: false, altKey: false }, 10, 0)).toBe(
      'pan-horizontal'
    );
    // Vertical swipe
    expect(classifyIntent('trackpad-swipe', { shiftKey: false, altKey: false }, 0, 10)).toBe(
      'pan-vertical'
    );
    // Diagonal
    expect(classifyIntent('trackpad-swipe', { shiftKey: false, altKey: false }, 10, 10)).toBe(
      'pan-free'
    );
  });
});

describe('extractMagnitude', () => {
  it('returns dy when |dy| >= |dx|', () => {
    expect(extractMagnitude(mockWheel({ deltaX: 0, deltaY: 100 }))).toBe(100);
    expect(extractMagnitude(mockWheel({ deltaX: 30, deltaY: 100 }))).toBe(100);
  });

  it('returns dx when |dx| > |dy| (macOS Shift+scroll axis swap)', () => {
    expect(extractMagnitude(mockWheel({ deltaX: 100, deltaY: 0 }))).toBe(100);
    expect(extractMagnitude(mockWheel({ deltaX: 100, deltaY: 30 }))).toBe(100);
  });

  it('preserves sign', () => {
    expect(extractMagnitude(mockWheel({ deltaX: 0, deltaY: -50 }))).toBe(-50);
    expect(extractMagnitude(mockWheel({ deltaX: -50, deltaY: 0 }))).toBe(-50);
  });

  it('normalizes deltaMode before comparing', () => {
    // Line mode: raw deltaY=3 → normalized 48; raw deltaX=0 → 0; should return 48
    expect(extractMagnitude(mockWheel({ deltaX: 0, deltaY: 3, deltaMode: 1 }))).toBe(48);
  });
});

describe('checkDecay', () => {
  it('returns false when window has fewer than DECAY_WINDOW entries', () => {
    expect(checkDecay([0.1, 0.2, 0.3, 0.4])).toBe(false);
  });

  it('returns true when all entries in last 5 are below threshold', () => {
    expect(checkDecay([100, 50, 0.4, 0.3, 0.2, 0.1, 0.05])).toBe(true);
  });

  it('returns false when any entry in last 5 is above threshold', () => {
    expect(checkDecay([0.1, 0.1, 0.1, 0.1, 1.0])).toBe(false);
  });
});

describe('applyZoomX', () => {
  it('clamps zoom to minZoomX when factor zooms out past min', () => {
    // With 2000 traces, min = 1000/2000 = 0.5 (shows all 2000 traces at min zoom)
    const result = applyZoomX(0.01, 1.0, { x: 0, y: 0 }, 0, 2000);
    expect(result.newZoomX).toBeCloseTo(0.5);
  });

  it('clamps zoom to maxZoomX', () => {
    // maxZoomX = Math.max(50, 1000/10) = 100
    const result = applyZoomX(1000, 1.0, { x: 0, y: 0 }, 0, 100);
    expect(result.newZoomX).toBe(100);
  });

  it('adjusts panX to keep anchor point stable', () => {
    // Double zoom with cursor at x=200: pan should shift
    const result = applyZoomX(2.0, 1.0, { x: 0, y: 0 }, 200, 100);
    // newZoom = 2, scale = 2; newPanX = anchorX - scale * (anchorX - panX) = 200 - 2*(200-0) = -200
    expect(result.newPanX).toBeCloseTo(-200);
  });
});

describe('applyZoomY', () => {
  it('clamps zoom to minimum 1.0', () => {
    const result = applyZoomY(0.01, 1.0, { x: 0, y: 0 }, 0);
    expect(result.newZoomY).toBe(1.0);
  });

  it('clamps zoom to maximum 50', () => {
    const result = applyZoomY(1000, 1.0, { x: 0, y: 0 }, 0);
    expect(result.newZoomY).toBe(50);
  });

  it('adjusts panY to keep anchor stable', () => {
    const result = applyZoomY(2.0, 1.0, { x: 0, y: 0 }, 100);
    // scale = 2; newPanY = anchorY - scale*(anchorY - panY) = 100 - 2*(100-0) = -100
    expect(result.newPanY).toBeCloseTo(-100);
  });
});

describe('applyZoomUniform', () => {
  it('updates both zoom axes', () => {
    const result = applyZoomUniform(2.0, 1.0, 1.0, { x: 0, y: 0 }, { x: 0, y: 0 }, 100);
    expect(result.newZoomX).toBeGreaterThan(1.0);
    expect(result.newZoomY).toBeGreaterThan(1.0);
  });

  it('adjusts pan on both axes to keep anchor stable', () => {
    const anchor = { x: 100, y: 100 };
    const result = applyZoomUniform(2.0, 1.0, 1.0, { x: 0, y: 0 }, anchor, 100);
    // Both pan axes shift to keep anchor fixed
    expect(result.newPanX).toBeCloseTo(-100); // 100 - 2*(100-0)
    expect(result.newPanY).toBeCloseTo(-100); // 100 - 2*(100-0)
  });

  it('returns all four values', () => {
    const result = applyZoomUniform(1.5, 1.0, 1.0, { x: 0, y: 0 }, { x: 0, y: 0 }, 100);
    expect(result).toHaveProperty('newZoomX');
    expect(result).toHaveProperty('newZoomY');
    expect(result).toHaveProperty('newPanX');
    expect(result).toHaveProperty('newPanY');
  });
});
