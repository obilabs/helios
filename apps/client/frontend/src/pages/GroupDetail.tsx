import { useState, useEffect } from 'react';
import { useTabPersistence } from '../hooks/useTabPersistence';
import { UsersRound, Search, Plus, Trash2, Loader, Save, BarChart3, User, Pencil } from 'lucide-react';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import './Pages.css';
import { authFetch } from '../config/api';

type GroupDetailTab = 'members' | 'settings' | 'activity';

interface GroupMember {
  id: string;
  email: string;
  role: string;
  type: string;
  status: string;
}

interface GroupDetailProps {
  organizationId: string;
  groupId: string;
  onBack: () => void;
}

export function GroupDetail({ organizationId, groupId, onBack }: GroupDetailProps) {
  const [activeTab, setActiveTab] = useTabPersistence<GroupDetailTab>('helios_group_detail_tab', 'members');
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('MEMBER');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  useEffect(() => {
    fetchGroupDetails();
    fetchGroupMembers();
  }, [groupId, organizationId]);

  useEffect(() => {
    if (group) {
      setEditedName(group.name || '');
      setEditedDescription(group.description || '');
    }
  }, [group]);

  const fetchGroupDetails = async () => {
    try {
      // First get group info from the groups list
      const response = await authFetch(
        `/api/v1/google-workspace/groups/${organizationId}`
      );

      const result = await response.json();

      if (result.success && result.data?.groups) {
        const groupData = result.data.groups.find((g: any) => g.id === groupId);
        setGroup(groupData);
      }
    } catch (err: any) {
      console.error('Failed to fetch group details:', err);
      setError(err.message);
    }
  };

  const fetchGroupMembers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch(
        `/api/v1/google-workspace/groups/${groupId}/members?organizationId=${organizationId}`
      );

      const result = await response.json();

      if (result.success && result.data?.members) {
        setMembers(result.data.members);
      } else {
        setError(result.error || 'Failed to fetch group members');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch group members');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!newMemberEmail) {
      setError('Please enter an email address');
      return;
    }

    try {
      setIsAddingMember(true);
      setError(null);

      const response = await authFetch(
        `/api/v1/google-workspace/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId,
            email: newMemberEmail,
            role: newMemberRole
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        setShowAddMemberModal(false);
        setNewMemberEmail('');
        setNewMemberRole('MEMBER');
        await fetchGroupMembers(); // Refresh member list
      } else {
        setError(result.error || 'Failed to add member');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = (memberEmail: string) => {
    setMemberToRemove(memberEmail);
  };

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;

    try {
      setRemovingMember(memberToRemove);
      setError(null);

      const response = await authFetch(
        `/api/v1/google-workspace/groups/${groupId}/members/${encodeURIComponent(memberToRemove)}?organizationId=${organizationId}`,
        {
          method: 'DELETE',
        }
      );

      const result = await response.json();

      if (result.success) {
        await fetchGroupMembers(); // Refresh member list
      } else {
        setError(result.error || 'Failed to remove member');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    } finally {
      setRemovingMember(null);
      setMemberToRemove(null);
    }
  };

  const handleUpdateGroup = async () => {
    try {
      setIsSavingSettings(true);
      setError(null);

      const response = await authFetch(
        `/api/v1/google-workspace/groups/${groupId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId,
            name: editedName,
            description: editedDescription
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        setIsEditingSettings(false);
        await fetchGroupDetails(); // Refresh group details
      } else {
        setError(result.error || 'Failed to update group');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update group');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      'OWNER': '#dc2626',
      'MANAGER': '#ea580c',
      'MEMBER': '#059669'
    };
    return colors[role] || '#6b7280';
  };

  if (!group && !isLoading) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <h3>Group not found</h3>
          <button onClick={onBack} className="btn-secondary">
            ← Back to Groups
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <button
            onClick={onBack}
            className="btn-link"
            style={{ marginBottom: '0.5rem', display: 'block' }}
          >
            ← Back to Groups
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="item-icon" style={{ fontSize: '2rem' }}><UsersRound size={32} /></div>
            <div>
              <h1>{group?.name || 'Loading...'}</h1>
              <p style={{ margin: '0.25rem 0', color: '#6b7280' }}>
                {group?.email} • {members.length} member{members.length !== 1 ? 's' : ''}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <PlatformBadge platform="google" size="sm" />
                <span className="type-badge">{group?.adminCreated ? 'Admin' : 'User'} Created</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ margin: '1rem 0', padding: '1rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-container" style={{ marginTop: '2rem', borderBottom: '2px solid #e5e7eb' }}>
        <button
          className={`tab ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'members' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'members' ? '#6366f1' : '#6b7280',
            fontWeight: activeTab === 'members' ? '600' : '400',
            cursor: 'pointer',
            marginBottom: '-2px'
          }}
        >
          Members ({members.length})
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'settings' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'settings' ? '#6366f1' : '#6b7280',
            fontWeight: activeTab === 'settings' ? '600' : '400',
            cursor: 'pointer',
            marginBottom: '-2px'
          }}
        >
          Settings
        </button>
        <button
          className={`tab ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'activity' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'activity' ? '#6366f1' : '#6b7280',
            fontWeight: activeTab === 'activity' ? '600' : '400',
            cursor: 'pointer',
            marginBottom: '-2px'
          }}
        >
          Activity
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content" style={{ marginTop: '2rem' }}>
        {activeTab === 'members' && (
          <div>
            <div className="page-controls" style={{ marginBottom: '1rem' }}>
              <div className="search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search members..."
                />
              </div>
              <button
                className="btn-primary"
                onClick={() => setShowAddMemberModal(true)}
              >
                <Plus size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Add Member
              </button>
            </div>

            {isLoading ? (
              <div className="loading-spinner">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="empty-state">
                <User size={48} className="empty-icon" />
                <h3>No members found</h3>
                <p>This group doesn't have any members yet</p>
              </div>
            ) : (
              <div className="data-grid">
                <div className="grid-header">
                  <div className="col-wide">Email</div>
                  <div className="col-medium">Role</div>
                  <div className="col-small">Type</div>
                  <div className="col-small">Status</div>
                  <div className="col-small">Actions</div>
                </div>
                <div className="grid-body">
                  {members.map(member => (
                    <div key={member.id} className="grid-row">
                      <div className="col-wide">
                        <div className="item-info">
                          <div className="item-icon"><User size={20} /></div>
                          <div>
                            <div className="item-name">{member.email}</div>
                          </div>
                        </div>
                      </div>
                      <div className="col-medium">
                        <span
                          className="role-badge"
                          style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            backgroundColor: getRoleBadgeColor(member.role) + '20',
                            color: getRoleBadgeColor(member.role)
                          }}
                        >
                          {member.role}
                        </span>
                      </div>
                      <div className="col-small">
                        <span className="type-badge">{member.type}</span>
                      </div>
                      <div className="col-small">
                        <span className="type-badge">{member.status || 'ACTIVE'}</span>
                      </div>
                      <div className="col-small">
                        <button
                          className="btn-icon danger"
                          title="Remove member"
                          onClick={() => handleRemoveMember(member.email)}
                          disabled={removingMember === member.email}
                        >
                          {removingMember === member.email ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2>Group Settings</h2>
              {!isEditingSettings ? (
                <button
                  className="btn-secondary"
                  onClick={() => setIsEditingSettings(true)}
                >
                  <Pencil size={14} style={{ marginRight: 4 }} /> Edit Settings
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setIsEditingSettings(false);
                      setEditedName(group?.name || '');
                      setEditedDescription(group?.description || '');
                      setError(null);
                    }}
                    disabled={isSavingSettings}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleUpdateGroup}
                    disabled={isSavingSettings}
                  >
                    {isSavingSettings ? <><Loader size={14} className="spin" style={{ marginRight: '4px' }} /> Saving...</> : <><Save size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Save Changes</>}
                  </button>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Group Name
              </label>
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                disabled={!isEditingSettings || isSavingSettings}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  backgroundColor: !isEditingSettings ? '#f9fafb' : 'white'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Description
              </label>
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                disabled={!isEditingSettings || isSavingSettings}
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  resize: 'vertical',
                  backgroundColor: !isEditingSettings ? '#f9fafb' : 'white'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Group Email
              </label>
              <input
                type="text"
                value={group?.email || ''}
                disabled
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  backgroundColor: '#f9fafb',
                  color: '#6b7280'
                }}
              />
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                Email address cannot be changed
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Group ID
              </label>
              <input
                type="text"
                value={group?.id || ''}
                disabled
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  backgroundColor: '#f9fafb',
                  color: '#6b7280'
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="empty-state">
            <BarChart3 size={48} className="empty-icon" />
            <h3>Group Activity</h3>
            <p>Group activity log will be available here</p>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowAddMemberModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '2rem',
              width: '90%',
              maxWidth: '500px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Add Member to Group</h2>

            {error && (
              <div className="error-message" style={{ margin: '1rem 0', padding: '1rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626' }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Email Address
              </label>
              <input
                type="email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                placeholder="user@example.com"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
                disabled={isAddingMember}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Role
              </label>
              <select
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
                disabled={isAddingMember}
              >
                <option value="MEMBER">Member</option>
                <option value="MANAGER">Manager</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowAddMemberModal(false);
                  setNewMemberEmail('');
                  setNewMemberRole('MEMBER');
                  setError(null);
                }}
                disabled={isAddingMember}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleAddMember}
                disabled={isAddingMember || !newMemberEmail}
              >
                {isAddingMember ? <><Loader size={14} className="spin" style={{ marginRight: '4px' }} /> Adding...</> : <><Plus size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Add Member</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation */}
      <ConfirmDialog
        isOpen={memberToRemove !== null}
        title="Remove Member"
        message={`Are you sure you want to remove ${memberToRemove} from this group?`}
        variant="danger"
        confirmText="Remove"
        onConfirm={confirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />
    </div>
  );
}
