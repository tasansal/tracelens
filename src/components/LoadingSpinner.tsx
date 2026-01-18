import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
    </div>
  );
};
