/**
 * Schema tab content: revision selector, spec toolbar, and inline custom field editor.
 * Replaces the old Standard/Custom toggle + CustomSpecManager dialog with a single
 * unified view — no nested modals.
 *
 * Typography (Task 4.2 / 4.2-mono): .text-eyebrow used exclusively for micro-labels, status
 * readouts (e.g. "Detected: ...", "Detection failed"), popover titles ("Load Custom Spec"),
 * and short technical chrome phrases ("or enter URL") inside the load UI. These fit the
 * narrow allowance for dense technical editing surfaces / schema workbench per
 * design-language.md. No application of .text-eyebrow or raw font-mono to any descriptive
 * prose, help text, or sentences. Toolbar buttons, selects, and inputs use text-[length:var(--text-sm,12px)] for
 * compact h-7 density — matches post-audit patterns in TraceControlPanel (fieldClass +
 * text-[length:var(--text-sm,12px)] compact controls) and documented 11px chrome exceptions. "✦ Unsaved" status
 * indicator normalized to `.text-eyebrow text-accent` (consistent with SettingsApp save
 * status treatment; forces appropriate mono/uppercase/tracking for readout). Data counts
 * in tabs use explicit font-mono + size (justified for numeric values). See
 * design-language.md §Typography "Mono vs. Proportional Font Usage Rules (4.2-mono)" and
 * "Documented Typography Exceptions".
 * Final 4.2 sweep (this pass) re-confirmed all patterns; no drift or new leaks in
 * schema surfaces or toolbar chrome.
 */
import { useCustomSpecStore } from '@/features/segy/store/customSpecStore';
import type { HeaderFieldSpec, HeaderType } from '@/features/segy/types/headerSpec';
import {
  addCustomField,
  clearCustomSpec as clearCustomSpecCommand,
  deleteCustomField,
  getBinaryHeaderSpec,
  getCustomSpec,
  getTraceHeaderSpec,
  loadCustomSpec,
  saveCustomSpec,
  updateCustomField,
  type SegyRevision,
} from '@/shared/api/tauri/segy';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { OptionTile } from '@/shared/ui/option-tile';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { cn } from '@/shared/utils/cn';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Download, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useReducer, useState } from 'react';
import toast from 'react-hot-toast';
import { FieldEditPanel } from './FieldEditPanel';
import { SchemaFieldList } from './SchemaFieldList';

interface SchemaTabContentProps {
  /** Path to the SEG-Y file. */
  filePath: string;
  /** Revision detected from the file header. */
  detectedRevision: SegyRevision | null;
  /** Currently active revision override. */
  currentRevision: SegyRevision | null;
  /** Callback to change the active revision. */
  onRevisionChange: (revision: SegyRevision) => void;
}

/** Stable empty array to avoid creating a new reference on every render. */
const EMPTY_FIELDS: HeaderFieldSpec[] = [];

const REVISION_OPTIONS: { value: SegyRevision; label: string }[] = [
  { value: 'Rev0', label: 'Rev 0' },
  { value: 'Rev1', label: 'Rev 1' },
];

interface StandardSpecState {
  binary: HeaderFieldSpec[];
  trace: HeaderFieldSpec[];
  loadedRevision: string | null;
}

interface SchemaUiState {
  innerTab: HeaderType;
  editPanelOpen: boolean;
  editingField: HeaderFieldSpec | undefined;
  loadPopoverOpen: boolean;
  loadUri: string;
  loading: boolean;
}

type SchemaUiAction =
  | { type: 'setInnerTab'; tab: HeaderType }
  | { type: 'openAdd' }
  | { type: 'openEdit'; field: HeaderFieldSpec }
  | { type: 'closeEditPanel' }
  | { type: 'setLoadPopoverOpen'; open: boolean }
  | { type: 'setLoadUri'; uri: string }
  | { type: 'setLoading'; loading: boolean }
  | { type: 'loadSucceeded' };

const initialSchemaUiState: SchemaUiState = {
  innerTab: 'binary',
  editPanelOpen: false,
  editingField: undefined,
  loadPopoverOpen: false,
  loadUri: '',
  loading: false,
};

function schemaUiReducer(state: SchemaUiState, action: SchemaUiAction): SchemaUiState {
  switch (action.type) {
    case 'setInnerTab':
      return { ...state, innerTab: action.tab };
    case 'openAdd':
      return { ...state, editPanelOpen: true, editingField: undefined };
    case 'openEdit':
      return { ...state, editPanelOpen: true, editingField: action.field };
    case 'closeEditPanel':
      return { ...state, editPanelOpen: false, editingField: undefined };
    case 'setLoadPopoverOpen':
      return { ...state, loadPopoverOpen: action.open };
    case 'setLoadUri':
      return { ...state, loadUri: action.uri };
    case 'setLoading':
      return { ...state, loading: action.loading };
    case 'loadSucceeded':
      return { ...state, loadPopoverOpen: false, loadUri: '' };
    default:
      return state;
  }
}

function RevisionRow({
  detectedRevision,
  displayRevision,
  detectionFailed,
  onRevisionChange,
}: {
  detectedRevision: string | null;
  displayRevision: string | null;
  detectionFailed: boolean;
  onRevisionChange: (revision: SegyRevision) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
      <div
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          detectionFailed ? 'bg-destructive' : 'bg-accent-2'
        )}
        aria-hidden="true"
      />
      <span className="flex-1 truncate text-eyebrow">
        {detectionFailed ? `Detection failed` : `Detected: ${detectedRevision}`}
      </span>
      <Select
        value={displayRevision ?? ''}
        onValueChange={value => onRevisionChange(value as SegyRevision)}
      >
        <SelectTrigger className="h-7 w-[86px] text-[length:var(--text-sm,12px)]">
          <SelectValue placeholder="Revision" />
        </SelectTrigger>
        <SelectContent>
          {REVISION_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SchemaToolbar({
  loadPopoverOpen,
  loading,
  loadUri,
  customSpecExists,
  customSpecModified,
  onLoadPopoverChange,
  onLoadUriChange,
  onLoadFromFile,
  onLoadFromUri,
  onExport,
  onClear,
}: {
  loadPopoverOpen: boolean;
  loading: boolean;
  loadUri: string;
  customSpecExists: boolean;
  customSpecModified: boolean;
  onLoadPopoverChange: (open: boolean) => void;
  onLoadUriChange: (uri: string) => void;
  onLoadFromFile: () => Promise<void>;
  onLoadFromUri: () => Promise<void>;
  onExport: () => Promise<void>;
  onClear: () => Promise<void>;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-2 py-1.5">
      <Popover open={loadPopoverOpen} onOpenChange={onLoadPopoverChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-7 gap-1 px-2 text-[length:var(--text-sm,12px)]"
            disabled={loading}
          >
            <Upload size={11} />
            Load
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3 p-3" align="start">
          <p className="text-eyebrow">Load Custom Spec</p>
          <Button
            variant="secondary"
            className="w-full justify-start text-[length:var(--text-sm,12px)]"
            onClick={onLoadFromFile}
            disabled={loading}
          >
            Choose file…
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-eyebrow">or enter URL</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex gap-1.5">
            <Input
              className="flex-1 text-[length:var(--text-sm,12px)]"
              placeholder="s3://, https://…"
              value={loadUri}
              onChange={e => onLoadUriChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && loadUri.trim()) void onLoadFromUri();
              }}
            />
            <Button
              variant="secondary"
              className="text-[length:var(--text-sm,12px)]"
              onClick={onLoadFromUri}
              disabled={loading || !loadUri.trim()}
            >
              Load
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        className="h-7 gap-1 px-2 text-[length:var(--text-sm,12px)]"
        onClick={onExport}
        disabled={!customSpecExists}
      >
        <Download size={11} />
        Export
      </Button>
      <Button
        variant="ghost"
        className="h-7 gap-1 px-2 text-[length:var(--text-sm,12px)]"
        onClick={onClear}
        disabled={!customSpecExists}
      >
        <Trash2 size={11} />
        Clear
      </Button>

      {customSpecModified && <span className="ml-auto text-eyebrow text-accent">✦ Unsaved</span>}
    </div>
  );
}

function InnerTabBar({
  innerTab,
  binaryCount,
  traceCount,
  onTabChange,
  onAdd,
}: {
  innerTab: HeaderType;
  binaryCount: number;
  traceCount: number;
  onTabChange: (tab: HeaderType) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
      <div className="flex gap-0.5 rounded-[var(--radius-sm)] border border-border bg-panel-muted p-0.5">
        <OptionTile
          density="compact"
          selected={innerTab === 'binary'}
          onClick={() => onTabChange('binary')}
        >
          Binary
          {binaryCount > 0 && (
            <span className="ml-1 font-mono text-[length:var(--text-xs,10px)] text-accent">
              {binaryCount}
            </span>
          )}
        </OptionTile>
        <OptionTile
          density="compact"
          selected={innerTab === 'trace'}
          onClick={() => onTabChange('trace')}
        >
          Trace
          {traceCount > 0 && (
            <span className="ml-1 font-mono text-[length:var(--text-xs,10px)] text-accent">
              {traceCount}
            </span>
          )}
        </OptionTile>
      </div>
      <Button variant="secondary" className="h-7 text-[length:var(--text-sm,12px)]" onClick={onAdd}>
        + Add Field
      </Button>
    </div>
  );
}

/**
 * Schema tab: revision selector, load/export/clear toolbar, and an inline
 * custom field editor that slides in without any nested dialogs.
 *
 * @param props - Component props
 * @returns Schema tab content
 */
export const SchemaTabContent = ({
  filePath,
  detectedRevision,
  currentRevision,
  onRevisionChange,
}: SchemaTabContentProps) => {
  const { customSpec, customSpecModified, setCustomSpec, setCustomSpecModified, clearCustomSpec } =
    useCustomSpecStore();

  const [uiState, dispatchUi] = useReducer(schemaUiReducer, initialSchemaUiState);
  const { innerTab, editPanelOpen, editingField, loadPopoverOpen, loadUri, loading } = uiState;

  // ── Standard spec (for the "show standard fields" toggle) ─────────────────
  const [standardSpec, setStandardSpec] = useState<StandardSpecState>({
    binary: [],
    trace: [],
    loadedRevision: null,
  });

  const displayRevision = currentRevision ?? detectedRevision;
  const detectionFailed = detectedRevision === 'Unknown';
  const specLoading = displayRevision !== null && standardSpec.loadedRevision !== displayRevision;

  // Fetch standard spec whenever the active revision changes. The cancel flag
  // ensures a slower fetch from a previous revision can't overwrite a newer one.
  useEffect(() => {
    if (!displayRevision) return;
    const rev = displayRevision as SegyRevision;
    let cancelled = false;
    Promise.all([
      getBinaryHeaderSpec(rev).catch(() => [] as HeaderFieldSpec[]),
      getTraceHeaderSpec(rev).catch(() => [] as HeaderFieldSpec[]),
    ]).then(([binary, trace]) => {
      if (!cancelled) setStandardSpec({ binary, trace, loadedRevision: displayRevision });
    });
    return () => {
      cancelled = true;
    };
  }, [displayRevision]);

  // Sync in-memory custom spec from backend when file changes.
  useEffect(() => {
    if (!filePath) return;
    getCustomSpec(filePath)
      .then(spec => {
        if (spec) setCustomSpec(spec);
      })
      .catch(console.error);
  }, [filePath, setCustomSpec]);

  // ── Derived custom field lists ─────────────────────────────────────────────
  // Stable empty array reference so SchemaFieldList's props don't change identity
  // on every render when no custom spec is loaded.
  const binaryCustomFields = customSpec?.binary_header?.fields ?? EMPTY_FIELDS;
  const traceCustomFields = customSpec?.trace_header?.fields ?? EMPTY_FIELDS;

  // ── Load spec ─────────────────────────────────────────────────────────────

  const loadSpecFromUri = useCallback(
    async (uri: string) => {
      dispatchUi({ type: 'setLoading', loading: true });
      try {
        const spec = await loadCustomSpec(filePath, uri);
        setCustomSpec(spec);
        setCustomSpecModified(false);
        toast.success('Custom spec loaded');
        dispatchUi({ type: 'loadSucceeded' });
      } catch (err) {
        toast.error(String(err));
      } finally {
        dispatchUi({ type: 'setLoading', loading: false });
      }
    },
    [filePath, setCustomSpec, setCustomSpecModified]
  );

  const handleLoadFromFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (selected) {
      await loadSpecFromUri(selected as string);
    }
  }, [loadSpecFromUri]);

  const handleLoadFromUri = useCallback(async () => {
    if (!loadUri.trim()) return;
    await loadSpecFromUri(loadUri.trim());
  }, [loadUri, loadSpecFromUri]);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const savePath = await save({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      defaultPath: 'custom_spec.json',
    });
    if (savePath) {
      try {
        await saveCustomSpec(filePath, savePath);
        setCustomSpecModified(false);
        toast.success('Custom spec exported');
      } catch (err) {
        toast.error(String(err));
      }
    }
  }, [filePath, setCustomSpecModified]);

  // ── Clear ─────────────────────────────────────────────────────────────────

  const handleClear = useCallback(async () => {
    try {
      await clearCustomSpecCommand(filePath);
      clearCustomSpec();
      toast.success('Custom spec cleared');
    } catch (err) {
      toast.error(String(err));
    }
  }, [filePath, clearCustomSpec]);

  // ── Field CRUD ────────────────────────────────────────────────────────────

  const handleSaveField = useCallback(
    async (headerType: HeaderType, field: HeaderFieldSpec) => {
      try {
        let updated;
        if (editingField) {
          updated = await updateCustomField(filePath, headerType, editingField.field_key, field);
          toast.success('Field updated');
        } else {
          updated = await addCustomField(filePath, headerType, field);
          toast.success('Field added');
        }
        setCustomSpec(updated);
        setCustomSpecModified(true);
        dispatchUi({ type: 'closeEditPanel' });
      } catch (err) {
        toast.error(String(err));
      }
    },
    [editingField, filePath, setCustomSpec, setCustomSpecModified]
  );

  const handleDeleteField = useCallback(
    async (headerType: HeaderType, fieldKey: string) => {
      try {
        const updated = await deleteCustomField(filePath, headerType, fieldKey);
        setCustomSpec(updated);
        setCustomSpecModified(true);
        toast.success('Field deleted');
      } catch (err) {
        toast.error(String(err));
      }
    },
    [filePath, setCustomSpec, setCustomSpecModified]
  );

  // ── Edit panel open helpers ────────────────────────────────────────────────

  const openAdd = () => {
    dispatchUi({ type: 'openAdd' });
  };

  const openEdit = (field: HeaderFieldSpec) => {
    dispatchUi({ type: 'openEdit', field });
  };

  const closeEditPanel = () => {
    dispatchUi({ type: 'closeEditPanel' });
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <RevisionRow
        detectedRevision={detectedRevision}
        displayRevision={displayRevision}
        detectionFailed={detectionFailed}
        onRevisionChange={onRevisionChange}
      />

      <SchemaToolbar
        loadPopoverOpen={loadPopoverOpen}
        loading={loading}
        loadUri={loadUri}
        customSpecExists={Boolean(customSpec)}
        customSpecModified={customSpecModified}
        onLoadPopoverChange={open => dispatchUi({ type: 'setLoadPopoverOpen', open })}
        onLoadUriChange={uri => dispatchUi({ type: 'setLoadUri', uri })}
        onLoadFromFile={handleLoadFromFile}
        onLoadFromUri={handleLoadFromUri}
        onExport={handleExport}
        onClear={handleClear}
      />

      <InnerTabBar
        innerTab={innerTab}
        binaryCount={binaryCustomFields.length}
        traceCount={traceCustomFields.length}
        onTabChange={tab => dispatchUi({ type: 'setInnerTab', tab })}
        onAdd={openAdd}
      />

      <div className="flex-1 overflow-hidden">
        {innerTab === 'binary' && (
          <SchemaFieldList
            customFields={binaryCustomFields}
            standardFields={standardSpec.binary}
            standardFieldsLoading={specLoading}
            onEdit={field => openEdit(field)}
            onDelete={fieldKey => void handleDeleteField('binary', fieldKey)}
          />
        )}
        {innerTab === 'trace' && (
          <SchemaFieldList
            customFields={traceCustomFields}
            standardFields={standardSpec.trace}
            standardFieldsLoading={specLoading}
            onEdit={field => openEdit(field)}
            onDelete={fieldKey => void handleDeleteField('trace', fieldKey)}
          />
        )}
      </div>

      <FieldEditPanel
        key={`${String(editPanelOpen)}-${editingField?.field_key ?? 'new'}`}
        open={editPanelOpen}
        headerType={innerTab}
        onClose={closeEditPanel}
        onSave={(headerType, field) => void handleSaveField(headerType, field)}
        initialField={editingField}
      />
    </div>
  );
};
