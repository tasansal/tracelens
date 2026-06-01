/**
 * Field list for one header type (binary or trace) in the schema tab.
 * Shows custom fields by default with an optional toggle to reveal
 * the full standard spec as a read-only reference.
 *
 * Typography notes (4.2 + density): headers/micro .text-eyebrow. Data cells font-mono +
 * density --text-sm (justified for lists). Desc uses text-[length:var(--text-xs,10px)]
 * text-text-dim (density-aware). Count badge --text-xs. No px leaks.
 */
import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils/cn';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface SchemaFieldListProps {
  /** Custom fields defined by the user for this header type. */
  customFields: HeaderFieldSpec[];
  /** Standard spec fields loaded from the active revision (read-only reference). */
  standardFields: HeaderFieldSpec[];
  /** True while standard fields are still loading from the backend. */
  standardFieldsLoading: boolean;
  /** Called when the user clicks Edit on a custom field row. */
  onEdit: (field: HeaderFieldSpec) => void;
  /** Called when the user clicks Delete on a custom field row. */
  onDelete: (fieldKey: string) => void;
}

/**
 * Single row in the field table.
 */
function FieldRow({
  field,
  isCustom,
  onEdit,
  onDelete,
}: {
  field: HeaderFieldSpec;
  isCustom: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <tr
      className={cn('group border-b border-border last:border-0', isCustom && 'bg-panel-muted/20')}
    >
      <td
        className={cn(
          'py-1.5 pl-3 pr-2 text-[length:var(--text-sm,12px)] font-semibold',
          isCustom ? 'italic text-accent' : 'text-text'
        )}
      >
        {field.name}
      </td>
      <td className="px-2 py-1.5 font-mono text-[length:var(--text-sm,12px)] text-text-dim">
        {field.byte_start}–{field.byte_end}
      </td>
      <td className="px-2 py-1.5 font-mono text-[length:var(--text-sm,12px)] text-accent-2">
        {field.data_type}
      </td>
      <td className="px-2 py-1.5 text-[length:var(--text-xs,10px)] text-text-dim">
        {field.description || '—'}
      </td>
      <td className="py-1.5 pl-2 pr-3">
        {isCustom && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              className="size-6 p-0"
              onClick={onEdit}
              aria-label={`Edit ${field.name}`}
            >
              <Pencil size={11} />
            </Button>
            <Button
              variant="ghost"
              className="size-6 p-0 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label={`Delete ${field.name}`}
            >
              <Trash2 size={11} />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * Renders the field list for one header section (binary or trace).
 * Custom fields appear at the top; standard fields are hidden by default
 * behind a toggle.
 *
 * @param props - Component props
 * @returns Scrollable field list with controls row
 */
export const SchemaFieldList = ({
  customFields,
  standardFields,
  standardFieldsLoading,
  onEdit,
  onDelete,
}: SchemaFieldListProps) => {
  const [showStandard, setShowStandard] = useState(false);

  const hasCustom = customFields.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Controls row */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setShowStandard(v => !v)}
          className="flex items-center gap-1.5 text-eyebrow transition-colors hover:text-text"
        >
          <span
            className={cn(
              'inline-flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-sm)] border transition-colors',
              showStandard
                ? 'border-accent-2 bg-accent-2/20 text-accent-2'
                : 'border-border bg-panel-muted'
            )}
            aria-hidden="true"
          >
            {showStandard && (
              <svg viewBox="0 0 8 8" className="size-2 fill-none stroke-current" strokeWidth="1.2">
                <path d="M1 4l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          Show standard fields
        </button>
        <span className="font-mono text-[length:var(--text-xs,10px)] text-text-muted">
          {customFields.length} custom
        </span>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="sticky top-0 border-b border-border bg-panel-strong">
              <th className="py-1.5 pl-3 pr-2 text-eyebrow">Name</th>
              <th className="px-2 py-1.5 text-eyebrow">Bytes</th>
              <th className="px-2 py-1.5 text-eyebrow">Type</th>
              <th className="px-2 py-1.5 text-eyebrow">Description</th>
              <th className="py-1.5 pl-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {/* Custom fields */}
            {hasCustom
              ? customFields.map(field => (
                  <FieldRow
                    key={field.field_key}
                    field={field}
                    isCustom={true}
                    onEdit={() => onEdit(field)}
                    onDelete={() => onDelete(field.field_key)}
                  />
                ))
              : !showStandard && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-[length:var(--text-xs,10px)] text-text-muted"
                    >
                      No custom fields. Click &ldquo;+ Add Field&rdquo; to create one.
                    </td>
                  </tr>
                )}

            {/* Standard fields section */}
            {showStandard && (
              <>
                {hasCustom && (
                  <tr>
                    <td colSpan={5} className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-eyebrow">Standard Fields</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    </td>
                  </tr>
                )}
                {standardFieldsLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-4 text-center text-[length:var(--text-xs,10px)] text-text-muted"
                    >
                      Loading standard fields…
                    </td>
                  </tr>
                ) : (
                  standardFields.map(field => (
                    <FieldRow key={field.field_key} field={field} isCustom={false} />
                  ))
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
