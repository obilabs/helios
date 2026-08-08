/**
 * UserSyncStatusTable Component
 *
 * Table/list view of all users in an organization with their signature sync statuses.
 * Features:
 * - Paginated user list
 * - Filter by sync status
 * - Search by name/email
 * - Individual re-sync actions
 * - Last synced timestamp per user
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  Loader2,
  UserCircle,
  Building2,
  Sparkles,
  Globe,
  FolderTree,
  Eye
} from 'lucide-react';
import { authFetch } from '../../config/api';
import './UserSyncStatusTable.css';

type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'error' | 'skipped';
type AssignmentSource = 'user' | 'group' | 'dynamic_group' | 'department' | 'ou' | 'organization' | null;

interface UserSyncInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  templateId: string | null;
  templateName: string | null;
  assignmentSource: AssignmentSource;
  syncStatus: SyncStatus;
  syncError: string | null;
  syncAttempts: number;
  lastSyncedAt: string | null;
  lastSyncAttemptAt: string | null;
}

interface UserSyncStatusTableProps {
  onUserClick?: (userId: string) => void;
  onSyncComplete?: () => void;
}

const SOURCE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  user: { label: 'Direct', icon: <UserCircle size={12} />, color: '#8b5cf6' },
  dynamic_group: { label: 'Dynamic', icon: <Sparkles size={12} />, color: '#ec4899' },
  group: { label: 'Group', icon: <Users size={12} />, color: '#3b82f6' },
  department: { label: 'Dept', icon: <Building2 size={12} />, color: '#10b981' },
  ou: { label: 'OU', icon: <FolderTree size={12} />, color: '#f59e0b' },
  organization: { label: 'Org', icon: <Globe size={12} />, color: '#6b7280' },
};

const STATUS_CONFIG: Record<SyncStatus, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: 'Pending', icon: <Clock size={14} />, color: '#f59e0b' },
  syncing: { label: 'Syncing', icon: <RefreshCw size={14} className="spinning" />, color: '#3b82f6' },
  synced: { label: 'Synced', icon: <CheckCircle size={14} />, color: '#10b981' },
  failed: { label: 'Failed', icon: <XCircle size={14} />, color: '#ef4444' },
  error: { label: 'Error', icon: <AlertCircle size={14} />, color: '#ef4444' },
  skipped: { label: 'Skipped', icon: <Clock size={14} />, color: '#9ca3af' },
};

const UserSyncStatusTable: React.FC<UserSyncStatusTableProps> = ({
  onUserClick,
  onSyncComplete
}) => {
  const [users, setUsers] = useState<UserSyncInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingUserId, setSyncingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const response = await authFetch(`/api/signatures/sync/users?${params}`);
      const data = await response.json();

      if (data.success) {
        setUsers(data.data.users || []);
        setTotal(data.data.total || 0);
      } else {
        setError(data.error || 'Failed to fetch users');
      }
    } catch (err) {
      console.error('Error fetching user sync statuses:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSyncUser = async (userId: string) => {
    setSyncingUserId(userId);
    setError(null);

    try {
      const response = await authFetch(`/api/signatures/sync/users/${userId}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        await fetchUsers();
        onSyncComplete?.();
      } else {
        setError(data.error || 'Sync failed');
      }
    } catch (err) {
      console.error('Error syncing user:', err);
      setError('Failed to sync user');
    } finally {
      setSyncingUserId(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const totalPages = Math.ceil(total / limit);

  const getSourceInfo = (source: AssignmentSource) => {
    if (!source) return null;
    return SOURCE_CONFIG[source] || null;
  };

  const getStatusInfo = (status: SyncStatus) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  };

  return (
    <div className="user-sync-table">
      <div className="table-header">
        <div className="header-title">
          <Users size={18} />
          <h3>User Sync Status</h3>
          <span className="user-count">{total} users</span>
        </div>

        <div className="header-actions">
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-select">
            <Filter size={14} />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Status</option>
              <option value="synced">Synced</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="error">Error</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>

          <button className="btn-icon" onClick={fetchUsers} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="table-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="table-loading">
          <Loader2 size={24} className="spinning" />
          <span>Loading users...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="table-empty">
          <Users size={32} />
          <p>No users found</p>
          {search || statusFilter !== 'all' ? (
            <button
              className="btn-text"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="table-content">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Template</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Last Synced</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const sourceInfo = getSourceInfo(user.assignmentSource);
                  const statusInfo = getStatusInfo(user.syncStatus);

                  return (
                    <tr key={user.id}>
                      <td className="user-cell">
                        <div className="user-info">
                          <span className="user-name">
                            {user.firstName} {user.lastName}
                          </span>
                          <span className="user-email">{user.email}</span>
                        </div>
                      </td>

                      <td className="template-cell">
                        {user.templateName || (
                          <span className="no-template">No assignment</span>
                        )}
                      </td>

                      <td className="source-cell">
                        {sourceInfo ? (
                          <span
                            className="source-badge"
                            style={{
                              backgroundColor: sourceInfo.color + '20',
                              color: sourceInfo.color
                            }}
                          >
                            {sourceInfo.icon}
                            {sourceInfo.label}
                          </span>
                        ) : (
                          <span className="no-source">—</span>
                        )}
                      </td>

                      <td className="status-cell">
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: statusInfo.color + '20',
                            color: statusInfo.color
                          }}
                          title={user.syncError || undefined}
                        >
                          {statusInfo.icon}
                          {statusInfo.label}
                          {user.syncAttempts > 1 && (
                            <span className="attempts">({user.syncAttempts})</span>
                          )}
                        </span>
                      </td>

                      <td className="date-cell">
                        {formatDate(user.lastSyncedAt)}
                      </td>

                      <td className="actions-cell">
                        <button
                          className="btn-icon-small"
                          onClick={() => onUserClick?.(user.id)}
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn-icon-small"
                          onClick={() => handleSyncUser(user.id)}
                          disabled={syncingUserId === user.id}
                          title="Re-sync signature"
                        >
                          {syncingUserId === user.id ? (
                            <Loader2 size={14} className="spinning" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="table-pagination">
              <span className="pagination-info">
                Page {page} of {totalPages}
              </span>
              <div className="pagination-buttons">
                <button
                  className="btn-pagination"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <button
                  className="btn-pagination"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserSyncStatusTable;
