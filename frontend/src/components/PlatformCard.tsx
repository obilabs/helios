import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface PlatformCardProps {
  platform: 'google' | 'microsoft' | 'helios';
  title: string;
  logo?: string | React.ReactNode;
  connected: boolean;
  totalUsers: number;
  stats: Array<{
    value: number;
    label: string;
    warning?: boolean;
  }>;
  lastSync?: string | null;
  licenses?: {
    used: number;
    total: number;
    reportDate?: string;
  } | null;
  onClick?: () => void;
}

export const PlatformCard: React.FC<PlatformCardProps> = ({
  platform,
  title,
  logo,
  connected: _connected,
  totalUsers: _totalUsers,
  stats,
  lastSync,
  licenses,
  onClick,
}) => {

  const statusLabel = platform === 'helios' ? 'Local management' : 'Connected';
  const statusClass = platform === 'helios' ? 'local' : 'connected';

  // Format last sync time
  const formatLastSync = (syncTime: string | null | undefined) => {
    if (!syncTime) return 'Never synced';
    const date = new Date(syncTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  const needsSync = platform !== 'helios' && !lastSync;

  return (
    <div
      className={`platform-card ${platform}-card`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Compact Header */}
      <div className="platform-card-header">
        <div className="platform-title">
          {typeof logo === 'string' ? (
            <img src={logo} alt={title} className="platform-logo" />
          ) : (
            logo
          )}
          <div>
            <h3>{title}</h3>
            {platform !== 'helios' && (
              <div className={`platform-sync-time ${needsSync ? 'warning' : ''}`}>
                {needsSync && <AlertTriangle size={12} />}
                {formatLastSync(lastSync)}
              </div>
            )}
          </div>
        </div>
        <div className={`platform-status-badge ${statusClass}`}>
          <CheckCircle size={12} />
          <span>{statusLabel}</span>
        </div>
      </div>

      {/* Compact Stats Row */}
      <div className="platform-stats-compact">
        {stats.map((stat, index) => (
          <div key={index} className={`stat-compact ${stat.warning ? 'warning' : ''}`}>
            {stat.warning && <AlertTriangle size={12} className="stat-warning-icon" />}
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Licenses (for external platforms) */}
      {licenses && licenses.total > 0 && (
        <div className="platform-licenses">
          <div className="license-bar">
            <div
              className="license-bar-fill"
              style={{ width: `${(licenses.used / licenses.total) * 100}%` }}
            ></div>
          </div>
          <div className="license-text">
            Licenses: {licenses.used} / {licenses.total} (
            {Math.round((licenses.used / licenses.total) * 100)}%)
            {licenses.reportDate && (
              <span className="license-date">
                {' '}
                · as of {new Date(licenses.reportDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
