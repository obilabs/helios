import { useState, useEffect } from 'react';
import { authFetch } from '../config/api';
import { ConfirmDialog } from './ui/ConfirmDialog';
import './Administrators.css';

interface Admin {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}

export function Administrators() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [adminToDemote, setAdminToDemote] = useState<string | null>(null);

  useEffect(() => {
    fetchAdmins();
    fetchUsers();
  }, []);

  const fetchAdmins = async () => {
    try {
      const response = await authFetch('/api/v1/organization/admins');

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setAdmins(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch admins:', err);
      setError('Failed to load administrators');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await authFetch('/api/v1/organization/users');

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Filter out users who are already admins
          const nonAdminUsers = data.data.filter((user: User) => user.role !== 'admin');
          setUsers(nonAdminUsers);
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const promoteUser = async () => {
    if (!selectedUserId) return;

    try {
      const response = await authFetch(`/api/v1/organization/admins/promote/${selectedUserId}`, {
        method: 'POST'
      });

      if (response.ok) {
        // Refresh the lists
        await fetchAdmins();
        await fetchUsers();
        setShowAddModal(false);
        setSelectedUserId('');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to promote user');
      }
    } catch (err) {
      console.error('Failed to promote user:', err);
      alert('Failed to promote user');
    }
  };

  const demoteAdmin = (adminId: string) => {
    setAdminToDemote(adminId);
  };

  const confirmDemoteAdmin = async () => {
    if (!adminToDemote) return;

    try {
      const response = await authFetch(`/api/v1/organization/admins/demote/${adminToDemote}`, {
        method: 'POST'
      });

      if (response.ok) {
        // Refresh the lists
        await fetchAdmins();
        await fetchUsers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to demote administrator');
      }
    } catch (err) {
      console.error('Failed to demote admin:', err);
      alert('Failed to demote administrator');
    }
    setAdminToDemote(null);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  // Get current user from localStorage (should be from context in production)
  const currentUserEmail = JSON.parse(localStorage.getItem('helios_user') || '{}').email;

  if (isLoading) {
    return (
      <div className="administrators-container">
        <div className="loading-spinner">Loading administrators...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="administrators-container">
        <div className="error-message">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="administrators-container">
      <div className="administrators-header">
        <div className="header-left">
          <h2>Administrators</h2>
          <span className="admin-count">{admins.length} administrator{admins.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="header-right">
          <button className="btn-add-admin" onClick={() => setShowAddModal(true)}>
            + Add Administrator
          </button>
        </div>
      </div>

      <div className="administrators-info">
        <div className="info-card">
          <span className="info-icon">ℹ️</span>
          <div>
            <strong>Administrator Privileges:</strong>
            <ul>
              <li>Full access to all organization settings</li>
              <li>Can manage users and other administrators</li>
              <li>Can enable/disable modules and integrations</li>
              <li>Can view audit logs and security settings</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="administrators-list">
        {admins.map(admin => {
          const initials = `${admin.first_name[0]}${admin.last_name[0] || ''}`.toUpperCase();
          const isCurrentUser = admin.email === currentUserEmail;

          return (
            <div key={admin.id} className="admin-card">
              <div className="admin-avatar" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                {initials}
              </div>
              <div className="admin-info">
                <div className="admin-name">
                  {admin.first_name} {admin.last_name}
                  {isCurrentUser && <span className="current-badge">You</span>}
                </div>
                <div className="admin-email">{admin.email}</div>
                <div className="admin-meta">
                  <span className="meta-item">Added: {formatDate(admin.created_at)}</span>
                  <span className="meta-item">Last login: {formatDate(admin.last_login)}</span>
                </div>
              </div>
              <div className="admin-actions">
                {!isCurrentUser && admins.length > 1 && (
                  <button
                    className="btn-demote"
                    onClick={() => demoteAdmin(admin.id)}
                    title="Demote to regular user"
                  >
                    Remove Admin
                  </button>
                )}
                {isCurrentUser && (
                  <span className="no-action">Current User</span>
                )}
                {admins.length === 1 && (
                  <span className="no-action">Last Admin</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Administrator</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>Select a user to promote to administrator:</p>
              <select
                className="user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Select a user...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName} ({user.email})
                  </option>
                ))}
              </select>
              {users.length === 0 && (
                <p className="no-users-message">
                  No eligible users found. All users are already administrators.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button
                className="btn-confirm"
                onClick={promoteUser}
                disabled={!selectedUserId}
              >
                Promote to Administrator
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={adminToDemote !== null}
        title="Demote Administrator"
        message="Are you sure you want to demote this administrator to a regular user?"
        variant="warning"
        confirmText="Demote"
        onConfirm={confirmDemoteAdmin}
        onCancel={() => setAdminToDemote(null)}
      />
    </div>
  );
}