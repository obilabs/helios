import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, RefreshCw, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { authFetch } from '../../config/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import './ApiKeyList.css';

interface ApiKey {
  id: string;
  name: string;
  description: string;
  type: 'service' | 'vendor';
  keyPrefix: string;
  permissions: string[];
  status: 'active' | 'expired' | 'revoked' | 'expiring_soon';
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  vendorConfig?: any;
  serviceConfig?: any;
}

interface ApiKeyListProps {
  organizationId: string;
  onCreateKey: () => void;
}

export function ApiKeyList({ organizationId, onCreateKey }: ApiKeyListProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'service' | 'vendor'>('all');
  const [keyToRevoke, setKeyToRevoke] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchKeys();
  }, [organizationId, filter, typeFilter]);

  const fetchKeys = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      if (typeFilter !== 'all') params.append('type', typeFilter);

      const response = await authFetch(
        `/api/v1/organization/api-keys?${params.toString()}`
      );

      const data = await response.json();
      if (data.success) {
        setKeys(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = (keyId: string, keyName: string) => {
    setKeyToRevoke({ id: keyId, name: keyName });
  };

  const confirmRevoke = async () => {
    if (!keyToRevoke) return;

    try {
      const response = await authFetch(
        `/api/v1/organization/api-keys/${keyToRevoke.id}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();
      if (data.success) {
        alert('API key revoked successfully');
        fetchKeys();
      } else {
        alert(`Failed to revoke key: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
    setKeyToRevoke(null);
  };

  const handleRenew = async (_keyId: string, keyName: string) => {
    // This would open a renewal dialog - for now just alert
    alert(`Renewal for "${keyName}" will be implemented in the renewal dialog`);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: { label: 'Active', color: '#10b981', icon: CheckCircle },
      expired: { label: 'Expired', color: '#ef4444', icon: AlertCircle },
      revoked: { label: 'Revoked', color: '#6b7280', icon: AlertCircle },
      expiring_soon: { label: 'Expiring Soon', color: '#f59e0b', icon: Clock },
    };

    const badge = badges[status as keyof typeof badges] || badges.active;
    const Icon = badge.icon;

    return (
      <span
        className="status-badge"
        style={{
          color: badge.color,
          background: `${badge.color}15`,
          border: `1px solid ${badge.color}40`,
        }}
      >
        <Icon size={12} />
        {badge.label}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    return (
      <span className={`type-badge type-${type}`}>
        {type === 'service' ? 'Service' : 'Vendor'}
      </span>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never used';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  if (isLoading) {
    return (
      <div className="api-keys-loading">
        <div className="loading-spinner"></div>
        <p>Loading API keys...</p>
      </div>
    );
  }

  return (
    <div className="api-keys-container">
      <div className="api-keys-header">
        <div className="header-left">
          <h3>
            <Key size={20} />
            API Keys
          </h3>
          <p>Manage API keys for programmatic access and partner integrations</p>
        </div>
        <button className="btn-primary" onClick={onCreateKey}>
          <Plus size={16} />
          Create New Key
        </button>
      </div>

      <div className="api-keys-filters">
        <div className="filter-group">
          <label>Status:</label>
          <select
            className="filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Type:</label>
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
          >
            <option value="all">All Types</option>
            <option value="service">Service Keys</option>
            <option value="vendor">Vendor Keys</option>
          </select>
        </div>

        <div className="filter-stats">
          <span>{keys.length} key{keys.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {keys.length === 0 ? (
        <div className="empty-state">
          <Key size={48} style={{ color: 'var(--theme-primary)', opacity: 0.5 }} />
          <h4>No API keys found</h4>
          <p>Create your first API key to enable programmatic access</p>
          <button className="btn-primary" onClick={onCreateKey}>
            <Plus size={16} />
            Create API Key
          </button>
        </div>
      ) : (
        <div className="api-keys-list">
          {keys.map((key) => (
            <div key={key.id} className="api-key-card">
              <div className="key-header">
                <div className="key-title">
                  <h4>{key.name}</h4>
                  <div className="key-badges">
                    {getTypeBadge(key.type)}
                    {getStatusBadge(key.status)}
                  </div>
                </div>
                <div className="key-actions">
                  {key.status === 'expired' && (
                    <button
                      className="btn-secondary-sm"
                      onClick={() => handleRenew(key.id, key.name)}
                      title="Renew key"
                    >
                      <RefreshCw size={14} />
                      Renew
                    </button>
                  )}
                  {key.status !== 'revoked' && (
                    <button
                      className="btn-danger-sm"
                      onClick={() => handleRevoke(key.id, key.name)}
                      title="Revoke key"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {key.description && (
                <p className="key-description">{key.description}</p>
              )}

              <div className="key-details">
                <div className="key-detail-row">
                  <span className="detail-label">Key Prefix:</span>
                  <code className="key-prefix">{key.keyPrefix}...</code>
                </div>

                <div className="key-detail-row">
                  <span className="detail-label">Permissions:</span>
                  <div className="permissions-list">
                    {key.permissions.slice(0, 3).map((perm, idx) => (
                      <span key={idx} className="permission-tag">{perm}</span>
                    ))}
                    {key.permissions.length > 3 && (
                      <span className="permission-tag more">
                        +{key.permissions.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="key-detail-row">
                  <span className="detail-label">Created:</span>
                  <span className="detail-value">{formatDate(key.createdAt)}</span>
                </div>

                {key.expiresAt && (
                  <div className="key-detail-row">
                    <span className="detail-label">Expires:</span>
                    <span className="detail-value">{formatDate(key.expiresAt)}</span>
                  </div>
                )}

                <div className="key-detail-row">
                  <span className="detail-label">Last Used:</span>
                  <span className="detail-value">{formatRelativeTime(key.lastUsedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={keyToRevoke !== null}
        title="Revoke API Key"
        message={`Are you sure you want to revoke the API key "${keyToRevoke?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Revoke"
        onConfirm={confirmRevoke}
        onCancel={() => setKeyToRevoke(null)}
      />
    </div>
  );
}
