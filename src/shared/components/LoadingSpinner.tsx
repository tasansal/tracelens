/**
 * Small animated spinner used in loading and empty states.
 */
import React from 'react';

/**
 * Accessible loading indicator.
 */
export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center p-8" role="status">
      <div className="loading-orbit">
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
};
