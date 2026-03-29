/**
 * Dialog for entering remote file URIs (S3, GCS, Azure, HTTP).
 *
 * @returns Dialog that validates URIs, shows examples, and forwards submit/cancel actions.
 */
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useState } from 'react';

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Open Remote SEG-Y File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="uri">File URI</Label>
            <Input
              id="uri"
              placeholder="s3://bucket/file.sgy or gs://bucket/file.sgy or https://..."
              value={uri}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUri(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
            />
            <p className="text-sm text-text-muted">
              Enter a remote file URI. Supported protocols: S3, GCS, Azure Blob, HTTP/HTTPS
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-panel-muted p-4">
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

          <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
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

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="primary" onClick={onClose}>
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
