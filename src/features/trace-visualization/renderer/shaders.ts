/**
 * GLSL shader sources for variable-density and wiggle rendering.
 *
 * Both modes sample the same amplitude texture tiles. Render params live in
 * uniforms, so colormap/clip/style changes are uniform updates instead of
 * texture re-uploads or CPU path rebuilds.
 *
 * Targets WebGL2 via PixiJS v8's `Shader` + `GlProgram`.
 */
import { GlProgram, Shader, UniformGroup, type Texture } from 'pixi.js';

const vertex = `#version 300 es
in vec2 aPosition;
in vec2 aUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

out vec2 vUV;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  vec3 pos = mvp * vec3(aPosition, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  vUV = aUV;
}
`;

const vdFragment = `#version 300 es
precision highp float;

in vec2 vUV;

uniform sampler2D uAmp;
uniform sampler2D uColormap;
uniform float uClip;

out vec4 fragColor;

float sampleAmpBilinear(vec2 uv) {
  vec2 texSize = vec2(textureSize(uAmp, 0));
  vec2 coord = uv * texSize - 0.5;
  ivec2 maxCoord = ivec2(texSize) - ivec2(1);

  ivec2 p00 = clamp(ivec2(floor(coord)), ivec2(0), maxCoord);
  ivec2 p10 = clamp(p00 + ivec2(1, 0), ivec2(0), maxCoord);
  ivec2 p01 = clamp(p00 + ivec2(0, 1), ivec2(0), maxCoord);
  ivec2 p11 = clamp(p00 + ivec2(1, 1), ivec2(0), maxCoord);

  vec2 f = fract(coord);
  float v00 = texelFetch(uAmp, p00, 0).r;
  float v10 = texelFetch(uAmp, p10, 0).r;
  float v01 = texelFetch(uAmp, p01, 0).r;
  float v11 = texelFetch(uAmp, p11, 0).r;
  float vx0 = mix(v00, v10, f.x);
  float vx1 = mix(v01, v11, f.x);
  return mix(vx0, vx1, f.y);
}

void main() {
  // Amplitude texture is laid out as (x=sample, y=trace) — the backend emits
  // row-major per trace. Screen maps x=trace, y=sample, so we swap UV here.
  vec2 ampUv = vec2(vUV.y, vUV.x);
  float a = sampleAmpBilinear(ampUv);
  float norm = clamp(a / max(uClip, 1e-12), -1.0, 1.0);
  float t = norm * 0.5 + 0.5;
  fragColor = texture(uColormap, vec2(t, 0.5));
}
`;

const wiggleFragment = `#version 300 es
precision highp float;

in vec2 vUV;

uniform sampler2D uAmp;
uniform float uClip;
uniform float uTraceCount;
uniform float uSampleCount;
uniform float uLineR;
uniform float uLineG;
uniform float uLineB;
uniform float uPosFillR;
uniform float uPosFillG;
uniform float uPosFillB;
uniform float uNegFillR;
uniform float uNegFillG;
uniform float uNegFillB;
uniform float uBgR;
uniform float uBgG;
uniform float uBgB;
uniform float uHasLine;
uniform float uHasPosFill;
uniform float uHasNegFill;
uniform float uHasBg;
uniform float uFillBackground;
uniform float uStrokeWidth;
uniform float uWiggleScale;
uniform float uPxPerTrace;
uniform float uPxPerSample;

out vec4 fragColor;

float ampAt(int traceIdx, int sampleIdx) {
  float sx = (float(sampleIdx) + 0.5) / uSampleCount;
  float sy = (float(traceIdx) + 0.5) / uTraceCount;
  return texture(uAmp, vec2(sx, sy)).r;
}

/**
 * Sample the normalized amplitude at a given (trace, canonical-sample) location
 * using linear interpolation between adjacent samples.
 *
 * Also returns (via out parameter) the local derivative d(norm)/dy measured
 * in canonical sample space. This derivative is used by the wiggle stroke
 * renderer to compute *true perpendicular distance* to the implicit curve
 * x = f(y) rather than raw horizontal distance.
 *
 * Using horizontal distance alone on an x=f(y) function produces the classic
 * "fountain pen" / variable-thickness artifact because the gradient of the
 * distance field is not constant — it varies with local slope. The correction
 * dist_perp = abs(x - f(y)) / sqrt(1 + (df/dy)^2) removes that dependency.
 */
float traceNormAt(int traceIdx, float yCanonical, out float dnorm_dy) {
  float yClamped = clamp(yCanonical, 0.0, uSampleCount - 1.0);
  float s0f = floor(yClamped);
  float s1f = min(s0f + 1.0, uSampleCount - 1.0);
  int s0 = int(s0f);
  int s1 = int(s1f);
  float lerpT = yClamped - s0f;

  float a0 = ampAt(traceIdx, s0);
  float a1 = ampAt(traceIdx, s1);

  // Mix raw amplitudes first, then clamp — preserves the correct zero-crossing
  // position (where norm=0 and wiggleX=traceCenter). Clamping before mixing
  // shifts zero-crossings when adjacent samples straddle the clip boundary,
  // which moves fill region edges and stroke to incorrect horizontal positions.
  float norm = clamp(mix(a0, a1, lerpT) / max(uClip, 1e-12), -1.0, 1.0);

  // Derivative on the clamped per-sample values — reflects the actual slope of
  // the displayed curve (which is clamped to ±1 at the sample points) and is
  // used for the perpendicular stroke-width correction in coverageForTrace.
  float n0 = clamp(a0 / max(uClip, 1e-12), -1.0, 1.0);
  float n1 = clamp(a1 / max(uClip, 1e-12), -1.0, 1.0);

  if (s0 == s1) {
    dnorm_dy = 0.0;
  } else {
    dnorm_dy = (n1 - n0); // Δy == 1.0 in canonical sample space
  }

  return norm;
}

/**
 * Core coverage computation for one specific trace index.
 * Returns vec3(fillPos, fillNeg, lineAlpha) for the wiggle belonging to trace t.
 *
 * Positive fill is the region between trace center and the curve when norm > 0.
 * Negative fill is the region between trace center and the curve when norm < 0.
 */
vec3 coverageForTrace(int t, float xPos, float yCanonical) {
  float dnorm_dy;
  float norm = traceNormAt(t, yCanonical, dnorm_dy);

  float traceCenter = float(t);
  float wiggleX = traceCenter + norm * uWiggleScale;

  float fillPos = 0.0;
  float fillNeg = 0.0;
  if (norm > 0.0 && xPos >= traceCenter && xPos <= wiggleX) {
    fillPos = 1.0;
  } else if (norm < 0.0 && xPos <= traceCenter && xPos >= wiggleX) {
    fillNeg = 1.0;
  }

  // Perpendicular distance in canonical space (slope correction)
  float slope = dnorm_dy * uWiggleScale;
  float s = clamp(slope, -40.0, 40.0);
  float denom = sqrt(1.0 + s * s + 1e-8);
  float dx = xPos - wiggleX;
  float dist = abs(dx) / denom;

  // === Isotropic screen-space stroke width ===
  // We want the rendered line to have constant thickness in *screen pixels*
  // no matter the combination of horizontal + vertical zoom.
  //
  // The normal to the curve x = f(y) in canonical space is approximately (1, -slope).
  // After the anisotropic screen transform (scale by pxPerTrace in X, pxPerSample in Y),
  // the length of that normal in screen pixels per canonical unit is:
  float sx = max(uPxPerTrace, 1e-4);
  float sy = max(uPxPerSample, 1e-4);
  float normalScreenLen = length(vec2(sx, -s * sy));

  // Desired half-width in screen pixels converted to canonical normal units.
  // dist is in canonical normal units (= abs(dx)/denom), so lineHalfWidth must
  // carry the same denom factor: strokePx / (normalScreenLen/denom) = strokePx * denom / normalScreenLen.
  float lineHalfWidth = 0.5 * max(uStrokeWidth, 1e-4) * denom / max(normalScreenLen, 1e-4);

  // One screen pixel expressed in canonical normal units — the correct AA kernel
  // for the perpendicular distance metric used by dist. denom/normalScreenLen
  // converts: denom maps canonical normal units to canonical trace units, while
  // normalScreenLen maps canonical trace units to screen pixels.
  float aaPerp = denom / max(normalScreenLen, 1e-4);

  float lineAlpha = 1.0 - smoothstep(lineHalfWidth, lineHalfWidth + aaPerp, dist);
  return vec3(fillPos, fillNeg, lineAlpha);
}

vec3 wiggleCoverageAt(float xPos, float yCanonical) {
  // Per-fragment primary trace for Voronoi ownership of the slot.
  // With wiggleScale (0.5–3.0), both the line stroke and pos/neg fills from a
  // trace can extend well outside its nominal +/-0.5 cell. We evaluate
  // coverageForTrace over a +/-3 window and take component-wise max.
  // This lets large scaled excursions render their complete positive and
  // negative fills "under the curve" without Voronoi clipping at cell boundaries.
  int primary = int(clamp(floor(xPos + 0.5), 0.0, uTraceCount - 1.0));

  float fillPos = 0.0;
  float fillNeg = 0.0;
  float lineAlpha = 0.0;
  for (int d = -3; d <= 3; d++) {
    int t = primary + d;
    if (t < 0 || t >= int(uTraceCount)) continue;
    vec3 cov = coverageForTrace(t, xPos, yCanonical);
    fillPos = max(fillPos, cov.x);
    fillNeg = max(fillNeg, cov.y);
    lineAlpha = max(lineAlpha, cov.z);
  }

  return vec3(fillPos, fillNeg, lineAlpha);
}

vec3 wiggleCoverageSupersampled(
  float xPos,
  float yCanonical,
  float span
) {
  vec3 c0 = wiggleCoverageAt(xPos, yCanonical);
  vec3 c1 = wiggleCoverageAt(xPos - 0.5 * span, yCanonical);
  vec3 c2 = wiggleCoverageAt(xPos + 0.5 * span, yCanonical);
  vec3 c3 = wiggleCoverageAt(xPos - span, yCanonical);
  vec3 c4 = wiggleCoverageAt(xPos + span, yCanonical);

  float fillPos = max(max(c0.x, c1.x), max(c2.x, max(c3.x, c4.x)));
  float fillNeg = max(max(c0.y, c1.y), max(c2.y, max(c3.y, c4.y)));
  float lineAlpha = (c0.z + c1.z + c2.z + c3.z + c4.z) * 0.2;
  return vec3(fillPos, fillNeg, lineAlpha);
}

void main() {
  float xCanonical = vUV.x * uTraceCount - 0.5;
  float yCanonical = vUV.y * uSampleCount - 0.5;
  float pxPerTrace = max(uPxPerTrace, 1e-4);
  float tracesPerPixel = 1.0 / pxPerTrace;
  float span = clamp(0.5 * tracesPerPixel, 0.5, 4.0);

  vec3 detailCoverage = wiggleCoverageAt(xCanonical, yCanonical);
  vec3 lodCoverage = wiggleCoverageSupersampled(xCanonical, yCanonical, span);
  vec3 coverage;

  // Explicit LOD regimes in screen-space:
  // - >= 2 px/trace: full wiggle detail
  // - 0.75..2 px/trace: transition blend
  // - < 0.75 px/trace: envelope-only (line removed)
  if (pxPerTrace >= 2.0) {
    coverage = detailCoverage;
  } else if (pxPerTrace <= 0.75) {
    coverage = vec3(lodCoverage.x, lodCoverage.y, 0.0);
  } else {
    float t = (2.0 - pxPerTrace) / (2.0 - 0.75);
    coverage = mix(detailCoverage, lodCoverage, t);
    // Fade the line independently to 0 — mix() alone doesn't guarantee the
    // line reaches 0 at t=1 because lodCoverage.z may be non-zero.
    coverage.z = detailCoverage.z * (1.0 - t);
  }

  float fillPos = coverage.x * uHasPosFill;
  float fillNeg = coverage.y * uHasNegFill;
  float lineA = coverage.z * uHasLine;

  vec3 posFill = vec3(uPosFillR, uPosFillG, uPosFillB);
  vec3 negFill = vec3(uNegFillR, uNegFillG, uNegFillB);
  vec3 lineColor = vec3(uLineR, uLineG, uLineB);
  vec3 bgColor = vec3(uBgR, uBgG, uBgB);

  // Choose which fill color (if any) to use.
  vec3 fillColor;
  float fAlpha;
  if (fillPos >= fillNeg) {
    fillColor = posFill;
    fAlpha = fillPos;
  } else {
    fillColor = negFill;
    fAlpha = fillNeg;
  }

  if (uFillBackground > 0.5) {
    if (uHasBg > 0.5) {
      // Pure wiggle mode with solid background
      vec3 col = mix(bgColor, fillColor, clamp(fAlpha, 0.0, 1.0));
      col = mix(col, lineColor, clamp(lineA, 0.0, 1.0));
      fragColor = vec4(col, 1.0);
    } else {
      // Pure wiggle mode with transparent background
      vec3 col = mix(vec3(0.0), fillColor, clamp(fAlpha, 0.0, 1.0));
      col = mix(col, lineColor, clamp(lineA, 0.0, 1.0));
      float finalAlpha = clamp(max(fAlpha, lineA), 0.0, 1.0);
      fragColor = vec4(col, finalAlpha);
    }
  } else {
    // Overlay mode (wiggle on top of VD): emit with alpha
    vec3 col = mix(vec3(0.0), fillColor, clamp(fAlpha, 0.0, 1.0));
    col = mix(col, lineColor, clamp(lineA, 0.0, 1.0));
    fragColor = vec4(col, clamp(max(fAlpha, lineA), 0.0, 1.0));
  }
}
`;

const VD_PROGRAM = GlProgram.from({ vertex, fragment: vdFragment, name: 'tracelens-vd' });
const WIGGLE_PROGRAM = GlProgram.from({
  vertex,
  fragment: wiggleFragment,
  name: 'tracelens-wiggle',
});

/** Resources used by a per-tile VD shader: amplitude texture, colormap, clip. */
export interface VdShaderResources {
  amplitude: Texture;
  colormap: Texture;
  clipValue: number;
}

/** Resources used by a per-tile wiggle shader. */
export interface WiggleShaderResources {
  amplitude: Texture;
  clipValue: number;
  traceCount: number;
  sampleCount: number;
  pxPerTrace: number;
  pxPerSample: number;
  lineColor: [number, number, number] | null;
  positiveFillColor: [number, number, number] | null;
  negativeFillColor: [number, number, number] | null;
  backgroundColor: [number, number, number] | null;
  fillBackground: boolean;
  /**
   * Desired stroke width in screen pixels. Converted using the local
   * screen-space normal (using both pxPerTrace + pxPerSample + local slope)
   * so thickness is constant and isotropic regardless of zoom or curve angle.
   */
  strokeWidth: number;
  wiggleScale: number;
}

/**
 * Build a `Shader` that renders one tile in variable-density mode. Uniforms
 * are routed through a `UniformGroup` so `clipValue` can be swapped in place.
 */
export function createVdShader(r: VdShaderResources): Shader {
  const uniforms = new UniformGroup({
    uClip: { value: r.clipValue, type: 'f32' },
  });

  return new Shader({
    glProgram: VD_PROGRAM,
    resources: {
      uAmp: r.amplitude.source,
      uColormap: r.colormap.source,
      vdUniforms: uniforms,
    },
  });
}

/**
 * Build a `Shader` that renders one tile in wiggle mode fully on the GPU.
 * The fragment shader samples amplitudes and computes fill/line coverage
 * analytically in canonical trace/sample coordinates.
 */
export function createWiggleShader(r: WiggleShaderResources): Shader {
  const hasLine = r.lineColor !== null;
  const hasPos = r.positiveFillColor !== null;
  const hasNeg = r.negativeFillColor !== null;
  const hasBg = r.backgroundColor !== null;

  const [r8, g8, b8] = r.lineColor ?? [0, 0, 0];
  const [pr8, pg8, pb8] = r.positiveFillColor ?? [0, 0, 0];
  const [nr8, ng8, nb8] = r.negativeFillColor ?? [0, 0, 0];
  const [bgR, bgG, bgB] = r.backgroundColor ?? [1, 1, 1];

  const uniforms = new UniformGroup({
    uClip: { value: r.clipValue, type: 'f32' },
    uTraceCount: { value: r.traceCount, type: 'f32' },
    uSampleCount: { value: r.sampleCount, type: 'f32' },
    uPxPerTrace: { value: r.pxPerTrace, type: 'f32' },
    uPxPerSample: { value: r.pxPerSample, type: 'f32' },
    uLineR: { value: r8 / 255, type: 'f32' },
    uLineG: { value: g8 / 255, type: 'f32' },
    uLineB: { value: b8 / 255, type: 'f32' },
    uPosFillR: { value: pr8 / 255, type: 'f32' },
    uPosFillG: { value: pg8 / 255, type: 'f32' },
    uPosFillB: { value: pb8 / 255, type: 'f32' },
    uNegFillR: { value: nr8 / 255, type: 'f32' },
    uNegFillG: { value: ng8 / 255, type: 'f32' },
    uNegFillB: { value: nb8 / 255, type: 'f32' },
    uBgR: { value: bgR / 255, type: 'f32' },
    uBgG: { value: bgG / 255, type: 'f32' },
    uBgB: { value: bgB / 255, type: 'f32' },
    uHasLine: { value: hasLine ? 1 : 0, type: 'f32' },
    uHasPosFill: { value: hasPos ? 1 : 0, type: 'f32' },
    uHasNegFill: { value: hasNeg ? 1 : 0, type: 'f32' },
    uHasBg: { value: hasBg ? 1 : 0, type: 'f32' },
    uFillBackground: { value: r.fillBackground ? 1 : 0, type: 'f32' },
    uStrokeWidth: { value: r.strokeWidth, type: 'f32' },
    uWiggleScale: { value: r.wiggleScale, type: 'f32' },
  });

  return new Shader({
    glProgram: WIGGLE_PROGRAM,
    resources: {
      uAmp: r.amplitude.source,
      wiggleUniforms: uniforms,
    },
  });
}
