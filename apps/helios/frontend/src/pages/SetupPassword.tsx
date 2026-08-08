import { useState, useEffect } from 'react';
import './SetupPassword.css';

interface VerificationResult {
  success: boolean;
  data?: {
    email: string;
    firstName: string;
    lastName: string;
  };
  error?: string;
}

export function SetupPassword() {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');

    if (!tokenParam) {
      setTokenError('No setup token provided');
      setLoading(false);
      return;
    }

    setToken(tokenParam);
    verifyToken(tokenParam);
  }, []);

  const verifyToken = async (tokenValue: string) => {
    try {
      const response = await fetch(
        `/api/v1/auth/verify-setup-token?token=${tokenValue}`
      );

      const data: VerificationResult = await response.json();

      if (!response.ok || !data.success) {
        setTokenError(data.error || 'Invalid or expired token');
        return;
      }

      setUserInfo(data.data);
    } catch (err: any) {
      setTokenError('Failed to verify token. Please contact your administrator.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid setup token');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/v1/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to set password');
        return;
      }

      // Store user and organization data for UI purposes (non-sensitive metadata)
      if (data.data.user) {
        localStorage.setItem('helios_user', JSON.stringify(data.data.user));
      }

      if (data.data.organization) {
        localStorage.setItem('helios_organization', JSON.stringify({
          organizationId: data.data.organization.id,
          organizationName: data.data.organization.name,
          domain: data.data.organization.domain
        }));
      }

      // Redirect to login page - user will log in with their new password via session-based auth
      window.location.href = '/?setup=complete';
    } catch (err: any) {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="setup-password-container">
        <div className="setup-password-card">
          <div className="loading">
            <div className="spinner"></div>
            <p>Verifying your setup link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="setup-password-container">
        <div className="setup-password-card">
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <h2>Invalid Setup Link</h2>
            <p className="error-message">{tokenError}</p>
            <p className="error-help">
              This link may have expired or already been used.
              Please contact your administrator for a new setup link.
            </p>
            <button
              className="btn-secondary"
              onClick={() => window.location.href = '/'}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-password-container">
      <div className="setup-password-card">
        <div className="setup-header">
          <div className="setup-logo">🔐</div>
          <h1>Set Up Your Password</h1>
          <p className="setup-subtitle">
            Welcome, {userInfo?.firstName}! Please create a password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="setup-form">
          <div className="user-info">
            <div className="info-label">Setting up account for:</div>
            <div className="info-value">{userInfo?.email}</div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              className="form-input"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="password-requirements">
            <div className="requirements-title">Password Requirements:</div>
            <ul>
              <li className={password.length >= 8 ? 'met' : ''}>
                At least 8 characters
              </li>
              <li className={password && confirmPassword && password === confirmPassword ? 'met' : ''}>
                Passwords match
              </li>
            </ul>
          </div>

          <button
            type="submit"
            className="btn-primary btn-large"
            disabled={submitting || password.length < 8 || password !== confirmPassword}
          >
            {submitting ? 'Setting up...' : 'Set Password & Continue'}
          </button>
        </form>

        <div className="setup-footer">
          <p>
            After setting your password, you'll be automatically logged in to your account.
          </p>
        </div>
      </div>
    </div>
  );
}
