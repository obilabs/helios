import { useState } from 'react';
import { Shield, Fingerprint, Loader2 } from 'lucide-react';
import { signInWithEmail, getSession, verify2FACode, signInWithPasskey, isPasskeySupported } from '../lib/auth-client';
import './LoginPage.css';

interface LoginPageProps {
  onLoginSuccess: (organizationData: any) => void;
  organizationDomain?: string;
  organizationName?: string;
}

export function LoginPage({ onLoginSuccess, organizationDomain: _organizationDomain, organizationName }: LoginPageProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const passkeySupported = isPasskeySupported();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Sign in with better-auth (sets httpOnly session cookies)
      // No JWT tokens stored in browser - session cookies are more secure
      const authResult = await signInWithEmail(formData.email, formData.password);

      // Check if 2FA is required
      if (authResult.twoFactorRequired) {
        setTwoFactorRequired(true);
        setLoading(false);
        return;
      }

      if (!authResult.success) {
        throw new Error(authResult.error || 'Sign in failed');
      }

      // Get the session to access user data
      const session = await getSession();
      if (!session) {
        throw new Error('Failed to get session after login');
      }

      const user = session.user;

      // Store user info for UI display (not for auth - that's handled by httpOnly cookies)
      localStorage.setItem('helios_user', JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        isExternalAdmin: user.isExternalAdmin,
        defaultView: user.defaultView,
        isActive: user.isActive,
        department: user.department,
      }));

      // Store organization info for UI display
      if (user.organizationId) {
        // Extract domain from email for display
        const emailDomain = user.email.split('@')[1] || '';
        localStorage.setItem('helios_organization', JSON.stringify({
          organizationId: user.organizationId,
          organizationName: organizationName || 'Organization',
          domain: emailDomain,
        }));
      }

      // Notify parent of successful login
      onLoginSuccess({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            organizationId: user.organizationId,
          },
          organization: { id: user.organizationId },
        },
      });

    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const authResult = await verify2FACode(totpCode);

      if (!authResult.success) {
        throw new Error(authResult.error || 'Invalid verification code');
      }

      // Get the session to access user data
      const session = await getSession();
      if (!session) {
        throw new Error('Failed to get session after 2FA verification');
      }

      const user = session.user;

      // Store user info for UI display
      localStorage.setItem('helios_user', JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        isExternalAdmin: user.isExternalAdmin,
        defaultView: user.defaultView,
        isActive: user.isActive,
        department: user.department,
      }));

      // Store organization info for UI display
      if (user.organizationId) {
        const emailDomain = user.email.split('@')[1] || '';
        localStorage.setItem('helios_organization', JSON.stringify({
          organizationId: user.organizationId,
          organizationName: organizationName || 'Organization',
          domain: emailDomain,
        }));
      }

      // Notify parent of successful login
      onLoginSuccess({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            organizationId: user.organizationId,
          },
          organization: { id: user.organizationId },
        },
      });

    } catch (err: any) {
      console.error('2FA verification error:', err);
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setTwoFactorRequired(false);
    setTotpCode('');
    setError(null);
  };

  const handlePasskeySignIn = async () => {
    setPasskeyLoading(true);
    setError(null);

    try {
      const authResult = await signInWithPasskey();

      if (!authResult.success) {
        setError(authResult.error || 'Passkey authentication failed');
        setPasskeyLoading(false);
        return;
      }

      // Get the session to access user data
      const session = await getSession();
      if (!session) {
        throw new Error('Failed to get session after passkey login');
      }

      const user = session.user;

      // Store user info for UI display
      localStorage.setItem('helios_user', JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        isExternalAdmin: user.isExternalAdmin,
        defaultView: user.defaultView,
        isActive: user.isActive,
        department: user.department,
      }));

      // Store organization info for UI display
      if (user.organizationId) {
        const emailDomain = user.email.split('@')[1] || '';
        localStorage.setItem('helios_organization', JSON.stringify({
          organizationId: user.organizationId,
          organizationName: organizationName || 'Organization',
          domain: emailDomain,
        }));
      }

      // Notify parent of successful login
      onLoginSuccess({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            organizationId: user.organizationId,
          },
          organization: { id: user.organizationId },
        },
      });

    } catch (err: any) {
      console.error('Passkey login error:', err);
      setError(err.message || 'Passkey authentication failed');
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-form-section">
        <div className="login-header">
          <h1>Helios Admin Portal</h1>
          <h2>{organizationName || 'Your Organization'}</h2>
          <p>Administrative Dashboard</p>
        </div>

        {twoFactorRequired ? (
          <form className="login-form" onSubmit={handle2FASubmit}>
            <div className="twofa-header">
              <Shield size={32} className="twofa-icon" />
              <h3>Two-Factor Authentication</h3>
              <p>Enter the 6-digit code from your authenticator app</p>
            </div>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <div className="form-field">
              <label htmlFor="totp">Verification Code</label>
              <input
                id="totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                required
                autoFocus
                disabled={loading}
                className="totp-input"
              />
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading || totpCode.length !== 6}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              className="back-link"
              onClick={handleBackToLogin}
              disabled={loading}
            >
              Back to login
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <div className="form-field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="admin@yourcompany.com"
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading || passkeyLoading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            {passkeySupported && (
              <>
                <div className="login-divider">
                  <span>or</span>
                </div>

                <button
                  type="button"
                  className="passkey-button"
                  onClick={handlePasskeySignIn}
                  disabled={loading || passkeyLoading}
                >
                  {passkeyLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <Fingerprint size={18} />
                      Sign in with Passkey
                    </>
                  )}
                </button>
              </>
            )}

            <div className="login-footer">
              <div className="security-note">
                Self-hosted. Fully audited. Complete control.
              </div>
            </div>
          </form>
        )}
      </div>

      <div className="login-info-section">
        <div className="feature-card">
          <h3>Delegate with Confidence</h3>
          <p>
            Grant vendors and team members admin access without sharing
            credentials. Full visibility into every action taken.
          </p>
        </div>
        <div className="feature-card">
          <h3>Complete Audit Trail</h3>
          <p>
            Every API call logged and traceable. Meet compliance requirements
            with detailed activity records and security events.
          </p>
        </div>
        <div className="feature-card">
          <h3>Your Infrastructure</h3>
          <p>
            Service accounts and credentials stay on your servers.
            No per-user fees. No data leaving your control.
          </p>
        </div>
      </div>
    </div>
  );
}
