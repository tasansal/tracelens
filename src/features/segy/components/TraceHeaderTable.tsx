/**
 * Table view for the SEG-Y trace header with spec-driven fields.
 */
import { useCustomSpecStore } from '@/features/segy/store/customSpecStore';
import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import { getTraceHeaderData, type HeaderFieldData } from '@/shared/api/tauri/segy';
import { useDataFetch } from '@/shared/hooks/useDataFetch';
import { useCallback, useMemo } from 'react';
import { HeaderSpecTable } from './HeaderSpecTable';

interface TraceHeaderTableProps {
  /** Path to the SEG-Y file */
  filePath: string;
  /** Zero-based trace index */
  traceIndex: number;
  /** Revision key to trigger re-fetch on revision change */
  revisionKey?: number;
}

export const TraceHeaderTable = ({
  filePath,
  traceIndex,
  revisionKey = 0,
}: TraceHeaderTableProps) => {
  const customSpec = useCustomSpecStore(s => s.customSpec);
  const fetchData = useCallback(() => {
    if (!filePath) {
      throw new Error('filePath is required');
    }
    return getTraceHeaderData(filePath, traceIndex);
  }, [filePath, traceIndex]);

  const {
    data: fieldData,
    loading,
    error,
  } = useDataFetch(fetchData, [revisionKey, customSpec, traceIndex, filePath]);

  const customFields = useMemo<HeaderFieldData[]>(() => {
    if (!customSpec?.trace_header?.fields || !fieldData) return [];
    const fieldMap = new Map(fieldData.map((f: HeaderFieldData) => [f.byte_start, f]));
    return customSpec.trace_header.fields.map((specF: HeaderFieldSpec): HeaderFieldData => {
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

  return (
    <HeaderSpecTable
      fieldData={fieldData || []}
      customFields={customFields}
      showCustomIndicator={customFields.length > 0}
    />
  );
};
