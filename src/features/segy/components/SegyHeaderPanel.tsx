/**
 * Header panel for switching between text, binary, trace, and schema headers.
 *
 * Typography (Task 4.2 final sweep): Trace number chrome (in 'trace' view) uses
 * `font-mono text-[length:var(--text-xs,10px)] tabular-nums` (density-aware) for the
 * live min-w value display (data in dense header chrome). The numeric <input> now
 * also uses the density var for its text. The textual_header <pre> uses density-aware
 * `font-mono text-[length:var(--text-xs,10px)]` (correct: raw SEG-Y technical data).
 * Other views delegate to tables (audited). 2px radius on input is documented micro
 * exception. No raw px leaks; tabs from shared. All mono on data per 4.2-mono. Clean.
 */
import type { SegyData } from '@/features/segy/types/segy';
import { pxPerTrace } from '@/features/trace-visualization/renderer/constants';
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import type { SegyRevision } from '@/shared/api/tauri/segy';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useAppStore } from '@/shared/store/appStore';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import {
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { HeaderView } from '../hooks/useTraceHeader';
import { BinaryHeaderTable } from './BinaryHeaderTable';
import { SchemaTabContent } from './SchemaTabContent';
import { TraceHeaderTable } from './TraceHeaderTable';

/**
 * Props for SegyHeaderPanel component.
 */
interface SegyHeaderPanelProps {
  /** Path to the loaded SEG-Y file */
  filePath: string;
  /** Parsed SEG-Y file data including headers */
  segyData: SegyData;
  /** Currently selected header view tab */
  headerView: HeaderView;
  /** Callback fired when header view changes */
  onHeaderViewChange: (view: HeaderView) => void;
  /** Current trace index for the slider display (1-based, live) */
  sliderValue: number;
  /** Debounced trace index used for data fetching (1-based) */
  traceId: number;
  /** Callback fired when trace slider value changes */
  onSliderChange: (value: number) => void;
  /** Current active revision */
  currentRevision: SegyRevision | null;
  /** Callback to change the active revision */
  setActiveRevision: (revision: SegyRevision) => void;
  /** Key to trigger table re-fetch on revision change */
  revisionKey: number;
}

const headerViews: HeaderView[] = ['text', 'binary', 'trace', 'schema'];

/**
 * Renders the selected header view with trace slider support.
 * Provides a tabbed interface to view text, binary, and trace headers.
 *
 * Typography note: see file-level JSDoc (Task 4.2 final sweep) for details on
 * header chrome mono usage and the documented 2px radius exception on the trace
 * number input (ultra-compact viz affordance).
 *
 * @param props - Component props
 * @returns Header panel component with tabs and content
 */
export const SegyHeaderPanel = ({
  filePath,
  segyData,
  headerView,
  onHeaderViewChange,
  sliderValue,
  traceId,
  onSliderChange,
  currentRevision,
  setActiveRevision,
  revisionKey,
}: SegyHeaderPanelProps) => {
  const totalTraces = segyData.total_traces ?? 0;
  const centerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const centerViewportOnTrace = useCallback((traceNumber: number, total: number) => {
    if (!total || traceNumber < 1 || traceNumber > total) return;
    const traceIdx = traceNumber - 1; // 0-based for pan math and lock
    const store = useTraceVisualizationStore.getState();
    const { zoomX, viewport, panOffset } = store;
    const width = viewport.width > 0 ? viewport.width : 800; // sensible fallback before first layout
    const px = pxPerTrace(width, zoomX);
    if (px <= 0) return;
    // Position trace's "origin" at viewport center (matches Home/End key and locked trace math)
    const desiredPanX = width / 2 - traceIdx * px;
    store.setPanOffset({ x: desiredPanX, y: panOffset.y });
    // Also drive the locked/highlighted trace in the canvas (so the vertical band follows)
    useAppStore.getState().setTraceLock(traceIdx);
  }, []);

  const handleTraceNumberChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const parsed = parseInt(e.target.value, 10);
      if (isNaN(parsed)) return;
      const clamped = Math.max(1, Math.min(totalTraces, parsed));
      onSliderChange(clamped);

      // Debounce centering: rapid typing (e.g. 1-2-3-4) only centers on final value after pause.
      // This keeps slider scrubbing from jittering the view while still allowing direct type-to-jump.
      if (centerTimeoutRef.current) {
        clearTimeout(centerTimeoutRef.current);
      }
      centerTimeoutRef.current = setTimeout(() => {
        centerViewportOnTrace(clamped, totalTraces);
        centerTimeoutRef.current = null;
      }, 350);
    },
    [onSliderChange, totalTraces, centerViewportOnTrace]
  );

  const handleTraceNumberKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        if (centerTimeoutRef.current) {
          clearTimeout(centerTimeoutRef.current);
          centerTimeoutRef.current = null;
        }
        centerViewportOnTrace(sliderValue, totalTraces);
        (e.currentTarget as HTMLInputElement).blur();
      }
      if (e.key === 'Escape') {
        (e.currentTarget as HTMLInputElement).blur();
      }
    },
    [centerViewportOnTrace, sliderValue, totalTraces]
  );

  // Allow mouse wheel to nudge the trace number ±1 (great for fine adjustment
  // once native spinners are hidden for space reasons).
  const handleTraceNumberWheel = useCallback(
    (e: React.WheelEvent<HTMLInputElement>) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      const next = Math.max(1, Math.min(totalTraces, sliderValue + delta));
      onSliderChange(next);

      // Reuse the same debounce as typing so centering + header load happen after the user stops wheeling
      if (centerTimeoutRef.current) {
        clearTimeout(centerTimeoutRef.current);
      }
      centerTimeoutRef.current = setTimeout(() => {
        centerViewportOnTrace(next, totalTraces);
        centerTimeoutRef.current = null;
      }, 350);
    },
    [onSliderChange, sliderValue, totalTraces, centerViewportOnTrace]
  );

  // Cleanup any pending center timer
  useEffect(() => {
    return () => {
      if (centerTimeoutRef.current) {
        clearTimeout(centerTimeoutRef.current);
      }
    };
  }, []);

  return (
    <ErrorBoundary
      title="Header panel unavailable"
      message="An error occurred while loading the header data"
    >
      <div className="flex h-full flex-col bg-panel">
        <section className="border-b border-border bg-panel-strong px-3 py-1">
          {/* Centered tab list */}
          <Tabs value={headerView} onValueChange={value => onHeaderViewChange(value as HeaderView)}>
            <TabsList className="mx-auto">
              {headerViews.map(view => (
                <TabsTrigger key={view} value={view}>
                  {view}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Trace slider row (full width, below centered tabs) */}
          {headerView === 'trace' && segyData.total_traces && (
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={segyData.total_traces}
                value={sliderValue}
                onChange={e => onSliderChange(parseInt(e.target.value, 10))}
                className="range-slider flex-1 w-full accent-accent"
              />
              <div className="flex items-center gap-1 font-mono text-[length:var(--text-xs,10px)] tabular-nums text-text-muted min-w-[120px] whitespace-nowrap">
                <input
                  type="number"
                  min={1}
                  max={totalTraces}
                  step={1}
                  value={sliderValue}
                  onChange={handleTraceNumberChange}
                  onKeyDown={handleTraceNumberKeyDown}
                  onWheel={handleTraceNumberWheel}
                  onFocus={e => e.target.select()}
                  aria-label="Trace number for header view — type or scroll to jump and center viewport"
                  className="no-spinner box-content min-w-[3ch] bg-transparent border border-border/30 hover:border-border/60 focus:border-accent focus:bg-panel-strong/60 rounded-[2px] px-1 py-px pl-1 pr-2 text-right text-[length:var(--text-xs,10px)] outline-none text-text transition-colors duration-150 tabular-nums"
                  style={{ width: `${Math.max(6, String(totalTraces).length + 1.75)}ch` }}
                />
                <span className="text-text-muted/70 select-none">/ {totalTraces}</span>
              </div>
            </div>
          )}
        </section>

        <div className="flex-1 overflow-hidden">
          {headerView === 'text' && (
            <div className="scroll-area flex-1 overflow-auto p-4 scroll-smooth">
              <pre className="font-mono text-[length:var(--text-xs,10px)] leading-relaxed text-text">
                {segyData.textual_header.lines.join('\n')}
              </pre>
            </div>
          )}

          {headerView === 'binary' && (
            <BinaryHeaderTable filePath={filePath} revisionKey={revisionKey} />
          )}

          {headerView === 'schema' && (
            <SchemaTabContent
              filePath={filePath}
              detectedRevision={segyData.detected_revision as SegyRevision}
              currentRevision={currentRevision}
              onRevisionChange={setActiveRevision}
            />
          )}

          {headerView === 'trace' && (
            <TraceHeaderTable
              filePath={filePath}
              traceIndex={traceId - 1}
              revisionKey={revisionKey}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};
