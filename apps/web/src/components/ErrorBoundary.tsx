import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Keepsake ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetSession = () => {
    try {
      localStorage.removeItem('keepsake_auth_session');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-[#0c0c0e] text-neutral-200 p-6">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Something went wrong</h2>
                <p className="text-xs text-neutral-400">Keepsake encountered an unexpected error</p>
              </div>
            </div>

            {this.state.error && (
              <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 text-[11px] font-mono text-neutral-300 break-words max-h-36 overflow-y-auto">
                {this.state.error.message}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-sky-500/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Keepsake</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetSession}
                className="py-2.5 px-4 rounded-xl border border-neutral-700 hover:border-neutral-600 bg-neutral-800 hover:bg-neutral-700/80 text-neutral-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                title="Clears saved session and returns to login screen"
              >
                <LogOut className="w-4 h-4" />
                <span>Reset Session</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
