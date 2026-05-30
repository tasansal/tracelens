/**
 * Build 1D colormap lookup textures (256×1 RGBA8) for use as shader LUTs.
 *
 * Each colormap is generated once per `Renderer`-reachable instance, cached by
 * name, and destroyed only when the scene tears down.
 */
import type { ColormapType } from '@/features/trace-visualization/types/rendering';
import { BufferImageSource, Texture } from 'pixi.js';

/** Width of the 1D lookup texture. */
const LUT_SIZE = 256;

type RgbFn = (t: number) => [number, number, number];

/** Linear interpolation across a list of [t, rgb] stops. */
function interpolateLinear(
  t: number,
  stops: Array<[number, [number, number, number]]>
): [number, number, number] {
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * u,
        c0[1] + (c1[1] - c0[1]) * u,
        c0[2] + (c1[2] - c0[2]) * u,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/** Grayscale: black → white. */
const grayscale: RgbFn = t => [t * 255, t * 255, t * 255];

/**
 * Classic blue–white–red seismic colormap. Center value (t=0.5) is pure white,
 * endpoints are saturated blue/red.
 */
const seismic: RgbFn = t =>
  interpolateLinear(t, [
    [0.0, [0, 0, 255]],
    [0.5, [255, 255, 255]],
    [1.0, [255, 0, 0]],
  ]);

/**
 * Viridis approximation — 5-stop piecewise linear. Perceptually uniform.
 */
const viridis: RgbFn = t =>
  interpolateLinear(t, [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 144, 140]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]],
  ]);

/**
 * Plasma approximation — dark purple through magenta to yellow.
 */
const plasma: RgbFn = t =>
  interpolateLinear(t, [
    [0.0, [13, 8, 135]],
    [0.25, [75, 3, 161]],
    [0.5, [125, 3, 168]],
    [0.75, [203, 70, 121]],
    [1.0, [240, 249, 33]],
  ]);

/**
 * Coolwarm — diverging blue-white-red with softer ends than classic seismic.
 */
const coolwarm: RgbFn = t =>
  interpolateLinear(t, [
    [0.0, [59, 76, 192]],
    [0.25, [120, 160, 220]],
    [0.5, [255, 255, 255]],
    [0.75, [220, 150, 120]],
    [1.0, [180, 60, 50]],
  ]);

/**
 * Bone — black through blue-gray to white. Common in seismic interpretation
 * for a paper-like background with cool mid-tones.
 */
const bone: RgbFn = t =>
  interpolateLinear(t, [
    [0.0, [0, 0, 0]],
    [0.25, [25, 35, 65]],
    [0.5, [90, 105, 130]],
    [0.75, [160, 170, 185]],
    [1.0, [255, 255, 255]],
  ]);

const GENERATORS: Record<ColormapType, RgbFn> = {
  grayscale,
  seismic,
  viridis,
  plasma,
  coolwarm,
  bone,
};

/**
 * Build a 256×1 RGBA8 `Texture` for the given colormap.
 * When `invert` is true the lookup is reversed (t → 1-t), which inverts any
 * colormap without needing separate "-r" / "-inverted" entries.
 */
export function createColormapTexture(name: ColormapType, invert = false): Texture {
  const gen = GENERATORS[name] ?? GENERATORS.grayscale;
  const pixels = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const tt = invert ? 1 - t : t;
    const [r, g, b] = gen(tt);
    pixels[i * 4 + 0] = Math.max(0, Math.min(255, Math.round(r)));
    pixels[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g)));
    pixels[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b)));
    pixels[i * 4 + 3] = 255;
  }
  const source = new BufferImageSource({
    resource: pixels,
    width: LUT_SIZE,
    height: 1,
    format: 'rgba8unorm',
    // Linear interpolation across the LUT gives smooth colormap gradients.
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
  });
  return new Texture({ source });
}

/** Sample a single RGB color from a colormap at normalized position t ∈ [0,1]. */
export function getColormapColor(
  name: ColormapType,
  t: number,
  invert = false
): [number, number, number] {
  const gen = GENERATORS[name] ?? GENERATORS.grayscale;
  const tt = invert ? 1 - t : t;
  const [r, g, b] = gen(tt);
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
}

/**
 * Return a CSS linear-gradient string for a live preview of the colormap.
 * Respects the invert flag so the UI preview always matches the rendered result.
 *
 * NOTE: This is only used for the tiny preview bar in TraceControlPanel.
 * The real rendering always uses the 256-sample WebGL texture (see createColormapTexture).
 * The preview is intentionally low-sample for DOM lightness; any edge artifacts
 * (e.g. 1px white/red line when an endpoint color after inversion is extreme)
 * are handled on the consumer side with a wrapper + overflow-hidden pattern.
 */
export function getColormapCssGradient(name: ColormapType, invert = false, samples = 11): string {
  const parts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const [r, g, b] = getColormapColor(name, t, invert);
    const pct = (t * 100).toFixed(1);
    parts.push(`rgb(${r},${g},${b}) ${pct}%`);
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
