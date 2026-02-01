/**
 * Table view for the SEG-Y trace header with spec-driven fields.
 */
import type { TraceHeader } from '@/features/segy/types/segy';
import { getTraceHeaderSpec } from '@/shared/api/tauri/segy';
import React from 'react';
import { HeaderSpecTable } from './HeaderSpecTable';

/**
 * Props for TraceHeaderTable.
 */
interface TraceHeaderTableProps {
  header: TraceHeader;
  traceId: number;
}

/**
 * Render a trace header table for the selected trace index.
 */
export const TraceHeaderTable: React.FC<TraceHeaderTableProps> = ({ header, traceId }) => {
  return (
    <HeaderSpecTable
      title={`Trace #${traceId} Header`}
      header={header as Record<string, unknown>}
      loadSpec={getTraceHeaderSpec}
    />
  );
};
