/**
 * Empty-state panel shown when no SEG-Y file has been loaded.
 */
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
    <div className="empty-state">
      <div className={`empty-card ${isDragActive ? 'is-drag-active' : ''}`}>
        <div className="section-title">No File Loaded</div>
        <p className="empty-subtitle">
          Open or drag & drop a SEG-Y file to explore headers and traces.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button onClick={onFileSelect} className="btn-primary">
            {isDragActive ? 'Drop SEG-Y to load' : 'Open SEG-Y'}
          </button>
          <div className="empty-hint">Ctrl+O</div>
        </div>
      </div>
    </div>
  );
};
