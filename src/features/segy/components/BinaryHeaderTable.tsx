/**
 * Table view for the SEG-Y binary file header with spec-driven fields.
 * Includes a 3-up hero gauge row (samples/trace, dt, data format)
 * lifted above the full field table for fast at-a-glance inspection.
 *
 * Typography (Task 4.2 final sweep): Delegates to HeaderSpecTable (already 4.2-audited
 * with .text-eyebrow headers, font-mono data cells, density --text-sm base table, justified
 * --text-2xs ✦ indicator). The local hero gauge uses .text-eyebrow + `font-mono
 * text-[length:var(--text-sm,12px)] ...` for values (density-aware). Unit "μs" uses
 * nested text-[length:var(--text-xs,10px)] (micro). Loading/error use
 * text-[length:var(--text-xs,10px)]. Fully compliant; see HeaderSpecTable JSDoc.
 */
import { useCustomSpecStore } from '@/features/segy/store/customSpecStore';
import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import { getBinaryHeaderData, type HeaderFieldData } from '@/shared/api/tauri/segy';
import { useDataFetch } from '@/shared/hooks/useDataFetch';
import { useCallback, useMemo } from 'react';
import { HeaderSpecTable } from './HeaderSpecTable';

interface BinaryHeaderTableProps {
  /** Path to the SEG-Y file */
  filePath: string;
  /** Revision key to trigger re-fetch on revision change */
  revisionKey?: number;
}

/** Binary header local byte positions (1-based, relative to binary header block start). */
const BYTE_SAMPLE_INTERVAL = 17; // dt (μs) — bytes 17–18
const BYTE_SAMPLES_PER_TRACE = 21; // samples per trace — bytes 21–22
const BYTE_DATA_FORMAT = 25; // data sample format code — bytes 25–26

/**
 * Resolve a field value by byte_start from parsed field data.
 * Returns the resolved string if available, or the raw numeric value as a string.
 */
function resolveField(fields: HeaderFieldData[], byteStart: number): string {
  const f = fields.find(x => x.byte_start === byteStart);
  if (!f) return '—';
  return f.resolved ?? String(f.value);
}

export const BinaryHeaderTable = ({ filePath, revisionKey = 0 }: BinaryHeaderTableProps) => {
  const customSpec = useCustomSpecStore(s => s.customSpec);
  const fetchData = useCallback(() => getBinaryHeaderData(filePath), [filePath]);
  const {
    data: fieldData,
    loading,
    error,
  } = useDataFetch(fetchData, [revisionKey, customSpec, filePath]);

  const customFields = useMemo<HeaderFieldData[]>(() => {
    if (!customSpec?.binary_header?.fields || !fieldData) return [];
    const fieldMap = new Map(fieldData.map((f: HeaderFieldData) => [f.byte_start, f]));
    return customSpec.binary_header.fields.map((specF: HeaderFieldSpec): HeaderFieldData => {
      const parsed = fieldMap.get(specF.byte_start);
      return {
        name: specF.name,
        description: specF.description,
        value: parsed?.value ?? 0,
        resolved: parsed?.resolved,
        byte_start: specF.byte_start,
        byte_end: specF.byte_end,
        data_type: specF.data_type,
      };
    });
  }, [customSpec, fieldData]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-panel">
        <div className="text-[length:var(--text-xs,10px)] text-text-muted">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-panel">
        <div className="text-[length:var(--text-xs,10px)] text-red-500">Error: {error}</div>
      </div>
    );
  }

  const fields = fieldData || [];
  const dt = resolveField(fields, BYTE_SAMPLE_INTERVAL);
  const samplesPerTrace = resolveField(fields, BYTE_SAMPLES_PER_TRACE);
  const dataFormat = resolveField(fields, BYTE_DATA_FORMAT);

  const heroRow =
    fields.length > 0 ? (
      <div
        className="flex items-center gap-3 border-b border-border bg-panel px-3 py-1"
        role="region"
        aria-label="Key binary header values"
      >
        <span className="text-eyebrow">Samples/Trace</span>
        <span className="font-mono text-[length:var(--text-sm,12px)] font-semibold tabular-nums text-accent-2">
          {samplesPerTrace}
        </span>
        <span className="text-border">·</span>
        <span className="text-eyebrow">dt</span>
        <span className="font-mono text-[length:var(--text-sm,12px)] font-semibold tabular-nums text-accent-2">
          {dt} <span className="text-[length:var(--text-xs,10px)] font-normal text-text-dim">μs</span>
        </span>
        <span className="text-border">·</span>
        <span className="text-eyebrow">Format</span>
        <span className="font-mono text-[length:var(--text-sm,12px)] font-semibold tabular-nums text-accent-2">
          {dataFormat}
        </span>
      </div>
    ) : null;

  return (
    <HeaderSpecTable
      fieldData={fields}
      customFields={customFields}
      showCustomIndicator={customFields.length > 0}
      heroSlot={heroRow}
      byteFileOffset={3200}
    />
  );
};
