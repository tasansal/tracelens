import { listScalarTypes, type HeaderFieldData } from '@/shared/api/tauri/segy';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/utils/cn';
import { useEffect, useState } from 'react';

/**
 * Props for the HeaderSpecTable component.
 */
interface HeaderSpecTableProps {
  /** Header field data with values resolved from spec-driven parsing */
  fieldData: HeaderFieldData[];
  /** Optional custom fields to merge with standard fields */
  customFields?: HeaderFieldData[];
  /** Whether fields should be visually distinguished as custom */
  showCustomIndicator?: boolean;
  /** Optional node rendered above the table (e.g. hero readouts) */
  heroSlot?: React.ReactNode;
  /**
   * When set, hovering the Bytes column shows the absolute file byte location
   * (local byte + this offset). Pass 3200 for the binary header.
   */
  byteFileOffset?: number;
}

/**
 * Merges custom fields with standard fields, sorting by byte position.
 * Custom fields override standard fields at the same byte position.
 */
function mergeFields(standard: HeaderFieldData[], custom: HeaderFieldData[]): HeaderFieldData[] {
  if (!custom.length) return standard;

  // Build a map of custom fields by byte_start for quick lookup
  const customMap = new Map<number, HeaderFieldData>();
  custom.forEach(f => customMap.set(f.byte_start, f));

  // Start with standard fields, filtering out those replaced by custom
  const merged = standard.filter(f => !customMap.has(f.byte_start));

  // Add custom fields (they override standard at same position)
  merged.push(...custom);

  // Sort by byte position
  merged.sort((a, b) => a.byte_start - b.byte_start);

  return merged;
}

/**
 * Displays a formatted table of SEG-Y header fields with their specifications.
 * Renders field name, byte range, type, and resolved value from spec-driven parsing.
 *
 * Typography (Task 4.2): Column headers use .text-eyebrow (canonical for table heads).
 * Bytes / type / value cells use font-mono (correct for technical identifiers + data values;
 * values in related readouts also carry tabular-nums). Base table size `text-[length:var(--text-sm,12px)]` is
 * structural for dense data presentation (matches patterns in SchemaFieldList post-4.2).
 * The custom ✦ micro-indicator uses text-[length:var(--text-2xs,9px)] (justified micro
 * chrome inside data rows). No prose receives mono/eyebrow. Tooltip plain (proportional).
 * Fully compliant with 4.2-mono + density scaling. See design-language.md.
 *
 * @param props - Component props
 * @returns Header specification table component
 */
export const HeaderSpecTable = ({
  fieldData,
  customFields,
  showCustomIndicator = false,
  heroSlot,
  byteFileOffset,
}: HeaderSpecTableProps) => {
  const mergedData = mergeFields(fieldData, customFields || []);

  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    listScalarTypes()
      .then(types => setTypeLabels(Object.fromEntries(types.map(t => [t.key, t.label]))))
      .catch(console.error);
  }, []);

  const headerCellClass =
    'text-eyebrow sticky top-0 border-b border-border bg-panel-strong px-3 py-1.5 text-left';
  const bodyCellClass = 'border-b border-border px-3 py-1.5';

  return (
    <div className="flex h-full flex-col bg-panel">
      {heroSlot}

      <Table
        containerClassName="scroll-area flex-1 overflow-auto scroll-smooth"
        className="min-w-full border-collapse text-[length:var(--text-sm,12px)]"
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
          {mergedData.map(field => {
            // Determine if this field is custom by checking if it exists in customFields
            const isCustom =
              showCustomIndicator && customFields?.some(f => f.byte_start === field.byte_start);

            return (
              <TableRow
                key={field.byte_start}
                className="transition-colors duration-150 hover:bg-[var(--row-hover)] motion-reduce:transition-none"
              >
                <TableCell className={cn(bodyCellClass, 'font-semibold text-text')}>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help text-left">
                      <span className={cn(isCustom && 'italic text-accent')}>
                        {field.name}
                        {isCustom && (
                          <span className="ml-1 text-[length:var(--text-2xs,9px)]">✦</span>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-64">
                      {field.description}
                      {isCustom && <span className="ml-2 text-accent">(Custom)</span>}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className={cn(bodyCellClass, 'font-mono text-text-dim')}>
                  {byteFileOffset !== undefined ? (
                    <Tooltip>
                      <TooltipTrigger className="cursor-help">
                        {field.byte_start}–{field.byte_end}
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        file bytes {field.byte_start + byteFileOffset}–
                        {field.byte_end + byteFileOffset}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <>
                      {field.byte_start}–{field.byte_end}
                    </>
                  )}
                </TableCell>
                <TableCell className={cn(bodyCellClass, 'font-mono text-accent-2')}>
                  {typeLabels[field.data_type] ? (
                    <Tooltip>
                      <TooltipTrigger className="cursor-help">{field.data_type}</TooltipTrigger>
                      <TooltipContent side="right">{typeLabels[field.data_type]}</TooltipContent>
                    </Tooltip>
                  ) : (
                    field.data_type
                  )}
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
