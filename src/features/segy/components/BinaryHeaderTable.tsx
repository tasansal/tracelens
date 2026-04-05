/**
 * Table view for the SEG-Y binary file header with spec-driven fields.
 */
import { getBinaryHeaderData, type HeaderFieldData } from '@/shared/api/tauri/segy';
import { useEffect, useState } from 'react';
import { HeaderSpecTable } from './HeaderSpecTable';

interface BinaryHeaderTableProps {
  /** Path to the SEG-Y file */
  filePath: string;
  /** Revision key to trigger re-fetch on revision change */
  revisionKey?: number;
}

export const BinaryHeaderTable = ({ filePath, revisionKey = 0 }: BinaryHeaderTableProps) => {
  const [fieldData, setFieldData] = useState<HeaderFieldData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getBinaryHeaderData(filePath)
      .then(data => {
        if (isMounted) {
          setFieldData(data);
        }
      })
      .catch(err => {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('Failed to load binary header data:', msg);
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
  }, [filePath, revisionKey]);

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

  return <HeaderSpecTable title="Binary File Header" fieldData={fieldData} />;
};
