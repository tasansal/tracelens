/**
 * Empty-state panel shown when no SEG-Y file has been loaded.
 */
import React from 'react';

/**
 * Props for SegyEmptyState.
 */
interface SegyEmptyStateProps {
  onFileSelect: () => void;
}

/**
 * Call-to-action card that prompts the user to open a SEG-Y file.
 */
export const SegyEmptyState: React.FC<SegyEmptyStateProps> = ({ onFileSelect }) => {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="section-title">No File Loaded</div>
        <p className="empty-subtitle">
          Open a SEG-Y file to explore headers, traces, and waveform structure.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button onClick={onFileSelect} className="btn-primary">
            Open SEG-Y
          </button>
          <div className="empty-hint">Ctrl+O</div>
        </div>
      </div>
    </div>
  );
};
