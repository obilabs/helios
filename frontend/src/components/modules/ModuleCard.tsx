import React from 'react';
import { Lock, Settings, RefreshCw, XCircle, CheckCircle, Package } from 'lucide-react';
import './ModuleCard.css';

export interface ModuleInfo {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  isEnabled: boolean;
  isConfigured: boolean;
  lastSync?: Date;
  syncStatus?: 'idle' | 'syncing' | 'success' | 'error';
  syncError?: string;
  stats?: {
    users?: number;
    groups?: number;
    lastActivity?: Date;
  };
}

interface ModuleCardProps {
  module: ModuleInfo;
  onConfigure: () => void;
  onToggle: (enabled: boolean) => void;
  onSync?: () => void;
  onViewDetails?: () => void;
}

const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  onConfigure,
  onToggle,
  onSync,
  onViewDetails
}) => {
  const getStatusIcon = () => {
    if (!module.isEnabled) return <Lock size={16} />;
    if (!module.isConfigured) return <Settings size={16} />;
    if (module.syncStatus === 'syncing') return <RefreshCw size={16} className="spinning" />;
    if (module.syncStatus === 'error') return <XCircle size={16} />;
    return <CheckCircle size={16} />;
  };

  const getStatusText = () => {
    if (!module.isEnabled) return 'Disabled';
    if (!module.isConfigured) return 'Not Configured';
    if (module.syncStatus === 'syncing') return 'Syncing...';
    if (module.syncStatus === 'error') return 'Sync Error';
    return 'Active';
  };

  const getStatusClass = () => {
    if (!module.isEnabled) return 'disabled';
    if (!module.isConfigured) return 'warning';
    if (module.syncStatus === 'syncing') return 'syncing';
    if (module.syncStatus === 'error') return 'error';
    return 'success';
  };

  const formatLastSync = (date?: Date) => {
    if (!date) return 'Never synced';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const getModuleIcon = () => {
    switch (module.slug) {
      case 'google_workspace':
        return (
          <svg className="module-icon" viewBox="0 0 24 24" width="32" height="32">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        );
      case 'microsoft_365':
        return (
          <svg className="module-icon" viewBox="0 0 24 24" width="32" height="32">
            <path d="M3 3h10v10H3V3z" fill="#f25022"/>
            <path d="M14 3h10v10H14V3z" fill="#00a4ef"/>
            <path d="M3 14h10v10H3V14z" fill="#ffb900"/>
            <path d="M14 14h10v10H14V14z" fill="#7fba00"/>
          </svg>
        );
      default:
        return <div className="module-icon-default"><Package size={32} /></div>;
    }
  };

  return (
    <div className={`module-card ${getStatusClass()}`}>
      <div className="module-card-header">
        <div className="module-card-icon">
          {getModuleIcon()}
        </div>
        <div className="module-card-title">
          <h3>{module.name}</h3>
          <p className="module-card-description">{module.description}</p>
        </div>
        <div className="module-card-toggle">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={module.isEnabled}
              onChange={(e) => onToggle(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="module-card-status">
        <div className={`module-status-indicator ${getStatusClass()}`}>
          <span className="module-status-icon">{getStatusIcon()}</span>
          <span className="module-status-text">{getStatusText()}</span>
        </div>

        {module.syncError && (
          <div className="module-error-message">
            {module.syncError}
          </div>
        )}
      </div>

      {module.isEnabled && module.isConfigured && module.stats && (
        <div className="module-card-stats">
          {module.stats.users !== undefined && (
            <div className="module-stat">
              <span className="module-stat-label">Users</span>
              <span className="module-stat-value">{module.stats.users}</span>
            </div>
          )}
          {module.stats.groups !== undefined && (
            <div className="module-stat">
              <span className="module-stat-label">Groups</span>
              <span className="module-stat-value">{module.stats.groups}</span>
            </div>
          )}
          <div className="module-stat">
            <span className="module-stat-label">Last Sync</span>
            <span className="module-stat-value">{formatLastSync(module.lastSync)}</span>
          </div>
        </div>
      )}

      <div className="module-card-actions">
        {!module.isEnabled && (
          <button
            className="module-action-button primary"
            onClick={() => onToggle(true)}
          >
            Enable Module
          </button>
        )}

        {module.isEnabled && !module.isConfigured && (
          <button
            className="module-action-button primary"
            onClick={onConfigure}
          >
            Configure
          </button>
        )}

        {module.isEnabled && module.isConfigured && (
          <>
            {onSync && (
              <button
                className="module-action-button secondary"
                onClick={onSync}
                disabled={module.syncStatus === 'syncing'}
              >
                {module.syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
              </button>
            )}
            <button
              className="module-action-button secondary"
              onClick={onConfigure}
            >
              Settings
            </button>
            {onViewDetails && (
              <button
                className="module-action-button primary"
                onClick={onViewDetails}
              >
                View Details
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ModuleCard;