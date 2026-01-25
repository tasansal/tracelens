/**
 * Header panel for switching between textual, binary, and trace headers.
 */
import type { SegyData, TraceHeader } from '@/features/segy/types/segy';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import React from 'react';
import type { HeaderView } from '../hooks/useTraceHeader';
import { BinaryHeaderTable } from './BinaryHeaderTable';
import { TraceHeaderTable } from './TraceHeaderTable';

/**
 * Props for SegyHeaderPanel.
 */
interface SegyHeaderPanelProps {
  segyData: SegyData;
  headerView: HeaderView;
  onHeaderViewChange: (view: HeaderView) => void;
  sliderValue: number;
  onSliderChange: (value: number) => void;
  currentTrace: TraceHeader | null;
  loadingTrace: boolean;
}

/**
 * Available header tabs displayed in the panel.
 */
const headerViews: HeaderView[] = ['textual', 'binary', 'trace'];

/**
 * Renders the selected header view with trace slider support.
 */
export const SegyHeaderPanel: React.FC<SegyHeaderPanelProps> = ({
  segyData,
  headerView,
  onHeaderViewChange,
  sliderValue,
  onSliderChange,
  currentTrace,
  loadingTrace,
}) => {
  const revisionValue = (segyData.binary_header as Record<string, unknown>)?.segy_revision;
  const revision =
    typeof revisionValue === 'number' ? revisionValue : Number(revisionValue ?? 0);

  return (
    <div className="flex h-full flex-col bg-panel">
      <section className="panel-header px-4 py-3">
        <div className="tab-strip">
          {headerViews.map(view => (
            <button
              key={view}
              onClick={() => onHeaderViewChange(view)}
              className={`tab-btn ${headerView === view ? 'is-active' : ''}`}
            >
              {view}
            </button>
          ))}
        </div>

        {headerView === 'trace' && segyData.total_traces && (
          <div className="mt-3 flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={segyData.total_traces}
              value={sliderValue}
              onChange={e => onSliderChange(parseInt(e.target.value, 10))}
              className="range-slider flex-1"
            />
            <span className="min-w-[110px] whitespace-nowrap font-mono text-xs text-muted">
              {sliderValue} / {segyData.total_traces}
            </span>
            <div className="flex h-5 w-5 items-center justify-center text-accent">
              {loadingTrace && (
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="flex-1 overflow-hidden">
        {headerView === 'textual' && (
          <div className="flex h-full flex-col">
            <div className="panel-header px-4 py-3">
              <h2 className="section-title">Textual File Header</h2>
            </div>
            <div className="scroll-area flex-1 overflow-auto p-4 scroll-smooth">
              <pre className="font-mono text-xs leading-relaxed text-strong">
                {segyData.textual_header.lines.join('\n')}
              </pre>
            </div>
          </div>
        )}

        {headerView === 'binary' && (
          <BinaryHeaderTable header={segyData.binary_header} revision={revision} />
        )}

        {headerView === 'trace' &&
          (currentTrace ? (
            <div
              className={`h-full ${loadingTrace ? 'opacity-60' : ''} transition-opacity duration-150`}
            >
              <TraceHeaderTable
                header={currentTrace}
                traceId={sliderValue}
                revision={revision}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted">
              {loadingTrace ? (
                <LoadingSpinner />
              ) : (
                <p className="text-sm">Select a trace to view its header</p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};
