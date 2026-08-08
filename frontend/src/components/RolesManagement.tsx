import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Users, Loader2 } from 'lucide-react';
import { authFetch } from '../config/api';
import './RolesManagement.css';

// Use versioned API paths
const API_BASE = '/api/v1';

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  isSystem: boolean;
  createdAt: string;
}

interface UserStats {
  total: number;
  byRole: {
    admin: number;
    manager: number;
    user: number;
  };
  managers: number;
}

export function RolesManagement() {
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserStats();
  }, []);

  const fetchUserStats = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_BASE}/organization/users/stats`);
      const data = await response.json();
      if (data.success) {
        setUserStats(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch user stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Derive roles from stats - system roles have real counts
  const roles: Role[] = [
    {
      id: '1',
      name: 'Organization Admin',
      description: 'Full access to organization settings and all modules',
      permissions: ['org.*', 'users.*', 'settings.*', 'modules.*', 'reports.*'],
      userCount: userStats?.byRole.admin ?? 0,
      isSystem: true,
      createdAt: '2025-01-01'
    },
    {
      id: '2',
      name: 'User',
      description: 'Standard user with access to personal profile and assigned resources',
      permissions: ['profile.read', 'profile.write', 'assigned.read', 'apps.use'],
      userCount: userStats?.byRole.user ?? 0,
      isSystem: true,
      createdAt: '2025-01-01'
    },
    {
      id: '3',
      name: 'Manager',
      description: 'Can manage team members and view team resources',
      permissions: ['team.read', 'team.write', 'reports.read', 'users.read'],
      userCount: userStats?.byRole.manager ?? 0,
      isSystem: true,
      createdAt: '2025-01-01'
    }
  ];

  const [_roles, _setRoles] = useState<Role[]>(roles);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [_editingRole, _setEditingRole] = useState<Role | null>(null);

  const availablePermissions = [
    { category: 'Profile', permissions: ['profile.read', 'profile.write', 'profile.preferences'] },
    { category: 'Users', permissions: ['users.read', 'users.write', 'users.delete', 'users.invite'] },
    { category: 'Groups', permissions: ['groups.read', 'groups.write', 'groups.delete'] },
    { category: 'Organization', permissions: ['orgunits.read', 'orgunits.write', 'org.settings'] },
    { category: 'Assets', permissions: ['assets.read', 'assets.write', 'assets.assign'] },
    { category: 'Applications', permissions: ['apps.use', 'apps.admin', 'apps.configure'] },
    { category: 'Reports', permissions: ['reports.read', 'reports.export', 'reports.create'] },
    { category: 'Settings', permissions: ['settings.read', 'settings.write', 'integrations.manage'] },
  ];

  return (
    <div className="roles-management">
      <div className="section-header">
        <div>
          <h2>Role Management</h2>
          <p>Define roles and permissions for users in your organization</p>
        </div>
        <button className="btn-create-role" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Create Role
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 size={24} className="spin" />
          <span>Loading roles...</span>
        </div>
      ) : (
        <div className="roles-grid">
          {roles.map(role => (
            <div key={role.id} className="role-card">
              <div className="role-header">
                <div>
                  <h3>{role.name}</h3>
                  {role.isSystem && <span className="system-badge">System Role</span>}
                </div>
                <div className="role-actions">
                  {!role.isSystem && (
                    <>
                      <button className="btn-icon" onClick={() => _setEditingRole(role)}><Pencil size={14} /></button>
                      <button className="btn-icon danger"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
              <p className="role-description">{role.description}</p>

              <div className="role-permissions">
                <h4>Permissions:</h4>
                <div className="permission-tags">
                  {role.permissions.slice(0, 3).map(perm => (
                    <span key={perm} className="permission-tag">{perm}</span>
                  ))}
                  {role.permissions.length > 3 && (
                    <span className="permission-tag more">+{role.permissions.length - 3} more</span>
                  )}
                </div>
              </div>

              <div className="role-footer">
                <span className="user-count">
                  <Users size={14} className="count-icon" />
                  {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                </span>
                <button className="btn-assign">Assign Users</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Role</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Role Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Department Manager"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Describe what this role can do..."
                />
              </div>

              <div className="form-group">
                <label>Permissions</label>
                <div className="permissions-selector">
                  {availablePermissions.map(category => (
                    <div key={category.category} className="permission-category">
                      <h4>{category.category}</h4>
                      <div className="permission-checkboxes">
                        {category.permissions.map(perm => (
                          <label key={perm} className="permission-checkbox">
                            <input type="checkbox" />
                            <span>{perm}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button className="btn-primary">
                Create Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}