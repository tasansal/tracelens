/**
 * Table view for the SEG-Y trace header with spec-driven fields.
 */
import { useCustomSpecStore } from '@/features/segy/store/customSpecStore';
import { getTraceHeaderData } from '@/shared/api/tauri/segy';
import { useDataFetch } from '@/shared/hooks/useDataFetch';
import { useCallback, useMemo } from 'react';
import { HeaderSpecTable } from './HeaderSpecTable';
import { mergeCustomFields } from './mergeCustomFields';

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

  const customFields = useMemo(
    () => mergeCustomFields(customSpec?.trace_header?.fields, fieldData),
    [customSpec, fieldData]
  );

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
