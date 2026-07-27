import { useState } from 'react';
import { Key, Server, Users, ArrowRight, ArrowLeft, X, CheckCircle } from 'lucide-react';
import { authFetch } from '../../config/api';
import './ApiKeyWizard.css';

interface ApiKeyWizardProps {
  organizationId: string;
  onClose: () => void;
  onSuccess: (keyData: any) => void;
}

type KeyType = 'service' | 'vendor' | null;

interface KeyConfig {
  name: string;
  description: string;
  type: KeyType;
  permissions: string[];
  expiresInDays: number | null;
  vendorConfig?: {
    vendorName: string;
    vendorContact: string;
    requiresActor: boolean;
    allowedActors?: string[];
    requiresClientReference: boolean;
  };
  serviceConfig?: {
    systemName: string;
    purpose: string;
  };
  ipWhitelist?: string[];
}

const AVAILABLE_PERMISSIONS = [
  { value: 'read:users', label: 'Read Users', description: 'View user information' },
  { value: 'write:users', label: 'Write Users', description: 'Create and update users' },
  { value: 'delete:users', label: 'Delete Users', description: 'Remove users' },
  { value: 'read:groups', label: 'Read Groups', description: 'View groups' },
  { value: 'write:groups', label: 'Write Groups', description: 'Create and update groups' },
  { value: 'delete:groups', label: 'Delete Groups', description: 'Remove groups' },
  { value: 'read:organization', label: 'Read Organization', description: 'View org settings' },
  { value: 'write:organization', label: 'Write Organization', description: 'Update org settings' },
];

export function ApiKeyWizard({ organizationId: _organizationId, onClose, onSuccess }: ApiKeyWizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [config, setConfig] = useState<KeyConfig>({
    name: '',
    description: '',
    type: null,
    permissions: [],
    expiresInDays: 365,
  });

  const handleTypeSelect = (type: KeyType) => {
    setConfig({
      ...config,
      type,
      ...(type === 'vendor' ? {
        vendorConfig: {
          vendorName: '',
          vendorContact: '',
          requiresActor: true,
          requiresClientReference: false,
        },
        expiresInDays: 90,
      } : {
        serviceConfig: {
          systemName: '',
          purpose: '',
        },
        expiresInDays: 365,
      }),
    });
    setStep(2);
  };

  const handlePermissionToggle = (permission: string) => {
    let newPermissions: string[];

    if (config.permissions.includes(permission)) {
      // Removing permission
      newPermissions = config.permissions.filter((p) => p !== permission);

      // If removing read, also remove write and delete
      if (permission === 'read:users') {
        newPermissions = newPermissions.filter((p) => p !== 'write:users' && p !== 'delete:users');
      }
      if (permission === 'read:groups') {
        newPermissions = newPermissions.filter((p) => p !== 'write:groups' && p !== 'delete:groups');
      }
      if (permission === 'write:users') {
        newPermissions = newPermissions.filter((p) => p !== 'delete:users');
      }
      if (permission === 'write:groups') {
        newPermissions = newPermissions.filter((p) => p !== 'delete:groups');
      }
    } else {
      // Adding permission
      newPermissions = [...config.permissions, permission];

      // Auto-enable dependencies
      if (permission === 'write:users' && !newPermissions.includes('read:users')) {
        newPermissions.push('read:users');
      }
      if (permission === 'delete:users') {
        if (!newPermissions.includes('read:users')) newPermissions.push('read:users');
        if (!newPermissions.includes('write:users')) newPermissions.push('write:users');
      }
      if (permission === 'write:groups' && !newPermissions.includes('read:groups')) {
        newPermissions.push('read:groups');
      }
      if (permission === 'delete:groups') {
        if (!newPermissions.includes('read:groups')) newPermissions.push('read:groups');
        if (!newPermissions.includes('write:groups')) newPermissions.push('write:groups');
      }
      if (permission === 'write:organization' && !newPermissions.includes('read:organization')) {
        newPermissions.push('read:organization');
      }
    }

    setConfig({
      ...config,
      permissions: newPermissions,
    });
  };

  const handleSubmit = async () => {
    if (config.permissions.length === 0) {
      alert('Please select at least one permission');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await authFetch('/api/v1/organization/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: config.name,
          description: config.description,
          type: config.type,
          permissions: config.permissions,
          expiresInDays: config.expiresInDays,
          serviceConfig: config.serviceConfig,
          vendorConfig: config.vendorConfig,
          ipWhitelist: config.ipWhitelist,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess(data.data);
      } else {
        alert(`Failed to create API key: ${data.error || data.message}`);
        setIsSubmitting(false);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return config.type !== null;
    if (step === 2) {
      if (!config.name.trim()) return false;
      if (config.type === 'vendor' && !config.vendorConfig?.vendorName.trim()) return false;
      if (config.type === 'service' && !config.serviceConfig?.systemName.trim()) return false;
      return true;
    }
    if (step === 3) return config.permissions.length > 0;
    return false;
  };

  return (
    <div className="api-key-wizard-overlay">
      <div className="api-key-wizard-modal">
        <div className="wizard-header">
          <div className="wizard-title">
            <Key size={20} />
            <h2>Create API Key</h2>
          </div>
          <button className="wizard-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="wizard-progress">
          <div className={`progress-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Type</div>
          </div>
          <div className="progress-line"></div>
          <div className={`progress-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Configure</div>
          </div>
          <div className="progress-line"></div>
          <div className={`progress-step ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
            <div className="step-number">3</div>
            <div className="step-label">Permissions</div>
          </div>
        </div>

        <div className="wizard-body">
          {step === 1 && (
            <div className="wizard-step">
              <h3>Select API Key Type</h3>
              <p className="step-description">Choose the type of access you want to grant</p>

              <div className="type-cards">
                <button
                  className={`type-card ${config.type === 'service' ? 'selected' : ''}`}
                  onClick={() => handleTypeSelect('service')}
                >
                  <div className="type-icon service">
                    <Server size={32} />
                  </div>
                  <h4>Service Key</h4>
                  <p>For automated systems and integrations where no human operator is involved</p>
                  <ul className="type-features">
                    <li>System-to-system automation</li>
                    <li>Scheduled jobs and webhooks</li>
                    <li>No actor attribution required</li>
                    <li>Longer expiration (1 year+)</li>
                  </ul>
                </button>

                <button
                  className={`type-card ${config.type === 'vendor' ? 'selected' : ''}`}
                  onClick={() => handleTypeSelect('vendor')}
                >
                  <div className="type-icon vendor">
                    <Users size={32} />
                  </div>
                  <h4>Vendor Key</h4>
                  <p>For third-party vendors with human operators performing actions on your behalf</p>
                  <ul className="type-features">
                    <li>MSP technicians and partners</li>
                    <li>Actor attribution required</li>
                    <li>Full audit trail of actions</li>
                    <li>Shorter expiration (90 days)</li>
                  </ul>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step">
              <h3>Configure {config.type === 'service' ? 'Service' : 'Vendor'} Key</h3>
              <p className="step-description">Provide details about this API key</p>

              <div className="wizard-form">
                <div className="form-group">
                  <label>Key Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={config.type === 'service' ? 'e.g., Automated Daily Sync' : 'e.g., GridWorx MSP Access'}
                    value={config.name}
                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  />
                  <span className="form-hint">A descriptive name for this API key</span>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Describe the purpose of this key..."
                    value={config.description}
                    onChange={(e) => setConfig({ ...config, description: e.target.value })}
                    rows={3}
                  />
                </div>

                {config.type === 'vendor' && config.vendorConfig && (
                  <>
                    <div className="form-group">
                      <label>Vendor Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g., GridWorx MSP"
                        value={config.vendorConfig.vendorName}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            vendorConfig: { ...config.vendorConfig!, vendorName: e.target.value },
                          })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Vendor Contact Email</label>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="support@vendor.com"
                        value={config.vendorConfig.vendorContact}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            vendorConfig: { ...config.vendorConfig!, vendorContact: e.target.value },
                          })
                        }
                      />
                    </div>

                    <div className="form-group checkbox-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={config.vendorConfig.requiresClientReference}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              vendorConfig: {
                                ...config.vendorConfig!,
                                requiresClientReference: e.target.checked,
                              },
                            })
                          }
                        />
                        <span>Require ticket/client reference with every request</span>
                      </label>
                      <span className="form-hint">Forces vendors to provide a ticket number or reference</span>
                    </div>
                  </>
                )}

                {config.type === 'service' && config.serviceConfig && (
                  <>
                    <div className="form-group">
                      <label>System Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g., Helios MTP, Monitoring System"
                        value={config.serviceConfig.systemName}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            serviceConfig: { ...config.serviceConfig!, systemName: e.target.value },
                          })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Purpose</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g., Sync user data every 4 hours"
                        value={config.serviceConfig.purpose}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            serviceConfig: { ...config.serviceConfig!, purpose: e.target.value },
                          })
                        }
                      />
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>Expiration</label>
                  <select
                    className="form-select"
                    value={config.expiresInDays || 0}
                    onChange={(e) => setConfig({ ...config, expiresInDays: parseInt(e.target.value) || null })}
                  >
                    <option value="30">30 days</option>
                    <option value="90">90 days {config.type === 'vendor' && '(Recommended)'}</option>
                    <option value="180">180 days</option>
                    <option value="365">1 year {config.type === 'service' && '(Recommended)'}</option>
                    {config.type === 'service' && <option value="0">Never expire</option>}
                  </select>
                  <span className="form-hint">Keys can be renewed before expiration</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-step">
              <h3>Select Permissions</h3>
              <p className="step-description">Choose what actions this API key can perform</p>

              <div className="permissions-grid">
                {AVAILABLE_PERMISSIONS.map((permission) => (
                  <label key={permission.value} className="permission-card">
                    <input
                      type="checkbox"
                      checked={config.permissions.includes(permission.value)}
                      onChange={() => handlePermissionToggle(permission.value)}
                    />
                    <div className="permission-info">
                      <div className="permission-label">{permission.label}</div>
                      <div className="permission-description">{permission.description}</div>
                    </div>
                    {config.permissions.includes(permission.value) && (
                      <CheckCircle size={18} className="permission-check" />
                    )}
                  </label>
                ))}
              </div>

              <div className="permissions-summary">
                <span className="summary-label">Selected:</span>
                <span className="summary-count">{config.permissions.length} permission{config.permissions.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          <div className="footer-left">
            {step > 1 && (
              <button className="btn-secondary" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} />
                Back
              </button>
            )}
          </div>
          <div className="footer-right">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            {step < 3 ? (
              <button
                className="btn-primary"
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!canProceed() || isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create API Key'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
