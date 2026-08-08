import { useState, useEffect } from 'react';
import {
  Settings,
  Bell,
  Globe,
  Lock,
  Palette,
  ChevronRight,
  Loader2,
  Check,
  AlertCircle,
  Moon,
  Sun,
  Monitor,
  Shield,
  ShieldCheck,
  ShieldOff,
  Copy,
  Eye,
  EyeOff,
  Key,
  Fingerprint,
  Trash2,
  Plus,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { authFetch } from '../config/api';
import {
  enable2FA,
  verify2FASetup,
  disable2FA,
  registerPasskey,
  listPasskeys,
  deletePasskey,
  isPasskeySupported,
} from '../lib/auth-client';
import './UserSettings.css';

interface UserSettingsProps {
  organizationId: string;
}

type ThemePreference = 'light' | 'dark' | 'system';

interface LifecycleNotifications {
  taskAssigned: boolean;
  taskReminder: boolean;
  taskOverdue: boolean;
  requestApproved: boolean;
  requestRejected: boolean;
  dailyDigest: boolean;
}

interface UserPreferences {
  theme: ThemePreference;
  emailNotifications: boolean;
  desktopNotifications: boolean;
  digestEmail: 'none' | 'daily' | 'weekly';
  timezone: string;
  language: string;
  lifecycleNotifications: LifecycleNotifications;
}

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
];

export function UserSettings({ organizationId: _organizationId }: UserSettingsProps) {
  const [activeSection, setActiveSection] = useState<'appearance' | 'notifications' | 'regional' | 'security'>('appearance');
  const [preferences, setPreferences] = useState<UserPreferences>({
    theme: 'system',
    emailNotifications: true,
    desktopNotifications: false,
    digestEmail: 'weekly',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language.split('-')[0] || 'en',
    lifecycleNotifications: {
      taskAssigned: true,
      taskReminder: true,
      taskOverdue: true,
      requestApproved: true,
      requestRejected: true,
      dailyDigest: false,
    },
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState<'setup' | 'verify' | 'backup' | 'disable'>('setup');
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // Passkey state
  interface PasskeyData {
    id: string;
    name: string | null;
    createdAt: Date;
    deviceType?: string;
  }
  const [passkeys, setPasskeys] = useState<PasskeyData[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyRegistering, setPasskeyRegistering] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);
  const passkeySupported = isPasskeySupported();

  // Apply theme to document
  const applyTheme = (theme: ThemePreference) => {
    let effectiveTheme: 'light' | 'dark' = 'light';

    if (theme === 'system') {
      // Check system preference
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      effectiveTheme = theme;
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);
  };

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem('helios_user_preferences');
    if (savedPrefs) {
      try {
        const parsed = JSON.parse(savedPrefs);
        setPreferences((prev) => ({ ...prev, ...parsed }));
        // Apply saved theme
        if (parsed.theme) {
          applyTheme(parsed.theme);
        }
      } catch (e) {
        console.error('Failed to parse saved preferences');
      }
    }
  }, []);

  // Check 2FA status on mount
  useEffect(() => {
    const check2FAStatus = async () => {
      try {
        // Check if user has 2FA enabled via better-auth
        const response = await authFetch('/api/v1/auth/two-factor/status');
        if (response.ok) {
          const data = await response.json();
          setTwoFactorEnabled(data.enabled || false);
        }
      } catch (error) {
        console.error('Failed to check 2FA status:', error);
      } finally {
        setTwoFactorLoading(false);
      }
    };
    check2FAStatus();
  }, []);

  // Fetch passkeys on mount
  useEffect(() => {
    const fetchPasskeys = async () => {
      if (!passkeySupported) {
        setPasskeysLoading(false);
        return;
      }
      try {
        const result = await listPasskeys();
        if (result.success && result.passkeys) {
          setPasskeys(result.passkeys);
        }
      } catch (error) {
        console.error('Failed to fetch passkeys:', error);
      } finally {
        setPasskeysLoading(false);
      }
    };
    fetchPasskeys();
  }, [passkeySupported]);

  // 2FA handlers
  const handleEnable2FA = async () => {
    setTwoFactorError(null);
    setTwoFactorStep('setup');
    setShow2FAModal(true);

    try {
      const result = await enable2FA();
      if (result.success && result.totpUri) {
        setTotpUri(result.totpUri);
        setBackupCodes(result.backupCodes || []);
      } else {
        setTwoFactorError(result.error || 'Failed to start 2FA setup');
      }
    } catch (error: any) {
      setTwoFactorError(error.message || 'Failed to start 2FA setup');
    }
  };

  const handleVerify2FA = async () => {
    if (verificationCode.length !== 6) {
      setTwoFactorError('Please enter a 6-digit code');
      return;
    }

    setTwoFactorError(null);

    try {
      const result = await verify2FASetup(verificationCode);
      if (result.success) {
        setTwoFactorStep('backup');
        setTwoFactorEnabled(true);
      } else {
        setTwoFactorError(result.error || 'Invalid verification code');
      }
    } catch (error: any) {
      setTwoFactorError(error.message || 'Verification failed');
    }
  };

  const handleDisable2FA = async () => {
    if (!disablePassword) {
      setTwoFactorError('Please enter your password');
      return;
    }

    setTwoFactorError(null);

    try {
      const result = await disable2FA(disablePassword);
      if (result.success) {
        setTwoFactorEnabled(false);
        setShow2FAModal(false);
        setDisablePassword('');
        setTwoFactorStep('setup');
      } else {
        setTwoFactorError(result.error || 'Failed to disable 2FA');
      }
    } catch (error: any) {
      setTwoFactorError(error.message || 'Failed to disable 2FA');
    }
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedBackupCodes(true);
    setTimeout(() => setCopiedBackupCodes(false), 2000);
  };

  const close2FAModal = () => {
    setShow2FAModal(false);
    setTotpUri(null);
    setBackupCodes([]);
    setVerificationCode('');
    setDisablePassword('');
    setTwoFactorError(null);
    setTwoFactorStep('setup');
    setShowBackupCodes(false);
  };

  // Passkey handlers
  const handleAddPasskey = async () => {
    if (!passkeyName.trim()) {
      setPasskeyError('Please enter a name for your passkey');
      return;
    }

    setPasskeyRegistering(true);
    setPasskeyError(null);

    try {
      const result = await registerPasskey(passkeyName.trim());
      if (result.success) {
        // Refresh passkey list
        const listResult = await listPasskeys();
        if (listResult.success && listResult.passkeys) {
          setPasskeys(listResult.passkeys);
        }
        setShowPasskeyModal(false);
        setPasskeyName('');
      } else {
        setPasskeyError(result.error || 'Failed to register passkey');
      }
    } catch (error: any) {
      setPasskeyError(error.message || 'Failed to register passkey');
    } finally {
      setPasskeyRegistering(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    setDeletingPasskeyId(id);
    try {
      const result = await deletePasskey(id);
      if (result.success) {
        setPasskeys(passkeys.filter(pk => pk.id !== id));
      } else {
        console.error('Failed to delete passkey:', result.error);
      }
    } catch (error) {
      console.error('Failed to delete passkey:', error);
    } finally {
      setDeletingPasskeyId(null);
    }
  };

  const closePasskeyModal = () => {
    setShowPasskeyModal(false);
    setPasskeyName('');
    setPasskeyError(null);
  };

  const handlePreferenceChange = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferences((prev) => {
      const updated = { ...prev, [key]: value };
      // Save to localStorage
      localStorage.setItem('helios_user_preferences', JSON.stringify(updated));

      // Apply theme immediately if theme changed
      if (key === 'theme') {
        applyTheme(value as ThemePreference);
      }

      return updated;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // In a real implementation, save to backend
      await new Promise((resolve) => setTimeout(resolve, 500));
      localStorage.setItem('helios_user_preferences', JSON.stringify(preferences));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
    setSaving(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    try {
      const response = await authFetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPasswordSuccess(true);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordSuccess(false);
        }, 2000);
      } else {
        setPasswordError(data.error || 'Failed to change password');
      }
    } catch (error) {
      setPasswordError('An error occurred. Please try again.');
    }
  };

  const getThemeIcon = (theme: ThemePreference) => {
    switch (theme) {
      case 'light':
        return <Sun size={16} />;
      case 'dark':
        return <Moon size={16} />;
      case 'system':
        return <Monitor size={16} />;
    }
  };

  const renderNavigation = () => (
    <nav className="settings-sidebar">
      <button
        className={`settings-nav-item ${activeSection === 'appearance' ? 'active' : ''}`}
        onClick={() => setActiveSection('appearance')}
      >
        <Palette size={16} />
        <span>Appearance</span>
        <ChevronRight size={14} className="nav-arrow" />
      </button>
      <button
        className={`settings-nav-item ${activeSection === 'notifications' ? 'active' : ''}`}
        onClick={() => setActiveSection('notifications')}
      >
        <Bell size={16} />
        <span>Notifications</span>
        <ChevronRight size={14} className="nav-arrow" />
      </button>
      <button
        className={`settings-nav-item ${activeSection === 'regional' ? 'active' : ''}`}
        onClick={() => setActiveSection('regional')}
      >
        <Globe size={16} />
        <span>Regional</span>
        <ChevronRight size={14} className="nav-arrow" />
      </button>
      <button
        className={`settings-nav-item ${activeSection === 'security' ? 'active' : ''}`}
        onClick={() => setActiveSection('security')}
      >
        <Lock size={16} />
        <span>Security</span>
        <ChevronRight size={14} className="nav-arrow" />
      </button>
    </nav>
  );

  const renderAppearance = () => (
    <div className="settings-section">
      <h2>Appearance</h2>
      <p className="section-description">Customize how Helios looks for you</p>

      <div className="setting-group">
        <label className="setting-label">Theme</label>
        <div className="theme-options">
          {(['light', 'dark', 'system'] as ThemePreference[]).map((theme) => (
            <button
              key={theme}
              className={`theme-option ${preferences.theme === theme ? 'selected' : ''}`}
              onClick={() => handlePreferenceChange('theme', theme)}
            >
              {getThemeIcon(theme)}
              <span>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
              {preferences.theme === theme && <Check size={14} className="check-icon" />}
            </button>
          ))}
        </div>
        <p className="setting-hint">
          {preferences.theme === 'system'
            ? 'Automatically matches your device settings'
            : preferences.theme === 'dark'
            ? 'Easy on the eyes in low light'
            : 'Classic light appearance'}
        </p>
      </div>
    </div>
  );

  const handleLifecycleNotificationChange = (key: keyof LifecycleNotifications, value: boolean) => {
    setPreferences((prev) => {
      const updated = {
        ...prev,
        lifecycleNotifications: {
          ...prev.lifecycleNotifications,
          [key]: value,
        },
      };
      localStorage.setItem('helios_user_preferences', JSON.stringify(updated));
      return updated;
    });
    setSaved(false);
  };

  const renderNotifications = () => (
    <div className="settings-section">
      <h2>Notifications</h2>
      <p className="section-description">Control how you receive updates</p>

      <div className="setting-group">
        <div className="toggle-setting">
          <div className="toggle-info">
            <label className="setting-label">Email Notifications</label>
            <p className="setting-hint">Receive important updates via email</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.emailNotifications}
              onChange={(e) => handlePreferenceChange('emailNotifications', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="setting-group">
        <div className="toggle-setting">
          <div className="toggle-info">
            <label className="setting-label">Desktop Notifications</label>
            <p className="setting-hint">Show browser notifications for updates</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.desktopNotifications}
              onChange={(e) => handlePreferenceChange('desktopNotifications', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label">Email Digest</label>
        <select
          className="setting-select"
          value={preferences.digestEmail}
          onChange={(e) =>
            handlePreferenceChange('digestEmail', e.target.value as 'none' | 'daily' | 'weekly')
          }
        >
          <option value="none">No digest emails</option>
          <option value="daily">Daily summary</option>
          <option value="weekly">Weekly summary</option>
        </select>
        <p className="setting-hint">Receive a summary of activity</p>
      </div>

      {/* Lifecycle Task Notifications */}
      <div className="setting-group-header">
        <h3>Lifecycle Task Notifications</h3>
        <p className="section-description">Control notifications for onboarding and offboarding tasks</p>
      </div>

      <div className="setting-group">
        <div className="toggle-setting">
          <div className="toggle-info">
            <label className="setting-label">Task Assigned</label>
            <p className="setting-hint">Get notified when a new task is assigned to you</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.lifecycleNotifications.taskAssigned}
              onChange={(e) => handleLifecycleNotificationChange('taskAssigned', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="setting-group">
        <div className="toggle-setting">
          <div className="toggle-info">
            <label className="setting-label">Task Reminder</label>
            <p className="setting-hint">Receive reminders for tasks due soon</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.lifecycleNotifications.taskReminder}
              onChange={(e) => handleLifecycleNotificationChange('taskReminder', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="setting-group">
        <div className="toggle-setting">
          <div className="toggle-info">
            <label className="setting-label">Overdue Alerts</label>
            <p className="setting-hint">Get notified when your tasks become overdue</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.lifecycleNotifications.taskOverdue}
              onChange={(e) => handleLifecycleNotificationChange('taskOverdue', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="setting-group">
        <div className="toggle-setting">
          <div className="toggle-info">
            <label className="setting-label">Request Approved</label>
            <p className="setting-hint">Get notified when your lifecycle requests are approved</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.lifecycleNotifications.requestApproved}
              onChange={(e) => handleLifecycleNotificationChange('requestApproved', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="setting-group">
        <div className="toggle-setting">
          <div className="toggle-info">
            <label className="setting-label">Request Rejected</label>
            <p className="setting-hint">Get notified when your lifecycle requests are rejected</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.lifecycleNotifications.requestRejected}
              onChange={(e) => handleLifecycleNotificationChange('requestRejected', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderRegional = () => (
    <div className="settings-section">
      <h2>Regional Settings</h2>
      <p className="section-description">Set your timezone and language preferences</p>

      <div className="setting-group">
        <label className="setting-label">Timezone</label>
        <select
          className="setting-select"
          value={preferences.timezone}
          onChange={(e) => handlePreferenceChange('timezone', e.target.value)}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
        <p className="setting-hint">Dates and times will be shown in this timezone</p>
      </div>

      <div className="setting-group">
        <label className="setting-label">Language</label>
        <select
          className="setting-select"
          value={preferences.language}
          onChange={(e) => handlePreferenceChange('language', e.target.value)}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <p className="setting-hint">Interface language (some content may remain in English)</p>
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div className="settings-section">
      <h2>Security</h2>
      <p className="section-description">Manage your account security</p>

      <div className="setting-group">
        <div className="security-action">
          <div className="action-info">
            <label className="setting-label">Password</label>
            <p className="setting-hint">Change your account password</p>
          </div>
          <button
            className="btn-secondary"
            onClick={() => setShowPasswordModal(true)}
          >
            Change Password
          </button>
        </div>
      </div>

      <div className="setting-group">
        <div className="security-action">
          <div className="action-info">
            <div className="label-with-badge">
              <label className="setting-label">Two-Factor Authentication</label>
              {twoFactorLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : twoFactorEnabled ? (
                <span className="badge badge-success">
                  <ShieldCheck size={12} />
                  Enabled
                </span>
              ) : (
                <span className="badge badge-warning">
                  <ShieldOff size={12} />
                  Disabled
                </span>
              )}
            </div>
            <p className="setting-hint">
              {twoFactorEnabled
                ? 'Your account is protected with TOTP authentication'
                : 'Add an extra layer of security with an authenticator app'}
            </p>
          </div>
          {twoFactorEnabled ? (
            <button
              className="btn-secondary btn-danger-text"
              onClick={() => {
                setTwoFactorStep('disable');
                setShow2FAModal(true);
              }}
            >
              Disable 2FA
            </button>
          ) : (
            <button
              className="btn-secondary"
              onClick={handleEnable2FA}
              disabled={twoFactorLoading}
            >
              <Shield size={16} />
              Enable 2FA
            </button>
          )}
        </div>
      </div>

      {/* Passkeys Section */}
      {passkeySupported && (
        <div className="setting-group">
          <div className="security-action passkey-section">
            <div className="action-info">
              <div className="label-with-badge">
                <label className="setting-label">Passkeys</label>
                {passkeysLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : passkeys.length > 0 ? (
                  <span className="badge badge-success">
                    <Key size={12} />
                    {passkeys.length} registered
                  </span>
                ) : (
                  <span className="badge badge-neutral">
                    None
                  </span>
                )}
              </div>
              <p className="setting-hint">
                Sign in with fingerprint, Face ID, or security key - no password needed
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={() => setShowPasskeyModal(true)}
              disabled={passkeysLoading}
            >
              <Plus size={16} />
              Add Passkey
            </button>
          </div>

          {/* Passkey List */}
          {passkeys.length > 0 && (
            <div className="passkey-list">
              {passkeys.map((pk) => (
                <div key={pk.id} className="passkey-item">
                  <div className="passkey-info">
                    <Fingerprint size={20} className="passkey-icon" />
                    <div>
                      <div className="passkey-name">{pk.name || 'Unnamed Passkey'}</div>
                      <div className="passkey-meta">
                        Added {pk.createdAt.toLocaleDateString()}
                        {pk.deviceType && ` · ${pk.deviceType === 'multiDevice' ? 'Synced' : 'Single device'}`}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn-icon btn-danger-text"
                    onClick={() => handleDeletePasskey(pk.id)}
                    disabled={deletingPasskeyId === pk.id}
                    title="Remove passkey"
                  >
                    {deletingPasskeyId === pk.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="setting-group">
        <div className="security-action">
          <div className="action-info">
            <label className="setting-label">Active Sessions</label>
            <p className="setting-hint">View and manage your login sessions</p>
          </div>
          <button className="btn-secondary" disabled>
            Coming Soon
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="user-settings-page">
      <div className="page-header">
        <div className="header-icon">
          <Settings size={24} />
        </div>
        <div className="header-text">
          <h1>Settings</h1>
          <p className="page-subtitle">Manage your personal preferences</p>
        </div>
      </div>

      <div className="settings-layout">
        {renderNavigation()}

        <div className="settings-content">
          {activeSection === 'appearance' && renderAppearance()}
          {activeSection === 'notifications' && renderNotifications()}
          {activeSection === 'regional' && renderRegional()}
          {activeSection === 'security' && renderSecurity()}

          <div className="settings-footer">
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <Check size={16} />
                  Saved
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change Password</h2>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                  required
                  minLength={8}
                />
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                  }
                  required
                  minLength={8}
                />
              </div>

              {passwordError && (
                <div className="form-error">
                  <AlertCircle size={16} />
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="form-success">
                  <Check size={16} />
                  Password changed successfully
                </div>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowPasswordModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2FA Setup Modal */}
      {show2FAModal && (
        <div className="modal-overlay" onClick={close2FAModal}>
          <div className="modal-content modal-2fa" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {twoFactorStep === 'disable'
                  ? 'Disable Two-Factor Authentication'
                  : twoFactorStep === 'backup'
                  ? 'Save Your Backup Codes'
                  : 'Set Up Two-Factor Authentication'}
              </h2>
              <button className="modal-close" onClick={close2FAModal}>
                &times;
              </button>
            </div>

            {twoFactorStep === 'setup' && (
              <div className="twofa-setup">
                {totpUri ? (
                  <>
                    <p className="twofa-instruction">
                      Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                    </p>
                    <div className="qr-code-container">
                      <QRCodeSVG value={totpUri} size={200} />
                    </div>
                    <p className="twofa-instruction">
                      Then enter the 6-digit code from your app to verify:
                    </p>
                    <div className="verification-input">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        className="code-input"
                        autoFocus
                      />
                    </div>
                    {twoFactorError && (
                      <div className="form-error">
                        <AlertCircle size={16} />
                        {twoFactorError}
                      </div>
                    )}
                    <div className="modal-footer">
                      <button type="button" className="btn-secondary" onClick={close2FAModal}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleVerify2FA}
                        disabled={verificationCode.length !== 6}
                      >
                        Verify & Enable
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="twofa-loading">
                    <Loader2 size={24} className="animate-spin" />
                    <p>Setting up two-factor authentication...</p>
                    {twoFactorError && (
                      <div className="form-error">
                        <AlertCircle size={16} />
                        {twoFactorError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {twoFactorStep === 'backup' && (
              <div className="twofa-backup">
                <div className="success-banner">
                  <ShieldCheck size={24} />
                  <p>Two-factor authentication is now enabled!</p>
                </div>
                <p className="twofa-instruction">
                  Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.
                </p>
                <div className="backup-codes-container">
                  <div className="backup-codes-header">
                    <span>Backup Codes</span>
                    <button
                      className="btn-icon"
                      onClick={() => setShowBackupCodes(!showBackupCodes)}
                      title={showBackupCodes ? 'Hide codes' : 'Show codes'}
                    >
                      {showBackupCodes ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      className="btn-icon"
                      onClick={handleCopyBackupCodes}
                      title="Copy codes"
                    >
                      {copiedBackupCodes ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  <div className={`backup-codes-list ${showBackupCodes ? '' : 'blurred'}`}>
                    {backupCodes.map((code, index) => (
                      <code key={index} className="backup-code">{code}</code>
                    ))}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-primary" onClick={close2FAModal}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {twoFactorStep === 'disable' && (
              <div className="twofa-disable">
                <div className="warning-banner">
                  <AlertCircle size={24} />
                  <p>This will remove two-factor authentication from your account</p>
                </div>
                <p className="twofa-instruction">
                  Enter your password to confirm you want to disable 2FA:
                </p>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="Enter your password"
                    autoFocus
                  />
                </div>
                {twoFactorError && (
                  <div className="form-error">
                    <AlertCircle size={16} />
                    {twoFactorError}
                  </div>
                )}
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={close2FAModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={handleDisable2FA}
                    disabled={!disablePassword}
                  >
                    Disable 2FA
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Passkey Registration Modal */}
      {showPasskeyModal && (
        <div className="modal-overlay" onClick={closePasskeyModal}>
          <div className="modal-content modal-passkey" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Passkey</h2>
              <button className="modal-close" onClick={closePasskeyModal}>
                &times;
              </button>
            </div>

            <div className="passkey-setup">
              <div className="passkey-intro">
                <Fingerprint size={48} className="passkey-hero-icon" />
                <p>
                  Passkeys let you sign in with your fingerprint, face, or security key.
                  No password needed.
                </p>
              </div>

              <div className="form-group">
                <label>Passkey Name</label>
                <input
                  type="text"
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  placeholder="e.g., MacBook Touch ID, YubiKey"
                  autoFocus
                  disabled={passkeyRegistering}
                />
                <p className="setting-hint">
                  Give your passkey a name so you can identify it later
                </p>
              </div>

              {passkeyError && (
                <div className="form-error">
                  <AlertCircle size={16} />
                  {passkeyError}
                </div>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closePasskeyModal}
                  disabled={passkeyRegistering}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleAddPasskey}
                  disabled={passkeyRegistering || !passkeyName.trim()}
                >
                  {passkeyRegistering ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Key size={16} />
                      Register Passkey
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
