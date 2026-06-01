/**
 * Control panel for trace visualization settings (render mode, render settings, scale).
 *
 * Typography (post-4.2 polish from visual review): This is the canonical dense viz workbench
 * control surface. Refined treatment after direct feedback that heavy mono + uppercase +
 * 0.28em tracking on the View Scale popover (especially status lines) looked "ugly".
 *
 * Current rules demonstrated here:
 * - Toolbar labels ("Style", "Zoom"): `.text-eyebrow` (short, perfect use).
 * - Scale popover title + section labels ("Horizontal", "Vertical exag."): proportional
 *   `text-[length:var(--text-xs,10px)]` / `text-[length:var(--text-sm,12px)]` (density-aware)
 *   font-medium for good hierarchy and readability.
 * - Unit hints ("px / trace", "time / depth stretch"): restrained mono, tiny size,
 *   light tracking (0.05em). Still technical, not shouting.
 * - Tick labels and numeric values/readouts: small mono + `tabular-nums`, light tracking.
 * - Dynamic status lines ("1,234 traces visible", "6.004s · 1,501 samples"): proportional
 *   `text-[length:var(--text-xs,10px)] text-text-dim` (density-aware; natural case, no eyebrow).
 *   Much friendlier to scan.
 * - Render settings popover (MODE / SCALING / VARIABLE DENSITY / WIGGLE): received the
 *   same post-review polish as the scale popover — section titles use colored proportional
 *   small text (accent color preserved via the left bars), internal labels proportional,
 *   ticks and data values use restrained mono, the "Empty = full-trace AGC." help text is
 *   now proportional small text (no more mono on explanatory content). The colored left
 *   bars + accent titles remain the strong visual grouping cue.
 *
 * No mono/eyebrow on sentences or body content anywhere. Both popovers (scale + render
 * settings) now serve as the reference for balanced dense viz chrome typography after
 * real visual review. See design-language.md Typography §4.2-mono.
 */
import {
  getMaxZoomX,
  getMinZoomX,
  MAX_ZOOM_Y,
  MIN_ZOOM_Y,
} from '@/features/trace-visualization/hooks/gestureClassifier';
import {
  getColormapCssGradient,
  normalizeColormap,
} from '@/features/trace-visualization/renderer/colormaps';
import { INITIAL_VISIBLE_TRACES } from '@/features/trace-visualization/renderer/constants';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import type {
  AmplitudeStats,
  ColormapType,
  RenderMode,
  RgbColor,
} from '@/features/trace-visualization/types/rendering';
import { scanAmplitudeRange } from '@/shared/api/tauri/segy';
import { useAppStore } from '@/shared/store/appStore';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { fieldClass } from '@/shared/ui/field';
import { Label } from '@/shared/ui/label';
import { OptionTile } from '@/shared/ui/option-tile';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/utils/cn';
import { Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const sliderToZoom = (v: number): number => Math.pow(10, (v - 50) / 50);
const zoomToSlider = (z: number): number => Math.max(0, Math.min(100, 50 + 50 * Math.log10(z)));

/**
 * Real signed linear amplitude histogram.
 * Shows both negative and positive lobes. Bars inside the [-clip, +clip]
 * region are drawn in accent color; bars outside are muted.
 */
function AmplitudeHistogramBar({
  histogram,
  clipValue,
  width = 220,
  height = 52,
}: {
  histogram: { binEdges: number[]; counts: number[] };
  clipValue: number;
  width?: number;
  height?: number;
}) {
  const { binEdges, counts } = histogram;
  if (!binEdges || binEdges.length < 2 || !counts || counts.length === 0) {
    return null;
  }

  const nBins = counts.length;
  const maxCount = Math.max(...counts, 1);
  const barW = width / nBins;

  const maxAmp = Math.max(Math.abs(binEdges[0] ?? 0), Math.abs(binEdges[binEdges.length - 1] ?? 0));
  const clip = Math.max(0, Math.min(clipValue, maxAmp));

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      {counts.map((count, i) => {
        const barH = (count / maxCount) * (height - 4);
        const left = binEdges[i];
        const right = binEdges[i + 1];
        if (left === undefined || right === undefined) return null;
        const mid = (left + right) / 2;
        const isInsideClip = Math.abs(mid) <= clip;

        return (
          <rect
            key={i}
            x={i * barW + 1}
            y={height - barH}
            width={barW - 1.5}
            height={barH}
            rx={1}
            className={isInsideClip ? 'fill-accent-2/60' : 'fill-border'}
          />
        );
      })}
    </svg>
  );
}

const MODE_LABELS: Record<RenderMode, string> = {
  'variable-density': 'Variable Density',
  wiggle: 'Wiggle',
  'wiggle-variable-density': 'Wiggle + VD',
};

/**
 * Colored section wrapper for the render settings popover. Uses a 2px left
 * border + matching tinted background so each semantic group is immediately
 * distinguishable at a glance.
 */
function SettingsSection({
  title,
  accentVar,
  badge,
  children,
}: {
  title: string;
  accentVar: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 pl-2 pr-1 py-1.5" style={{ borderLeft: `2px solid ${accentVar}` }}>
      <div className="flex items-center justify-between">
        <p className="text-[length:var(--text-xs,10px)] font-semibold tracking-[0.06em]" style={{ color: accentVar }}>
          {title}
        </p>
        {badge}
      </div>
      {children}
    </div>
  );
}

const scalingTypes = [
  { value: 'global-percentile', label: 'Perc' },
  { value: 'global-fixed', label: 'Fixed' },
  { value: 'agc', label: 'AGC' },
] as const;

/** Amplitude scaling controls — title and badge are provided by the wrapping SettingsSection. */
function AmplitudeScalingSection() {
  const { amplitudeScaling, amplitudeStats, setAmplitudeScaling } = useTraceVisualizationStore();
  const { filePath } = useAppStore();

  const [percentile, setPercentile] = useState(0.99);
  const [gainDb, setGainDb] = useState(-6);
  const [agcGainDb, setAgcGainDb] = useState(() =>
    amplitudeScaling.type === 'agc' ? (amplitudeScaling.gainDb ?? -6) : -6
  );
  const percentileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanRequestIdRef = useRef(0);

  useEffect(() => {
    const scanRequestId = scanRequestIdRef;
    return () => {
      scanRequestId.current++;
      if (percentileTimerRef.current) clearTimeout(percentileTimerRef.current);
    };
  }, []);

  useEffect(() => {
    scanRequestIdRef.current++;
    if (percentileTimerRef.current) clearTimeout(percentileTimerRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of local UI state (defaults) on new file load; standard pattern for panel reset
    setPercentile(0.99);
    setGainDb(-6);
    setAgcGainDb(-6);
  }, [filePath]);

  const maxAmp = amplitudeStats?.maxAmplitude ?? 1.0;
  const gainFactor = Math.pow(10, gainDb / 20);
  const appliedClipValue = maxAmp * gainFactor;
  const clipValue =
    amplitudeScaling.type === 'global-percentile'
      ? (amplitudeStats?.percentileClip ?? maxAmp)
      : amplitudeScaling.type === 'global-fixed'
        ? appliedClipValue
        : maxAmp;

  const handlePercentileChange = (newPercentile: number) => {
    setPercentile(newPercentile);
    if (!filePath) return;
    if (percentileTimerRef.current) clearTimeout(percentileTimerRef.current);
    const requestId = ++scanRequestIdRef.current;
    const requestFilePath = filePath;
    percentileTimerRef.current = setTimeout(() => {
      scanAmplitudeRange(requestFilePath, newPercentile)
        .then((stats: AmplitudeStats) => {
          if (requestId !== scanRequestIdRef.current) return;
          useTraceVisualizationStore.setState({
            amplitudeStats: stats,
            amplitudeScaling: { type: 'global-percentile', clipValue: stats.percentileClip },
            amplitudeScanFailed: false,
          });
        })
        .catch(err => {
          if (requestId !== scanRequestIdRef.current) return;
          console.warn('Amplitude scan failed:', err);
          useTraceVisualizationStore.setState({ amplitudeScanFailed: true });
        });
    }, 300);
  };

  const handleGainDbChange = (newGainDb: number) => {
    setGainDb(newGainDb);
    setAmplitudeScaling({
      type: 'global-fixed',
      clipValue: maxAmp * Math.pow(10, newGainDb / 20),
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-0.5 rounded-[var(--radius-sm)] border border-border bg-panel-muted p-0.5">
        {scalingTypes.map(({ value, label }) => (
          <OptionTile
            key={value}
            density="compact"
            selected={amplitudeScaling.type === value}
            onClick={() => {
              if (value === 'global-percentile') {
                setAmplitudeScaling({
                  type: 'global-percentile',
                  clipValue: amplitudeStats?.percentileClip ?? maxAmp,
                });
                handlePercentileChange(percentile);
              } else if (value === 'global-fixed') handleGainDbChange(gainDb);
              else {
                const currentWindow =
                  amplitudeScaling.type === 'agc' ? amplitudeScaling.windowSize : undefined;
                setAmplitudeScaling({ type: 'agc', windowSize: currentWindow, gainDb: agcGainDb });
              }
            }}
          >
            {label}
          </OptionTile>
        ))}
      </div>

      {amplitudeStats && amplitudeScaling.type !== 'agc' && amplitudeStats.histogram && (
        <div className="rounded-[var(--radius-sm)] border border-border bg-panel-muted px-2 pt-2 pb-2">
          <AmplitudeHistogramBar histogram={amplitudeStats.histogram} clipValue={clipValue} />
          <div className="mt-2 flex items-center justify-between text-[length:var(--text-2xs,9px)] font-mono text-text-dim tabular-nums">
            <span>-{maxAmp.toExponential(1)}</span>
            <span className="rounded-sm bg-accent-2/10 px-1 py-px text-[length:var(--text-2xs,9px)] font-medium text-accent-2 tabular-nums">
              clip
            </span>
            <span>+{maxAmp.toExponential(1)}</span>
          </div>
        </div>
      )}

      {amplitudeScaling.type === 'global-percentile' && (
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <label htmlFor="amp-percentile" className="text-[length:var(--text-xs,10px)] font-medium text-text">
              Percentile
            </label>
            <div className="ml-auto w-[88px] flex justify-end">
              <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                {(percentile * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <input
            id="amp-percentile"
            type="range"
            min="0.5"
            max="1.0"
            step="0.01"
            value={percentile}
            onChange={e => handlePercentileChange(parseFloat(e.target.value))}
            className="range-slider w-full accent-accent"
          />
          <div className="mt-0.5 flex justify-between text-[length:var(--text-2xs,9px)] font-mono text-text-dim tabular-nums tracking-[0.02em]">
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {amplitudeScaling.type === 'global-fixed' && (
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <label htmlFor="amp-gain" className="text-[length:var(--text-xs,10px)] font-medium text-text">
              Gain
            </label>
            <div className="ml-auto w-[88px] flex justify-end">
              <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                {gainDb >= 0 ? '+' : ''}
                {gainDb} dB
              </span>
            </div>
          </div>
          <input
            id="amp-gain"
            type="range"
            min="-40"
            max="40"
            step="1"
            value={gainDb}
            onChange={e => handleGainDbChange(parseInt(e.target.value, 10))}
            className="range-slider w-full accent-accent"
          />
          <div className="mt-0.5 flex justify-between text-[length:var(--text-2xs,9px)] font-mono text-text-dim tabular-nums tracking-[0.02em]">
            <span>-40 dB</span>
            <span>+40 dB</span>
          </div>
          {amplitudeStats && (
            <div className="mt-2 space-y-0.5 text-[length:var(--text-2xs,9px)] font-mono text-text-dim tabular-nums">
              <p>max · {maxAmp.toExponential(2)}</p>
              <p>
                clip · {appliedClipValue.toExponential(2)} ({gainFactor.toFixed(3)}×)
              </p>
            </div>
          )}
        </div>
      )}

      {amplitudeScaling.type === 'agc' && (
        <div className="space-y-3">
          <div>
            <label htmlFor="agc-window" className="mb-1.5 block text-[length:var(--text-xs,10px)] font-medium text-text">
              Window (ms)
            </label>
            <input
              id="agc-window"
              type="number"
              min="0"
              step="10"
              value={amplitudeScaling.windowSize || ''}
              onChange={e => {
                const val = e.target.value;
                setAmplitudeScaling({
                  type: 'agc',
                  windowSize: val ? parseFloat(val) : undefined,
                });
              }}
              placeholder="Full trace"
              className={cn(fieldClass, 'w-full font-mono tabular-nums')}
            />
            <p className="mt-1 text-[length:var(--text-xs,10px)] text-text-dim">Empty = full-trace AGC.</p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-3">
              <label htmlFor="agc-gain" className="text-[length:var(--text-xs,10px)] font-medium text-text">
                Gain
              </label>
              <div className="ml-auto w-[88px] flex justify-end">
                <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                  {agcGainDb >= 0 ? '+' : ''}
                  {agcGainDb} dB
                </span>
              </div>
            </div>
            <input
              id="agc-gain"
              type="range"
              min="-12"
              max="12"
              step="1"
              value={agcGainDb}
              onChange={e => {
                const newGain = parseInt(e.target.value, 10);
                setAgcGainDb(newGain);
                setAmplitudeScaling({
                  type: 'agc',
                  windowSize: amplitudeScaling.windowSize,
                  gainDb: newGain,
                });
              }}
              className="range-slider w-full accent-accent"
            />
            <div className="mt-0.5 flex justify-between text-[length:var(--text-2xs,9px)] font-mono text-text-dim tabular-nums tracking-[0.02em]">
              <span>-12 dB</span>
              <span>+12 dB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const rgbToHex = (c: RgbColor | null): string => {
  if (!c) return '#666666'; // visual hint that this is "no color"
  const [r, g, b] = c;
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
};

const hexToRgb = (hex: string): RgbColor => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * Gear button + adaptive popover for all render-mode-specific settings:
 * colormap (VD modes), amplitude scaling (all modes), wiggle scale + line
 * color (wiggle modes).
 */
function RenderSettingsControl() {
  const {
    renderMode,
    setRenderMode,
    colormap,
    invertColormap,
    setColormap,
    setInvertColormap,
    wiggleConfig,
    setWiggleConfig,
    amplitudeScanFailed,
  } = useTraceVisualizationStore();

  // Legacy migration for old persisted / HMR state containing the removed variant.
  const { colormap: effectiveColormapForUI, invert: effectiveInvertForUI } = normalizeColormap(
    colormap,
    invertColormap
  );

  const showColormap =
    renderMode === 'variable-density' || renderMode === 'wiggle-variable-density';
  const showWiggle = renderMode === 'wiggle' || renderMode === 'wiggle-variable-density';

  const scanFailedBadge = amplitudeScanFailed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--accent-3)]/40 bg-[var(--accent-3)]/10 px-1.5 py-0.5',
            'text-eyebrow readout-warn'
          )}
          role="status"
        >
          <span className="size-1 rounded-full bg-[var(--accent-3)]" />
          Default
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Amplitude scan failed, using default scaling. Check console for details.
      </TooltipContent>
    </Tooltip>
  ) : undefined;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(fieldClass, 'flex items-center gap-1.5 py-1 px-2 text-[length:var(--text-sm,12px)]')}
            >
              <span>{MODE_LABELS[renderMode]}</span>
              <Settings className="size-3 text-text-dim" aria-hidden />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Render settings</TooltipContent>
      </Tooltip>

      <PopoverContent className="w-72 space-y-2" align="start" side="top">
        <div>
          <p className="mb-1 text-[length:var(--text-xs,10px)] font-semibold tracking-[0.06em] text-text-dim">Mode</p>
          <Select value={renderMode} onValueChange={v => setRenderMode(v as RenderMode)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="variable-density">Variable Density</SelectItem>
              <SelectItem value="wiggle">Wiggle</SelectItem>
              <SelectItem value="wiggle-variable-density">Wiggle + VD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <SettingsSection title="Scaling" accentVar="var(--accent-2)" badge={scanFailedBadge}>
          <AmplitudeScalingSection />
        </SettingsSection>

        {showColormap && (
          <SettingsSection title="Variable Density" accentVar="var(--accent)">
            {/* Live preview of the selected colormap (respects invert).
                The wrapper + inner div pattern prevents a 1px edge artifact
                (white/red "leak") that occurs when a linear-gradient is the
                direct background of an element that also has border + border-radius,
                especially on very small heights with large radius and when an
                endpoint color after inversion is pure white or red. */}
            <div className="h-2.5 w-full overflow-hidden rounded-[var(--radius-sm)] border border-border shadow-inner">
              <div
                className="h-full w-full"
                style={{
                  background: getColormapCssGradient(effectiveColormapForUI, effectiveInvertForUI),
                }}
                aria-hidden="true"
              />
            </div>

            {/* Colormap select + Invert toggle on the same row for visual parity
                with the Wiggle color rows and other justify-between controls. */}
            <div className="pt-1.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    value={effectiveColormapForUI}
                    onValueChange={v => setColormap(v as ColormapType)}
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seismic">Seismic</SelectItem>
                      <SelectItem value="grayscale">Grayscale</SelectItem>
                      <SelectItem value="viridis">Viridis</SelectItem>
                      <SelectItem value="plasma">Plasma</SelectItem>
                      <SelectItem value="coolwarm">Coolwarm</SelectItem>
                      <SelectItem value="bone">Bone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="ml-auto w-[88px] flex items-center justify-end gap-1 shrink-0">
                  <Checkbox
                    id="vd-invert"
                    size="sm"
                    checked={effectiveInvertForUI}
                    onCheckedChange={checked => setInvertColormap(checked === true)}
                  />
                  <Label
                    htmlFor="vd-invert"
                    className="cursor-pointer text-[length:var(--text-xs,10px)] font-medium text-text whitespace-nowrap"
                  >
                    Invert
                  </Label>
                </div>
              </div>
            </div>
          </SettingsSection>
        )}

        {showWiggle && (
          <SettingsSection title="Wiggle" accentVar="var(--accent-3)">
            <div className="pt-1">
              <div className="mb-1.5 flex items-center gap-3">
                <label htmlFor="wiggle-scale" className="text-[length:var(--text-xs,10px)] font-medium text-text">
                  Scale
                </label>
                <div className="ml-auto w-[88px] flex justify-end">
                  <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text">
                    {wiggleConfig.wiggleScale.toFixed(1)}×
                  </span>
                </div>
              </div>
              <input
                id="wiggle-scale"
                type="range"
                min="0.5"
                max="3.0"
                step="0.5"
                value={wiggleConfig.wiggleScale}
                onChange={e => setWiggleConfig({ wiggleScale: parseFloat(e.target.value) })}
                className="range-slider w-full accent-accent"
              />
              <div className="mt-0.5 flex justify-between text-[length:var(--text-2xs,9px)] font-mono text-text-dim tabular-nums tracking-[0.02em]">
                <span>0.5×</span>
                <span>2.0×</span>
                <span>3.0×</span>
              </div>
            </div>

            <div className="pt-1" />

            {/* Color rows — ultra compact professional tool style.
               Fixed narrow label column + tight right cluster keeps everything close. */}
            {/* Line */}
            <div className="flex items-center pt-0.5 gap-2">
              <label
                htmlFor="wiggle-line-color"
                className="text-[length:var(--text-xs,10px)] font-medium text-text w-[60px] shrink-0"
              >
                Line
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="wiggle-line-color"
                  type="color"
                  value={rgbToHex(wiggleConfig.lineColor)}
                  onChange={e => setWiggleConfig({ lineColor: hexToRgb(e.target.value) })}
                  className={`h-4 w-7 cursor-pointer rounded border border-border/60 bg-transparent ${wiggleConfig.lineColor === null ? 'opacity-40' : ''}`}
                />
                <Button
                  variant="ghost"
                  className="size-4 p-0.5 focus-ring text-text-dim hover:text-text rounded hover:bg-panel-strong/50"
                  onClick={() => setWiggleConfig({ lineColor: null })}
                  aria-label="No line (transparent)"
                  title="No line (transparent)"
                >
                  <X size={10} />
                </Button>
              </div>
            </div>

            {/* Positive Fill */}
            <div className="flex items-center pt-0.5 gap-2">
              <label
                htmlFor="wiggle-pos-fill"
                className="text-[length:var(--text-xs,10px)] font-medium text-text w-[60px] shrink-0"
              >
                + Fill
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="wiggle-pos-fill"
                  type="color"
                  value={rgbToHex(wiggleConfig.positiveFillColor)}
                  onChange={e => setWiggleConfig({ positiveFillColor: hexToRgb(e.target.value) })}
                  className={`h-4 w-7 cursor-pointer rounded border border-border/60 bg-transparent ${wiggleConfig.positiveFillColor === null ? 'opacity-40' : ''}`}
                />
                <Button
                  variant="ghost"
                  className="size-4 p-0.5 focus-ring text-text-dim hover:text-text rounded hover:bg-panel-strong/50"
                  onClick={() => setWiggleConfig({ positiveFillColor: null })}
                  aria-label="No positive fill"
                  title="No positive fill"
                >
                  <X size={10} />
                </Button>
              </div>
            </div>

            {/* Negative Fill */}
            <div className="flex items-center pt-0.5 gap-2">
              <label
                htmlFor="wiggle-neg-fill"
                className="text-[length:var(--text-xs,10px)] font-medium text-text w-[60px] shrink-0"
              >
                – Fill
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="wiggle-neg-fill"
                  type="color"
                  value={rgbToHex(wiggleConfig.negativeFillColor)}
                  onChange={e => setWiggleConfig({ negativeFillColor: hexToRgb(e.target.value) })}
                  className={`h-4 w-7 cursor-pointer rounded border border-border/60 bg-transparent ${wiggleConfig.negativeFillColor === null ? 'opacity-40' : ''}`}
                />
                <Button
                  variant="ghost"
                  className="size-4 p-0.5 focus-ring text-text-dim hover:text-text rounded hover:bg-panel-strong/50"
                  onClick={() => setWiggleConfig({ negativeFillColor: null })}
                  aria-label="No negative fill"
                  title="No negative fill"
                >
                  <X size={10} />
                </Button>
              </div>
            </div>

            {/* Background */}
            <div className="flex items-center pt-0.5 gap-2">
              <label
                htmlFor="wiggle-bg-color"
                className="text-[length:var(--text-xs,10px)] font-medium text-text w-[60px] shrink-0"
              >
                Background
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="wiggle-bg-color"
                  type="color"
                  value={rgbToHex(wiggleConfig.backgroundColor)}
                  onChange={e => setWiggleConfig({ backgroundColor: hexToRgb(e.target.value) })}
                  className={`h-4 w-7 cursor-pointer rounded border border-border/60 bg-transparent ${wiggleConfig.backgroundColor === null ? 'opacity-40' : ''}`}
                />
                <Button
                  variant="ghost"
                  className="size-4 p-0.5 focus-ring text-text-dim hover:text-text rounded hover:bg-panel-strong/50"
                  onClick={() => setWiggleConfig({ backgroundColor: null })}
                  aria-label="Transparent background"
                  title="Transparent background"
                >
                  <X size={10} />
                </Button>
              </div>
            </div>
          </SettingsSection>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ScaleControl() {
  const { zoomX, zoomY } = useTraceVisualizationStore();
  const { segyData } = useAppStore();

  const totalTraces = segyData?.total_traces ?? 0;
  const totalSamples = (segyData?.binary_header?.['samples_per_trace'] as number | undefined) ?? 0;
  const bothDefault = Math.abs(zoomX - 1.0) < 0.001 && Math.abs(zoomY - 1.0) < 0.001;
  const scaleLabel = bothDefault
    ? `${zoomX.toFixed(1)}×`
    : `H ${zoomX.toFixed(1)}× · V ${zoomY.toFixed(1)}×`;
  const visibleTraceCount = totalTraces > 0 ? Math.round(INITIAL_VISIBLE_TRACES / zoomX) : null;
  const dtRaw = segyData?.binary_header?.['sample_interval_us'];
  const sampleIntervalUs = typeof dtRaw === 'number' && dtRaw > 0 ? dtRaw : null;
  const totalTimeSec =
    totalSamples > 0 && sampleIntervalUs
      ? ((totalSamples * sampleIntervalUs) / 1_000_000).toFixed(3)
      : null;

  const updateScale = (next: { zoomX?: number; zoomY?: number; resetPan?: boolean }) => {
    const minX = totalTraces > 0 ? getMinZoomX(totalTraces) : 0.1;
    const maxX = getMaxZoomX();
    const minY = MIN_ZOOM_Y;
    const maxY = MAX_ZOOM_Y;

    const nextX = next.zoomX != null ? Math.max(minX, Math.min(maxX, next.zoomX)) : undefined;
    const nextY = next.zoomY != null ? Math.max(minY, Math.min(maxY, next.zoomY)) : undefined;

    useTraceVisualizationStore.setState(state => ({
      zoomX: nextX ?? state.zoomX,
      zoomY: nextY ?? state.zoomY,
      ...(next.resetPan ? { panOffset: { x: 0, y: 0 } } : {}),
    }));
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-eyebrow">Zoom</span>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  fieldClass,
                  'flex items-center gap-1.5 font-mono tabular-nums py-1 px-2 text-[length:var(--text-sm,12px)]'
                )}
              >
                <span className={bothDefault ? undefined : 'text-accent'}>{scaleLabel}</span>
                <Settings className="size-3 text-text-dim" aria-hidden />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Zoom — Shift+scroll: H zoom · Alt+scroll: V exag.
          </TooltipContent>
        </Tooltip>

        <PopoverContent className="w-72 space-y-3" align="start" side="top">
          <div className="text-[length:var(--text-sm,12px)] font-semibold tracking-[0.03em] text-text">View scale</div>

          {/* Horizontal */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <div>
                <label htmlFor="scale-horizontal" className="text-[length:var(--text-sm,12px)] font-medium text-text">
                  Horizontal
                </label>
                <div className="text-[length:var(--text-2xs,9px)] font-mono text-text-dim tracking-[0.05em] leading-none">
                  px / trace
                </div>
              </div>
              <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text font-medium">
                {zoomX.toFixed(2)}×
              </span>
            </div>
            <input
              id="scale-horizontal"
              type="range"
              min="0"
              max="100"
              step="1"
              value={zoomToSlider(zoomX)}
              onChange={e => {
                updateScale({ zoomX: sliderToZoom(parseFloat(e.target.value)) });
              }}
              className="range-slider h-1 w-full accent-accent"
            />
            <div className="flex justify-between text-[length:var(--text-2xs,9px)] font-mono text-text-dim tabular-nums tracking-[0.02em]">
              <span>0.1×</span>
              <span>1.0×</span>
              <span>10×</span>
            </div>
            {visibleTraceCount !== null && (
              <p className="text-[length:var(--text-xs,10px)] text-text-dim tabular-nums">
                <span className="tabular-nums">{visibleTraceCount.toLocaleString()}</span> traces
                visible
              </p>
            )}
          </div>

          <div className="border-t border-border/60" />

          {/* Vertical */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <div>
                <label htmlFor="scale-vertical" className="text-[length:var(--text-sm,12px)] font-medium text-text">
                  Vertical exag.
                </label>
                <div className="text-[length:var(--text-2xs,9px)] font-mono text-text-dim tracking-[0.05em] leading-none">
                  time / depth stretch
                </div>
              </div>
              <span className="font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text font-medium">
                {zoomY.toFixed(2)}×
              </span>
            </div>
            <input
              id="scale-vertical"
              type="range"
              min="50"
              max="100"
              step="1"
              value={zoomToSlider(zoomY)}
              onChange={e => {
                updateScale({ zoomY: sliderToZoom(parseFloat(e.target.value)) });
              }}
              className="range-slider h-1 w-full accent-accent"
            />
            <div className="flex justify-between text-[length:var(--text-2xs,9px)] font-mono text-text-dim tabular-nums tracking-[0.02em]">
              <span>1.0×</span>
              <span>3.2×</span>
              <span>10×</span>
            </div>
            {totalTimeSec !== null && totalSamples > 0 && (
              <p className="text-[length:var(--text-xs,10px)] text-text-dim tabular-nums">
                <span className="tabular-nums">{totalTimeSec}</span>s ·{' '}
                <span className="tabular-nums">{totalSamples.toLocaleString()}</span> samples
              </p>
            )}
          </div>

          <div className="flex gap-1.5 pt-1">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => updateScale({ zoomY: 1.0 })}
            >
              Fit Vertical
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => updateScale({ zoomX: 1.0, zoomY: 1.0, resetPan: true })}
            >
              Reset
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * UI controls for rendering and viewport settings.
 *
 * Typography note: see file-level JSDoc (Task 4.2 final sweep) for full 4.2-mono analysis.
 * This component (plus its nested sections and popovers) is the canonical dense chrome
 * surface demonstrating correct mono/proportional separation in the viz workbench.
 *
 * @returns Control panel with mode selector, render settings gear, and scale popover.
 */
export const TraceControlPanel = () => {
  return (
    <div className="text-text">
      <div className="flex flex-wrap items-center gap-3 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-eyebrow">Style</span>
          <RenderSettingsControl />
        </div>
        <ScaleControl />
      </div>
    </div>
  );
};
