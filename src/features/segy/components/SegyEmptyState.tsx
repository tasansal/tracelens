/**
 * Empty-state panel shown when no SEG-Y file has been loaded.
 */
import { Button } from '@/shared/ui/button';
import { SectionTitle } from '@/shared/ui/section-title';
import React from 'react';

/**
 * Props for SegyEmptyState.
 */
interface SegyEmptyStateProps {
  isDragActive: boolean;
  onFileSelect: () => void;
}

/**
 * Call-to-action card that prompts the user to open a SEG-Y file.
 */
export const SegyEmptyState: React.FC<SegyEmptyStateProps> = ({ isDragActive, onFileSelect }) => {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className={`w-[min(520px,92%)] rounded-[var(--radius-xl)] border border-border bg-panel p-8 text-center shadow-[var(--shadow)] transition-transform transition-opacity transition-colors duration-300 ease-out motion-reduce:transition-none ${
          isDragActive
            ? 'border-accent-2 border-dashed opacity-[0.88] -translate-y-1'
            : 'animate-[rise-in_0.8s_ease-out] motion-reduce:animate-none'
        }`}
      >
        <SectionTitle as="div">No File Loaded</SectionTitle>
        <p className="mt-2 text-[13px] text-text-muted">
          Open or drag & drop a SEG-Y file to explore headers and traces.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button onClick={onFileSelect}>
            {isDragActive ? 'Drop SEG-Y to load' : 'Open SEG-Y'}
          </Button>
          <div className="mt-3.5 text-[11px] uppercase tracking-[0.2em] text-text-dim">Ctrl+O</div>
        </div>
      </div>
    </div>
  );
};
