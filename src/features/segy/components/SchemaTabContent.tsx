/**
 * Schema tab content with revision selector and detection status.
 */
import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import {
  getBinaryHeaderSpec,
  getTraceHeaderSpec,
  type SegyRevision,
} from '@/shared/api/tauri/segy';
import { SectionTitle } from '@/shared/ui/section-title';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { cn } from '@/shared/utils/cn';
import { useEffect, useState } from 'react';

interface SchemaTabContentProps {
  /** Parsed SEG-Y data with detected revision */
  detectedRevision: SegyRevision | null;
  /** Currently active revision */
  currentRevision: SegyRevision | null;
  /** Callback to change the active revision */
  onRevisionChange: (revision: SegyRevision) => void;
}

const REVISION_OPTIONS: { value: SegyRevision; label: string }[] = [
  { value: 'Rev0', label: 'Rev 0' },
  { value: 'Rev1', label: 'Rev 1' },
];

/**
 * Renders the Schema tab with revision selector and detection status.
 *
 * @param props - Component props
 * @returns Schema tab content with revision controls
 */
export const SchemaTabContent = ({
  detectedRevision,
  currentRevision,
  onRevisionChange,
}: SchemaTabContentProps) => {
  const detectionFailed = detectedRevision === 'Unknown';
  const displayRevision = currentRevision || detectedRevision;

  const [binarySpec, setBinarySpec] = useState<HeaderFieldSpec[]>([]);
  const [traceSpec, setTraceSpec] = useState<HeaderFieldSpec[]>([]);
  const [loadedRevision, setLoadedRevision] = useState<SegyRevision | undefined>();

  const specLoading = loadedRevision !== displayRevision;

  useEffect(() => {
    const rev = displayRevision as SegyRevision | undefined;
    Promise.all([
      getBinaryHeaderSpec(rev).catch(() => []),
      getTraceHeaderSpec(rev).catch(() => []),
    ]).then(([binary, trace]) => {
      setBinarySpec(binary);
      setTraceSpec(trace);
      setLoadedRevision(rev);
    });
  }, [displayRevision]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-panel-strong px-4 py-3">
        <SectionTitle>Schema</SectionTitle>
      </div>
      <div className="scroll-area flex-1 overflow-auto p-4 scroll-smooth">
        <div className="space-y-4">
          {/* Detection Status */}
          <div className="rounded-md border border-border bg-panel p-3">
            <h3 className="mb-1 text-xs font-medium text-text-muted uppercase tracking-wide">
              Detection Status
            </h3>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  detectionFailed ? 'bg-destructive' : 'bg-accent-2'
                )}
              />
              <span className="text-sm text-text">
                {detectionFailed
                  ? `Detection failed — using ${displayRevision}`
                  : `Detected: ${detectedRevision}`}
              </span>
            </div>
          </div>

          {/* Revision Selector */}
          <div className="rounded-md border border-border bg-panel p-3">
            <h3 className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wide">
              Active Revision
            </h3>
            <Select
              value={displayRevision as string}
              onValueChange={value => onRevisionChange(value as SegyRevision)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select revision" />
              </SelectTrigger>
              <SelectContent>
                {REVISION_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {displayRevision && (
              <p className="mt-2 text-xs text-text-muted">Currently viewing: {displayRevision}</p>
            )}
          </div>

          {/* Schema Metadata */}
          <div className="rounded-md border border-border bg-panel p-3">
            <h3 className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wide">
              Schema Metadata
            </h3>
            {specLoading ? (
              <p className="text-xs text-text-muted">Loading spec...</p>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Binary header fields</span>
                  <span className="font-mono text-text">{binarySpec.length} fields</span>
                </div>
                {binarySpec.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Binary byte range</span>
                    <span className="font-mono text-text">
                      {binarySpec[0].byte_start}–{binarySpec[binarySpec.length - 1].byte_end}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-text-muted">Trace header fields</span>
                  <span className="font-mono text-text">{traceSpec.length} fields</span>
                </div>
                {traceSpec.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Trace byte range</span>
                    <span className="font-mono text-text">
                      {traceSpec[0].byte_start}–{traceSpec[traceSpec.length - 1].byte_end}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
