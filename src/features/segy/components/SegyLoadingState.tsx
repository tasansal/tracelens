/**
 * Full-panel loading indicator for SEG-Y file loading.
 */
import { LoadingSpinner } from '@/shared/ui/loading-spinner';

/**
 * Centered loading view used while parsing or fetching SEG-Y file data.
 * Displays a spinner in the center of the available space.
 *
 * @returns Loading state component
 */
export const SegyLoadingState = () => {
  return (
    <div className="flex flex-1 items-center justify-center">
      <LoadingSpinner />
    </div>
  );
};
