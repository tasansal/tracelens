import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import { SectionTitle } from '@/shared/ui/section-title';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { formatValue, getRawCode } from '@/shared/utils/formatters';
import { useEffect, useState } from 'react';

/**
 * Props for the HeaderSpecTable component.
 */
interface HeaderSpecTableProps {
  /** Section title displayed at the top of the table */
  title: React.ReactNode;
  /** Header data object with field values */
  header: Record<string, unknown>;
  /** Function to load field specifications from backend */
  loadSpec: () => Promise<HeaderFieldSpec[]>;
}

/**
 * Displays a formatted table of SEG-Y header fields with their specifications.
 * Loads field specs asynchronously and renders field name, byte range, type, and value.
 *
 * @param props - Component props
 * @returns Header specification table component
 */
export const HeaderSpecTable = ({ title, header, loadSpec }: HeaderSpecTableProps) => {
  const [fieldSpecs, setFieldSpecs] = useState<HeaderFieldSpec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    loadSpec()
      .then((specs: HeaderFieldSpec[]) => {
        if (isMounted) {
          setFieldSpecs(specs);
        }
      })
      .catch((error: unknown) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Failed to load header field specifications:', errorMsg, error);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadSpec]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-panel">
        <div className="text-xs text-text-muted">Loading...</div>
      </div>
    );
  }

  const headerCellClass =
    'sticky top-0 border-b border-border bg-panel-strong px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.18em] text-text-muted';
  const bodyCellClass = 'border-b border-border px-3 py-2.5';

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="border-b border-border bg-panel-strong px-4 py-3">
        <SectionTitle>{title}</SectionTitle>
      </div>

      <Table
        containerClassName="scroll-area flex-1 overflow-auto scroll-smooth"
        className="min-w-full border-collapse text-[12px]"
      >
        <TableHeader>
          <TableRow>
            <TableHead className={headerCellClass}>Field</TableHead>
            <TableHead className={headerCellClass}>Bytes</TableHead>
            <TableHead className={headerCellClass}>Type</TableHead>
            <TableHead className={`${headerCellClass} text-right`}>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fieldSpecs.map((field: HeaderFieldSpec, idx: number) => {
            const value = header[field.field_key];
            const rawCode = getRawCode(value);

            return (
              <TableRow
                key={idx}
                title={field.description}
                className="transition-colors duration-150 hover:bg-[var(--row-hover)] motion-reduce:transition-none"
              >
                <TableCell className={`${bodyCellClass} font-semibold text-text`}>
                  {field.name}
                </TableCell>
                <TableCell className={`${bodyCellClass} font-mono text-text-dim`}>
                  {field.byte_start}-{field.byte_end}
                </TableCell>
                <TableCell className={`${bodyCellClass} font-mono text-accent-2`}>
                  {field.data_type}
                </TableCell>
                <TableCell
                  className={`${bodyCellClass} text-right font-mono text-text ${rawCode ? 'cursor-help' : ''}`}
                  title={rawCode ? `Raw code: ${rawCode}` : undefined}
                >
                  {formatValue(value)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
