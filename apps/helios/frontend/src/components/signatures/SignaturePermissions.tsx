/**
 * SignaturePermissions Component
 *
 * Manage signature permission levels for users in the organization.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Users,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  AlertCircle,
  Info,
  History,
  RefreshCw,
  Crown,
} from 'lucide-react';
import { authFetch } from '../../config/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import './SignaturePermissions.css';

// Permission level type
type PermissionLevel = 'admin' | 'designer' | 'campaign_manager' | 'helpdesk' | 'viewer';

// User permission summary from API
interface UserPermissionSummary {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  effectivePermission: PermissionLevel;
  explicitPermission: PermissionLevel | null;
  grantedBy: string | null;
  granterName: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  isOrgAdmin: boolean;
}

// Permission level info
interface PermissionLevelInfo {
  level: PermissionLevel;
  displayName: string;
  description: string;
  capabilities: string[];
}

// Audit log entry
interface AuditLogEntry {
  id: string;
  organizationId: string;
  targetUserId: string;
  action: 'grant' | 'revoke' | 'update';
  oldPermissionLevel: PermissionLevel | null;
  newPermissionLevel: PermissionLevel | null;
  performedBy: string | null;
  performerName: string | null;
  performerEmail: string | null;
  createdAt: string;
}

// Stats
interface PermissionStats {
  total: number;
  byLevel: Record<PermissionLevel, number>;
  withExplicit: number;
  orgAdmins: number;
}

const SignaturePermissions: React.FC = () => {
  const [users, setUsers] = useState<UserPermissionSummary[]>([]);
  const [permissionLevels, setPermissionLevels] = useState<PermissionLevelInfo[]>([]);
  const [stats, setStats] = useState<PermissionStats | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<PermissionLevel | 'all'>('all');

  // Edit modal state
  const [editingUser, setEditingUser] = useState<UserPermissionSummary | null>(null);
  const [editForm, setEditForm] = useState<{
    permissionLevel: PermissionLevel;
    notes: string;
  }>({
    permissionLevel: 'viewer',
    notes: '',
  });

  // View state
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [showLevelInfo, setShowLevelInfo] = useState(false);
  const [userToRevoke, setUserToRevoke] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [usersRes, levelsRes, statsRes] = await Promise.all([
        authFetch('/api/signatures/permissions'),
        authFetch('/api/signatures/permissions/levels'),
        authFetch('/api/signatures/permissions/stats'),
      ]);

      if (!usersRes.ok) throw new Error('Failed to fetch users');
      if (!levelsRes.ok) throw new Error('Failed to fetch permission levels');
      if (!statsRes.ok) throw new Error('Failed to fetch stats');

      const [usersData, levelsData, statsData] = await Promise.all([
        usersRes.json(),
        levelsRes.json(),
        statsRes.json(),
      ]);

      setUsers(usersData.data || []);
      setPermissionLevels(levelsData.data || []);
      setStats(statsData.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch audit log
  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await authFetch('/api/signatures/permissions/audit?limit=50');
      if (!res.ok) throw new Error('Failed to fetch audit log');
      const data = await res.json();
      setAuditLog(data.data || []);
    } catch (err) {
      console.error('Error fetching audit log:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLog();
    }
  }, [activeTab, fetchAuditLog]);

  // Grant/update permission
  const handleSavePermission = async () => {
    if (!editingUser) return;

    setSaving(true);
    setError(null);

    try {
      const res = await authFetch(`/api/signatures/permissions/users/${editingUser.userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          permissionLevel: editForm.permissionLevel,
          notes: editForm.notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save permission');
      }

      // Refresh data
      await fetchData();
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permission');
    } finally {
      setSaving(false);
    }
  };

  // Revoke permission
  const handleRevokePermission = (userId: string) => {
    setUserToRevoke(userId);
  };

  const confirmRevokePermission = async () => {
    if (!userToRevoke) return;

    setSaving(true);
    setError(null);

    try {
      const res = await authFetch(`/api/signatures/permissions/users/${userToRevoke}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke permission');
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke permission');
    } finally {
      setSaving(false);
      setUserToRevoke(null);
    }
  };

  // Open edit modal
  const openEditModal = (user: UserPermissionSummary) => {
    setEditingUser(user);
    setEditForm({
      permissionLevel: user.effectivePermission,
      notes: user.notes || '',
    });
  };

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterLevel === 'all' || user.effectivePermission === filterLevel;

    return matchesSearch && matchesFilter;
  });

  // Get permission level badge color
  const getLevelBadgeColor = (level: PermissionLevel): string => {
    switch (level) {
      case 'admin':
        return 'badge-purple';
      case 'designer':
        return 'badge-blue';
      case 'campaign_manager':
        return 'badge-green';
      case 'helpdesk':
        return 'badge-orange';
      case 'viewer':
      default:
        return 'badge-gray';
    }
  };

  // Format date
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get level display name
  const getLevelDisplayName = (level: PermissionLevel): string => {
    const levelInfo = permissionLevels.find((l) => l.level === level);
    return levelInfo?.displayName || level;
  };

  if (loading) {
    return (
      <div className="permissions-loading">
        <RefreshCw className="spin" size={24} />
        <span>Loading permissions...</span>
      </div>
    );
  }

  return (
    <div className="signature-permissions">
      {/* Header */}
      <div className="permissions-header">
        <div className="header-content">
          <h2>
            <Shield size={24} />
            Signature Permissions
          </h2>
          <p>Control who can create templates, manage campaigns, and deploy signatures</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={() => setShowLevelInfo(!showLevelInfo)}
          >
            <Info size={16} />
            Permission Levels
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Permission levels info panel */}
      {showLevelInfo && (
        <div className="levels-info-panel">
          <h3>Permission Levels</h3>
          <div className="levels-grid">
            {permissionLevels.map((level) => (
              <div key={level.level} className="level-card">
                <div className={`level-badge ${getLevelBadgeColor(level.level)}`}>
                  {level.displayName}
                </div>
                <p className="level-description">{level.description}</p>
                <div className="level-capabilities">
                  {level.capabilities.slice(0, 4).map((cap) => (
                    <span key={cap} className="capability-tag">
                      {cap.replace('.', ': ')}
                    </span>
                  ))}
                  {level.capabilities.length > 4 && (
                    <span className="capability-more">
                      +{level.capabilities.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button className="close-btn" onClick={() => setShowLevelInfo(false)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="permissions-stats">
          <div className="stat-card">
            <Users size={20} />
            <div>
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Users</span>
            </div>
          </div>
          <div className="stat-card">
            <Crown size={20} />
            <div>
              <span className="stat-value">{stats.orgAdmins}</span>
              <span className="stat-label">Org Admins</span>
            </div>
          </div>
          <div className="stat-card">
            <Shield size={20} />
            <div>
              <span className="stat-value">{stats.withExplicit}</span>
              <span className="stat-label">Custom Permissions</span>
            </div>
          </div>
          <div className="stat-card stat-breakdown">
            <div className="breakdown-items">
              {Object.entries(stats.byLevel).map(([level, count]) => (
                <div key={level} className="breakdown-item">
                  <span className={`level-dot ${getLevelBadgeColor(level as PermissionLevel)}`} />
                  <span className="breakdown-label">{getLevelDisplayName(level as PermissionLevel)}</span>
                  <span className="breakdown-value">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="permissions-tabs">
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          Users
        </button>
        <button
          className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <History size={16} />
          Audit Log
        </button>
      </div>

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="users-section">
          {/* Toolbar */}
          <div className="section-toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="filter-select">
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value as PermissionLevel | 'all')}
              >
                <option value="all">All Levels</option>
                {permissionLevels.map((level) => (
                  <option key={level.level} value={level.level}>
                    {level.displayName}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
            <button className="btn-secondary" onClick={fetchData}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {/* Users table */}
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Permission Level</th>
                  <th>Source</th>
                  <th>Granted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.userId} className={!user.isActive ? 'inactive' : ''}>
                    <td className="user-cell">
                      <div className="user-avatar">
                        {user.firstName.charAt(0)}
                        {user.lastName.charAt(0)}
                      </div>
                      <div className="user-info">
                        <span className="user-name">
                          {user.firstName} {user.lastName}
                          {user.isOrgAdmin && (
                            <span title="Organization Admin">
                              <Crown size={14} className="admin-icon" />
                            </span>
                          )}
                        </span>
                        <span className="user-email">{user.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`permission-badge ${getLevelBadgeColor(user.effectivePermission)}`}>
                        {getLevelDisplayName(user.effectivePermission)}
                      </span>
                    </td>
                    <td className="source-cell">
                      {user.isOrgAdmin ? (
                        <span className="source-tag org-admin">Org Admin Role</span>
                      ) : user.explicitPermission ? (
                        <span className="source-tag explicit">Custom Permission</span>
                      ) : (
                        <span className="source-tag default">Default (Viewer)</span>
                      )}
                    </td>
                    <td className="date-cell">
                      {user.grantedAt ? (
                        <div>
                          <span className="date">{formatDate(user.grantedAt)}</span>
                          {user.granterName && (
                            <span className="granter">by {user.granterName}</span>
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="actions-cell">
                      {!user.isOrgAdmin && (
                        <>
                          <button
                            className="action-btn"
                            onClick={() => openEditModal(user)}
                            title="Edit permission"
                          >
                            <Edit2 size={16} />
                          </button>
                          {user.explicitPermission && (
                            <button
                              className="action-btn danger"
                              onClick={() => handleRevokePermission(user.userId)}
                              title="Revoke permission"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="empty-state">
              <Users size={48} />
              <h3>No users found</h3>
              <p>
                {searchQuery || filterLevel !== 'all'
                  ? 'Try adjusting your search or filter'
                  : 'No users in this organization'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Audit tab */}
      {activeTab === 'audit' && (
        <div className="audit-section">
          <div className="section-toolbar">
            <button className="btn-secondary" onClick={fetchAuditLog}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          <div className="audit-table-container">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>User</th>
                  <th>Change</th>
                  <th>Performed By</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span className={`action-badge action-${entry.action}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td>{entry.targetUserId}</td>
                    <td className="change-cell">
                      {entry.oldPermissionLevel && (
                        <span className={`level-tag ${getLevelBadgeColor(entry.oldPermissionLevel)}`}>
                          {getLevelDisplayName(entry.oldPermissionLevel)}
                        </span>
                      )}
                      {entry.oldPermissionLevel && entry.newPermissionLevel && (
                        <span className="arrow">&rarr;</span>
                      )}
                      {entry.newPermissionLevel && (
                        <span className={`level-tag ${getLevelBadgeColor(entry.newPermissionLevel)}`}>
                          {getLevelDisplayName(entry.newPermissionLevel)}
                        </span>
                      )}
                    </td>
                    <td>
                      {entry.performerName || entry.performerEmail || 'System'}
                    </td>
                    <td>{formatDate(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {auditLog.length === 0 && (
            <div className="empty-state">
              <History size={48} />
              <h3>No audit log entries</h3>
              <p>Permission changes will be logged here</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Permission</h3>
              <button onClick={() => setEditingUser(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="edit-user-info">
                <div className="user-avatar large">
                  {editingUser.firstName.charAt(0)}
                  {editingUser.lastName.charAt(0)}
                </div>
                <div>
                  <div className="user-name">
                    {editingUser.firstName} {editingUser.lastName}
                  </div>
                  <div className="user-email">{editingUser.email}</div>
                </div>
              </div>

              <div className="form-group">
                <label>Permission Level</label>
                <div className="level-options">
                  {permissionLevels.map((level) => (
                    <label
                      key={level.level}
                      className={`level-option ${
                        editForm.permissionLevel === level.level ? 'selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="permissionLevel"
                        value={level.level}
                        checked={editForm.permissionLevel === level.level}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            permissionLevel: e.target.value as PermissionLevel,
                          }))
                        }
                      />
                      <div className="level-option-content">
                        <span className={`level-badge ${getLevelBadgeColor(level.level)}`}>
                          {level.displayName}
                        </span>
                        <span className="level-desc">{level.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Why is this permission being granted?"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setEditingUser(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSavePermission}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw className="spin" size={16} />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Save Permission
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={userToRevoke !== null}
        title="Revoke Permission"
        message="Are you sure you want to revoke this permission? The user will have viewer access only."
        variant="warning"
        confirmText="Revoke"
        onConfirm={confirmRevokePermission}
        onCancel={() => setUserToRevoke(null)}
      />
    </div>
  );
};

export default SignaturePermissions;
