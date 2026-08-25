import React, { useState, useEffect } from 'react';
import { Check, CheckCircle, FileUp, AlertTriangle, Copy, ExternalLink, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { authFetch } from '../../config/api';
import { HelpWidget } from '../ai/HelpWidget';
import './GoogleWorkspaceWizard.css';

interface DelegationInfo {
  requiredScopes: string[];
  requiredScopesCsv: string;
  scopeDetails: { scope: string; reason: string }[];
}

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
  const [delegationInfo, setDelegationInfo] = useState<DelegationInfo | null>(null);
  const [scopesExpanded, setScopesExpanded] = useState(false);
  const [scopesCopied, setScopesCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  // Load the canonical scope list from the backend so the setup screen always
  // shows exactly what the code requests (see backend config/google-scopes.ts).
  useEffect(() => {
    authFetch('/api/google-workspace/delegation-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.requiredScopes && d?.requiredScopesCsv) {
          setDelegationInfo({
            requiredScopes: d.requiredScopes,
            requiredScopesCsv: d.requiredScopesCsv,
            scopeDetails: d.scopeDetails || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleCopyScopes = async () => {
    if (!delegationInfo) return;
    try {
      await navigator.clipboard.writeText(delegationInfo.requiredScopesCsv);
      setScopesCopied(true);
      setTimeout(() => setScopesCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the scopes are still shown below to copy manually */
    }
  };

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

          // Stored credentials (even for a disabled module) mean saving will
          // overwrite an existing configuration — warn before doing so.
          if (result.success && (result.data.hasCredentials || (result.data.isEnabled && result.data.configuration))) {
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
        // Show an explicit success screen instead of silently closing the
        // modal, so the admin gets confirmation that the module is now enabled
        // and the initial sync has started.
        setSetupComplete(true);
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
          <button className="gw-wizard-close" onClick={setupComplete ? onSuccess : onClose}>×</button>
        </div>

        {setupComplete ? (
          <div className="gw-wizard-content">
            <div className="gw-wizard-step-content gw-wizard-success">
              <CheckCircle size={56} style={{ color: '#10b981', display: 'block', margin: '8px auto 16px' }} />
              <h3 style={{ textAlign: 'center', margin: '0 0 8px' }}>Module enabled</h3>
              <p style={{ textAlign: 'center', color: '#4b5563', maxWidth: 460, margin: '0 auto 8px' }}>
                Google Workspace is now active. The initial sync has started — your
                team members will appear in the Directory in a few minutes.
              </p>
              <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, maxWidth: 460, margin: '0 auto 24px' }}>
                Domain <strong>{domain}</strong>{adminEmail ? <> · Admin <strong>{adminEmail}</strong></> : null}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button className="gw-wizard-save-button" onClick={onSuccess}>Go to Modules</button>
              </div>
            </div>
          </div>
        ) : (
        <>
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

              {delegationInfo && (
                <div className="gw-wizard-info">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>Authorize API scopes</h4>
                    <button
                      type="button"
                      onClick={() => setHelpOpen(true)}
                      title="Help with authorizing API scopes"
                      aria-label="Help with authorizing API scopes"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, color: '#8b5cf6', cursor: 'pointer', fontSize: 12 }}
                    >
                      <HelpCircle size={14} />
                      Help
                    </button>
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4b5563' }}>
                    Authorize this service account for the {delegationInfo.requiredScopes.length} scopes Helios uses.
                    Authorizing fewer will make some features silently fail.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={handleCopyScopes}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13 }}
                    >
                      {scopesCopied ? <Check size={15} /> : <Copy size={15} />}
                      {scopesCopied ? 'Copied' : 'Copy scopes'}
                    </button>
                    {serviceAccountData?.client_id && (
                      <a
                        href={`https://admin.google.com/ac/owl/domainwidedelegation?clientIdToAdd=${encodeURIComponent(serviceAccountData.client_id)}&clientScopeToAdd=${encodeURIComponent(delegationInfo.requiredScopesCsv)}&overwriteClientId=false`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #8b5cf6', borderRadius: 6, background: '#8b5cf6', color: '#fff', textDecoration: 'none', fontSize: 13 }}
                      >
                        <ExternalLink size={15} />
                        Open pre-filled authorization
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setScopesExpanded((v) => !v)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', padding: 0, fontSize: 13 }}
                  >
                    {scopesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {scopesExpanded ? 'Hide' : 'Show'} the {delegationInfo.requiredScopes.length} scopes and why each is needed
                  </button>
                  {scopesExpanded && (
                    <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
                      {delegationInfo.scopeDetails.map((s) => (
                        <li key={s.scope} style={{ marginBottom: 10 }}>
                          <code style={{ fontSize: 11, color: '#374151', wordBreak: 'break-all' }}>
                            {s.scope.replace('https://www.googleapis.com/auth/', '')}
                          </code>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.reason}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
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
                    <h4><CheckCircle size={16} style={{ color: '#10b981', verticalAlign: 'middle', marginRight: 6 }} /> Connection Verified!</h4>
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
                  border: '2px solid var(--color-warning)',
                  borderRadius: '8px',
                  padding: '20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                  zIndex: 1000,
                  maxWidth: '400px'
                }}>
                  <h3 style={{ marginTop: 0, color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={20} /> Configuration Already Exists</h3>
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
                        background: 'var(--color-warning)',
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
        </>
        )}
      </div>

      <HelpWidget
        currentPage="settings"
        subContext="google-workspace"
        hideFloatingButton
        externalOpen={helpOpen}
        onExternalClose={() => setHelpOpen(false)}
      />
    </div>
  );
};

export default GoogleWorkspaceWizard;