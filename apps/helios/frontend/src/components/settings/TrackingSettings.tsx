import React, { useEffect, useState } from 'react';
import {
  Eye,
  Shield,
  RefreshCw,
  Save,
  AlertCircle,
  CheckCircle,
  Info,
  Bot,
  Calendar,
  BarChart2
} from 'lucide-react';
import { ToggleSwitch } from '@/components/ui';
import { apiPath, authFetch } from '../../config/api';
import './TrackingSettings.css';

interface TrackingSettingsData {
  userTrackingEnabled: boolean;
  campaignTrackingEnabled: boolean;
  retentionDays: number;
  showUserDashboard: boolean;
  excludeBots: boolean;
}

export const TrackingSettings: React.FC = () => {
  const [settings, setSettings] = useState<TrackingSettingsData>({
    userTrackingEnabled: true,
    campaignTrackingEnabled: true,
    retentionDays: 90,
    showUserDashboard: true,
    excludeBots: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<TrackingSettingsData | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await authFetch(apiPath('/settings/tracking'));

      if (!res.ok) {
        throw new Error('Failed to fetch tracking settings');
      }

      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setOriginalSettings(data.data);
        setHasChanges(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (originalSettings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasChanges(changed);
    }
  }, [settings, originalSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const res = await authFetch(apiPath('/settings/tracking'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Failed to save settings');
      }

      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setOriginalSettings(data.data);
        setHasChanges(false);
        setSuccess('Settings saved successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = <K extends keyof TrackingSettingsData>(
    key: K,
    value: TrackingSettingsData[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleReset = () => {
    if (originalSettings) {
      setSettings(originalSettings);
      setHasChanges(false);
    }
  };

  if (loading) {
    return (
      <div className="tracking-settings">
        <div className="settings-loading">
          <RefreshCw size={20} className="animate-spin" />
          <span>Loading tracking settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tracking-settings">
      <div className="settings-header">
        <div className="header-info">
          <h2>
            <BarChart2 size={20} />
            Email Tracking Settings
          </h2>
          <p className="settings-description">
            Configure how email engagement is tracked across your organization.
          </p>
        </div>
      </div>

      {error && (
        <div className="settings-alert error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="settings-alert success">
          <CheckCircle size={16} />
          <span>{success}</span>
        </div>
      )}

      <div className="settings-form">
        {/* User Tracking Toggle */}
        <div className="setting-group">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">
                <Eye size={16} />
                <span>User-level Tracking</span>
              </div>
              <p className="setting-help">
                Track individual user email engagement with tracking pixels in signatures.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.userTrackingEnabled}
              onChange={(checked) => handleChange('userTrackingEnabled', checked)}
            />
          </div>
        </div>

        {/* Campaign Tracking Toggle */}
        <div className="setting-group">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">
                <Shield size={16} />
                <span>Campaign Tracking</span>
              </div>
              <p className="setting-help">
                Track engagement for signature campaigns and promotional banners.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.campaignTrackingEnabled}
              onChange={(checked) => handleChange('campaignTrackingEnabled', checked)}
            />
          </div>
        </div>

        {/* Show User Dashboard Toggle */}
        <div className="setting-group">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">
                <BarChart2 size={16} />
                <span>Show Engagement Widget to Users</span>
              </div>
              <p className="setting-help">
                Display the email engagement widget on user dashboards.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.showUserDashboard}
              onChange={(checked) => handleChange('showUserDashboard', checked)}
            />
          </div>
        </div>

        {/* Bot Filtering Toggle */}
        <div className="setting-group">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">
                <Bot size={16} />
                <span>Exclude Bots and Crawlers</span>
              </div>
              <p className="setting-help">
                Filter out automated traffic from email scanners and bots.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.excludeBots}
              onChange={(checked) => handleChange('excludeBots', checked)}
            />
          </div>
        </div>

        {/* Data Retention */}
        <div className="setting-group">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">
                <Calendar size={16} />
                <span>Data Retention Period</span>
              </div>
              <p className="setting-help">
                How long to keep tracking data before automatic deletion.
              </p>
            </div>
            <select
              value={settings.retentionDays}
              onChange={(e) => handleChange('retentionDays', Number(e.target.value))}
              className="retention-select"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="privacy-notice">
          <Info size={16} />
          <div className="notice-content">
            <strong>Privacy Information</strong>
            <p>
              Email tracking uses a small 1x1 pixel image embedded in signatures.
              When recipients view the email, the pixel loads and records an open event.
              IP addresses are hashed for privacy. Individual recipient emails are not stored.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="settings-actions">
          <button
            className="reset-btn"
            onClick={handleReset}
            disabled={!hasChanges || saving}
          >
            Reset Changes
          </button>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrackingSettings;
