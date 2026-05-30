/**
 * Dialog for entering remote file URIs (S3, GCS, Azure, HTTP).
 *
 * Typography (Task 4.2 final sweep): URI examples in the softCard block use raw
 * `font-mono` on full example strings (technical identifiers / URL schemes per
 * 4.2-mono rules; treated as code snippets, not prose). No other custom typography;
 * relies on shared Label (proportional text-sm), Button, Input (fieldClass), and
 * softCardClassName. No text-[Npx], no eyebrow on descriptions. Clean; aligns with
 * StorageSettingsPanel patterns for remote auth help text.
 *
 * @returns Dialog that validates URIs, shows examples, and forwards submit/cancel actions.
 */
import { Button } from '@/shared/ui/button';
import { softCardClassName } from '@/shared/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useEffect, useRef, useState } from 'react';

interface UriInputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (uri: string) => void;
  onOpenSettings?: () => void;
}

export const UriInputDialog = ({
  isOpen,
  onClose,
  onSubmit,
  onOpenSettings,
}: UriInputDialogProps) => {
  const [uri, setUri] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSubmit = () => {
    if (uri.trim()) {
      onSubmit(uri.trim());
      setUri('');
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Open Remote SEG-Y File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="uri">File URI</Label>
            <Input
              ref={inputRef}
              id="uri"
              placeholder="s3://bucket/file.sgy or gs://bucket/file.sgy or https://..."
              value={uri}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUri(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <p className="text-sm text-text-muted">
              Enter a remote file URI. Supported protocols: S3, GCS, Azure Blob, HTTP/HTTPS
            </p>
          </div>

          <div className={softCardClassName}>
            <p className="text-sm font-semibold text-text">Examples:</p>
            <div className="space-y-1 text-sm text-text-muted">
              <p className="font-mono">s3://my-bucket/seismic/survey.sgy</p>
              <p className="font-mono">gs://my-bucket/data/survey.sgy</p>
              <p className="font-mono">az://my-container/survey.sgy</p>
              <p className="font-mono">
                https://myaccount.blob.core.windows.net/my-container/survey.sgy
              </p>
              <p className="font-mono">https://example.com/data/survey.sgy</p>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-accent/20 bg-accent/5 p-4">
            <p className="text-sm text-text">
              <span className="font-semibold">Note:</span> Configure cloud credentials in{' '}
              {onOpenSettings ? (
                <button
                  onClick={onOpenSettings}
                  className="font-semibold underline decoration-accent/40 underline-offset-2 hover:decoration-accent transition-colors"
                >
                  Settings
                </button>
              ) : (
                <span className="font-semibold">Settings</span>
              )}{' '}
              before accessing private storage. For public S3 buckets, enable Anonymous Access in
              AWS S3 settings. For Azure HTTPS URLs, account name and URL SAS token are
              auto-detected.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="tonal" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!uri.trim()}>
            Open File
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
