/**
 * Empty-state panel shown when no SEG-Y file has been loaded.
 */
import { Button } from '@/shared/ui/button';
import { SectionTitle } from '@/shared/ui/section-title';
import { cn } from '@/shared/utils/cn';

/**
 * Props for SegyEmptyState component.
 */
interface SegyEmptyStateProps {
  /** Whether a file is currently being dragged over the drop zone */
  isDragActive: boolean;
  /** Callback fired when the user clicks to select a local file */
  onFileSelect: () => void;
  /** Callback fired when the user clicks to open a remote file */
  onRemoteFileSelect: () => void;
}

/**
 * Call-to-action card that prompts the user to open a SEG-Y file.
 * Displays an empty state with instructions and file selection button.
 *
 * @param props - Component props
 * @returns Empty state component
 */
export const SegyEmptyState = ({
  isDragActive,
  onFileSelect,
  onRemoteFileSelect,
}: SegyEmptyStateProps) => {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className={cn(
          'w-[min(520px,92%)] rounded-[var(--radius-xl)] border border-border bg-panel p-8 text-center shadow-[var(--shadow)] transition-transform transition-opacity transition-colors duration-300 ease-out motion-reduce:transition-none',
          isDragActive
            ? 'border-accent-2 border-dashed opacity-[0.88] -translate-y-1'
            : 'animate-[rise-in_0.8s_ease-out] motion-reduce:animate-none'
        )}
      >
        <SectionTitle as="div">No File Loaded</SectionTitle>
        <p className="mt-2 text-[13px] text-text-muted">
          Open a local file, drag & drop, or connect to remote SEG-Y data.
        </p>
        <div className="mt-6 flex flex-col items-center">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-2">
              <Button onClick={onFileSelect}>
                {isDragActive ? 'Drop SEG-Y to load' : 'Open Local File'}
              </Button>
              <div className="text-[11px] uppercase tracking-[0.2em] text-text-dim">Ctrl+O</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button onClick={onRemoteFileSelect}>Open Remote File</Button>
              <div className="text-[11px] uppercase tracking-[0.2em] text-text-dim">
                Ctrl+Shift+O
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
