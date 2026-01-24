/**
 * Table view for the SEG-Y trace header with spec-driven fields.
 */
import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import type { TraceHeader } from '@/features/segy/types/segy';
import { getTraceHeaderSpec } from '@/services/tauri/segy';
import { formatValue, getRawCode } from '@/shared/utils/formatters';
import React from 'react';

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
  const [fieldSpecs, setFieldSpecs] = React.useState<HeaderFieldSpec[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Pull the header field definitions from the backend spec.
    getTraceHeaderSpec()
      .then(setFieldSpecs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-panel">
        <div className="text-xs text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="panel-header px-4 py-3">
        <h2 className="section-title">Trace #{traceId} Header</h2>
      </div>

      <div className="scroll-area flex-1 overflow-x-auto overflow-y-auto scroll-smooth">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              <th>Field</th>
              <th>Bytes</th>
              <th>Type</th>
              <th className="text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {fieldSpecs.map((field, idx) => {
              const value = (header as Record<string, unknown>)[field.field_key];
              const rawCode = getRawCode(value);

              return (
                <tr key={idx} title={field.description}>
                  <td className="cell-field">{field.name}</td>
                  <td className="cell-bytes">
                    {field.byte_start}-{field.byte_end}
                  </td>
                  <td className="cell-type">{field.data_type}</td>
                  <td
                    className={`cell-value ${rawCode ? 'cursor-help' : ''}`}
                    title={rawCode ? `Raw code: ${rawCode}` : undefined}
                  >
                    {formatValue(value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
