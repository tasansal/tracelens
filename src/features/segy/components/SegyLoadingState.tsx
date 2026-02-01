/**
 * Full-panel loading indicator for SEG-Y file loading.
 */
import { LoadingSpinner } from '@/shared/ui/loading-spinner';
import React from 'react';

/**
 * Centered loading view used while parsing or fetching file data.
 */
export const SegyLoadingState: React.FC = () => {
  return (
    <div className="flex flex-1 items-center justify-center">
      <LoadingSpinner />
    </div>
  );
};
