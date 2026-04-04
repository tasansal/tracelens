/**
 * Table view for the SEG-Y trace header with spec-driven fields.
 */
import { getTraceHeaderData, type HeaderFieldData } from '@/shared/api/tauri/segy';
import { useEffect, useState } from 'react';
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
  const [fieldData, setFieldData] = useState<HeaderFieldData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getTraceHeaderData(filePath, traceIndex)
      .then(data => {
        if (isMounted) {
          setFieldData(data);
        }
      })
      .catch(err => {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('Failed to load trace header data:', msg);
          setError(msg);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [filePath, traceIndex, revisionKey]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-panel">
        <div className="text-xs text-text-muted">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-panel">
        <div className="text-xs text-red-500">Error: {error}</div>
      </div>
    );
  }

  return <HeaderSpecTable title={`Trace #${traceIndex + 1} Header`} fieldData={fieldData} />;
};
