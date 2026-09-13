import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Settings.css';
import { Administrators } from './Administrators';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import { RolesManagement } from './RolesManagement';
import { ThemeSelector } from './ThemeSelector';
import GoogleWorkspaceWizard from './modules/GoogleWorkspaceWizard';
import Microsoft365Wizard from './modules/Microsoft365Wizard';
import { AISettings } from './settings/AISettings';
import { ApiKeyList } from './integrations/ApiKeyList';
import { ApiKeyWizard } from './integrations/ApiKeyWizard';
import { ApiKeyShowOnce } from './integrations/ApiKeyShowOnce';
import { MasterDataSection } from './settings/MasterDataSection';
import { TrackingSettings } from './settings/TrackingSettings';
import { FeatureFlagsSettings } from './settings/FeatureFlagsSettings';
import { RelayAccessSettings } from './settings/RelayAccessSettings';
import { EntityLabelSettings } from './settings/EntityLabelSettings';
import { LicenseLimitsSection } from './LicenseLimitsSection';
import { useTabPersistence } from '../hooks/useTabPersistence';
import { Package, Building2, Shield, Lock, Palette, Settings as SettingsIcon, Key, Search as SearchIcon, RefreshCw, BarChart3, Info, MoreVertical, Power, Database, Bot, ToggleLeft, Link, Book, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { authFetch } from '../config/api';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface SettingsProps {
  organizationName: string;
  domain: string;
  organizationId: string;
  showPasswordModal?: boolean;
  onPasswordModalChange?: (show: boolean) => void;
  currentUser?: any;
  onAIConfigChange?: () => void;
}

interface ModuleStatus {
  isEnabled: boolean;
  hasCredentials?: boolean;
  isConfigured?: boolean;
  userCount: number;
  lastSync: string | null;
  configuration: any;
  updatedAt?: string;
}

type SettingsTabId = 'modules' | 'organization' | 'roles' | 'security' | 'customization' | 'masterdata' | 'ai' | 'advanced';

/**
 * Settings tabs and the feature flag behind each (flags: backend
 * config/feature-registry.ts). `core.settings` tabs are always present.
 */
const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string; icon: LucideIcon; flag: string }> = [
  { id: 'modules', label: 'Google Workspace', icon: Package, flag: 'core.settings' },
  { id: 'organization', label: 'Organization', icon: Building2, flag: 'core.settings' },
  { id: 'roles', label: 'Roles & Admins', icon: Shield, flag: 'core.settings' },
  { id: 'security', label: 'Security', icon: Lock, flag: 'core.settings' },
  { id: 'customization', label: 'Customization', icon: Palette, flag: 'settings.customization' },
  { id: 'masterdata', label: 'Master Data', icon: Database, flag: 'settings.master_data' },
  { id: 'ai', label: 'AI Assistant', icon: Bot, flag: 'settings.ai_assistant' },
  { id: 'advanced', label: 'Advanced', icon: SettingsIcon, flag: 'core.settings' },
];

export function Settings({ organizationName, domain, organizationId, showPasswordModal: externalShowPasswordModal, onPasswordModalChange, currentUser, onAIConfigChange }: SettingsProps) {
  const [storedTab, setActiveTab] = useTabPersistence<SettingsTabId | 'integrations' | 'features'>('helios_settings_tab', 'modules');
  const { isEnabled } = useFeatureFlags();
  const navigate = useNavigate();
  const visibleTabs = SETTINGS_TABS.filter(t => isEnabled(t.flag));
  // API keys and feature flags used to have their own tabs; both now live in
  // Advanced. A tab whose flag is off falls back to the first tab.
  const requestedTab: SettingsTabId = storedTab === 'integrations' || storedTab === 'features' ? 'advanced' : storedTab;
  const activeTab: SettingsTabId = visibleTabs.some(t => t.id === requestedTab) ? requestedTab : 'modules';
  const [showModuleConfig, setShowModuleConfig] = useState(false);
  const [configuringModule, setConfiguringModule] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Organization editing state
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [editedOrgName, setEditedOrgName] = useState(organizationName);
  const [editedDomain, setEditedDomain] = useState(domain);
  const [savingOrg, setSavingOrg] = useState(false);

  // Sync settings state
  const DEFAULT_OWNERSHIP: Record<string, 'google' | 'helios'> = {
    jobTitle: 'google', department: 'google', manager: 'google', mobilePhone: 'google', workPhone: 'google', location: 'google',
  };
  const [syncSettings, setSyncSettings] = useState({
    syncInterval: '900',
    autoSyncEnabled: true,
    deletionPolicy: 'delete',
    fieldOwnership: DEFAULT_OWNERSHIP,
  });
  const [originalSyncSettings, setOriginalSyncSettings] = useState({
    syncInterval: '900',
    autoSyncEnabled: true,
    deletionPolicy: 'delete',
    fieldOwnership: DEFAULT_OWNERSHIP,
  });

  // Load the SAVED settings. There used to be no load at all, so the page always
  // showed these defaults whatever had been saved.
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/v1/organization/sync-settings');
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success && data.data) {
          const loaded = {
            syncInterval: String(data.data.intervalSeconds),
            autoSyncEnabled: !!data.data.autoSyncEnabled,
            deletionPolicy: data.data.deletionDefault,
            fieldOwnership: { ...DEFAULT_OWNERSHIP, ...(data.data.fieldOwnership || {}) },
          };
          setSyncSettings(loaded);
          setOriginalSyncSettings(loaded);
        }
      } catch {
        // Keep the defaults on screen; the save path reports its own errors.
      }
    })();
  }, []);
  const [savingSyncSettings, setSavingSyncSettings] = useState(false);
  const syncSettingsChanged = JSON.stringify(syncSettings) !== JSON.stringify(originalSyncSettings);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Sync external password modal state
  useEffect(() => {
    if (externalShowPasswordModal !== undefined) {
      setShowPasswordModal(externalShowPasswordModal);
      if (externalShowPasswordModal) {
        setActiveTab('security');
      }
    }
  }, [externalShowPasswordModal]);
  const [googleWorkspaceStatus, setGoogleWorkspaceStatus] = useState<ModuleStatus>({
    isEnabled: false,
    userCount: 0,
    lastSync: null,
    configuration: null
  });
  const [microsoftStatus, setMicrosoftStatus] = useState<{
    isConfigured: boolean;
    isActive: boolean;
    syncStatus: string;
    lastSyncAt: string | null;
    stats: { users: number; groups: number; licenses: number };
  }>({
    isConfigured: false,
    isActive: false,
    syncStatus: 'not_configured',
    lastSyncAt: null,
    stats: { users: 0, groups: 0, licenses: 0 }
  });
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  
  const [showApiKeyWizard, setShowApiKeyWizard] = useState(false);
  const [newApiKeyData, setNewApiKeyData] = useState<any>(null);
  const [showModuleMenu, setShowModuleMenu] = useState(false);
  const [showDisableGoogleConfirm, setShowDisableGoogleConfirm] = useState(false);
  const [enablingGoogle, setEnablingGoogle] = useState(false);

  // Fetch module status on component mount
  useEffect(() => {
    fetchModuleStatus();
  }, [organizationId]);

  const fetchModuleStatus = async () => {
    try {
      setIsLoadingStatus(true);

      // Fetch both Google and Microsoft status in parallel
      const [gwResponse, msResponse] = await Promise.all([
        authFetch(`/api/v1/google-workspace/module-status/${organizationId}`),
        authFetch('/api/v1/microsoft/status')
      ]);

      const gwData = await gwResponse.json();
      if (gwData.success) {
        setGoogleWorkspaceStatus(gwData.data);
      }

      const msData = await msResponse.json();
      if (msData.success) {
        setMicrosoftStatus(msData.data);
      }
    } catch (error) {
      console.error('Failed to fetch module status:', error);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Enable Google Workspace using credentials that are ALREADY stored, without
  // re-opening the full setup wizard (which would demand the service-account key
  // again). Used when the module is disabled but configuration exists.
  const enableGoogleWorkspaceFromStoredCredentials = async () => {
    try {
      setEnablingGoogle(true);
      const response = await authFetch('/api/v1/google-workspace/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId })
      });
      const data = await response.json();
      if (data.success) {
        await fetchModuleStatus();
      } else if (response.status === 400) {
        // Credentials turned out to be missing — fall back to the setup wizard.
        setConfiguringModule('google-workspace');
        setShowModuleConfig(true);
      } else {
        alert(`Failed to enable Google Workspace: ${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert(`Failed to enable Google Workspace: ${error.message}`);
    } finally {
      setEnablingGoogle(false);
    }
  };

  const saveOrganization = async () => {
    try {
      setSavingOrg(true);
      const response = await authFetch('/api/v1/organization/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editedOrgName,
          domain: editedDomain
        })
      });

      if (response.ok) {
        setIsEditingOrg(false);
        // The shell restores the organization name/domain from this stored copy
        // on load, so refresh it from the saved record before reloading.
        const saved = (await response.json())?.data;
        try {
          const stored = JSON.parse(localStorage.getItem('helios_organization') || '{}');
          localStorage.setItem('helios_organization', JSON.stringify({
            ...stored,
            organizationName: saved?.name ?? editedOrgName,
            domain: saved?.domain ?? editedDomain,
          }));
        } catch {
          // Storage unavailable: the reload still shows the server copy after sign-in.
        }
        window.location.reload();
      } else {
        console.error('Failed to save organization settings');
      }
    } catch (error) {
      console.error('Failed to save organization settings:', error);
    } finally {
      setSavingOrg(false);
    }
  };

  const saveSyncSettings = async () => {
    try {
      setSavingSyncSettings(true);
      const response = await authFetch('/api/v1/organization/sync-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          intervalSeconds: Number(syncSettings.syncInterval),
          autoSyncEnabled: syncSettings.autoSyncEnabled,
          deletionDefault: syncSettings.deletionPolicy,
          fieldOwnership: syncSettings.fieldOwnership,
        })
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        setOriginalSyncSettings({ ...syncSettings });
        alert('Sync settings saved. The new schedule is already in effect.');
      } else {
        alert(`Failed to save sync settings: ${data.error || response.status}`);
      }
    } catch (error) {
      console.error('Failed to save sync settings:', error);
      alert('Failed to save sync settings');
    } finally {
      setSavingSyncSettings(false);
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        <p>Manage your organization's configuration and modules</p>
      </div>

      <div className="settings-layout">
        <div className="settings-sidebar">
          <nav className="settings-nav">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  data-testid={`settings-tab-${tab.id}`}
                >
                  <Icon className="nav-icon" size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="settings-content">
          {activeTab === 'modules' && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Google Workspace</h2>
                <p>Connect and sync the Google Workspace this installation manages</p>
              </div>

              <div className="modules-grid">
                <div className="module-card">
                  <div className="module-header">
                    <div className="module-info">
                      <div className="module-icon"><Package size={24} /></div>
                      <div className="module-details">
                        <h3>Google Workspace</h3>
                        <p>Manage users, groups, and settings</p>
                        {googleWorkspaceStatus.isEnabled && (
                          <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '4px' }}>
                            {googleWorkspaceStatus.userCount} user{googleWorkspaceStatus.userCount !== 1 ? 's' : ''} synced
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="module-status">
                      {isLoadingStatus ? (
                        <span className="status-badge" style={{ backgroundColor: '#f0f0f0', color: '#666' }}>Loading...</span>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Connection Status Indicator */}
                            {googleWorkspaceStatus.isEnabled && (
                              <div
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: googleWorkspaceStatus.configuration ? 'var(--color-success)' : 'var(--color-warning)',
                                  animation: googleWorkspaceStatus.configuration ? 'none' : 'pulse 2s infinite',
                                  boxShadow: googleWorkspaceStatus.configuration ? '0 0 5px rgba(16, 185, 129,0.5)' : '0 0 5px rgba(245, 158, 11,0.5)'
                                }}
                                title={googleWorkspaceStatus.configuration ? 'Connected' : 'Not configured'}
                              />
                            )}
                            <span className={`status-badge ${googleWorkspaceStatus.isEnabled ? 'enabled' : 'disabled'}`}>
                              {googleWorkspaceStatus.isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          {!googleWorkspaceStatus.isEnabled && (
                            googleWorkspaceStatus.hasCredentials ? (
                              // Credentials already exist — enable in place and
                              // offer reconfigure, rather than re-running setup.
                              <div className="module-actions">
                                <button
                                  className="enable-btn"
                                  disabled={enablingGoogle}
                                  onClick={enableGoogleWorkspaceFromStoredCredentials}
                                  title="Enable using your existing Google Workspace credentials"
                                >
                                  {enablingGoogle ? 'Enabling…' : 'Enable'}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    setConfiguringModule('google-workspace');
                                    setShowModuleConfig(true);
                                  }}
                                  title="Upload a new service-account key and reconfigure"
                                >
                                  <SettingsIcon size={14} /> Reconfigure
                                </button>
                              </div>
                            ) : (
                              <button
                                className="enable-btn"
                                onClick={() => {
                                  setConfiguringModule('google-workspace');
                                  setShowModuleConfig(true);
                                }}
                              >
                                Enable
                              </button>
                            )
                          )}
                          {googleWorkspaceStatus.isEnabled && (
                            <div className="module-actions">
                              <button
                                className="btn btn-info"
                                onClick={async () => {
                                  try {
                                    const response = await authFetch('/api/v1/google-workspace/sync-now', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json'
                                      },
                                      body: JSON.stringify({ organizationId })
                                    });

                                    const data = await response.json();
                                    if (data.success) {
                                      alert(`Sync complete!\n\nTotal users: ${data.stats?.total_users || 0}\nActive: ${data.stats?.active_users || 0}\nSuspended: ${data.stats?.suspended_users || 0}\nAdmins: ${data.stats?.admin_users || 0}`);
                                      await fetchModuleStatus();
                                    } else {
                                      alert(`Sync failed: ${data.message}`);
                                    }
                                  } catch (error: any) {
                                    alert(`Sync failed: ${error.message}`);
                                  }
                                }}
                              >
                                <RefreshCw size={14} /> Sync Now
                              </button>
                              <button
                                className="btn btn-success"
                                onClick={async () => {
                                  try {
                                    const response = await authFetch('/api/v1/google-workspace/test-connection', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json'
                                      },
                                      body: JSON.stringify({ organizationId, domain })
                                    });

                                    const data = await response.json();
                                    if (data.success) {
                                      alert(`Connection successful!\n\nProject: ${data.details?.projectId}\nDomain: ${data.details?.domain}\nUsers accessible: ${data.details?.userCount || 0}`);
                                    } else {
                                      alert(`Connection failed: ${data.message || data.error}`);
                                    }
                                  } catch (error: any) {
                                    alert(`Test failed: ${error.message}`);
                                  }
                                }}
                              >
                                <SearchIcon size={14} /> Test
                              </button>
                              <button
                                className="btn btn-secondary"
                                onClick={() => {
                                  setConfiguringModule('google-workspace');
                                  setShowModuleConfig(true);
                                }}
                              >
                                <SettingsIcon size={14} /> Configure
                              </button>
                              <div className="module-more-menu">
                                <button
                                  className="module-more-btn"
                                  onClick={() => setShowModuleMenu(!showModuleMenu)}
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {showModuleMenu && (
                                  <div className="module-more-dropdown">
                                    <button
                                      className="danger"
                                      onClick={() => {
                                        setShowModuleMenu(false);
                                        setShowDisableGoogleConfirm(true);
                                      }}
                                    >
                                      <Power size={14} /> Disable Module
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="module-description">
                    <p>Connect your Google Workspace to manage users, groups, organizational units, and automate user lifecycle operations.</p>
                    <div className="module-features">
                      <span className="feature-tag">User Management</span>
                      <span className="feature-tag">Group Management</span>
                      <span className="feature-tag">Domain-Wide Delegation</span>
                      <span className="feature-tag">Automation</span>
                    </div>
                    {googleWorkspaceStatus.isEnabled && (
                      <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: '600', marginBottom: '6px' }}>
                          Configuration Details:
                        </div>
                        {googleWorkspaceStatus.configuration?.projectId && (
                          <div style={{ fontSize: '0.75rem', color: '#166534', marginBottom: '4px' }}>
                            <strong>Project ID:</strong> <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '3px' }}>{googleWorkspaceStatus.configuration.projectId}</code>
                          </div>
                        )}
                        {googleWorkspaceStatus.configuration?.clientEmail && (
                          <div style={{ fontSize: '0.75rem', color: '#166534', marginBottom: '4px' }}>
                            <strong>Service Account:</strong> <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '3px', fontSize: '0.7rem' }}>{googleWorkspaceStatus.configuration.clientEmail}</code>
                          </div>
                        )}
                        {googleWorkspaceStatus.lastSync && (
                          <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '6px' }}>
                            <strong>Last synced:</strong> {new Date(googleWorkspaceStatus.lastSync).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isEnabled('integrations.microsoft_365') && (
                <div className="module-card">
                  <div className="module-header">
                    <div className="module-info">
                      <div className="module-icon"><Building2 size={24} /></div>
                      <div className="module-details">
                        <h3>Microsoft 365</h3>
                        <p>Manage Entra ID users, groups, and licenses</p>
                        {microsoftStatus.isConfigured && (
                          <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '4px' }}>
                            {microsoftStatus.stats.users} user{microsoftStatus.stats.users !== 1 ? 's' : ''} synced
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="module-status">
                      {isLoadingStatus ? (
                        <span className="status-badge" style={{ backgroundColor: '#f0f0f0', color: '#666' }}>Loading...</span>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {microsoftStatus.isConfigured && (
                              <div
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: microsoftStatus.isActive ? 'var(--color-success)' : 'var(--color-warning)',
                                  boxShadow: microsoftStatus.isActive ? '0 0 5px rgba(16, 185, 129,0.5)' : '0 0 5px rgba(245, 158, 11,0.5)'
                                }}
                                title={microsoftStatus.isActive ? 'Connected' : 'Inactive'}
                              />
                            )}
                            <span className={`status-badge ${microsoftStatus.isConfigured ? 'enabled' : 'disabled'}`}>
                              {microsoftStatus.isConfigured ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          {!microsoftStatus.isConfigured && (
                            <button
                              className="enable-btn"
                              onClick={() => {
                                setConfiguringModule('microsoft-365');
                                setShowModuleConfig(true);
                              }}
                            >
                              Enable
                            </button>
                          )}
                          {microsoftStatus.isConfigured && (
                            <div className="module-actions">
                              <button
                                className="btn btn-info"
                                onClick={async () => {
                                  try {
                                    const response = await authFetch('/api/v1/microsoft/sync', {
                                      method: 'POST'
                                    });

                                    const data = await response.json();
                                    if (data.success) {
                                      alert('Sync started! Check back in a few moments.');
                                      setTimeout(() => fetchModuleStatus(), 3000);
                                    } else {
                                      alert(`Sync failed: ${data.message || data.error?.message}`);
                                    }
                                  } catch (error: any) {
                                    alert(`Sync failed: ${error.message}`);
                                  }
                                }}
                              >
                                <RefreshCw size={14} /> Sync Now
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="module-description">
                    <p>Connect your Microsoft 365 tenant to manage Entra ID users, groups, and license assignments.</p>
                    <div className="module-features">
                      <span className="feature-tag">Entra ID</span>
                      <span className="feature-tag">User Management</span>
                      <span className="feature-tag">License Management</span>
                    </div>
                    {microsoftStatus.isConfigured && (
                      <div style={{ marginTop: '12px', padding: '12px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: '600', marginBottom: '6px' }}>
                          Sync Status: {microsoftStatus.syncStatus}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#1e40af', marginBottom: '4px' }}>
                          <strong>Users:</strong> {microsoftStatus.stats.users} | <strong>Groups:</strong> {microsoftStatus.stats.groups} | <strong>Licenses:</strong> {microsoftStatus.stats.licenses}
                        </div>
                        {microsoftStatus.lastSyncAt && (
                          <div style={{ fontSize: '0.75rem', color: '#1e40af', marginTop: '6px' }}>
                            <strong>Last synced:</strong> {new Date(microsoftStatus.lastSyncAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                )}

              </div>
            </div>
          )}

          {activeTab === 'organization' && (
            <>
            <div className="settings-section">
              <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2>Organization Settings</h2>
                  <p>Configure your organization details and branding</p>
                </div>
                {!isEditingOrg ? (
                  <button className="btn-secondary" onClick={() => setIsEditingOrg(true)}>
                    Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setIsEditingOrg(false);
                        setEditedOrgName(organizationName);
                        setEditedDomain(domain);
                      }}
                      disabled={savingOrg}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      onClick={saveOrganization}
                      disabled={savingOrg}
                    >
                      {savingOrg ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              <div className="settings-form">
                <div className="form-group">
                  <label>Organization Name</label>
                  <input
                    type="text"
                    value={isEditingOrg ? editedOrgName : organizationName}
                    onChange={(e) => setEditedOrgName(e.target.value)}
                    readOnly={!isEditingOrg}
                    className="form-input"
                  />
                  {!isEditingOrg && <div className="form-hint">Click Edit to change organization name</div>}
                </div>

                <div className="form-group">
                  <label>Primary Domain</label>
                  <input
                    type="text"
                    value={isEditingOrg ? editedDomain : domain}
                    onChange={(e) => setEditedDomain(e.target.value)}
                    readOnly={!isEditingOrg}
                    className="form-input"
                  />
                  <div className="form-hint">Used for SaaS integrations and user authentication</div>
                </div>

                <div className="form-group">
                  <label>Organization Logo</label>
                  <div className="logo-upload">
                    <div className="logo-preview"><Building2 size={32} /></div>
                    <button className="upload-btn">Upload Logo</button>
                    <div className="form-hint">Recommended: 200x200px PNG or SVG</div>
                  </div>
                </div>
              </div>
            </div>
            <LicenseLimitsSection />
            {currentUser?.role === 'admin' && (
              <div className="settings-section" style={{ marginTop: 24 }}>
                <ThemeSelector />
              </div>
            )}
            </>
          )}

          {activeTab === 'roles' && (
            <>
              <Administrators />
              <div style={{ marginTop: 24 }}>
                <RolesManagement />
              </div>
            </>
          )}

          {activeTab === 'security' && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Security Policies</h2>
                <p>Configure organization-wide security settings and policies</p>
              </div>

              <div className="security-section">
                {/* These policy editors are not wired to the backend (nothing
                    saves), so they stay behind an experimental flag. */}
                {isEnabled('settings.security_policies') && (<>
                <div className="security-card">
                  <h3><Lock size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Password Policy</h3>
                  <p>Set password requirements for all users in your organization</p>
                  <div className="policy-settings">
                    <div className="policy-row">
                      <label>Minimum Password Length</label>
                      <select className="form-select" defaultValue="8">
                        <option value="8">8 characters</option>
                        <option value="10">10 characters</option>
                        <option value="12">12 characters</option>
                        <option value="14">14 characters</option>
                        <option value="16">16 characters</option>
                      </select>
                    </div>
                    <div className="policy-row">
                      <label className="checkbox-label">
                        <input type="checkbox" defaultChecked />
                        <span>Require uppercase letter</span>
                      </label>
                    </div>
                    <div className="policy-row">
                      <label className="checkbox-label">
                        <input type="checkbox" defaultChecked />
                        <span>Require lowercase letter</span>
                      </label>
                    </div>
                    <div className="policy-row">
                      <label className="checkbox-label">
                        <input type="checkbox" defaultChecked />
                        <span>Require number</span>
                      </label>
                    </div>
                    <div className="policy-row">
                      <label className="checkbox-label">
                        <input type="checkbox" />
                        <span>Require special character</span>
                      </label>
                    </div>
                    <div className="policy-row">
                      <label>Password Expiration</label>
                      <select className="form-select" defaultValue="0">
                        <option value="0">Never</option>
                        <option value="30">Every 30 days</option>
                        <option value="60">Every 60 days</option>
                        <option value="90">Every 90 days</option>
                        <option value="180">Every 180 days</option>
                        <option value="365">Every year</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="security-card">
                  <h3><Shield size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Account Lockout</h3>
                  <p>Configure account lockout settings after failed login attempts</p>
                  <div className="policy-settings">
                    <div className="policy-row">
                      <label>Max Failed Attempts</label>
                      <select className="form-select" defaultValue="5">
                        <option value="3">3 attempts</option>
                        <option value="5">5 attempts</option>
                        <option value="10">10 attempts</option>
                        <option value="0">Unlimited (no lockout)</option>
                      </select>
                    </div>
                    <div className="policy-row">
                      <label>Lockout Duration</label>
                      <select className="form-select" defaultValue="15">
                        <option value="5">5 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                        <option value="0">Until admin unlocks</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="security-card">
                  <h3><Key size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Session Settings</h3>
                  <p>Control session timeout and concurrent login policies</p>
                  <div className="policy-settings">
                    <div className="policy-row">
                      <label>Session Timeout (Idle)</label>
                      <select className="form-select" defaultValue="60">
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                        <option value="120">2 hours</option>
                        <option value="480">8 hours</option>
                        <option value="0">Never (not recommended)</option>
                      </select>
                    </div>
                    <div className="policy-row">
                      <label>Max Concurrent Sessions</label>
                      <select className="form-select" defaultValue="0">
                        <option value="1">1 session only</option>
                        <option value="3">3 sessions</option>
                        <option value="5">5 sessions</option>
                        <option value="0">Unlimited</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="security-card">
                  <h3><Shield size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Authentication Requirements</h3>
                  <p>Enforce authentication methods for all users</p>
                  <div className="policy-settings">
                    <div className="policy-row">
                      <label className="checkbox-label">
                        <input type="checkbox" disabled />
                        <span style={{ color: '#9ca3af' }}>Require Two-Factor Authentication for all users</span>
                      </label>
                    </div>
                    <div className="policy-row">
                      <label className="checkbox-label">
                        <input type="checkbox" disabled />
                        <span style={{ color: '#9ca3af' }}>Require SSO for all users</span>
                      </label>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>Contact your administrator to enable these features.</p>
                </div>

                <div className="security-card">
                  <h3><Shield size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Single Sign-On (SSO)</h3>
                  <p>Configure SAML or OAuth for your organization</p>
                  <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', color: '#6b7280', fontSize: '13px' }}>
                    SSO configuration requires enterprise setup. Contact support for assistance.
                  </div>
                </div>
                </>)}

                {/* API Relay Access — least-privilege gate on the Google API proxy */}
                <RelayAccessSettings />
              </div>
            </div>
          )}

          {activeTab === 'customization' && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Customization</h2>
                <p>Customize the look, feel, and terminology of your organization's portal</p>
              </div>

              <div className="customization-section">
                {/* Entity Label Customization */}
                <EntityLabelSettings
                  isAdmin={currentUser?.role === 'admin'}
                />

                {/* Branding & Support Settings - Admin Only */}
                {currentUser?.role === 'admin' && (
                  <div className="customization-card">
                    <h3><Link size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Branding & Support</h3>
                    <p>Configure navigation and support links</p>
                    <div className="branding-settings">
                      <div className="setting-row">
                        <label>
                          <span className="setting-label">Logo Click URL</span>
                          <span className="setting-hint">Where clicking the logo/company name navigates to</span>
                        </label>
                        <input
                          type="text"
                          placeholder="/admin/dashboard (default)"
                          className="setting-input"
                          defaultValue=""
                          disabled
                        />
                      </div>
                      <div className="setting-row">
                        <label>
                          <span className="setting-label">Support Portal URL</span>
                          <span className="setting-hint">Link to your organization's support/helpdesk portal</span>
                        </label>
                        <input
                          type="url"
                          placeholder="https://support.yourcompany.com"
                          className="setting-input"
                          defaultValue=""
                          disabled
                        />
                      </div>
                      <div className="setting-row">
                        <label>
                          <span className="setting-label">Support Email</span>
                          <span className="setting-hint">Email address for support inquiries</span>
                        </label>
                        <input
                          type="email"
                          placeholder="support@yourcompany.com"
                          className="setting-input"
                          defaultValue=""
                          disabled
                        />
                      </div>
                      <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
                        These settings are stored in organization configuration. Contact your system administrator to update.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'masterdata' && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Master Data</h2>
                <p>Manage departments, locations, cost centers, job titles and licenses</p>
              </div>
              <MasterDataSection organizationId={organizationId} />
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="settings-section">
              <div className="section-header">
                <h2>AI Assistant</h2>
                <p>Configure the AI-powered help and command assistant</p>
              </div>
              <AISettings organizationId={organizationId} onConfigSaved={onAIConfigChange} />
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Advanced Settings</h2>
                <p>Configure data synchronization and advanced platform settings</p>
              </div>

              <div className="advanced-section">
                <div className="advanced-card">
                  <h3><BarChart3 size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Data Synchronization</h3>
                  <p>Configure how data syncs between Helios and connected platforms</p>

                  <div className="sync-settings">
                    <div className="sync-setting-group">
                      <div className="sync-options">
                        <label>Automatic Sync Interval:</label>
                        <select
                          className="form-select"
                          value={syncSettings.syncInterval}
                          onChange={(e) => setSyncSettings(prev => ({ ...prev, syncInterval: e.target.value }))}
                        >
                          <option value="300">Every 5 minutes</option>
                          <option value="900">Every 15 minutes (Recommended)</option>
                          <option value="1800">Every 30 minutes</option>
                          <option value="3600">Every 1 hour</option>
                          <option value="14400">Every 4 hours</option>
                          <option value="86400">Once per day</option>
                        </select>
                        <div className="form-hint">
                          How often to automatically sync data from connected platforms.
                        </div>
                      </div>

                      <div className="sync-options" style={{ marginTop: '16px' }}>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={syncSettings.autoSyncEnabled}
                            onChange={(e) => setSyncSettings(prev => ({ ...prev, autoSyncEnabled: e.target.checked }))}
                          />
                          <span>Enable automatic synchronization</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="sync-setting-group" style={{ marginTop: '24px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>User Deletion Policy</h4>
                    <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#6b7280' }}>
                      Choose what happens in Google Workspace when a user is deleted in Helios
                    </p>
                    <div className="sync-options">
                      <label>Default Action:</label>
                      <select
                        className="form-select"
                        value={syncSettings.deletionPolicy}
                        onChange={(e) => setSyncSettings(prev => ({ ...prev, deletionPolicy: e.target.value }))}
                      >
                        <option value="keep">Keep active in Google (no changes)</option>
                        <option value="suspend">Suspend in Google (still billed)</option>
                        <option value="delete">Delete from Google (frees license)</option>
                      </select>
                      <div className="form-hint">
                        This setting determines the default action when deleting users. You can still choose a different action for individual deletions.
                      </div>
                    </div>
                  </div>

                  <div className="sync-setting-group" style={{ marginTop: '24px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Field ownership</h4>
                    {/* A single "sync direction" was offered here and nothing ever read it.
                        Sync already runs both ways per operation; the real question is who
                        wins when a field differs, and that is decided per field. */}
                    <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#6b7280' }}>
                      Users created in either place appear in both, and edits you save in Helios go to Google
                      straight away. When the sync finds a field that differs, the owner decides: a Google-owned
                      field takes Google&apos;s value, a Helios-owned field is listed for you to resolve on the
                      Users page. An empty value in Google never erases a value in Helios.
                    </p>
                    <table className="field-ownership-table" style={{ width: '100%', maxWidth: 460, borderCollapse: 'collapse', fontSize: 13 }}>
                      <tbody>
                        {([
                          ['jobTitle', 'Job title'], ['department', 'Department'], ['manager', 'Manager'],
                          ['mobilePhone', 'Mobile phone'], ['workPhone', 'Work phone'], ['location', 'Location'],
                        ] as const).map(([key, label]) => (
                          <tr key={key}>
                            <td style={{ padding: '6px 0' }}>{label}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right' }}>
                              <select
                                className="form-select"
                                aria-label={`Owner of ${label}`}
                                value={syncSettings.fieldOwnership[key]}
                                onChange={(e) => setSyncSettings(prev => ({
                                  ...prev,
                                  fieldOwnership: { ...prev.fieldOwnership, [key]: e.target.value as 'google' | 'helios' },
                                }))}
                              >
                                <option value="google">Google owns it</option>
                                <option value="helios">Helios owns it</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-secondary"
                      disabled={!syncSettingsChanged}
                      onClick={() => setSyncSettings({ ...originalSyncSettings })}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      disabled={!syncSettingsChanged || savingSyncSettings}
                      onClick={saveSyncSettings}
                    >
                      {savingSyncSettings ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>

                  <div className="info-box" style={{ marginTop: '16px' }}>
                    <Info size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    <span>Sync settings are applied per-module. Configure individual module sync from the Modules tab.</span>
                  </div>
                </div>

                {/* Email Tracking Settings — its API route is not mounted yet
                    (see frontend-route-coverage KNOWN_BROKEN), so it stays behind
                    an experimental flag. */}
                {isEnabled('settings.email_tracking') && (
                  <div style={{ marginTop: '24px' }}>
                    <TrackingSettings />
                  </div>
                )}

                {/* Features: what this installation has switched on */}
                <div className="advanced-card" style={{ marginTop: '24px' }}>
                  <h3><ToggleLeft size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Features</h3>
                  <FeatureFlagsSettings />
                </div>

                {/* Developer tools: one home for API keys, API docs and the console */}
                {isEnabled('developer.tools') && (
                  <div className="advanced-card" style={{ marginTop: '24px' }} data-testid="settings-developer-tools">
                    <h3><Key size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />API keys &amp; developer tools</h3>
                    <p>API keys for integrations, the API reference, and the Developer Console</p>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '12px 0 16px' }}>
                      <button className="btn-secondary" onClick={() => window.open('/api/v1/docs', '_blank', 'noopener')}>
                        <Book size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />API documentation
                      </button>
                      <button className="btn-secondary" onClick={() => navigate('/admin/console')}>
                        <Terminal size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Developer Console
                      </button>
                    </div>
                    <ApiKeyList
                      organizationId={organizationId}
                      onCreateKey={() => setShowApiKeyWizard(true)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showModuleConfig && configuringModule === 'google-workspace' && (
        <GoogleWorkspaceWizard
          onClose={() => setShowModuleConfig(false)}
          onSuccess={async () => {
            setShowModuleConfig(false);
            await fetchModuleStatus();
          }}
        />
      )}

      {showModuleConfig && configuringModule === 'microsoft-365' && (
        <Microsoft365Wizard
          onClose={() => setShowModuleConfig(false)}
          onSuccess={async () => {
            setShowModuleConfig(false);
            await fetchModuleStatus();
          }}
        />
      )}

      {showPasswordModal && (
        <div className="module-config-modal">
          <div className="modal-overlay" onClick={() => {
            setShowPasswordModal(false);
            onPasswordModalChange?.(false);
          }}></div>
          <div className="modal-content">
            <div className="modal-header">
              <h2><Key size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Change Password</h2>
              <button className="modal-close" onClick={() => {
                setShowPasswordModal(false);
                onPasswordModalChange?.(false);
              }}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                  placeholder="Enter your current password"
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                  placeholder="Enter your new password"
                />
                <div className="form-hint">Minimum 8 characters</div>
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                  placeholder="Re-enter your new password"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => {
                setShowPasswordModal(false);
                onPasswordModalChange?.(false);
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
              }}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (passwordData.newPassword !== passwordData.confirmPassword) {
                    alert('Passwords do not match');
                    return;
                  }
                  if (passwordData.newPassword.length < 8) {
                    alert('Password must be at least 8 characters');
                    return;
                  }

                  try {
                    const user = localStorage.getItem('helios_user');
                    const userData = user ? JSON.parse(user) : null;

                    const response = await authFetch('/api/v1/user/change-password', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        userId: userData?.id,
                        currentPassword: passwordData.currentPassword,
                        newPassword: passwordData.newPassword
                      })
                    });

                    const data = await response.json();
                    if (data.success) {
                      alert('Password changed successfully');
                      setShowPasswordModal(false);
                      onPasswordModalChange?.(false);
                      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    } else {
                      alert(`${data.error || 'Failed to change password'}`);
                    }
                  } catch (err: any) {
                    alert(`Error: ${err.message}`);
                  }
                }}
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}

      {showApiKeyWizard && (
        <ApiKeyWizard
          organizationId={organizationId}
          onClose={() => setShowApiKeyWizard(false)}
          onSuccess={(keyData) => {
            setShowApiKeyWizard(false);
            setNewApiKeyData(keyData);
          }}
        />
      )}

      {newApiKeyData && (
        <ApiKeyShowOnce
          keyData={newApiKeyData}
          onClose={() => setNewApiKeyData(null)}
        />
      )}

      <ConfirmDialog
        isOpen={showDisableGoogleConfirm}
        title="Disable Google Workspace"
        message="Are you sure you want to disable Google Workspace? This will stop all synchronization."
        variant="danger"
        confirmText="Disable"
        onConfirm={async () => {
          try {
            const response = await authFetch(`/api/v1/google-workspace/disable/${organizationId}`, {
              method: 'POST'
            });

            const data = await response.json();
            if (data.success) {
              alert('Google Workspace has been disabled');
              fetchModuleStatus();
            } else {
              alert(`Failed to disable: ${data.message}`);
            }
          } catch (error) {
            alert('Error disabling Google Workspace');
            console.error(error);
          }
          setShowDisableGoogleConfirm(false);
        }}
        onCancel={() => setShowDisableGoogleConfirm(false)}
      />
    </div>
  );
}
