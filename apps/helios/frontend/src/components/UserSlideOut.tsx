import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTabPersistence } from '../hooks/useTabPersistence';
import { ClipboardList, Users, BarChart3, Settings, Trash2, CheckCircle, AlertTriangle, FileText, PenTool, Link2, Lock, Mail, Forward, UserPlus, X, Loader2, ShieldCheck, AppWindow, Fingerprint } from 'lucide-react';
import { UserSignatureStatus } from './signatures';
import { useToast } from '../contexts/ToastContext';
import { authFetch } from '../config/api';
import { ConfirmDialog } from './ui/ConfirmDialog';
import './UserSlideOut.css';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  platforms: string[];
  lastLogin?: string;
  jobTitle?: string;
  department?: string;
  organizationalUnit?: string;
  location?: string;
  mobilePhone?: string;
  workPhone?: string;
  avatarUrl?: string;
  googleWorkspaceId?: string;
  microsoft365Id?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  managerId?: string;
  managerName?: string;
}

interface UserSlideOutProps {
  user: User;
  organizationId: string;
  onClose: () => void;
  onUserUpdated?: () => void;
}

type TabType = 'overview' | 'groups' | 'email' | 'signature' | 'security' | 'platforms' | 'activity' | 'settings' | 'danger';

interface EmailDelegate {
  delegateEmail: string;
  verificationStatus?: string;
}

interface ForwardingSettings {
  enabled: boolean;
  emailAddress?: string;
  disposition?: 'leaveInInbox' | 'archive' | 'trash' | 'markRead';
}

export function UserSlideOut({ user, organizationId, onClose, onUserUpdated }: UserSlideOutProps) {
  const [activeTab, setActiveTab] = useTabPersistence<TabType>('helios_user_slideout_tab', 'overview');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [googleAction, setGoogleAction] = useState<'keep' | 'suspend' | 'delete'>('delete');
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<User>(user);
  const [isSaving, setIsSaving] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [isCreatingInGoogle, setIsCreatingInGoogle] = useState(false);
  const { showSuccess, showError } = useToast();

  // Dropdown data for edit mode
  const [availableManagers, setAvailableManagers] = useState<any[]>([]);
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);

  // Confirmation dialog state
  const [statusChangeConfirm, setStatusChangeConfirm] = useState<string | null>(null);
  const [showCreateInGoogleConfirm, setShowCreateInGoogleConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [groupToRemove, setGroupToRemove] = useState<string | null>(null);
  const [availableOrgUnits, setAvailableOrgUnits] = useState<any[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<any[]>([]);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [selectedNewGroupIds, setSelectedNewGroupIds] = useState<string[]>([]);

  // Email settings state
  const [emailDelegates, setEmailDelegates] = useState<EmailDelegate[]>([]);
  const [forwardingSettings, setForwardingSettings] = useState<ForwardingSettings | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [newDelegateEmail, setNewDelegateEmail] = useState('');
  const [addingDelegate, setAddingDelegate] = useState(false);
  const [removingDelegate, setRemovingDelegate] = useState<string | null>(null);
  const [showForwardingModal, setShowForwardingModal] = useState(false);
  const [newForwardingEmail, setNewForwardingEmail] = useState('');
  const [forwardingDisposition, setForwardingDisposition] = useState<'leaveInInbox' | 'archive' | 'trash' | 'markRead'>('leaveInInbox');
  const [savingForwarding, setSavingForwarding] = useState(false);

  // Initial password reveal state
  const [initialPassword, setInitialPassword] = useState<{ password: string; createdAt: string } | null>(null);
  const [initialPasswordLoading, setInitialPasswordLoading] = useState(false);
  const [initialPasswordClearing, setInitialPasswordClearing] = useState(false);
  const [initialPasswordError, setInitialPasswordError] = useState<string | null>(null);

  // Security tab state - Unified 2FA format
  interface UserSecurityData {
    twoFactor: {
      helios: { isEnrolled: boolean; updatedAt?: string } | null;
      google: { isEnrolled: boolean; isEnforced?: boolean; updatedAt?: string } | null;
      anyEnrolled: boolean;
      allEnrolled: boolean;
    };
    passkeys: {
      count: number;
      devices: Array<{
        id: string;
        name: string | null;
        createdAt: string;
      }>;
    } | null;
    connectedApps: Array<{
      id: string;
      clientId: string;
      displayName: string | null;
      scopes: string[];
      nativeApp: boolean;
      lastTimeUsed: string | null;
    }>;
  }
  const [securityData, setSecurityData] = useState<UserSecurityData | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  // Helper function to normalize department name (strip OU path prefixes)
  const normalizeDepartmentName = (department: string | undefined | null): string => {
    if (!department) return '-';
    // If it's an OU path like "/Staff/Sales" or "/Marketing", extract just the last part
    if (department.startsWith('/')) {
      const parts = department.split('/').filter(Boolean);
      return parts[parts.length - 1] || department;
    }
    return department;
  };

  useEffect(() => {
    // Fetch additional data based on active tab
    if (activeTab === 'groups') {
      fetchUserGroups();
    } else if (activeTab === 'activity') {
      fetchActivityLog();
    } else if (activeTab === 'email') {
      fetchEmailSettings();
    } else if (activeTab === 'security') {
      fetchSecurityData();
    }
  }, [activeTab, user.id]);

  // Fetch dropdown data when entering edit mode
  useEffect(() => {
    if (isEditing) {
      fetchDropdownData();
    }
  }, [isEditing]);

  const fetchDropdownData = async () => {
    // Fetch available managers (all active users)
    try {
      const managersResponse = await authFetch(`/api/v1/organization/users?status=active`);
      if (managersResponse.ok) {
        const managersData = await managersResponse.json();
        setAvailableManagers(managersData.data || []);
      }
    } catch (error) {
      console.error('Error fetching managers:', error);
    }

    // Groups are now fetched when needed in the Groups tab

    // Fetch organizational units from Google Workspace
    try {
      const orgUnitsResponse = await authFetch(`/api/v1/google-workspace/org-units/${organizationId}`);
      if (orgUnitsResponse.ok) {
        const orgUnitsData = await orgUnitsResponse.json();
        if (orgUnitsData.success && orgUnitsData.data) {
          setAvailableOrgUnits(orgUnitsData.data);
        }
      }
    } catch (error) {
      console.error('Error fetching org units:', error);
    }

    // Fetch available departments
    try {
      const deptResponse = await authFetch(`/api/v1/departments`);
      if (deptResponse.ok) {
        const deptData = await deptResponse.json();
        if (deptData.success && deptData.data) {
          setAvailableDepartments(deptData.data);
        }
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchUserGroups = async () => {
    setLoading(true);
    try {
      const response = await authFetch(`/api/v1/organization/users/${user.id}/groups`);
      if (response.ok) {
        const data = await response.json();
        setGroups(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLog = async () => {
    setLoading(true);
    try {
      const response = await authFetch(`/api/v1/organization/users/${user.id}/activity`);
      if (response.ok) {
        const data = await response.json();
        setActivityLog(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching activity:', error);
    } finally {
      setLoading(false);
    }
  };

  // Email Settings Functions
  const fetchEmailSettings = async () => {
    if (!user.googleWorkspaceId) return;

    setEmailLoading(true);
    try {
      // Fetch delegates
      const delegatesResponse = await authFetch(
        `/api/v1/google-workspace/relay?path=/gmail/v1/users/${encodeURIComponent(user.email)}/settings/delegates`
      );
      if (delegatesResponse.ok) {
        const delegatesData = await delegatesResponse.json();
        if (delegatesData.success && delegatesData.data?.delegates) {
          setEmailDelegates(delegatesData.data.delegates);
        } else {
          setEmailDelegates([]);
        }
      }

      // Fetch forwarding settings
      const forwardingResponse = await authFetch(
        `/api/v1/google-workspace/relay?path=/gmail/v1/users/${encodeURIComponent(user.email)}/settings/autoForwarding`
      );
      if (forwardingResponse.ok) {
        const forwardingData = await forwardingResponse.json();
        if (forwardingData.success && forwardingData.data) {
          setForwardingSettings(forwardingData.data);
        }
      }
    } catch (error) {
      console.error('Error fetching email settings:', error);
    } finally {
      setEmailLoading(false);
    }
  };

  const fetchSecurityData = async () => {
    setSecurityLoading(true);
    try {
      const response = await authFetch(
        `/api/v1/organization/security/users/${encodeURIComponent(user.email)}/security`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSecurityData(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching security data:', error);
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleRevokeToken = async (clientId: string, displayName: string | null) => {
    setRevokingToken(clientId);
    try {
      const response = await authFetch(
        `/api/v1/organization/security/users/${encodeURIComponent(user.email)}/oauth-tokens/${encodeURIComponent(clientId)}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        showSuccess(`Revoked access for ${displayName || 'app'}`);
        fetchSecurityData(); // Refresh the list
      } else {
        const errorData = await response.json();
        showError(errorData.message || 'Failed to revoke token');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to revoke token');
    } finally {
      setRevokingToken(null);
    }
  };

  const handleAddDelegate = async () => {
    if (!newDelegateEmail.trim()) return;

    setAddingDelegate(true);
    try {
      const response = await authFetch(
        `/api/v1/google-workspace/relay?path=/gmail/v1/users/${encodeURIComponent(user.email)}/settings/delegates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delegateEmail: newDelegateEmail.trim() })
        }
      );

      if (response.ok) {
        showSuccess(`Added ${newDelegateEmail} as delegate`);
        setNewDelegateEmail('');
        fetchEmailSettings(); // Refresh the list
      } else {
        const errorData = await response.json();
        showError(errorData.message || 'Failed to add delegate');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to add delegate');
    } finally {
      setAddingDelegate(false);
    }
  };

  const handleRemoveDelegate = async (delegateEmail: string) => {
    setRemovingDelegate(delegateEmail);
    try {
      const response = await authFetch(
        `/api/v1/google-workspace/relay?path=/gmail/v1/users/${encodeURIComponent(user.email)}/settings/delegates/${encodeURIComponent(delegateEmail)}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        showSuccess(`Removed ${delegateEmail} as delegate`);
        fetchEmailSettings(); // Refresh the list
      } else {
        const errorData = await response.json();
        showError(errorData.message || 'Failed to remove delegate');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to remove delegate');
    } finally {
      setRemovingDelegate(null);
    }
  };

  const handleSetForwarding = async () => {
    if (!newForwardingEmail.trim()) {
      showError('Please enter a forwarding email address');
      return;
    }

    setSavingForwarding(true);
    try {
      // First, add the forwarding address
      const addResponse = await authFetch(
        `/api/v1/google-workspace/relay?path=/gmail/v1/users/${encodeURIComponent(user.email)}/settings/forwardingAddresses`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forwardingEmail: newForwardingEmail.trim() })
        }
      );

      // May already exist, ignore 409 errors
      if (!addResponse.ok && addResponse.status !== 409) {
        const errorData = await addResponse.json();
        if (!errorData.message?.includes('already exists')) {
          showError(errorData.message || 'Failed to add forwarding address');
          return;
        }
      }

      // Then enable auto-forwarding
      const enableResponse = await authFetch(
        `/api/v1/google-workspace/relay?path=/gmail/v1/users/${encodeURIComponent(user.email)}/settings/autoForwarding`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: true,
            emailAddress: newForwardingEmail.trim(),
            disposition: forwardingDisposition
          })
        }
      );

      if (enableResponse.ok) {
        showSuccess(`Forwarding enabled to ${newForwardingEmail}`);
        setShowForwardingModal(false);
        setNewForwardingEmail('');
        fetchEmailSettings(); // Refresh
      } else {
        const errorData = await enableResponse.json();
        showError(errorData.message || 'Failed to enable forwarding');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to set forwarding');
    } finally {
      setSavingForwarding(false);
    }
  };

  const handleDisableForwarding = async () => {
    setSavingForwarding(true);
    try {
      const response = await authFetch(
        `/api/v1/google-workspace/relay?path=/gmail/v1/users/${encodeURIComponent(user.email)}/settings/autoForwarding`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false })
        }
      );

      if (response.ok) {
        showSuccess('Forwarding disabled');
        fetchEmailSettings(); // Refresh
      } else {
        const errorData = await response.json();
        showError(errorData.message || 'Failed to disable forwarding');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to disable forwarding');
    } finally {
      setSavingForwarding(false);
    }
  };

  const handleSaveUser = async () => {
    setIsSaving(true);
    try {
      const response = await authFetch(
        `/api/v1/organization/users/${user.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            firstName: editedUser.firstName,
            lastName: editedUser.lastName,
            jobTitle: editedUser.jobTitle,
            department: editedUser.department,
            location: editedUser.location,
            organizationalUnit: editedUser.organizationalUnit,
            mobilePhone: editedUser.mobilePhone,
            workPhone: editedUser.workPhone,
            role: editedUser.role,
            managerId: editedUser.managerId || null
          })
        }
      );

      if (response.ok) {
        showSuccess('User updated successfully');
        setIsEditing(false);
        onUserUpdated?.();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to update user');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedUser(user);
    setIsEditing(false);
  };

  const handleStatusChange = (newStatus: string) => {
    setStatusChangeConfirm(newStatus);
  };

  const confirmStatusChange = async () => {
    if (!statusChangeConfirm) return;
    const newStatus = statusChangeConfirm;
    setStatusChangeConfirm(null);

    try {
      const response = await authFetch(
        `/api/v1/organization/users/${user.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: newStatus })
        }
      );

      if (response.ok) {
        showSuccess('User status updated successfully');
        onUserUpdated?.();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to update status');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to update status');
    }
  };

  const handleResetPassword = async () => {
    setResetLoading(true);
    try {
      const response = await authFetch(
        `/api/v1/organization/users/${user.id}/reset-password`,
        {
          method: 'POST'
        }
      );

      if (response.ok) {
        showSuccess('Password reset email sent successfully');
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to send reset email');
      }
    } catch (error: any) {
      showError(error.message || 'Network error');
    } finally {
      setResetLoading(false);
    }
  };

  const handleRevealInitialPassword = async () => {
    setInitialPasswordLoading(true);
    setInitialPasswordError(null);
    try {
      const response = await authFetch(`/api/v1/initial-passwords/${encodeURIComponent(user.email)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setInitialPassword({
            password: data.data.password,
            createdAt: data.data.createdAt
          });
        } else {
          setInitialPasswordError('No initial password found');
        }
      } else {
        const data = await response.json();
        setInitialPasswordError(data.error || 'No initial password stored for this user');
      }
    } catch (error: any) {
      setInitialPasswordError('Failed to retrieve initial password');
    } finally {
      setInitialPasswordLoading(false);
    }
  };

  const handleClearInitialPassword = async () => {
    setInitialPasswordClearing(true);
    try {
      const response = await authFetch(`/api/v1/initial-passwords/${encodeURIComponent(user.email)}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setInitialPassword(null);
        showSuccess('Initial password cleared');
      } else {
        showError('Failed to clear initial password');
      }
    } catch (error: any) {
      showError('Failed to clear initial password');
    } finally {
      setInitialPasswordClearing(false);
    }
  };

  const handleDeleteUser = async () => {
    setShowDeleteModal(true);
  };

  const handleCreateInGoogle = () => {
    setShowCreateInGoogleConfirm(true);
  };

  const confirmCreateInGoogle = async () => {
    setShowCreateInGoogleConfirm(false);
    setIsCreatingInGoogle(true);
    try {
      const response = await authFetch(
        `/api/v1/google-workspace/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            heliosUserId: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            jobTitle: user.jobTitle,
            department: user.department,
            orgUnitPath: user.organizationalUnit || '/'
          })
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccess('User created in Google Workspace successfully');
        onUserUpdated?.();
      } else {
        showError(data.error || 'Failed to create user in Google Workspace');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to create user in Google Workspace');
    } finally {
      setIsCreatingInGoogle(false);
    }
  };

  const confirmDelete = async () => {
    try {
      const response = await authFetch(
        `/api/v1/organization/users/${user.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            googleAction: user.googleWorkspaceId ? googleAction : undefined
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        showSuccess(data.message || 'User deleted successfully');
        setShowDeleteModal(false);
        onUserUpdated?.();
        onClose();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to delete user');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to delete user');
    }
  };

  const handleRestoreUser = () => {
    setShowRestoreConfirm(true);
  };

  const confirmRestoreUser = async () => {
    setShowRestoreConfirm(false);

    try {
      const response = await authFetch(
        `/api/v1/organization/users/${user.id}/restore`,
        {
          method: 'PATCH'
        }
      );

      if (response.ok) {
        showSuccess('User restored successfully');
        onUserUpdated?.();
        onClose();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to restore user');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to restore user');
    }
  };

  const handleAddToGroups = async () => {
    if (selectedNewGroupIds.length === 0) {
      showError('Please select at least one group');
      return;
    }

    try {
      const errors: string[] = [];
      let successCount = 0;

      // Add user to each selected group
      for (const groupId of selectedNewGroupIds) {
        try {
          const response = await authFetch(
            `/api/v1/organization/access-groups/${groupId}/members`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                userId: user.id,
                memberType: 'member'
              })
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            const data = await response.json();
            const groupName = availableGroups.find(g => g.id === groupId)?.name || groupId;
            errors.push(`${groupName}: ${data.error || 'Failed'}`);
          }
        } catch (error: any) {
          const groupName = availableGroups.find(g => g.id === groupId)?.name || groupId;
          errors.push(`${groupName}: ${error.message}`);
        }
      }

      // Refresh groups list
      await fetchUserGroups();

      // Show results
      if (successCount > 0 && errors.length === 0) {
        // All successful
        showSuccess(`Added to ${successCount} group(s)`);
        setShowAddGroupModal(false);
        setSelectedNewGroupIds([]);
      } else if (successCount > 0 && errors.length > 0) {
        // Partial success
        showError(`Added to ${successCount} group(s), but some failed: ${errors.join(', ')}`);
        setShowAddGroupModal(false);
        setSelectedNewGroupIds([]);
      } else {
        // All failed
        showError(`Failed to add to groups: ${errors.join(', ')}`);
      }
    } catch (error: any) {
      showError(error.message || 'Failed to add to groups');
    }
  };

  const handleRemoveFromGroup = (groupId: string) => {
    setGroupToRemove(groupId);
  };

  const confirmRemoveFromGroup = async () => {
    if (!groupToRemove) return;

    try {
      const response = await authFetch(
        `/api/v1/organization/access-groups/${groupToRemove}/members/${user.id}`,
        {
          method: 'DELETE'
        }
      );

      if (response.ok) {
        showSuccess('User removed from group');
        // Refresh groups list
        await fetchUserGroups();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to remove user from group');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to remove user from group');
    } finally {
      setGroupToRemove(null);
    }
  };


  const getStatusBadgeClass = (status?: string) => {
    if (status === 'active') return 'status-badge-active';
    if (status === 'pending') return 'status-badge-pending';
    if (status === 'deleted') return 'status-badge-deleted';
    return 'status-badge-active';
  };

  const tabs: { id: TabType; label: string; icon: ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <ClipboardList size={16} /> },
    { id: 'groups', label: 'Groups', icon: <Users size={16} /> },
    { id: 'email', label: 'Email', icon: <Mail size={16} /> },
    { id: 'signature', label: 'Signature', icon: <PenTool size={16} /> },
    { id: 'security', label: 'Security', icon: <ShieldCheck size={16} /> },
    { id: 'platforms', label: 'Connections', icon: <Link2 size={16} /> },
    { id: 'activity', label: 'Activity', icon: <BarChart3 size={16} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
    { id: 'danger', label: 'Danger Zone', icon: <Trash2 size={16} /> }
  ];

  return (
    <div className="slideout-overlay" onClick={onClose}>
      <div className="slideout-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="slideout-header">
          <div className="slideout-user-info">
            <div className="slideout-avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={`${user.firstName} ${user.lastName}`} />
              ) : (
                <span>{user.firstName[0]}{user.lastName[0]}</span>
              )}
            </div>
            <div>
              <h2>{user.firstName} {user.lastName}</h2>
              <p className="slideout-email">{user.email}</p>
              <span className={`status-badge ${getStatusBadgeClass(user.status)}`}>
                {user.status || 'active'}
              </span>
            </div>
          </div>
          <button className="slideout-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="slideout-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`slideout-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="slideout-content">
          {loading && <div className="loading-spinner">Loading...</div>}

          {!loading && activeTab === 'overview' && (
            <div className="tab-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>User Information</h3>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--theme-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Edit User
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleSaveUser}
                      disabled={isSaving}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        opacity: isSaving ? 0.5 : 1
                      }}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="info-grid">
                <div className="info-item">
                  <label>First Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedUser.firstName}
                      onChange={(e) => setEditedUser({ ...editedUser, firstName: e.target.value })}
                    />
                  ) : (
                    <div>{user.firstName}</div>
                  )}
                </div>
                <div className="info-item">
                  <label>Last Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedUser.lastName}
                      onChange={(e) => setEditedUser({ ...editedUser, lastName: e.target.value })}
                    />
                  ) : (
                    <div>{user.lastName}</div>
                  )}
                </div>
                <div className="info-item full-width">
                  <label>Email</label>
                  <div>{user.email}</div>
                </div>
                <div className="info-item">
                  <label>Role</label>
                  {isEditing ? (
                    <select
                      value={editedUser.role}
                      onChange={(e) => setEditedUser({ ...editedUser, role: e.target.value })}
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="user">User</option>
                    </select>
                  ) : (
                    <div>
                      <span className={`role-badge role-${user.role}`}>
                        {user.role}
                      </span>
                    </div>
                  )}
                </div>
                <div className="info-item">
                  <label>Status</label>
                  <div>
                    <span className={`status-indicator ${user.isActive ? 'active' : 'inactive'}`}>
                      {user.isActive ? <><CheckCircle size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Active</> : <><AlertTriangle size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Inactive</>}
                    </span>
                  </div>
                </div>
                <div className="info-item">
                  <label>Last Login</label>
                  <div>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</div>
                </div>
              </div>

              {(isEditing || user.jobTitle || user.department || user.location || user.organizationalUnit) && (
                <>
                  <h3>Profile Information</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Job Title</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedUser.jobTitle || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, jobTitle: e.target.value })}
                        />
                      ) : (
                        <div>{user.jobTitle || '-'}</div>
                      )}
                    </div>
                    <div className="info-item">
                      <label>Department</label>
                      {isEditing ? (
                        availableDepartments.length > 0 ? (
                          <select
                            value={editedUser.department || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, department: e.target.value })}
                          >
                            <option value="">Select Department...</option>
                            {availableDepartments.map(dept => (
                              <option key={dept.id} value={dept.name}>
                                {dept.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={editedUser.department || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, department: e.target.value })}
                            placeholder="Enter department name"
                          />
                        )
                      ) : (
                        <div>{normalizeDepartmentName(user.department)}</div>
                      )}
                    </div>
                    <div className="info-item">
                      <label>Reporting Manager</label>
                      {isEditing ? (
                        <select
                          value={editedUser.managerId || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, managerId: e.target.value })}
                        >
                          <option value="">No Manager</option>
                          {availableManagers
                            .filter(m => m.id !== user.id) // Don't allow self as manager
                            .map(manager => (
                              <option key={manager.id} value={manager.id}>
                                {manager.first_name || manager.firstName} {manager.last_name || manager.lastName} ({manager.email})
                              </option>
                            ))}
                        </select>
                      ) : (
                        <div>{user.managerName || '-'}</div>
                      )}
                    </div>
                    <div className="info-item">
                      <label>Location</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedUser.location || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, location: e.target.value })}
                        />
                      ) : (
                        <div>{user.location || '-'}</div>
                      )}
                    </div>
                    <div className="info-item full-width">
                      <label>Organizational Unit</label>
                      {isEditing ? (
                        <select
                          value={editedUser.organizationalUnit || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, organizationalUnit: e.target.value })}
                        >
                          <option value="">Select Org Unit...</option>
                          {availableOrgUnits.map(ou => (
                            <option key={ou.id} value={ou.path}>
                              {ou.path}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>{user.organizationalUnit || '-'}</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {(isEditing || user.mobilePhone || user.workPhone) && (
                <>
                  <h3>Contact Information</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Mobile Phone</label>
                      {isEditing ? (
                        <input
                          type="tel"
                          value={editedUser.mobilePhone || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, mobilePhone: e.target.value })}
                        />
                      ) : (
                        <div>{user.mobilePhone || '-'}</div>
                      )}
                    </div>
                    <div className="info-item">
                      <label>Work Phone</label>
                      {isEditing ? (
                        <input
                          type="tel"
                          value={editedUser.workPhone || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, workPhone: e.target.value })}
                        />
                      ) : (
                        <div>{user.workPhone || '-'}</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {!loading && activeTab === 'groups' && (
            <div className="tab-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Group Memberships</h3>
                <button
                  className="btn-primary"
                  onClick={() => {
                    // Fetch available groups if not already loaded
                    if (availableGroups.length === 0) {
                      authFetch(`/api/v1/organization/access-groups`)
                        .then(res => res.json())
                        .then(data => {
                          if (data.success) setAvailableGroups(data.data || []);
                        });
                    }
                    setShowAddGroupModal(true);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'var(--theme-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  + Add to Group
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="empty-state" style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                  <p>This user is not a member of any groups yet.</p>
                </div>
              ) : (
                <div className="groups-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {groups.map(group => (
                    <div key={group.id} className="group-item" style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div className="group-info">
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>{group.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{group.email || group.description}</div>
                      </div>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => handleRemoveFromGroup(group.id)}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: 'white',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fee2e2';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'email' && (
            <div className="tab-content">
              <h3>Email Settings</h3>
              <p className="section-description">
                Manage email delegation and forwarding for this user.
              </p>

              {!user.googleWorkspaceId ? (
                <div className="info-message">
                  <AlertTriangle size={16} />
                  <span>Email settings require a Google Workspace connection. This user is not synced from Google Workspace.</span>
                </div>
              ) : emailLoading ? (
                <div className="loading-spinner">
                  <Loader2 size={20} className="animate-spin" />
                  <span>Loading email settings...</span>
                </div>
              ) : (
                <>
                  {/* Email Delegation Section */}
                  <div className="email-section">
                    <div className="section-header">
                      <h4>
                        <UserPlus size={16} />
                        Email Delegation
                      </h4>
                      <p className="section-hint">
                        Allow other users to read, send, and delete emails on behalf of this user.
                      </p>
                    </div>

                    {emailDelegates.length === 0 ? (
                      <p className="empty-message">No delegates configured</p>
                    ) : (
                      <div className="delegate-list">
                        {emailDelegates.map((delegate) => (
                          <div key={delegate.delegateEmail} className="delegate-item">
                            <div className="delegate-info">
                              <Mail size={14} />
                              <span>{delegate.delegateEmail}</span>
                              {delegate.verificationStatus && delegate.verificationStatus !== 'accepted' && (
                                <span className="delegate-status">{delegate.verificationStatus}</span>
                              )}
                            </div>
                            <button
                              className="btn-icon-danger"
                              onClick={() => handleRemoveDelegate(delegate.delegateEmail)}
                              disabled={removingDelegate === delegate.delegateEmail}
                              title="Remove delegate"
                            >
                              {removingDelegate === delegate.delegateEmail ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <X size={14} />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="add-delegate-form">
                      <input
                        type="email"
                        placeholder="Enter delegate email address"
                        value={newDelegateEmail}
                        onChange={(e) => setNewDelegateEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddDelegate()}
                      />
                      <button
                        className="btn-primary"
                        onClick={handleAddDelegate}
                        disabled={addingDelegate || !newDelegateEmail.trim()}
                      >
                        {addingDelegate ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <UserPlus size={14} />
                        )}
                        Add Delegate
                      </button>
                    </div>
                  </div>

                  {/* Email Forwarding Section */}
                  <div className="email-section">
                    <div className="section-header">
                      <h4>
                        <Forward size={16} />
                        Email Forwarding
                      </h4>
                      <p className="section-hint">
                        Automatically forward incoming emails to another address.
                      </p>
                    </div>

                    {forwardingSettings?.enabled ? (
                      <div className="forwarding-active">
                        <div className="forwarding-info">
                          <CheckCircle size={16} className="success-icon" />
                          <div>
                            <strong>Forwarding enabled</strong>
                            <p>Emails are being forwarded to: <strong>{forwardingSettings.emailAddress}</strong></p>
                            <p className="forwarding-disposition">
                              After forwarding: {
                                forwardingSettings.disposition === 'leaveInInbox' ? 'Keep in inbox' :
                                forwardingSettings.disposition === 'archive' ? 'Archive' :
                                forwardingSettings.disposition === 'trash' ? 'Move to trash' :
                                forwardingSettings.disposition === 'markRead' ? 'Mark as read' :
                                forwardingSettings.disposition
                              }
                            </p>
                          </div>
                        </div>
                        <button
                          className="btn-secondary btn-danger-text"
                          onClick={handleDisableForwarding}
                          disabled={savingForwarding}
                        >
                          {savingForwarding ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : null}
                          Disable Forwarding
                        </button>
                      </div>
                    ) : (
                      <div className="forwarding-disabled">
                        <p className="empty-message">Forwarding is not enabled</p>
                        <button
                          className="btn-primary"
                          onClick={() => setShowForwardingModal(true)}
                        >
                          <Forward size={14} />
                          Set Up Forwarding
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {!loading && activeTab === 'signature' && (
            <div className="tab-content">
              <h3>Email Signature</h3>
              <p className="section-description">
                View and manage this user's email signature status.
              </p>
              <UserSignatureStatus
                userId={user.id}
                userName={`${user.firstName} ${user.lastName}`}
                userEmail={user.email}
                showPreview={true}
                onSyncComplete={() => {
                  // Optionally refresh user data after sync
                  onUserUpdated?.();
                }}
              />
            </div>
          )}

          {!loading && activeTab === 'security' && (
            <div className="tab-content">
              <h3>Security</h3>
              <p className="section-description">
                View security status and manage connected third-party apps.
              </p>

              {securityLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Loading security data...</span>
                </div>
              )}

              {!securityLoading && securityData && (
                <>
                  {/* Two-Factor Authentication Section - Unified Display */}
                  <div className="info-section" style={{ marginBottom: '24px' }}>
                    <h4 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldCheck size={16} />
                      Two-Factor Authentication
                    </h4>

                    {/* Summary Banner */}
                    <div style={{
                      padding: '12px 16px',
                      marginBottom: '12px',
                      backgroundColor: securityData.twoFactor.anyEnrolled ? '#f0fdf4' : '#fef2f2',
                      borderRadius: '8px',
                      border: `1px solid ${securityData.twoFactor.anyEnrolled ? '#bbf7d0' : '#fecaca'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {securityData.twoFactor.anyEnrolled ? (
                        <>
                          <CheckCircle size={18} style={{ color: '#22c55e' }} />
                          <span style={{ color: '#15803d', fontWeight: 500 }}>
                            {securityData.twoFactor.allEnrolled ? 'Enrolled in all sources' : 'Enrolled in some sources'}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                          <span style={{ color: '#dc2626', fontWeight: 500 }}>Not enrolled in any 2FA</span>
                        </>
                      )}
                    </div>

                    {/* Per-source 2FA Status */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Helios (Local) 2FA */}
                      {securityData.twoFactor.helios !== null && (
                        <div style={{
                          padding: '12px 16px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              backgroundColor: '#8b5cf6',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: 600,
                              fontSize: '12px'
                            }}>H</div>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: '14px' }}>Helios (Local)</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>TOTP Authenticator</div>
                            </div>
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            backgroundColor: securityData.twoFactor.helios.isEnrolled ? '#dcfce7' : '#fee2e2',
                            color: securityData.twoFactor.helios.isEnrolled ? '#15803d' : '#dc2626',
                            fontSize: '12px',
                            fontWeight: 500
                          }}>
                            {securityData.twoFactor.helios.isEnrolled ? (
                              <><CheckCircle size={12} /> Enabled</>
                            ) : (
                              <><X size={12} /> Not Enabled</>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Google Workspace 2FA */}
                      {securityData.twoFactor.google !== null && (
                        <div style={{
                          padding: '12px 16px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              backgroundColor: '#4285F4',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: 600,
                              fontSize: '12px'
                            }}>G</div>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: '14px' }}>Google Workspace</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                {securityData.twoFactor.google.isEnforced ? 'Enforced by policy' : 'Optional'}
                              </div>
                            </div>
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            backgroundColor: securityData.twoFactor.google.isEnrolled ? '#dcfce7' : '#fee2e2',
                            color: securityData.twoFactor.google.isEnrolled ? '#15803d' : '#dc2626',
                            fontSize: '12px',
                            fontWeight: 500
                          }}>
                            {securityData.twoFactor.google.isEnrolled ? (
                              <><CheckCircle size={12} /> Enrolled</>
                            ) : (
                              <><X size={12} /> Not Enrolled</>
                            )}
                          </div>
                        </div>
                      )}

                      {/* M365 placeholder (when available) */}
                      {user.microsoft365Id && (
                        <div style={{
                          padding: '12px 16px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          opacity: 0.6
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              backgroundColor: '#00a4ef',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: 600,
                              fontSize: '12px'
                            }}>M</div>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: '14px' }}>Microsoft 365</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>Coming soon</div>
                            </div>
                          </div>
                          <div style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            backgroundColor: '#e5e7eb',
                            color: '#6b7280',
                            fontSize: '12px',
                            fontWeight: 500
                          }}>
                            Pending
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Passkeys Section */}
                  <div className="info-section" style={{ marginBottom: '24px' }}>
                    <h4 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Fingerprint size={16} />
                      Passkeys ({securityData.passkeys?.count || 0})
                    </h4>

                    {!securityData.passkeys || securityData.passkeys.count === 0 ? (
                      <div style={{
                        padding: '16px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: '14px'
                      }}>
                        No passkeys registered
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {securityData.passkeys.devices.map(device => (
                          <div
                            key={device.id}
                            style={{
                              padding: '12px 16px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '28px',
                                height: '28px',
                                backgroundColor: '#8b5cf6',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white'
                              }}>
                                <Fingerprint size={14} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 500, fontSize: '14px' }}>
                                  {device.name || 'Unnamed passkey'}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                  Added {new Date(device.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              backgroundColor: '#dcfce7',
                              color: '#15803d',
                              fontSize: '12px',
                              fontWeight: 500
                            }}>
                              <CheckCircle size={12} /> Active
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Connected Apps Section */}
                  <div className="info-section">
                    <h4 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AppWindow size={16} />
                      Connected Apps ({securityData.connectedApps.length})
                    </h4>

                    {securityData.connectedApps.length === 0 ? (
                      <div style={{
                        padding: '24px',
                        textAlign: 'center',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        color: '#6b7280'
                      }}>
                        No third-party apps connected
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {securityData.connectedApps.map(app => (
                          <div
                            key={app.clientId}
                            style={{
                              padding: '16px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                                  {app.displayName || 'Unknown App'}
                                  {app.nativeApp && (
                                    <span style={{
                                      marginLeft: '8px',
                                      fontSize: '11px',
                                      padding: '2px 6px',
                                      backgroundColor: '#e5e7eb',
                                      borderRadius: '4px'
                                    }}>
                                      Native
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                                  {app.scopes.length > 0 ? (
                                    <span title={app.scopes.join(', ')}>
                                      {app.scopes.slice(0, 3).join(', ')}
                                      {app.scopes.length > 3 && ` +${app.scopes.length - 3} more`}
                                    </span>
                                  ) : (
                                    'No scopes'
                                  )}
                                </div>
                                {app.lastTimeUsed && (
                                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                    Last used: {new Date(app.lastTimeUsed).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleRevokeToken(app.clientId, app.displayName)}
                                disabled={revokingToken === app.clientId}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: 'white',
                                  color: '#ef4444',
                                  border: '1px solid #ef4444',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  cursor: revokingToken === app.clientId ? 'not-allowed' : 'pointer',
                                  opacity: revokingToken === app.clientId ? 0.5 : 1
                                }}
                              >
                                {revokingToken === app.clientId ? 'Revoking...' : 'Revoke'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {!securityLoading && !securityData && (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  color: '#6b7280'
                }}>
                  No security data available for this user
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'platforms' && (
            <div className="tab-content">
              <h3>Connections</h3>
              <p className="section-description">
                View this user's connected platform accounts and sync status.
              </p>

              <div className="platforms-list connections-grid">
                {/* Google Workspace Integration */}
                <div className="platform-card connection-card google">
                  <div className="platform-header">
                    <div className="platform-icon" style={{ backgroundColor: '#4285F4' }}>
                      G
                    </div>
                    <div className="platform-info">
                      <h4>Google Workspace</h4>
                      {user.googleWorkspaceId ? (
                        <span className="sync-status connected">
                          <span className="status-dot"></span>
                          Synced from Google
                        </span>
                      ) : (
                        <span className="sync-status not-connected">
                          <span className="status-dot"></span>
                          Local User Only
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="platform-details">
                    {user.googleWorkspaceId ? (
                      <div className="sync-info">
                        <div className="info-row">
                          <label>Google Workspace ID:</label>
                          <code>{user.googleWorkspaceId}</code>
                        </div>
                        <div className="info-row">
                          <label>Sync Source:</label>
                          <span>Imported from Google Workspace</span>
                        </div>
                        {user.updatedAt && (
                          <div className="info-row">
                            <label>Last updated:</label>
                            <span>{new Date(user.updatedAt).toLocaleString()}</span>
                          </div>
                        )}
                        <div className="sync-notice" style={{ marginTop: '12px' }}>
                          <span className="notice-icon">ℹ️</span>
                          <div>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                              This user is synced with Google Workspace. Changes made here will be pushed to Google.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="platform-info-box">
                        <p className="help-text" style={{ marginBottom: '12px' }}>
                          This user exists in Helios but not in Google Workspace.
                        </p>
                        <button
                          className="btn-create-in-google"
                          onClick={() => handleCreateInGoogle()}
                          disabled={isCreatingInGoogle}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            backgroundColor: '#4285F4',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: isCreatingInGoogle ? 'not-allowed' : 'pointer',
                            opacity: isCreatingInGoogle ? 0.7 : 1
                          }}
                        >
                          <span style={{
                            width: '20px',
                            height: '20px',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            color: '#4285F4',
                            fontSize: '12px'
                          }}>G</span>
                          {isCreatingInGoogle ? 'Creating...' : 'Create in Google Workspace'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Microsoft 365 Integration */}
                <div className="platform-card connection-card microsoft">
                  <div className="platform-header">
                    <div className="platform-icon" style={{ backgroundColor: '#00a4ef' }}>
                      M
                    </div>
                    <div className="platform-info">
                      <h4>Microsoft 365</h4>
                      {user.microsoft365Id ? (
                        <span className="sync-status connected">
                          <span className="status-dot"></span>
                          Connected
                        </span>
                      ) : (
                        <span className="sync-status not-connected">
                          <span className="status-dot"></span>
                          Not Connected
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="platform-details">
                    {user.microsoft365Id ? (
                      <div className="sync-info">
                        <div className="info-row">
                          <label>Microsoft 365 ID:</label>
                          <code>{user.microsoft365Id}</code>
                        </div>
                        {user.updatedAt && (
                          <div className="info-row">
                            <label>Last updated:</label>
                            <span>{new Date(user.updatedAt).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="platform-info-box">
                        <p className="help-text" style={{ marginBottom: '0' }}>
                          This user is not connected to Microsoft 365.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && activeTab === 'activity' && (
            <div className="tab-content">
              <h3>Activity Log</h3>
              {activityLog.length === 0 ? (
                <div className="empty-state">
                  <p>No recent activity to display.</p>
                </div>
              ) : (
                <div className="activity-list">
                  {activityLog.map((activity) => (
                    <div key={activity.id} className="activity-item">
                      <div className="activity-icon"><FileText size={16} /></div>
                      <div className="activity-details">
                        <strong>{activity.title || activity.description || activity.action?.replace(/[._]/g, ' ')}</strong>
                        {activity.description && activity.title && (
                          <p className="activity-description">{activity.description}</p>
                        )}
                        <span className="activity-time">
                          {new Date(activity.timestamp).toLocaleString()}
                        </span>
                        {(activity.actorEmail || activity.actorName) && (
                          <p className="activity-actor">
                            by {activity.actorName || `${activity.actorFirstName || ''} ${activity.actorLastName || ''}`.trim() || activity.actorEmail}
                          </p>
                        )}
                        {activity.ipAddress && (
                          <span className="activity-ip">IP: {activity.ipAddress}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'settings' && (
            <div className="tab-content">
              <h3>User Settings</h3>

              <div className="settings-section">
                <h4>Status Management</h4>
                <div className="setting-item">
                  <label>User Status</label>
                  {user.status === 'deleted' ? (
                    <div className="deleted-status-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="status-badge-locked" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        borderRadius: '6px',
                        fontWeight: 500,
                        fontSize: '14px'
                      }}>
                        <Lock size={14} />
                        Deleted
                      </span>
                      <button
                        className="btn-primary"
                        onClick={handleRestoreUser}
                        style={{ padding: '6px 12px', fontSize: '14px' }}
                      >
                        Restore User
                      </button>
                    </div>
                  ) : (
                    <select
                      value={user.status || 'active'}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="form-select"
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <h4>Role Management</h4>
                <div className="setting-item">
                  <label>User Role</label>
                  <select
                    value={user.role}
                    className="form-select"
                    disabled
                  >
                    <option value="user">User</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <p className="setting-hint">Role changes coming soon</p>
                </div>
              </div>

              <div className="settings-section">
                <h4>Password</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <button
                    className="btn-secondary"
                    onClick={handleResetPassword}
                    disabled={resetLoading || user.status === 'deleted'}
                    style={{ opacity: (resetLoading || user.status === 'deleted') ? 0.6 : 1 }}
                  >
                    {resetLoading ? 'Sending...' : 'Send Password Reset Email'}
                  </button>
                  {!initialPassword && (
                    <button
                      className="btn-secondary"
                      onClick={handleRevealInitialPassword}
                      disabled={initialPasswordLoading || user.status === 'deleted'}
                      style={{ opacity: (initialPasswordLoading || user.status === 'deleted') ? 0.6 : 1 }}
                    >
                      <Lock size={14} style={{ marginRight: '4px' }} />
                      {initialPasswordLoading ? 'Loading...' : 'Reveal Initial Password'}
                    </button>
                  )}
                </div>
                {initialPassword && (
                  <div className="initial-password-reveal" style={{
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 500, color: '#92400e' }}>Initial Password</span>
                      <button
                        className="btn-secondary"
                        onClick={handleClearInitialPassword}
                        disabled={initialPasswordClearing}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      >
                        {initialPasswordClearing ? 'Clearing...' : 'Clear'}
                      </button>
                    </div>
                    <code style={{
                      display: 'block',
                      background: '#fff',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1f2937',
                      marginBottom: '8px'
                    }}>
                      {initialPassword.password}
                    </code>
                    <p style={{ fontSize: '11px', color: '#92400e', margin: 0 }}>
                      Created: {new Date(initialPassword.createdAt).toLocaleString()}
                      <br />
                      Clear this after the user has set their own password.
                    </p>
                  </div>
                )}
                {initialPasswordError && (
                  <p className="setting-hint" style={{ color: '#6b7280' }}>{initialPasswordError}</p>
                )}
                {user.status === 'deleted' && (
                  <p className="setting-hint">Cannot reset password for deleted users</p>
                )}
              </div>
            </div>
          )}

          {!loading && activeTab === 'danger' && (
            <div className="tab-content">
              <h3>Danger Zone</h3>

              <div className="danger-section">
                <div className="danger-item">
                  <div>
                    <h4>Delete User</h4>
                    <p>Soft delete this user. They can be restored within 30 days.</p>
                  </div>
                  <button className="btn-danger" onClick={handleDeleteUser}>
                    Delete User
                  </button>
                </div>

                {user.status === 'deleted' && (
                  <div className="danger-item">
                    <div>
                      <h4>Restore User</h4>
                      <p>Restore this deleted user and reactivate their account.</p>
                    </div>
                    <button className="btn-primary" onClick={handleRestoreUser}>
                      Restore User
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Delete User: {user.firstName} {user.lastName}</h2>

            {user.googleWorkspaceId ? (
              <>
                <p>This user is synced from Google Workspace.</p>
                <p><strong>What should happen in Google Workspace?</strong></p>

                <div className="delete-options">
                  <label className={`delete-option ${googleAction === 'keep' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="googleAction"
                      value="keep"
                      checked={googleAction === 'keep'}
                      onChange={(e) => setGoogleAction(e.target.value as 'keep')}
                    />
                    <div className="option-content">
                      <strong>Keep Google account active</strong>
                      <p>User can still access Gmail, Drive, Calendar. You will continue to be billed.</p>
                    </div>
                  </label>

                  <label className={`delete-option ${googleAction === 'suspend' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="googleAction"
                      value="suspend"
                      checked={googleAction === 'suspend'}
                      onChange={(e) => setGoogleAction(e.target.value as 'suspend')}
                    />
                    <div className="option-content">
                      <strong>Suspend Google account</strong>
                      <p className="warning-text">User cannot login BUT you are STILL billed for this license!</p>
                    </div>
                  </label>

                  <label className={`delete-option ${googleAction === 'delete' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="googleAction"
                      value="delete"
                      checked={googleAction === 'delete'}
                      onChange={(e) => setGoogleAction(e.target.value as 'delete')}
                    />
                    <div className="option-content">
                      <strong>Permanently delete from Google Workspace (Recommended)</strong>
                      <p className="success-text">License will be freed immediately.</p>
                      <p className="warning-text">All data will be permanently deleted.</p>
                    </div>
                  </label>
                </div>

                {googleAction === 'delete' && (
                  <div className="warning-box">
                    <p><strong>Warning:</strong> Permanent deletion cannot be undone. Consider transferring important data first.</p>
                  </div>
                )}
              </>
            ) : (
              <p>This will soft-delete the user in Helios. They can be restored within 30 days.</p>
            )}

            <div className="modal-buttons">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn-danger" onClick={confirmDelete}>Confirm Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Groups Modal */}
      {showAddGroupModal && (
        <div className="modal-overlay" onClick={() => setShowAddGroupModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2>Add to Groups</h2>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Select groups to add {user.firstName} {user.lastName} to:
                </label>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  {selectedNewGroupIds.length > 0 && (
                    <span>{selectedNewGroupIds.length} group(s) selected</span>
                  )}
                </div>
              </div>

              <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                backgroundColor: 'white'
              }}>
                {availableGroups.filter(g => !groups.some(ug => ug.id === g.id)).length === 0 ? (
                  <p style={{ padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                    User is already a member of all available groups.
                  </p>
                ) : (
                  availableGroups
                    .filter(g => !groups.some(ug => ug.id === g.id)) // Filter out groups user is already in
                    .map(group => (
                      <label
                        key={group.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          padding: '12px 16px',
                          borderBottom: '1px solid #f3f4f6',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                          backgroundColor: selectedNewGroupIds.includes(group.id) ? '#f5f3ff' : 'white'
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedNewGroupIds.includes(group.id)) {
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!selectedNewGroupIds.includes(group.id)) {
                            e.currentTarget.style.backgroundColor = 'white';
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedNewGroupIds.includes(group.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedNewGroupIds([...selectedNewGroupIds, group.id]);
                            } else {
                              setSelectedNewGroupIds(selectedNewGroupIds.filter(id => id !== group.id));
                            }
                          }}
                          style={{ marginRight: '12px', marginTop: '2px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', fontSize: '14px', marginBottom: '2px' }}>
                            {group.name}
                          </div>
                          {group.description && (
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              {group.description}
                            </div>
                          )}
                          {group.member_count !== undefined && (
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                              {group.member_count} current member(s)
                            </div>
                          )}
                        </div>
                      </label>
                    ))
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowAddGroupModal(false);
                  setSelectedNewGroupIds([]);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleAddToGroups}
                disabled={selectedNewGroupIds.length === 0}
                style={{
                  opacity: selectedNewGroupIds.length === 0 ? 0.5 : 1,
                  cursor: selectedNewGroupIds.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                Add to {selectedNewGroupIds.length > 0 ? `${selectedNewGroupIds.length} ` : ''}Group{selectedNewGroupIds.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forwarding Modal */}
      {showForwardingModal && (
        <div className="modal-overlay" onClick={() => setShowForwardingModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <h2>Set Up Email Forwarding</h2>
            <p style={{ color: '#6b7280', marginBottom: '20px' }}>
              Forward emails from <strong>{user.email}</strong> to another address.
            </p>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                Forward to:
              </label>
              <input
                type="email"
                placeholder="recipient@example.com"
                value={newForwardingEmail}
                onChange={(e) => setNewForwardingEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                After forwarding:
              </label>
              <select
                value={forwardingDisposition}
                onChange={(e) => setForwardingDisposition(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'white'
                }}
              >
                <option value="leaveInInbox">Keep email in inbox</option>
                <option value="archive">Archive email</option>
                <option value="markRead">Mark as read</option>
                <option value="trash">Move to trash</option>
              </select>
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowForwardingModal(false);
                  setNewForwardingEmail('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSetForwarding}
                disabled={savingForwarding || !newForwardingEmail.trim()}
              >
                {savingForwarding ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Enable Forwarding'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Confirmation */}
      <ConfirmDialog
        isOpen={statusChangeConfirm !== null}
        title="Change User Status"
        message={`Are you sure you want to change user status to ${statusChangeConfirm}?`}
        variant="warning"
        confirmText="Change Status"
        onConfirm={confirmStatusChange}
        onCancel={() => setStatusChangeConfirm(null)}
      />

      {/* Create in Google Confirmation */}
      <ConfirmDialog
        isOpen={showCreateInGoogleConfirm}
        title="Create in Google Workspace"
        message={`Create ${user.firstName} ${user.lastName} (${user.email}) in Google Workspace?`}
        variant="info"
        confirmText="Create"
        onConfirm={confirmCreateInGoogle}
        onCancel={() => setShowCreateInGoogleConfirm(false)}
      />

      {/* Restore User Confirmation */}
      <ConfirmDialog
        isOpen={showRestoreConfirm}
        title="Restore User"
        message={`Are you sure you want to restore ${user.firstName} ${user.lastName}?`}
        variant="info"
        confirmText="Restore"
        onConfirm={confirmRestoreUser}
        onCancel={() => setShowRestoreConfirm(false)}
      />

      {/* Remove from Group Confirmation */}
      <ConfirmDialog
        isOpen={groupToRemove !== null}
        title="Remove from Group"
        message="Are you sure you want to remove this user from the group?"
        variant="warning"
        confirmText="Remove"
        onConfirm={confirmRemoveFromGroup}
        onCancel={() => setGroupToRemove(null)}
      />
    </div>
  );
}
