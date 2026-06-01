/**
 * Revision detection error dialog shown when SEG-Y revision detection fails.
 *
 * Typography: uses proportional text-sm / text-[length:var(--text-xs,10px)] text-text-dim for labels and descriptions
 * inside OptionTile choices (per design-language.md 4.2-mono rules; avoids text-[Npx] leaks;
 * final sweep confirmed)
 * and any mono on prose). Matches AppearanceSettings pattern.
 */
import type { SegyRevision } from '@/shared/api/tauri/segy';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { OptionTile } from '@/shared/ui/option-tile';
import { useState } from 'react';

interface RevisionDetectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (revision: SegyRevision) => void;
}

const REVISION_OPTIONS: { value: SegyRevision; label: string; description: string }[] = [
  { value: 'Rev0', label: 'Rev 0', description: 'Original SEG-Y (1975)' },
  { value: 'Rev1', label: 'Rev 1', description: 'SEG-Y Revision 1 (2002)' },
];

/**
 * Modal dialog shown when SEG-Y revision detection returns Unknown.
 * Allows user to choose between Rev 0 and Rev 1.
 *
 * @param props - Component props
 * @returns Revision detection dialog
 */
export const RevisionDetectionDialog = ({
  isOpen,
  onClose,
  onConfirm,
}: RevisionDetectionDialogProps) => {
  const [selectedRevision, setSelectedRevision] = useState<SegyRevision>('Rev0');

  const handleConfirm = () => {
    onConfirm(selectedRevision);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Revision Detection Failed</DialogTitle>
          <DialogDescription>
            Could not automatically detect the SEG-Y revision. Please choose a revision to use.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {REVISION_OPTIONS.map(option => (
            <OptionTile
              key={option.value}
              selected={selectedRevision === option.value}
              onClick={() => setSelectedRevision(option.value)}
            >
              <span
                aria-hidden="true"
                className={
                  selectedRevision === option.value
                    ? 'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-[var(--accent-2-muted)] bg-panel-muted'
                    : 'h-3.5 w-3.5 shrink-0 rounded-full border border-border'
                }
              >
                {selectedRevision === option.value && (
                  <span className="size-1.5 rounded-full bg-accent-2" />
                )}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[length:var(--text-sm,12px)] font-semibold text-text">
                  {option.label}
                </span>
                <span className="text-[length:var(--text-xs,10px)] text-text-dim">
                  {option.description}
                </span>
              </div>
            </OptionTile>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="tonal" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Use {REVISION_OPTIONS.find(o => o.value === selectedRevision)?.label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
