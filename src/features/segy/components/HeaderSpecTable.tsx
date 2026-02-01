import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import { SectionTitle } from '@/shared/ui/section-title';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { formatValue, getRawCode } from '@/shared/utils/formatters';
import React from 'react';

interface HeaderSpecTableProps {
  title: React.ReactNode;
  header: Record<string, unknown>;
  loadSpec: () => Promise<HeaderFieldSpec[]>;
}

export const HeaderSpecTable: React.FC<HeaderSpecTableProps> = ({ title, header, loadSpec }) => {
  const [fieldSpecs, setFieldSpecs] = React.useState<HeaderFieldSpec[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    loadSpec()
      .then(specs => {
        if (isMounted) {
          setFieldSpecs(specs);
        }
      })
      .catch(console.error)
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
          {fieldSpecs.map((field, idx) => {
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
