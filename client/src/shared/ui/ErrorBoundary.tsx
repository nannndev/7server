import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('7Server Uncaught UI Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)]">
                {this.props.fallbackTitle || 'Terjadi Masalah pada Tampilan'}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Aplikasi mendeteksi error tak terduga. Klik tombol di bawah untuk memuat ulang tampilan.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 rounded-lg bg-[var(--muted)]/50 border border-[var(--border)] text-left font-mono text-[11px] text-red-400 overflow-x-auto max-h-36 whitespace-pre-wrap select-all">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <Button onClick={this.handleReset} className="w-full btn-metal">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Muat Ulang Halaman (Reload)
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

