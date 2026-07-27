import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          padding: '2rem'
        }}>
          <div style={{
            maxWidth: '32rem',
            width: '100%',
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '4rem',
              height: '4rem',
              backgroundColor: '#fef2f2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <AlertTriangle size={32} color="#dc2626" />
            </div>

            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '0.5rem'
            }}>
              Something went wrong
            </h1>

            <p style={{
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: 1.5
            }}>
              An unexpected error occurred. You can try refreshing the page or going back to the dashboard.
            </p>

            <div style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
              marginBottom: '1.5rem'
            }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1rem',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={16} />
                Refresh Page
              </button>

              <button
                onClick={this.handleGoHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1rem',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Home size={16} />
                Go to Dashboard
              </button>
            </div>

            {this.state.error && (
              <details style={{
                textAlign: 'left',
                backgroundColor: '#f9fafb',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginTop: '1rem'
              }}>
                <summary style={{
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151'
                }}>
                  Error Details
                </summary>
                <div style={{
                  marginTop: '0.75rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: '#dc2626',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}>
                  <strong>Error:</strong> {this.state.error.message}
                  {this.state.error.stack && (
                    <>
                      {'\n\n'}
                      <strong>Stack:</strong>
                      {'\n'}
                      {this.state.error.stack}
                    </>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}