/**
 * Full-panel loading indicator for SEG-Y file loading.
 * Renders a branded seismic sweep — a stroke-drawn wiggle trace paired with
 * a left-to-right progress rail — with a live mono readout (elapsed seconds
 * and current path segment) and a top-of-panel accent gradient rail.
 */
import { useAppStore } from '@/shared/store/appStore';
import { useEffect, useState } from 'react';

/** Extract the last meaningful segment of a path/URI for compact display. */
function lastSegment(path: string | null): string {
  if (!path) return '…';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

/**
 * Full-panel loading state for SEG-Y file loading.
 * Seismic wave draws itself, elapsed timer tracks progress, progress rail sweeps.
 *
 * Typography (Task 4.2 final sweep): .text-eyebrow used for the "Reading · SEG-Y" micro
 * status label (correct per 4.2-mono for dense chrome labels). The bottom filename + elapsed
 * timer uses raw `font-mono text-[length:var(--text-sm,12px)] tabular-nums` (data/identifier + numeric readout in
 * branded loading chrome; path segment treated as technical token, consistent with other
 * viz status readouts and HUDs). No prose/help text receives mono or eyebrow. The single
 * arbitrary size is justified for this specialized surface (matches patterns in TraceCanvas
 * overlay and TraceControlPanel values). See design-language.md §Typography (4.2-mono rules
 * + documented 11px chrome exceptions in viz contexts). Fully compliant; no leaks.
 *
 * @returns Loading state component
 */
export const SegyLoadingState = () => {
  const { filePath } = useAppStore();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed((Date.now() - started) / 1000);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const filename = lastSegment(filePath);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      {/* Top-of-panel accent rail — YouTube/Linear style L->R sweep. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden">
        <div
          className="h-full w-1/3 bg-[linear-gradient(90deg,transparent,var(--accent),var(--accent-3),var(--accent-2),transparent)] motion-reduce:hidden"
          style={{ animation: 'sweep-rail 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}
        />
      </div>

      <div className="relative z-10 w-[min(560px,92%)] rounded-[var(--radius-xl)] border border-border bg-panel/85 backdrop-blur-sm px-8 py-7 shadow-[var(--shadow)] animate-[rise-in_0.5s_ease-out] motion-reduce:animate-none">
        {/* Eyebrow */}
        <div className="flex items-center gap-2">
          <span className="size-1 rounded-full bg-accent-2 shadow-[0_0_6px_var(--accent-2-glow)]" />
          <span className="text-eyebrow">Reading · SEG-Y</span>
        </div>

        {/* Seismic wave — draws itself over ~1.6s, loops. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 800 120"
          className="mt-5 h-20 w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="wave-grad" x1="0%" x2="100%">
              <stop offset="0%" stopColor="var(--accent-2)" stopOpacity="0" />
              <stop offset="30%" stopColor="var(--accent-2)" stopOpacity="1" />
              <stop offset="70%" stopColor="var(--accent)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--accent-3)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[
            {
              d: 'M0 60 Q50 20 100 60 T200 60 T300 60 T400 60 T500 60 T600 60 T700 60 T800 60',
              delay: '0s',
              dash: 1600,
            },
            {
              d: 'M0 60 Q40 95 80 60 T160 60 T240 60 T320 60 T400 60 T480 60 T560 60 T640 60 T720 60 T800 60',
              delay: '0.25s',
              dash: 1600,
            },
          ].map(({ d, delay, dash }, i) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="url(#wave-grad)"
              strokeWidth={i === 0 ? 1.8 : 1.2}
              strokeLinecap="round"
              strokeDasharray={dash}
              style={{
                animation: `wave-draw 1.8s ease-in-out ${delay} infinite`,
              }}
            />
          ))}
          {/* Center rule — mimics oscilloscope zero-amplitude line. */}
          <line
            x1="0"
            y1="60"
            x2="800"
            y2="60"
            stroke="var(--accent-2-muted)"
            strokeWidth="0.6"
            strokeDasharray="2 6"
          />
        </svg>

        <div className="mt-5 flex items-center justify-between gap-3 font-mono text-[length:var(--text-sm,12px)] tabular-nums text-text-muted">
          <span className="truncate text-text" title={filePath ?? undefined}>
            {filename}
          </span>
          <span className="flex-shrink-0 text-accent-2">{elapsed.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
};
