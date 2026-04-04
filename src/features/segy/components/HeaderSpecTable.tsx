import type { HeaderFieldData } from '@/shared/api/tauri/segy';
import { SectionTitle } from '@/shared/ui/section-title';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/utils/cn';

/**
 * Props for the HeaderSpecTable component.
 */
interface HeaderSpecTableProps {
  /** Section title displayed at the top of the table */
  title: React.ReactNode;
  /** Header field data with values resolved from spec-driven parsing */
  fieldData: HeaderFieldData[];
}

/**
 * Displays a formatted table of SEG-Y header fields with their specifications.
 * Renders field name, byte range, type, and resolved value from spec-driven parsing.
 *
 * @param props - Component props
 * @returns Header specification table component
 */
export const HeaderSpecTable = ({ title, fieldData }: HeaderSpecTableProps) => {
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
            <TableHead className={cn(headerCellClass, 'text-right')}>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fieldData.map((field, idx) => {
            return (
              <TableRow
                key={idx}
                className="transition-colors duration-150 hover:bg-[var(--row-hover)] motion-reduce:transition-none"
              >
                <TableCell className={cn(bodyCellClass, 'font-semibold text-text')}>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help text-left">{field.name}</TooltipTrigger>
                    <TooltipContent side="right" className="max-w-64">
                      {field.description}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className={cn(bodyCellClass, 'font-mono text-text-dim')}>
                  {field.byte_start}-{field.byte_end}
                </TableCell>
                <TableCell className={cn(bodyCellClass, 'font-mono text-accent-2')}>
                  {field.data_type}
                </TableCell>
                <TableCell className={cn(bodyCellClass, 'text-right font-mono text-text')}>
                  {field.resolved ? (
                    <Tooltip>
                      <TooltipTrigger className="cursor-help">{field.resolved}</TooltipTrigger>
                      <TooltipContent side="top">
                        <span>Raw value: {field.value}</span>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    String(field.value)
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
