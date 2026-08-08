import React, { useState, useEffect } from 'react';
import { Check, CheckCircle, AlertTriangle, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { authFetch } from '../../config/api';
import './GoogleWorkspaceWizard.css'; // Reuse the same styles

interface Microsoft365WizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

const Microsoft365Wizard: React.FC<Microsoft365WizardProps> = ({
  onClose,
  onSuccess
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testDetails, setTestDetails] = useState<{ displayName?: string; userCount?: number; groupCount?: number } | null>(null);
  const [existingConfig, setExistingConfig] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);

  // Check if configuration already exists
  useEffect(() => {
    const checkExistingConfig = async () => {
      try {
        const response = await authFetch('/api/v1/microsoft/status');
        const result = await response.json();

        if (result.success && result.data.isConfigured) {
          setExistingConfig(true);
        }
      } catch (err) {
        console.error('Failed to check existing configuration:', err);
      }
    };

    checkExistingConfig();
  }, []);

  const steps = [
    { id: 1, title: 'Azure AD Setup', description: 'Create an app registration in Azure Portal' },
    { id: 2, title: 'Enter Credentials', description: 'Enter your Tenant ID, Client ID, and Secret' },
    { id: 3, title: 'Test Connection', description: 'Verify the connection to Microsoft 365' },
    { id: 4, title: 'Complete Setup', description: 'Review and complete the configuration' }
  ];

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setError('');
    setTestDetails(null);

    try {
      const response = await authFetch('/api/v1/microsoft/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          clientId,
          clientSecret
        })
      });

      const result = await response.json();

      if (result.success) {
        setTestStatus('success');
        setTestDetails(result.data.details);
      } else {
        setTestStatus('error');
        setError(result.error?.message || result.message || 'Connection test failed');
      }
    } catch (err) {
      setTestStatus('error');
      setError('Failed to test connection. Please check your settings.');
    }
  };

  const handleSaveConfiguration = async (forceOverwrite = false) => {
    // Check if config exists and we haven't asked for confirmation yet
    if (existingConfig && !forceOverwrite && !showOverwriteDialog) {
      setShowOverwriteDialog(true);
      return;
    }

    setIsLoading(true);
    setError('');
    setShowOverwriteDialog(false);

    try {
      const response = await authFetch('/api/v1/microsoft/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          clientId,
          clientSecret
        })
      });

      const result = await response.json();

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error?.message || result.message || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save configuration. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isValidGuid = (value: string) => {
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return guidRegex.test(value);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return true; // Instructions step
      case 2:
        return isValidGuid(tenantId) && isValidGuid(clientId) && clientSecret.length > 0;
      case 3:
        return testStatus === 'success';
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="gw-wizard-overlay">
      <div className="gw-wizard-container">
        <div className="gw-wizard-header">
          <h2>Microsoft 365 Setup</h2>
          <button className="gw-wizard-close" onClick={onClose}>&times;</button>
        </div>

        <div className="gw-wizard-progress">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`gw-wizard-step ${
                currentStep === step.id ? 'active' : ''
              } ${currentStep > step.id ? 'completed' : ''}`}
            >
              <div className="gw-wizard-step-number">
                {currentStep > step.id ? <Check size={16} /> : step.id}
              </div>
              <div className="gw-wizard-step-info">
                <div className="gw-wizard-step-title">{step.title}</div>
                <div className="gw-wizard-step-description">{step.description}</div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="gw-wizard-error">
            <AlertTriangle size={16} /> <span>{error}</span>
          </div>
        )}

        <div className="gw-wizard-content">
          {currentStep === 1 && (
            <div className="gw-wizard-step-content">
              <h3>Create an App Registration in Azure</h3>
              <p>Before continuing, you'll need to create an app registration in Azure Portal.</p>

              <div className="gw-wizard-info">
                <h4>Steps to create an App Registration:</h4>
                <ol>
                  <li>
                    Go to{' '}
                    <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer">
                      Azure Portal - App Registrations <ExternalLink size={12} style={{ verticalAlign: 'middle' }} />
                    </a>
                  </li>
                  <li>Click <strong>New registration</strong></li>
                  <li>Name: "Helios Admin Portal"</li>
                  <li>Supported account types: <strong>Single tenant</strong></li>
                  <li>Click <strong>Register</strong></li>
                </ol>

                <h4 style={{ marginTop: '1.5rem' }}>Required API Permissions:</h4>
                <ol>
                  <li>Go to <strong>API permissions</strong> &rarr; <strong>Add a permission</strong></li>
                  <li>Select <strong>Microsoft Graph</strong> &rarr; <strong>Application permissions</strong></li>
                  <li>Add these permissions:
                    <ul style={{ marginTop: '0.5rem' }}>
                      <li><code>User.Read.All</code> - Read all users</li>
                      <li><code>User.ReadWrite.All</code> - Create/update users</li>
                      <li><code>Group.Read.All</code> - Read all groups</li>
                      <li><code>Group.ReadWrite.All</code> - Create/update groups</li>
                      <li><code>Directory.Read.All</code> - Read directory data</li>
                    </ul>
                  </li>
                  <li>Click <strong>Grant admin consent</strong></li>
                </ol>

                <h4 style={{ marginTop: '1.5rem' }}>Create a Client Secret:</h4>
                <ol>
                  <li>Go to <strong>Certificates & secrets</strong></li>
                  <li>Click <strong>New client secret</strong></li>
                  <li>Add a description (e.g., "Helios")</li>
                  <li>Choose expiration (recommended: 24 months)</li>
                  <li>Copy the secret <strong>Value</strong> immediately (shown only once!)</li>
                </ol>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="gw-wizard-step-content">
              <h3>Enter Azure AD Credentials</h3>
              <p>Enter the details from your Azure App Registration.</p>

              <div className="gw-wizard-form">
                <div className="gw-wizard-field">
                  <label>Tenant ID (Directory ID)</label>
                  <input
                    type="text"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value.trim())}
                  />
                  <small>
                    Found in: Azure Portal &rarr; Azure Active Directory &rarr; Overview &rarr; <strong>Tenant ID</strong>
                  </small>
                  {tenantId && !isValidGuid(tenantId) && (
                    <small style={{ color: '#dc2626' }}>Invalid format. Should be a GUID like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</small>
                  )}
                </div>

                <div className="gw-wizard-field">
                  <label>Client ID (Application ID)</label>
                  <input
                    type="text"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value.trim())}
                  />
                  <small>
                    Found in: Azure Portal &rarr; App Registrations &rarr; Your App &rarr; <strong>Application (client) ID</strong>
                  </small>
                  {clientId && !isValidGuid(clientId) && (
                    <small style={{ color: '#dc2626' }}>Invalid format. Should be a GUID like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</small>
                  )}
                </div>

                <div className="gw-wizard-field">
                  <label>Client Secret</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      placeholder="Enter your client secret"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#6b7280'
                      }}
                    >
                      {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <small>
                    Created in: App Registration &rarr; Certificates & secrets &rarr; <strong>Client secrets</strong>
                  </small>
                </div>
              </div>

              <div className="gw-wizard-info" style={{ marginTop: '1.5rem', background: '#fef3c7', borderColor: '#fcd34d' }}>
                <h4 style={{ color: '#92400e' }}>Important Security Notes:</h4>
                <ul>
                  <li>Client secrets expire. Set a calendar reminder to rotate before expiration.</li>
                  <li>The secret is encrypted before storage and never displayed again.</li>
                  <li>Use the least privilege principle - only request permissions you need.</li>
                </ul>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="gw-wizard-step-content">
              <h3>Test Connection</h3>
              <p>Let's verify that we can connect to your Microsoft 365 tenant.</p>

              <div className="gw-wizard-test-section">
                <button
                  className={`gw-wizard-test-button ${testStatus}`}
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                >
                  {testStatus === 'idle' && 'Test Connection'}
                  {testStatus === 'testing' && 'Testing...'}
                  {testStatus === 'success' && <><Check size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Connection Successful</>}
                  {testStatus === 'error' && 'Retry Test'}
                </button>

                {testStatus === 'success' && testDetails && (
                  <div className="gw-wizard-test-success">
                    <h4><CheckCircle size={18} style={{ color: '#10b981', verticalAlign: 'middle', marginRight: 6 }} /> Connection Verified!</h4>
                    <p>Successfully connected to Microsoft 365</p>
                    {testDetails.displayName && <p>Organization: {testDetails.displayName}</p>}
                    <p>Tenant ID: {tenantId}</p>
                  </div>
                )}

                {testStatus === 'testing' && (
                  <div className="gw-wizard-test-progress">
                    <div className="gw-wizard-spinner"></div>
                    <p>Testing connection to Microsoft 365...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="gw-wizard-step-content">
              <h3>Complete Setup</h3>
              <p>Review your configuration and complete the setup.</p>

              <div className="gw-wizard-summary">
                <h4>Configuration Summary:</h4>
                <dl>
                  <dt>Tenant ID:</dt>
                  <dd>{tenantId}</dd>
                  <dt>Client ID:</dt>
                  <dd>{clientId}</dd>
                  <dt>Client Secret:</dt>
                  <dd>{'*'.repeat(20)} (encrypted)</dd>
                  {testDetails?.displayName && (
                    <>
                      <dt>Organization:</dt>
                      <dd>{testDetails.displayName}</dd>
                    </>
                  )}
                </dl>
              </div>

              <div className="gw-wizard-info" style={{ marginTop: '1.5rem' }}>
                <h4>What happens next:</h4>
                <ul>
                  <li>Your credentials will be encrypted and stored securely</li>
                  <li>An initial sync will begin to import users, groups, and licenses</li>
                  <li>You can manage Microsoft 365 users from the Users page</li>
                  <li>License assignment and user management will be available</li>
                </ul>
              </div>

              <div className="gw-wizard-final-actions">
                <button
                  className="gw-wizard-save-button"
                  onClick={() => handleSaveConfiguration()}
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Complete Setup'}
                </button>
              </div>

              {showOverwriteDialog && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'white',
                  border: '2px solid #ff9800',
                  borderRadius: '8px',
                  padding: '20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                  zIndex: 1000,
                  maxWidth: '400px'
                }}>
                  <h3 style={{ marginTop: 0, color: '#ff9800' }}>Configuration Already Exists</h3>
                  <p>Microsoft 365 is already configured for this organization. Do you want to overwrite the existing configuration?</p>
                  <p style={{ fontSize: '0.9em', color: '#666' }}>This will replace your current credentials and trigger a new sync.</p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <button
                      onClick={() => setShowOverwriteDialog(false)}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        background: 'white',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveConfiguration(true)}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '4px',
                        background: '#ff9800',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Yes, Overwrite
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="gw-wizard-footer">
          <button
            className="gw-wizard-button secondary"
            onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)}
            disabled={currentStep === 1}
          >
            Previous
          </button>
          <button
            className="gw-wizard-button primary"
            onClick={() => currentStep < 4 && setCurrentStep(currentStep + 1)}
            disabled={!canProceed() || currentStep === 4}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default Microsoft365Wizard;
