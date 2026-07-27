import { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { themeService, availableThemes, type ThemeName } from '../services/theme.service';
import './AccountSetup.css';

interface AccountSetupProps {
  onComplete: (autoLogin?: { token: string; user: any; organization: any }) => void;
}

export function AccountSetup({ onComplete }: AccountSetupProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>('helios-purple');

  const [formData, setFormData] = useState({
    organizationName: '',
    domain: '',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: ''
  });

  const handleThemeSelect = (themeId: ThemeName) => {
    setSelectedTheme(themeId);
    // Apply theme immediately for preview
    themeService.setInitialTheme(themeId);
  };

  const handleSubmit = async () => {
    if (!formData.organizationName || !formData.domain || !formData.adminFirstName ||
        !formData.adminLastName || !formData.adminEmail || !formData.adminPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (formData.adminPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (formData.adminPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[Setup] Starting organization setup...');

      const response = await fetch('/api/v1/organization/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: formData.organizationName,
          organizationDomain: formData.domain,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          adminFirstName: formData.adminFirstName,
          adminLastName: formData.adminLastName
        })
      });

      console.log('[Setup] Response status:', response.status);

      const data = await response.json();
      console.log('[Setup] Response data:', data);

      if (!response.ok) {
        throw new Error(data.error?.message || data.error || data.message || 'Setup failed');
      }

      if (!data.success) {
        throw new Error(data.error?.message || data.message || 'Setup failed');
      }

      // Validate response structure
      if (!data.data?.organization || !data.data?.admin) {
        console.error('[Setup] Invalid response structure:', data);
        throw new Error('Invalid server response - missing organization or admin data');
      }

      // Store the organization info for UI purposes (non-sensitive metadata)
      localStorage.setItem('helios_organization', JSON.stringify({
        organizationId: data.data.organization.id,
        organizationName: data.data.organization.name,
        domain: data.data.organization.domain
      }));

      // Save the selected theme
      localStorage.setItem('helios_theme', selectedTheme);

      console.log('[Setup] Setup complete, calling onComplete...');

      // Auto-login with the returned token and navigate to dashboard
      onComplete({
        token: data.data.token,
        user: data.data.admin,
        organization: data.data.organization
      });
    } catch (err: any) {
      console.error('[Setup] Error:', err);
      setError(err.message || 'Setup failed. Please check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-setup-container">
      <div className="account-setup-card">
        <div className="account-setup-header">
          <h1>🚀 Welcome to Helios Admin Portal</h1>
          <p>Set up your organization and admin account</p>
        </div>

        <div className="setup-progress">
          <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Organization</div>
          </div>
          <div className={`progress-line ${step >= 2 ? 'active' : ''}`}></div>
          <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Admin Account</div>
          </div>
          <div className={`progress-line ${step >= 3 ? 'active' : ''}`}></div>
          <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
            <div className="step-number">3</div>
            <div className="step-label">Theme</div>
          </div>
        </div>

        <div className="account-setup-body">
          {error && (
            <div className="setup-error">⚠️ {error}</div>
          )}

          {step === 1 && (
            <div className="setup-step">
              <h2>Organization Information</h2>
              <p className="step-description">
                Tell us about your organization to personalize your admin portal
              </p>

              <div className="form-group">
                <label>Organization Name</label>
                <input
                  type="text"
                  value={formData.organizationName}
                  onChange={e => setFormData({...formData, organizationName: e.target.value})}
                  placeholder="Acme Corporation"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Primary Domain</label>
                <input
                  type="text"
                  value={formData.domain}
                  onChange={e => setFormData({...formData, domain: e.target.value})}
                  placeholder="acme.com"
                />
                <div className="form-hint">
                  This will be used for Google Workspace integration and user management
                </div>
              </div>

              <div className="info-box">
                <strong>📋 What's Next?</strong>
                <p>
                  After setup, you'll be able to enable Google Workspace integration
                  to sync users, groups, and organizational units from your dashboard settings.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="setup-step">
              <h2>Create Admin Account</h2>
              <p className="step-description">
                Create your administrator account to manage this portal
              </p>

              <div className="form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={formData.adminFirstName}
                    onChange={e => setFormData({...formData, adminFirstName: e.target.value})}
                    placeholder="John"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={formData.adminLastName}
                    onChange={e => setFormData({...formData, adminLastName: e.target.value})}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={formData.adminEmail}
                  onChange={e => setFormData({...formData, adminEmail: e.target.value})}
                  placeholder="admin@acme.com"
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={formData.adminPassword}
                  onChange={e => setFormData({...formData, adminPassword: e.target.value})}
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                  placeholder="Re-enter your password"
                />
              </div>

              <div className="info-box">
                <strong>🔒 Admin Privileges</strong>
                <p>
                  This account will have full access to manage modules, users, and settings.
                  You can invite additional users with different permission levels later.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="setup-step">
              <h2>Choose Your Theme</h2>
              <p className="step-description">
                Select a color theme for your admin portal. You can change this later in Settings.
              </p>

              <div className="theme-grid">
                {availableThemes.map((theme) => (
                  <button
                    key={theme.id}
                    className={`theme-card ${selectedTheme === theme.id ? 'selected' : ''}`}
                    onClick={() => handleThemeSelect(theme.id)}
                    type="button"
                  >
                    <div className={`theme-preview theme-preview-${theme.id}`}>
                      <div className="theme-preview-header"></div>
                      <div className="theme-preview-content">
                        <div className="theme-preview-sidebar"></div>
                        <div className="theme-preview-card"></div>
                      </div>
                    </div>
                    <div className="theme-card-info">
                      <div className="theme-card-name">
                        {theme.name}
                        {selectedTheme === theme.id && (
                          <span className="theme-check">
                            <Check size={14} />
                          </span>
                        )}
                      </div>
                      <div className="theme-card-description">{theme.description}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="info-box">
                <strong><Palette size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />Theme Preview</strong>
                <p>
                  The theme is applied live as you select. Choose the one that best fits your organization's style.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="account-setup-footer">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="btn-secondary"
              disabled={loading}
            >
              Back
            </button>
          )}

          {step === 1 && (
            <button
              onClick={() => {
                if (!formData.organizationName || !formData.domain) {
                  setError('Please fill in organization information');
                  return;
                }
                setError(null);
                setStep(2);
              }}
              className="btn-primary"
            >
              Next
            </button>
          )}

          {step === 2 && (
            <button
              onClick={() => {
                if (!formData.adminFirstName || !formData.adminLastName ||
                    !formData.adminEmail || !formData.adminPassword) {
                  setError('Please fill in all fields');
                  return;
                }
                if (formData.adminPassword.length < 8) {
                  setError('Password must be at least 8 characters');
                  return;
                }
                if (formData.adminPassword !== formData.confirmPassword) {
                  setError('Passwords do not match');
                  return;
                }
                setError(null);
                setStep(3);
              }}
              className="btn-primary"
            >
              Next
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleSubmit}
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Complete Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}