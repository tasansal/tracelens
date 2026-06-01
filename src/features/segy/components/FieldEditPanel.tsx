/**
 * Slide-in panel for adding or editing a custom header field.
 * Absolutely positioned within the schema tab container, slides from the right
 * using a CSS transition — no modal or dialog dependency.
 *
 * Typography (Task 4.2 / 4.2-mono + final sweep): Follows exemplary mono discipline. All explanatory
 * content (form instructions, tooltip paragraphs describing code mappings) uses
 * proportional flow / `text-text-muted` / `font-medium` etc. Raw `font-mono` (with
 * accent color for examples) is applied *only* to inline technical tokens and values:
 *   <span className="font-mono ...">1</span>, <span className="font-mono">IBM Float32</span>,
 *   code entry inputs, byte ranges, etc. This is the reference "Good (inline technical
 *   examples)" pattern cited in design-language.md. No mono or .text-eyebrow leaks onto
 *   sentences or help prose. The "+ Add" code mapping affordance uses baked `text-xs`
 *   primitive (no arbitrary `text-[Npx]`). Byte-end computed display uses `font-mono` for
 *   data value (with explicit size for the readout box). Compact inputs use `text-[length:var(--text-sm,12px)]`
 *   only for density matching other schema surfaces. All per 4.2-mono rules.
 *   Final sweep confirmed ongoing compliance (no new leaks introduced).
 */
import type { HeaderFieldSpec, HeaderType } from '@/features/segy/types/headerSpec';
import { listScalarTypes, type ScalarTypeInfo } from '@/shared/api/tauri/segy';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/utils/cn';
import { Info, X } from 'lucide-react';
import { useEffect, useReducer, useState } from 'react';

interface CodeEntry {
  id: string;
  code: string;
  label: string;
}

interface FieldFormState {
  name: string;
  byteStart: string;
  dataType: string;
  description: string;
  codeEntries: CodeEntry[];
}

type FieldFormAction =
  | { type: 'setName'; value: string }
  | { type: 'setByteStart'; value: string }
  | { type: 'setDataType'; value: string }
  | { type: 'setDescription'; value: string }
  | { type: 'addCodeEntry' }
  | { type: 'removeCodeEntry'; id: string }
  | { type: 'updateCodeEntry'; id: string; field: 'code' | 'label'; value: string };

function createCodeEntry(code = '', label = ''): CodeEntry {
  return { id: crypto.randomUUID(), code, label };
}

function createInitialFormState(initialField: HeaderFieldSpec | undefined): FieldFormState {
  return {
    name: initialField?.name ?? '',
    byteStart: initialField ? String(initialField.byte_start) : '',
    dataType: initialField?.data_type ?? 'int32',
    description: initialField?.description ?? '',
    codeEntries: initialField?.code_mapping
      ? Object.entries(initialField.code_mapping).map(([code, label]) =>
          createCodeEntry(code, label)
        )
      : [],
  };
}

function fieldFormReducer(state: FieldFormState, action: FieldFormAction): FieldFormState {
  switch (action.type) {
    case 'setName':
      return { ...state, name: action.value };
    case 'setByteStart':
      return { ...state, byteStart: action.value };
    case 'setDataType':
      return { ...state, dataType: action.value };
    case 'setDescription':
      return { ...state, description: action.value };
    case 'addCodeEntry':
      return { ...state, codeEntries: [...state.codeEntries, createCodeEntry()] };
    case 'removeCodeEntry':
      return {
        ...state,
        codeEntries: state.codeEntries.filter(entry => entry.id !== action.id),
      };
    case 'updateCodeEntry':
      return {
        ...state,
        codeEntries: state.codeEntries.map(entry =>
          entry.id === action.id ? { ...entry, [action.field]: action.value } : entry
        ),
      };
    default:
      return state;
  }
}

interface FieldEditPanelProps {
  /** Whether the panel is visible. */
  open: boolean;
  /** Which header section this panel operates on — driven by the active tab in the parent. */
  headerType: HeaderType;
  /** Called when the user closes or cancels. */
  onClose: () => void;
  /**
   * Called when the user submits a valid field.
   *
   * @param headerType - Which header section the field belongs to.
   * @param field - The complete field spec to save.
   */
  onSave: (headerType: HeaderType, field: HeaderFieldSpec) => void;
  /** Pre-filled field when editing an existing entry; undefined when adding. */
  initialField?: HeaderFieldSpec;
}

/**
 * Slide-in panel for adding or editing a single custom header field.
 * Must be rendered inside a `position: relative; overflow: hidden` container.
 *
 * @param props - Component props
 * @returns Slide-in panel component
 */
export const FieldEditPanel = ({
  open,
  headerType,
  onClose,
  onSave,
  initialField,
}: FieldEditPanelProps) => {
  // Lazy initializers — the parent resets this component via a key prop change,
  // so no reset effects are needed here.
  const [formState, dispatch] = useReducer(fieldFormReducer, initialField, createInitialFormState);
  const [scalarTypes, setScalarTypes] = useState<ScalarTypeInfo[]>([]);
  const { name, byteStart, dataType, description, codeEntries } = formState;

  useEffect(() => {
    listScalarTypes().then(setScalarTypes).catch(console.error);
  }, []);

  const typeSize = scalarTypes.find(t => t.key === dataType)?.size ?? 0;
  const byteEnd = byteStart.length > 0 ? parseInt(byteStart) + typeSize - 1 : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || byteStart.length === 0 || byteEnd === null) return;

    const validEntries = codeEntries.filter(({ code }) => code.trim());
    const field: HeaderFieldSpec = {
      name: name.trim(),
      field_key: initialField?.field_key ?? name.trim().toLowerCase().replace(/\s+/g, '_'),
      byte_start: parseInt(byteStart),
      byte_end: byteEnd,
      data_type: dataType,
      description: description.trim(),
      required: false,
      ...(validEntries.length > 0 && {
        code_mapping: Object.fromEntries(validEntries.map(({ code, label }) => [code, label])),
      }),
    };
    onSave(headerType, field);
  };

  const maxByte = headerType === 'binary' ? 400 : 240;
  const isEditing = Boolean(initialField);
  const sectionLabel = headerType === 'binary' ? 'Binary' : 'Trace';

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex flex-col bg-panel transition-transform duration-200 ease-out',
        open ? 'translate-x-0' : 'translate-x-full'
      )}
      aria-hidden={!open}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <p className="text-[length:var(--text-sm,12px)] font-semibold text-text">
          {isEditing ? `Edit ${sectionLabel} Field` : `Add ${sectionLabel} Field`}
        </p>
        <Button
          variant="ghost"
          type="button"
          onClick={onClose}
          className="focus-ring p-1"
          aria-label="Close panel"
        >
          <X size={14} />
        </Button>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-auto p-4">
        <form id="field-edit-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="fp-name" className="mb-1.5 block">
              Field Name *
            </Label>
            <Input
              id="fp-name"
              value={name}
              onChange={e => dispatch({ type: 'setName', value: e.target.value })}
              placeholder="e.g. Shotpoint Number"
              required
            />
          </div>

          <div className="grid grid-cols-[80px_80px_1fr] gap-3">
            <div>
              <Label htmlFor="fp-byte-start" className="mb-1.5 block">
                Byte Start *
              </Label>
              <Input
                id="fp-byte-start"
                type="number"
                min={1}
                max={maxByte}
                value={byteStart}
                onChange={e => dispatch({ type: 'setByteStart', value: e.target.value })}
                placeholder="1"
                required
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-text-muted">Byte End</Label>
              <div className="flex items-center rounded-[var(--radius-sm)] border border-border bg-panel-strong px-2.5 py-1.5 font-mono tabular-nums text-[length:var(--text-sm,12px)] text-text-dim">
                {byteEnd !== null ? byteEnd : '—'}
              </div>
            </div>
            <div>
              <Label htmlFor="fp-data-type" className="mb-1.5 block">
                Data Type *
              </Label>
              <Select
                value={dataType}
                onValueChange={value => dispatch({ type: 'setDataType', value })}
              >
                <SelectTrigger id="fp-data-type" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scalarTypes.map(({ key, label }) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="fp-description" className="mb-1.5 block">
              Description
            </Label>
            <Input
              id="fp-description"
              value={description}
              onChange={e => dispatch({ type: 'setDescription', value: e.target.value })}
              placeholder="Optional description"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label>Code Mappings</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      type="button"
                      className="p-1 text-text-muted hover:text-text-dim focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
                    >
                      <Info size={11} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-56">
                    <p className="font-medium text-text">What are code mappings?</p>
                    <p className="mt-1 text-text-muted">
                      Map raw integer values to labels. When the field reads{' '}
                      <span className="font-mono text-accent-2">1</span>, the app shows{' '}
                      <span className="font-mono text-accent-2">IBM Float32</span> instead.
                    </p>
                    <p className="mt-1 text-text-muted">
                      Useful when each number in the field stands for a named option, like{' '}
                      <span className="font-mono text-accent-2">1</span> for Meters,{' '}
                      <span className="font-mono text-accent-2">2</span> for Feet.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: 'addCodeEntry' })}
                className="text-[length:var(--text-xs,10px)] font-medium text-accent hover:text-accent/80"
              >
                + Add
              </button>
            </div>
            {codeEntries.length > 0 && (
              <div className="space-y-1">
                {codeEntries.map(({ id, code, label }) => (
                  <div key={id} className="flex items-center gap-1">
                    <Input
                      className="w-16 shrink-0 font-mono text-[length:var(--text-sm,12px)]"
                      value={code}
                      onChange={e =>
                        dispatch({
                          type: 'updateCodeEntry',
                          id,
                          field: 'code',
                          value: e.target.value,
                        })
                      }
                      placeholder="code"
                    />
                    <Input
                      className="flex-1 text-[length:var(--text-sm,12px)]"
                      value={label}
                      onChange={e =>
                        dispatch({
                          type: 'updateCodeEntry',
                          id,
                          field: 'label',
                          value: e.target.value,
                        })
                      }
                      placeholder="label"
                    />
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => dispatch({ type: 'removeCodeEntry', id })}
                      className="shrink-0 p-1 text-text-muted hover:text-destructive"
                      aria-label="Remove entry"
                    >
                      <X size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
        <Button variant="tonal" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="field-edit-form">
          {isEditing ? 'Update Field' : 'Add Field'}
        </Button>
      </div>
    </div>
  );
};
