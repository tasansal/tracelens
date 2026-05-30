import { describe, expect, it } from 'vitest';
import {
  applyZoomUniform,
  applyZoomX,
  applyZoomY,
  getMaxZoomX,
  getMinZoomX,
  MAX_ZOOM_Y,
  MIN_ZOOM_Y,
} from './zoomMath';

describe('getMinZoomX / getMaxZoomX', () => {
  it('getMinZoomX returns 1.0 for small files (<= INITIAL_VISIBLE_TRACES)', () => {
    expect(getMinZoomX(500)).toBe(1.0);
    expect(getMinZoomX(1000)).toBe(1.0);
  });

  it('getMinZoomX scales for large files', () => {
    expect(getMinZoomX(2000)).toBeCloseTo(0.5);
    expect(getMinZoomX(4000)).toBeCloseTo(0.25);
  });

  it('getMaxZoomX is at least 50 and higher for the default visible trace count', () => {
    const max = getMaxZoomX();
    expect(max).toBeGreaterThanOrEqual(50);
  });
});

describe('MIN_ZOOM_Y / MAX_ZOOM_Y', () => {
  it('MIN_ZOOM_Y is 1.0', () => {
    expect(MIN_ZOOM_Y).toBe(1.0);
  });

  it('MAX_ZOOM_Y equals getMaxZoomX upper bound (50)', () => {
    expect(MAX_ZOOM_Y).toBe(50);
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
