/**
 * Revision detection error dialog shown when SEG-Y revision detection fails.
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
import { cn } from '@/shared/utils/cn';
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revision Detection Failed</DialogTitle>
          <DialogDescription>
            Could not automatically detect the SEG-Y revision. Please choose a revision to use.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {REVISION_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedRevision(option.value)}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                selectedRevision === option.value
                  ? 'border-primary bg-accent/10 ring-2 ring-primary'
                  : 'border-border'
              )}
            >
              <div
                className={cn(
                  'h-4 w-4 rounded-full border',
                  selectedRevision === option.value
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground'
                )}
              />
              <div>
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
          >
            Cancel
          </button>
          <Button onClick={handleConfirm}>
            Use {REVISION_OPTIONS.find(o => o.value === selectedRevision)?.label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
