import { Component as ReactComponent, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Global crash guard — a runtime error anywhere in the tree shows a recoverable
 *  screen instead of a white page (previously only plugin widgets were guarded). */
export class AppErrorBoundary extends ReactComponent<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[App] Unhandled render error:', error);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-dvh bg-ndp-bg flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-8 text-center" role="alert">
          <p className="text-ndp-text font-semibold text-lg">Something went wrong</p>
          <p className="text-ndp-text-muted text-sm mt-2">
            The page crashed instead of loading. Your data is safe, try reloading.
          </p>
          {this.state.error && (
            <p className="text-ndp-text-dim text-xs mt-3 font-mono opacity-70 break-all">
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <button onClick={this.handleReload} className="btn-primary px-4 py-2 text-sm">
              Reload
            </button>
            <button onClick={this.handleHome} className="btn-secondary px-4 py-2 text-sm">
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
