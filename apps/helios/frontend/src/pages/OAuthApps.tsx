import { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, Loader2, AppWindow, AlertTriangle, Users } from 'lucide-react';
import { authFetch } from '../config/api';
import { useToast } from '../contexts/ToastContext';
import { DataTable, createColumnHelper } from '../components/ui/DataTable';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import './Pages.css';

interface OAuthApp {
  clientId: string;
  displayName: string | null;
  scopes: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  userCount: number;
  firstSeen: string;
  lastSeen: string;
}

interface AppUser {
  email: string;
  scopes: string[];
  syncedAt: string;
}

interface OAuthAppsProps {
  organizationId: string;
}

const columnHelper = createColumnHelper<OAuthApp>();

const getRiskBadgeStyle = (level: string) => {
  switch (level) {
    case 'high':
      return { backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' };
    case 'medium':
      return { backgroundColor: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' };
    case 'low':
      return { backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' };
    default:
      return { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' };
  }
};

export function OAuthApps({ organizationId: _organizationId }: OAuthAppsProps) {
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [totalApps, setTotalApps] = useState(0);
  const [totalGrants, setTotalGrants] = useState(0);
  const { showSuccess, showError } = useToast();

  // Modal states
  const [selectedApp, setSelectedApp] = useState<OAuthApp | null>(null);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (riskFilter !== 'all') params.append('riskLevel', riskFilter);
      params.append('sortBy', 'userCount');
      params.append('sortOrder', 'desc');
      params.append('limit', '100');

      const response = await authFetch(`/api/v1/organization/security/oauth-apps?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setApps(data.data.apps || []);
          setTotalApps(data.data.summary?.totalApps || 0);
          setTotalGrants(data.data.summary?.totalGrants || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching OAuth apps:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, [searchTerm, riskFilter]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await authFetch('/api/v1/organization/security/oauth-apps/sync', {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        showSuccess(`Synced ${data.data.appsFound} apps from ${data.data.usersProcessed} users`);
        fetchApps();
      } else {
        showError('Failed to sync OAuth tokens');
      }
    } catch (error) {
      showError('Failed to sync OAuth tokens');
    } finally {
      setSyncing(false);
    }
  };

  const handleViewUsers = async (app: OAuthApp) => {
    setSelectedApp(app);
    setLoadingUsers(true);
    try {
      const response = await authFetch(
        `/api/v1/organization/security/oauth-apps/${encodeURIComponent(app.clientId)}/users`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAppUsers(data.data.users || []);
        }
      }
    } catch (error) {
      console.error('Error fetching app users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleRevokeAll = async () => {
    if (!selectedApp) return;

    setRevoking(true);
    try {
      const response = await authFetch(
        `/api/v1/organization/security/oauth-apps/${encodeURIComponent(selectedApp.clientId)}`,
        { method: 'DELETE' }
      );
      if (response.ok) {
        const data = await response.json();
        showSuccess(`Revoked ${selectedApp.displayName || 'app'} from ${data.data.revokedCount} users`);
        setShowRevokeConfirm(false);
        setSelectedApp(null);
        fetchApps();
      } else {
        const error = await response.json();
        showError(error.message || 'Failed to revoke app');
      }
    } catch (error) {
      showError('Failed to revoke app');
    } finally {
      setRevoking(false);
    }
  };

  const columns = useMemo(() => [
    columnHelper.accessor('displayName', {
      header: 'App Name',
      cell: (info) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AppWindow size={16} style={{ color: '#6b7280' }} />
          <span style={{ fontWeight: 500 }}>{info.getValue() || 'Unknown App'}</span>
        </div>
      ),
      size: 250
    }),
    columnHelper.accessor('userCount', {
      header: 'Users',
      cell: (info) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Users size={14} style={{ color: '#6b7280' }} />
          <span>{info.getValue()}</span>
        </div>
      ),
      size: 80
    }),
    columnHelper.accessor('riskLevel', {
      header: 'Risk',
      cell: (info) => {
        const level = info.getValue();
        const style = getRiskBadgeStyle(level);
        return (
          <span style={{
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            textTransform: 'capitalize',
            ...style
          }}>
            {level}
          </span>
        );
      },
      size: 100
    }),
    columnHelper.accessor('scopes', {
      header: 'Scopes',
      cell: (info) => {
        const scopes = info.getValue() || [];
        if (scopes.length === 0) return <span style={{ color: '#9ca3af' }}>None</span>;
        return (
          <span title={scopes.join(', ')} style={{ color: '#6b7280', fontSize: '13px' }}>
            {scopes.slice(0, 2).join(', ')}
            {scopes.length > 2 && ` +${scopes.length - 2}`}
          </span>
        );
      },
      size: 200
    }),
    columnHelper.accessor('lastSeen', {
      header: 'Last Seen',
      cell: (info) => {
        const date = info.getValue();
        return date ? new Date(date).toLocaleDateString() : '-';
      },
      size: 100
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewUsers(row.original);
            }}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              color: 'var(--theme-primary)',
              border: '1px solid var(--theme-primary)',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            View Users
          </button>
        </div>
      ),
      size: 100
    })
  ], []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>OAuth Apps</h1>
          <p className="page-subtitle">
            Manage third-party applications connected to your organization
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              Sync Tokens
            </>
          )}
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600 }}>{totalApps}</div>
          <div style={{ color: '#6b7280', fontSize: '14px' }}>Connected Apps</div>
        </div>
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600 }}>{totalGrants}</div>
          <div style={{ color: '#6b7280', fontSize: '14px' }}>Total Grants</div>
        </div>
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#dc2626' }}>
            {apps.filter(a => a.riskLevel === 'high').length}
          </div>
          <div style={{ color: '#6b7280', fontSize: '14px' }}>High Risk Apps</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-container">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Risk Levels</option>
          <option value="high">High Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="low">Low Risk</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px'
        }}>
          <AppWindow size={48} style={{ color: '#9ca3af', marginBottom: '16px' }} />
          <h3 style={{ marginBottom: '8px' }}>No OAuth Apps Found</h3>
          <p style={{ color: '#6b7280' }}>
            Run a sync to discover third-party apps connected to your organization
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={apps}
          onRowClick={handleViewUsers}
        />
      )}

      {/* App Users Modal */}
      {selectedApp && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedApp(null);
            setAppUsers([]);
          }}
          title={selectedApp.displayName || 'Unknown App'}
          size="large"
        >
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px'
            }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                  {selectedApp.userCount} users have granted access
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  Scopes: {selectedApp.scopes.join(', ') || 'None'}
                </div>
              </div>
              <span style={{
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                textTransform: 'capitalize',
                ...getRiskBadgeStyle(selectedApp.riskLevel)
              }}>
                {selectedApp.riskLevel} risk
              </span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h4>Users with Access</h4>
              <button
                onClick={() => setShowRevokeConfirm(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertTriangle size={14} />
                Revoke from All Users
              </button>
            </div>

            {loadingUsers ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                        Email
                      </th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                        Last Synced
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {appUsers.map(user => (
                      <tr key={user.email}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>
                          {user.email}
                        </td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                          {new Date(user.syncedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Revoke Confirmation */}
      <ConfirmDialog
        isOpen={showRevokeConfirm}
        title="Revoke App Access"
        message={`Are you sure you want to revoke "${selectedApp?.displayName || 'this app'}" from all ${selectedApp?.userCount} users? This action cannot be undone.`}
        confirmText={revoking ? 'Revoking...' : 'Revoke All'}
        cancelText="Cancel"
        onConfirm={handleRevokeAll}
        onCancel={() => setShowRevokeConfirm(false)}
        variant="danger"
      />
    </div>
  );
}
