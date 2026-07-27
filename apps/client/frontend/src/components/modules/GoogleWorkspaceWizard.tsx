import React, { useState, useEffect } from 'react';
import { Check, CheckCircle, FileUp, AlertTriangle } from 'lucide-react';
import { authFetch } from '../../config/api';
import './GoogleWorkspaceWizard.css';

interface ServiceAccountData {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface GoogleWorkspaceWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

const GoogleWorkspaceWizard: React.FC<GoogleWorkspaceWizardProps> = ({
  onClose,
  onSuccess
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [serviceAccountFile, setServiceAccountFile] = useState<File | null>(null);
  const [serviceAccountData, setServiceAccountData] = useState<ServiceAccountData | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [existingConfig, setExistingConfig] = useState<boolean>(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);

  // Check if configuration already exists and pre-populate domain
  useEffect(() => {
    const checkExistingConfig = async () => {
      try {
        const orgData = localStorage.getItem('helios_organization');
        const parsedOrgData = orgData ? JSON.parse(orgData) : null;
        const organizationId = parsedOrgData?.organizationId || parsedOrgData?.id;

        // Pre-populate domain from organization data
        if (parsedOrgData?.domain && !domain) {
          setDomain(parsedOrgData.domain);
        }

        if (organizationId) {
          const response = await authFetch(`/api/v1/google-workspace/module-status/${organizationId}`);
          const result = await response.json();

          if (result.success && result.data.isEnabled && result.data.configuration) {
            setExistingConfig(true);
          }
        }
      } catch (err) {
        console.error('Failed to check existing configuration:', err);
      }
    };

    checkExistingConfig();
  }, []);

  const steps = [
    { id: 1, title: 'Upload Service Account', description: 'Upload your Google Cloud service account JSON key file' },
    { id: 2, title: 'Configure Domain', description: 'Set your Google Workspace domain and admin email' },
    { id: 3, title: 'Test Connection', description: 'Verify the connection to Google Workspace' },
    { id: 4, title: 'Complete Setup', description: 'Review and complete the configuration' }
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setServiceAccountFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);

        // Validate required fields
        const requiredFields = [
          'type', 'project_id', 'private_key_id', 'private_key',
          'client_email', 'client_id', 'auth_uri', 'token_uri'
        ];

        const missingFields = requiredFields.filter(field => !json[field]);
        if (missingFields.length > 0) {
          setError(`Invalid service account file. Missing fields: ${missingFields.join(', ')}`);
          setServiceAccountFile(null);
          return;
        }

        setServiceAccountData(json);
        // Domain is pre-populated from organization data on component mount
        // No need to set it here again
      } catch (err) {
        setError('Invalid JSON file. Please upload a valid service account key file.');
        setServiceAccountFile(null);
      }
    };
    reader.readAsText(file);
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setError('');

    try {
      const response = await authFetch('/api/v1/google-workspace/test-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceAccount: serviceAccountData,
          adminEmail,
          domain
        })
      });

      const result = await response.json();

      if (result.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setError(result.error || result.message || 'Connection test failed');
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
      const orgData = localStorage.getItem('helios_organization');
      const parsedOrgData = orgData ? JSON.parse(orgData) : {};

      const response = await authFetch('/api/v1/google-workspace/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credentials: serviceAccountData,
          adminEmail,
          domain,
          organizationId: parsedOrgData.organizationId || parsedOrgData.id || null,
          organizationName: parsedOrgData.organizationName || parsedOrgData.name || ''
        })
      });

      const result = await response.json();

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save configuration. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return serviceAccountData !== null;
      case 2:
        return adminEmail && domain && adminEmail.includes('@');
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
          <h2>Google Workspace Setup</h2>
          <button className="gw-wizard-close" onClick={onClose}>×</button>
        </div>

        <div className="gw-wizard-progress">
          {steps.map((step, _index) => (
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
              <h3>Upload Service Account Key</h3>
              <p>Upload the JSON key file for your Google Cloud service account with domain-wide delegation enabled.</p>

              <div className="gw-wizard-upload-area">
                <input
                  type="file"
                  id="service-account-file"
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <label htmlFor="service-account-file" className="gw-wizard-upload-label">
                  {serviceAccountFile ? (
                    <div>
                      <p><CheckCircle size={16} style={{ color: '#10b981', verticalAlign: 'middle', marginRight: 4 }} /> File uploaded: {serviceAccountFile.name}</p>
                      {serviceAccountData && (
                        <p className="gw-wizard-file-info">
                          Service Account: {serviceAccountData.client_email}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p><FileUp size={20} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Click to upload JSON key file</p>
                      <p className="gw-wizard-upload-hint">or drag and drop</p>
                    </div>
                  )}
                </label>
              </div>

              <div className="gw-wizard-info">
                <h4>How to create a service account:</h4>
                <ol>
                  <li>Go to Google Cloud Console</li>
                  <li>Create a new service account or use existing</li>
                  <li>Enable domain-wide delegation</li>
                  <li>Download the JSON key file</li>
                  <li>Configure admin SDK API access in Google Workspace</li>
                </ol>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="gw-wizard-step-content">
              <h3>Configure Domain Settings</h3>
              <p>Enter your Google Workspace domain and the email of a super admin account.</p>

              <div className="gw-wizard-form">
                <div className="gw-wizard-field">
                  <label>Google Workspace Domain</label>
                  <input
                    type="text"
                    placeholder="example.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                  <small>Your organization's Google Workspace domain</small>
                </div>

                <div className="gw-wizard-field">
                  <label>Admin Email Address</label>
                  <input
                    type="email"
                    placeholder="admin@example.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                  />
                  <small>Email of a Google Workspace super admin account</small>
                </div>
              </div>

              <div className="gw-wizard-info">
                <h4>Important:</h4>
                <ul>
                  <li>The admin email must be a super admin in Google Workspace</li>
                  <li>Domain-wide delegation must be configured for this service account</li>
                  <li>Required API scopes must be authorized in Google Workspace Admin</li>
                </ul>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="gw-wizard-step-content">
              <h3>Test Connection</h3>
              <p>Let's verify that we can connect to your Google Workspace domain.</p>

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

                {testStatus === 'success' && (
                  <div className="gw-wizard-test-success">
                    <h4><CheckCircle size={18} style={{ color: '#10b981', verticalAlign: 'middle', marginRight: 6 }} /> Connection Verified!</h4>
                    <p>Successfully connected to Google Workspace domain: {domain}</p>
                    <p>Service Account: {serviceAccountData?.client_email}</p>
                    <p>Admin Email: {adminEmail}</p>
                  </div>
                )}

                {testStatus === 'testing' && (
                  <div className="gw-wizard-test-progress">
                    <div className="gw-wizard-spinner"></div>
                    <p>Testing connection to Google Workspace...</p>
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
                  <dt>Domain:</dt>
                  <dd>{domain}</dd>
                  <dt>Admin Email:</dt>
                  <dd>{adminEmail}</dd>
                  <dt>Service Account:</dt>
                  <dd>{serviceAccountData?.client_email}</dd>
                  <dt>Project ID:</dt>
                  <dd>{serviceAccountData?.project_id}</dd>
                </dl>
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
                  <h3 style={{ marginTop: 0, color: '#ff9800' }}>⚠️ Configuration Already Exists</h3>
                  <p>Google Workspace is already configured for this organization. Do you want to overwrite the existing configuration?</p>
                  <p style={{ fontSize: '0.9em', color: '#666' }}>This will replace your current service account and settings.</p>
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

export default GoogleWorkspaceWizard;