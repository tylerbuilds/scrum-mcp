import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
            <AlertTriangle className="w-16 h-16 text-red-400 relative z-10 mb-4" />
          </div>

          <h2 className="text-xl font-semibold text-stone-100 mb-2">
            Something went wrong
          </h2>

          <p className="text-sm text-stone-400 max-w-md mb-6">
            An unexpected error occurred while rendering this component.
            {this.state.error?.message && (
              <span className="block mt-2 font-mono text-xs text-red-400/80 bg-stone-900 p-2 rounded">
                {this.state.error.message}
              </span>
            )}
          </p>

          <div className="flex items-center gap-3">
            <Button onClick={this.handleRetry} variant="default">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try again
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
            >
              Reload page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Inline error fallback for smaller components
export function InlineErrorFallback({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-red-300">Failed to load</p>
        {error?.message && (
          <p className="text-xs text-red-400/70 truncate">{error.message}</p>
        )}
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1 px-2 py-1 text-xs text-red-300 hover:text-red-200 rounded hover:bg-red-500/20 transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Retry
      </button>
    </div>
  );
}
