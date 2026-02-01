/**
 * Table view for the SEG-Y trace header with spec-driven fields.
 */
import type { TraceHeader } from '@/features/segy/types/segy';
import { getTraceHeaderSpec } from '@/shared/api/tauri/segy';
import { HeaderSpecTable } from './HeaderSpecTable';

/**
 * Props for TraceHeaderTable component.
 */
interface TraceHeaderTableProps {
  /** Trace header data to display */
  header: TraceHeader;
  /** One-based trace index number for display */
  traceId: number;
}

/**
 * Renders a trace header table for the selected trace index.
 * Displays structured field information from the trace header specification.
 *
 * @param props - Component props
 * @returns Trace header table component
 */
export const TraceHeaderTable = ({ header, traceId }: TraceHeaderTableProps) => {
  return (
    <HeaderSpecTable
      title={`Trace #${traceId} Header`}
      header={header as Record<string, unknown>}
      loadSpec={getTraceHeaderSpec}
    />
  );
};
