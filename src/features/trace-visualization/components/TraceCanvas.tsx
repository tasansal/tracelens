/**
 * Trace rendering canvas backed by a PixiJS `TraceScene`.
 *
 * All interaction logic (wheel gestures, keyboard shortcuts, drag pan) is
 * handled by `useCanvasInteraction`. This component owns only the canvas DOM
 * node and rendering concerns.
 *
 * Typography (Task 4.2 final sweep): The crosshair status overlay uses a local
 * StatusItem helper with `font-mono text-[length:var(--text-xs,10px)] tabular-nums` (ultra-dense numeric
 * data: trace/sample indices, time, amplitude in canvas HUD; short code labels
 * inherit mono appropriately). The hint affordance at end of bar uses `.text-eyebrow`
 * (short formulaic instruction in viz chrome, per 4.2-mono "slightly longer" allowance
 * for dense technical surfaces). No long prose. The 10px size is justified micro
 * for the 22px status bar (distinct from eyebrow 10px which carries uppercase/dim).
 * See design-language.md and TraceVisualizationContainer/TraceControlPanel for sibling
 * viz chrome patterns. Audited clean in final 4.2 sweep; no leaks.
 */
import { normalizeColormap } from '@/features/trace-visualization/renderer/colormaps';
import {
  pixelToIndex,
  pxPerSample,
  pxPerTrace,
} from '@/features/trace-visualization/renderer/constants';
import { TraceScene } from '@/features/trace-visualization/renderer/traceScene';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import {
  agcClip,
  type ColormapType,
  type RenderMode,
  type RgbColor,
} from '@/features/trace-visualization/types/rendering';
import { useAppStore } from '@/shared/store/appStore';
import { useEffect, useReducer, useRef, type RefObject } from 'react';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';

type SceneStatus = { kind: 'init' } | { kind: 'ready' } | { kind: 'error'; message: string };

type SceneStatusAction = { type: 'init' } | { type: 'ready' } | { type: 'error'; message: string };

const INIT_STATUS: SceneStatus = { kind: 'init' };

function sceneStatusReducer(_: SceneStatus, action: SceneStatusAction): SceneStatus {
  switch (action.type) {
    case 'init':
      return { kind: 'init' };
    case 'ready':
      return { kind: 'ready' };
    case 'error':
      return { kind: 'error', message: action.message };
  }
}

function formatAmplitude(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs < 0.001 || abs >= 1e6) return v.toExponential(3);
  return v.toPrecision(4);
}

function StatusItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="font-mono text-[length:var(--text-xs,10px)] tabular-nums text-text-muted">
      <span className="text-text-dim">{label} </span>
      <span className="text-text">{children}</span>
    </span>
  );
}

interface TraceCanvasProps {
  width: number;
  height: number;
}

interface TraceSceneParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  filePath: string | null;
  colormap: ColormapType;
  invertColormap: boolean;
  clipValue: number;
  renderMode: RenderMode;
  lineColor: RgbColor | null;
  wiggleScale: number;
  positiveFillColor: RgbColor | null;
  negativeFillColor: RgbColor | null;
  backgroundColor: RgbColor | null;
  totalTraces: number;
  totalSamples: number;
  zoomX: number;
  zoomY: number;
  panOffset: { x: number; y: number };
  agcEnabled: boolean;
  agcWindowMs: number | null;
}

function useTraceScene({
  canvasRef,
  width,
  height,
  filePath,
  colormap,
  invertColormap,
  clipValue,
  renderMode,
  lineColor,
  wiggleScale,
  positiveFillColor,
  negativeFillColor,
  backgroundColor,
  totalTraces,
  totalSamples,
  zoomX,
  zoomY,
  panOffset,
  agcEnabled,
  agcWindowMs,
}: TraceSceneParams) {
  const sceneRef = useRef<TraceScene | null>(null);
  // Single state machine — ready and error are mutually exclusive, dispatched
  // actions document the transitions and avoid cascading setState.
  const [status, dispatchStatus] = useReducer(sceneStatusReducer, INIT_STATUS);
  const sceneReady = status.kind === 'ready';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new TraceScene();
    sceneRef.current = scene;
    let cancelled = false;
    dispatchStatus({ type: 'init' });
    void scene
      .init(canvas, width, height)
      .then(() => {
        if (cancelled) {
          scene.destroy();
          return;
        }
        dispatchStatus({ type: 'ready' });
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to initialize trace renderer:', error);
        scene.destroy();
        sceneRef.current = null;
        dispatchStatus({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
      dispatchStatus({ type: 'init' });
      sceneRef.current = null;
      scene.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef]);

  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.resize(width, height);
  }, [sceneReady, width, height]);

  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.setFilePath(filePath);
  }, [sceneReady, filePath]);

  // Live colormap (and invert) updates.
  // The caller (outer TraceCanvas) is responsible for passing already-normalized values.
  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.setColormap(colormap, invertColormap);
  }, [sceneReady, colormap, invertColormap]);

  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.setClipValue(clipValue);
  }, [sceneReady, clipValue]);

  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.setRenderMode(renderMode);
  }, [sceneReady, renderMode]);

  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.setWiggleConfig({
      lineColor,
      wiggleScale,
      positiveFillColor,
      negativeFillColor,
      backgroundColor,
    });
  }, [sceneReady, lineColor, wiggleScale, positiveFillColor, negativeFillColor, backgroundColor]);

  // AGC changes the sample data, so this runs before the viewport update below
  // (which re-requests tiles). setAmplitudeAgc invalidates + refetches on change.
  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.setAmplitudeAgc(agcEnabled ? { windowMs: agcWindowMs } : null);
  }, [sceneReady, agcEnabled, agcWindowMs]);

  useEffect(() => {
    if (!sceneReady) return;
    sceneRef.current?.update({
      viewportWidth: width,
      viewportHeight: height,
      totalTraces,
      totalSamples,
      zoomX,
      zoomY,
      panX: panOffset.x,
      panY: panOffset.y,
    });
  }, [
    sceneReady,
    width,
    height,
    totalTraces,
    totalSamples,
    zoomX,
    zoomY,
    panOffset.x,
    panOffset.y,
  ]);

  return {
    sceneRef,
    sceneError: status.kind === 'error' ? status.message : null,
  };
}

export const TraceCanvas = ({ width, height }: TraceCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    zoomX,
    zoomY,
    panOffset,
    colormap,
    invertColormap,
    amplitudeScaling,
    renderMode,
    wiggleConfig,
  } = useTraceVisualizationStore();

  const { segyData, filePath } = useAppStore();

  const totalTraces = segyData?.total_traces ?? 0;
  const totalSamples = (segyData?.binary_header?.samples_per_trace as number | undefined) ?? 0;

  const clipValue =
    amplitudeScaling.type === 'global-percentile' || amplitudeScaling.type === 'global-fixed'
      ? amplitudeScaling.clipValue
      : agcClip(amplitudeScaling.gainDb ?? -6);

  const agcEnabled = amplitudeScaling.type === 'agc';
  const agcWindowMs = agcEnabled ? (amplitudeScaling.windowSize ?? null) : null;

  // Legacy migration — normalize once, very early.
  // All effects below and the scene creation will use these clean values.
  const { colormap: effectiveColormap, invert: effectiveInvert } = normalizeColormap(
    colormap,
    invertColormap
  );

  const { sceneRef, sceneError } = useTraceScene({
    canvasRef,
    width,
    height,
    filePath,
    colormap: effectiveColormap,
    invertColormap: effectiveInvert,
    clipValue,
    renderMode,
    lineColor: wiggleConfig.lineColor,
    wiggleScale: wiggleConfig.wiggleScale,
    positiveFillColor: wiggleConfig.positiveFillColor,
    negativeFillColor: wiggleConfig.negativeFillColor,
    backgroundColor: wiggleConfig.backgroundColor,
    totalTraces,
    totalSamples,
    zoomX,
    zoomY,
    panOffset,
    agcEnabled,
    agcWindowMs,
  });

  const {
    isDragging,
    showCrosshair,
    cursor,
    lockedTraceIdx,
    sampleValue,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDoubleClick,
    onMouseLeave,
  } = useCanvasInteraction({
    canvasRef,
    sceneRef,
    width,
    height,
    totalTraces,
    totalSamples,
    filePath,
    disabled: Boolean(sceneError),
  });

  if (sceneError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-panel p-6 text-center">
        <div>
          <p className="text-[length:var(--text-sm,12px)] font-semibold text-text">
            Trace renderer unavailable
          </p>
          <p className="mt-2 max-w-md text-[length:var(--text-xs,10px)] text-text-muted">
            {sceneError}
          </p>
        </div>
      </div>
    );
  }

  const pixelsPerTrace = pxPerTrace(width, zoomX);
  const pixelsPerSample = pxPerSample(height, totalSamples, zoomY);
  const traceIdx = cursor ? pixelToIndex(cursor.x, panOffset.x, pixelsPerTrace, totalTraces) : null;
  const sampleIdx = cursor
    ? pixelToIndex(cursor.y, panOffset.y, pixelsPerSample, totalSamples)
    : null;
  const dtRaw = segyData?.binary_header?.['sample_interval_us'];
  const sampleIntervalUs = typeof dtRaw === 'number' && dtRaw > 0 ? dtRaw : 4000;
  const timeSec = sampleIdx !== null ? (sampleIdx * sampleIntervalUs) / 1_000_000 : null;

  return (
    <div className="relative h-full w-full" onMouseLeave={onMouseLeave}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', display: 'block' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
      />

      {showCrosshair && (lockedTraceIdx !== null || cursor) && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
        >
          {lockedTraceIdx !== null &&
            (() => {
              const centerX = Math.round(lockedTraceIdx * pixelsPerTrace + panOffset.x);
              const bandWidth = Math.max(1, Math.round(pixelsPerTrace));
              const bandLeft = centerX - Math.floor(bandWidth / 2);
              return (
                <>
                  <rect
                    x={bandLeft}
                    y={0}
                    width={bandWidth}
                    height={height}
                    fill="var(--accent)"
                    fillOpacity={0.1}
                  />
                  <line
                    x1={centerX}
                    y1={0}
                    x2={centerX}
                    y2={height}
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                  />
                </>
              );
            })()}
          {cursor && (
            <>
              <line
                x1={cursor.x}
                y1={0}
                x2={cursor.x}
                y2={height}
                stroke="var(--accent-2)"
                strokeWidth={1}
                strokeOpacity={0.45}
                strokeDasharray="4 3"
              />
              <line
                x1={0}
                y1={cursor.y}
                x2={width}
                y2={cursor.y}
                stroke="var(--accent-2)"
                strokeWidth={1}
                strokeOpacity={0.45}
                strokeDasharray="4 3"
              />
              <circle cx={cursor.x} cy={cursor.y} r={3} fill="var(--accent-2)" fillOpacity={0.7} />
            </>
          )}
        </svg>
      )}

      {showCrosshair && cursor && traceIdx !== null && sampleIdx !== null && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center gap-4 bg-[var(--panel-tint)] px-3 backdrop-blur-sm"
          style={{ height: 22 }}
        >
          <StatusItem label="TR">{(traceIdx + 1).toLocaleString()}</StatusItem>
          <StatusItem label="SMP">{(sampleIdx + 1).toLocaleString()}</StatusItem>
          {timeSec !== null && <StatusItem label="T">{timeSec.toFixed(3)}s</StatusItem>}
          {sampleValue !== null && (
            <StatusItem label="AMP">{formatAmplitude(sampleValue)}</StatusItem>
          )}
          <span className="ml-auto text-eyebrow">DBL-CLICK: trace header · C: toggle</span>
        </div>
      )}
    </div>
  );
};
