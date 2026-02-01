import * as React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center p-8" role="status">
      <div className="loading-orbit relative h-16 w-16">
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
};
