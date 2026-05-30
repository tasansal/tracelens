/**
 * Error boundary component that catches React errors and displays a fallback UI.
 * Provides graceful error handling to prevent white-screen crashes.
 */
import { Button } from '@/shared/ui/button';
import * as React from 'react';

export interface ErrorBoundaryProps {
  /** Child components to render */
  children: React.ReactNode;
  /** Optional custom fallback UI — overrides title/message if provided */
  fallback?: React.ReactNode;
  /** Title shown in the default fallback */
  title?: string;
  /** Description shown in the default fallback */
  message?: string;
}

interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean;
  /** The caught error */
  error: Error | null;
}

/**
 * Error boundary that catches JavaScript errors in child components.
 * Displays a fallback UI with retry option when errors occur.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  /**
   * Static lifecycle method that catches errors in child components.
   * Updates state to trigger fallback UI rendering.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  /**
   * Resets the error state to allow retrying the operation.
   */
  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Render custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-panel p-8 text-center">
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-text">
              {this.props.title ?? 'Something went wrong'}
            </p>
            <p className="text-sm text-text-muted">
              {this.props.message ?? this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
          </div>
          <Button onClick={this.handleRetry}>Try Again</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
