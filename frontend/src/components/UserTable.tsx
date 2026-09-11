/**
 * UserTable - TanStack Table based user list component
 *
 * Features:
 * - TanStack Query for data fetching with caching
 * - TanStack Table for robust column handling
 * - Virtual scrolling for large datasets
 * - Column resizing and visibility management
 * - Row selection for bulk operations
 */

import { accountPurposeLabel } from '../config/accountPurpose';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisibilityState, RowSelectionState } from '@tanstack/react-table';
import {
  DataTable,
  createColumnHelper,
  createSelectionColumn,
  createActionsColumn,
} from './ui/DataTable';
import { UserSlideOut } from './UserSlideOut';
import { PlatformIcon } from './ui/PlatformIcon';
import {
  useUsers,
  useUserStatusCounts,
  useUpdateUserStatus,
  useDeleteUser,
  useBulkUpdateStatus,
  useBulkDelete,
} from '../hooks/queries/useUsers';
import type { User, UserFilters } from '../hooks/queries/useUsers';
import {
  MoreVertical,
  Eye,
  PauseCircle,
  PlayCircle,
  Copy,
  Trash2,
  UserMinus,
  CheckCircle,
} from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { authFetch } from '../config/api';
import './UserTable.css';

// Column helper for type-safe column definitions
const columnHelper = createColumnHelper<User>();

interface UserTableProps {
  organizationId: string;
  userType: 'staff' | 'guests' | 'contacts';
  statusFilter?: string;
  platformFilter?: string;
  purposeFilter?: string;
  searchQuery?: string;
  onStatusCountsChange?: (counts: any) => void;
  onDepartmentsChange?: (departments: string[]) => void;
  onNavigate?: (page: string, params?: Record<string, string>) => void;
}

export function UserTable({
  organizationId,
  userType,
  statusFilter = 'all',
  platformFilter = 'all',
  purposeFilter = 'all',
  searchQuery = '',
  onStatusCountsChange,
  onDepartmentsChange,
  onNavigate,
}: UserTableProps) {
  const navigate = useNavigate();

  // UI State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [googleAction, setGoogleAction] = useState<'keep' | 'suspend' | 'delete'>('delete');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  // Bulk action confirmation state
  const [bulkConfirmAction, setBulkConfirmAction] = useState<'activate' | 'suspend' | 'delete' | null>(null);
  // Suspend is a platform write; ask first (2026-09-08).
  const [suspendConfirmUser, setSuspendConfirmUser] = useState<User | null>(null);
  // Server refusals worth reading (no-orphans policy names the people who still report to the user).
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 8 });
  const [restoreDeletedUser, setRestoreDeletedUser] = useState<User | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // Set when Google could not undelete and Helios re-created the account from its snapshot.
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  // Column visibility (persisted in localStorage)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem('helios_user_columns_v2');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Row selection
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Convert userType to API format
  const apiUserType = userType === 'guests' ? 'guest' : userType === 'contacts' ? 'contact' : 'staff';

  // Query filters
  const filters: UserFilters = {
    userType: apiUserType as 'staff' | 'guest' | 'contact',
    status: statusFilter !== 'all' ? statusFilter : undefined,
    platform: platformFilter !== 'all' ? platformFilter : undefined,
    purpose: purposeFilter !== 'all' ? purposeFilter : undefined,
  };

  // Fetch users with TanStack Query
  const { data: users = [], isLoading, error, refetch } = useUsers(filters);

  // The slide-out receives a snapshot; refresh it when the list refetches so a
  // save does not keep showing pre-save values (2026-09-08).
  useEffect(() => {
    if (!selectedUser) return;
    const fresh = users.find((u) => u.id === selectedUser.id);
    if (fresh && fresh !== selectedUser) setSelectedUser(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // Fetch status counts and departments
  const { data: countsData } = useUserStatusCounts(apiUserType);

  // Mutations
  const updateStatusMutation = useUpdateUserStatus();
  const deleteMutation = useDeleteUser();
  const bulkUpdateMutation = useBulkUpdateStatus();
  const bulkDeleteMutation = useBulkDelete();

  // Update parent with counts and departments
  useMemo(() => {
    if (countsData && onStatusCountsChange) {
      onStatusCountsChange(countsData.statusCounts);
    }
    if (countsData && onDepartmentsChange) {
      onDepartmentsChange(countsData.departments);
    }
  }, [countsData, onStatusCountsChange, onDepartmentsChange]);

  // Handle column visibility changes (persist to localStorage)
  const handleColumnVisibilityChange = useCallback((visibility: VisibilityState) => {
    setColumnVisibility(visibility);
    localStorage.setItem('helios_user_columns_v2', JSON.stringify(visibility));
  }, []);

  // Filter users by search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.firstName.toLowerCase().includes(query) ||
        user.lastName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.department?.toLowerCase().includes(query) ||
        user.jobTitle?.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  // Get selected user IDs
  const selectedUserIds = useMemo(() => {
    return Object.keys(rowSelection).filter((key) => rowSelection[key]);
  }, [rowSelection]);

  // Action handlers
  const handleQuickSuspend = (user: User) => {
    setSuspendConfirmUser(user);
    setActionMenuOpen(null);
  };

  const confirmQuickSuspend = async () => {
    if (!suspendConfirmUser) return;
    const target = suspendConfirmUser;
    try {
      await updateStatusMutation.mutateAsync({ userId: target.id, status: 'suspended' });
      setSuspendConfirmUser(null);
      setSuspendError(null);
    } catch (e: any) {
      setSuspendError(e?.message || 'Failed to suspend user');
      throw e; // keeps the dialog open with the reason
    }
  };

  const confirmRestoreDeleted = async () => {
    if (!restoreDeletedUser) return;
    const target = restoreDeletedUser;
    try {
      const response = await authFetch(`/api/v1/organization/users/${target.id}/restore`, { method: 'PATCH' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setRestoreError(data.error || 'Failed to restore user');
        throw new Error(data.error || 'Failed to restore user');
      }
      setRestoreDeletedUser(null);
      setRestoreError(null);
      if (data.recreated) {
        const r = data.recreated;
        const parts = [`${target.email} was re-created in Google from the snapshot taken ${String(r.takenAt).slice(0, 10)}`];
        if (r.restored) parts.push(`${r.restored.groups} group(s) and ${r.restored.licenses} licence(s) restored`);
        if (Array.isArray(r.failures) && r.failures.length) parts.push(`not restored: ${r.failures.join(', ')}`);
        parts.push('The user signs in with a one-time password set by an admin.');
        setRestoreNotice(parts.join('. '));
      }
      refetch();
    } catch (e: any) {
      setRestoreError(e?.message || 'Failed to restore user');
      throw e;
    }
  };

  const handleQuickRestore = async (user: User) => {
    await updateStatusMutation.mutateAsync({ userId: user.id, status: 'active' });
    setActionMenuOpen(null);
  };

  const handleCopyEmail = (user: User) => {
    navigator.clipboard?.writeText(user.email);
    setActionMenuOpen(null);
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setGoogleAction('delete');
    setShowDeleteModal(true);
    setActionMenuOpen(null);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteMutation.mutateAsync({
        userId: userToDelete.id,
        googleAction: userToDelete.googleWorkspaceId ? googleAction : undefined,
      });
      setShowDeleteModal(false);
      setUserToDelete(null);
      setDeleteError(null);
    } catch (e: any) {
      setDeleteError(e?.message || 'Failed to delete user');
      throw e;
    }
  };

  // Bulk actions - show confirmation dialog
  const handleBulkActivate = () => {
    if (selectedUserIds.length === 0) return;
    setBulkConfirmAction('activate');
  };

  const handleBulkSuspend = () => {
    if (selectedUserIds.length === 0) return;
    setBulkConfirmAction('suspend');
  };

  const handleBulkDelete = () => {
    if (selectedUserIds.length === 0) return;
    setBulkConfirmAction('delete');
  };

  // Execute bulk action after confirmation
  const executeBulkAction = async () => {
    if (!bulkConfirmAction) return;

    if (bulkConfirmAction === 'activate') {
      await bulkUpdateMutation.mutateAsync({ userIds: selectedUserIds, status: 'active' });
    } else if (bulkConfirmAction === 'suspend') {
      await bulkUpdateMutation.mutateAsync({ userIds: selectedUserIds, status: 'suspended' });
    } else if (bulkConfirmAction === 'delete') {
      await bulkDeleteMutation.mutateAsync({ userIds: selectedUserIds });
    }

    setRowSelection({});
    setBulkConfirmAction(null);
  };

  // Role badge renderer
  const getRoleBadge = (role: string) => {
    const isAdmin = role === 'admin' || role === 'tenant_admin';
    return (
      <span className={`role-badge ${isAdmin ? 'admin' : 'user'}`}>
        {isAdmin ? 'Admin' : 'User'}
      </span>
    );
  };

  // Status badge renderer
  const getStatusBadge = (status: string) => {
    const statusClass = status || 'active';
    const statusText = {
      active: 'Active',
      suspended: 'Suspended',
      staged: 'Staged',
      deleted: 'Deleted',
      blocked: 'Blocked',
    }[statusClass] || 'Active';

    return (
      <span className={`status-badge ${statusClass}`}>
        <span className={`status-dot ${statusClass}`} />
        {statusText}
      </span>
    );
  };

  // Platform icon renderer
  const getPlatformIcon = (user: User) => {
    const platforms = [...(user.platforms || [])];
    if (user.googleWorkspaceId && !platforms.includes('google_workspace')) {
      platforms.push('google_workspace');
    }
    if (user.microsoft365Id && !platforms.includes('microsoft_365')) {
      platforms.push('microsoft_365');
    }

    // Determine primary platform
    let primary = 'local';
    if (platforms.includes('google_workspace')) primary = 'google';
    else if (platforms.includes('microsoft_365')) primary = 'microsoft';
    else if (platforms.includes('local')) primary = 'helios';

    return <PlatformIcon platform={primary} size={24} />;
  };

  // Action menu renderer
  const renderActions = (user: User) => (
    <div className="action-cell">
      <button
        className="btn-ellipsis"
        onClick={(e) => {
          e.stopPropagation();
          // The table scrolls horizontally, so an absolutely positioned menu
          // is clipped by the scroll container at desktop widths (2026-09-08).
          // Anchor it to the viewport instead.
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
          setActionMenuOpen(actionMenuOpen === user.id ? null : user.id);
        }}
      >
        <MoreVertical size={16} />
      </button>

      {actionMenuOpen === user.id && (
        <div className="action-menu" style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setSelectedUser(user); setShowViewModal(true); setActionMenuOpen(null); }}>
            <Eye size={14} /> View Details
          </button>
          <div className="menu-divider" />

          {user.status === 'deleted' ? (
            <button onClick={() => { setRestoreError(null); setRestoreDeletedUser(user); setActionMenuOpen(null); }}>
              <PlayCircle size={14} /> Restore user...
            </button>
          ) : user.status !== 'suspended' ? (
            <button onClick={() => handleQuickSuspend(user)}>
              <PauseCircle size={14} /> Suspend
            </button>
          ) : (
            <button onClick={() => handleQuickRestore(user)}>
              <PlayCircle size={14} /> Restore
            </button>
          )}

          {userType === 'staff' && user.status === 'active' && (
            <button
              className="menu-item-warning"
              onClick={() => {
                setActionMenuOpen(null);
                if (onNavigate) {
                  onNavigate('user-offboarding', { userId: user.id });
                } else {
                  navigate(`/admin/user-offboarding?userId=${user.id}`);
                }
              }}
            >
              <UserMinus size={14} /> Offboard User...
            </button>
          )}

          <div className="menu-divider" />
          <button onClick={() => handleCopyEmail(user)}>
            <Copy size={14} /> Copy Email
          </button>
          <div className="menu-divider" />
          <button className="menu-item-danger" onClick={() => handleDeleteUser(user)}>
            <Trash2 size={14} /> Delete...
          </button>
        </div>
      )}
    </div>
  );

  // Define columns based on user type
  const columns = useMemo(() => {
    const baseColumns = [
      createSelectionColumn<User>(),
      columnHelper.accessor('firstName', {
        header: 'First Name',
        size: 100,
        minSize: 80,
        cell: (info) => <span className="name-primary">{info.getValue()}</span>,
      }),
      columnHelper.accessor('lastName', {
        header: 'Last Name',
        size: 100,
        minSize: 80,
        cell: (info) => <span className="name-primary">{info.getValue()}</span>,
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        size: 200,
        minSize: 150,
        cell: (info) => {
          const purpose = info.row.original.accountPurpose;
          return (
            <span className="email-cell">
              {info.getValue()}
              {/* Not a person: a shared mailbox, service or resource account. Kept off the org chart. */}
              {purpose && purpose !== 'person' && (
                <span className="purpose-badge" title="Not a person. Kept off the org chart and out of manager lists.">
                  {accountPurposeLabel(purpose)}
                </span>
              )}
            </span>
          );
        },
      }),
    ];

    if (userType === 'staff') {
      return [
        ...baseColumns,
        columnHelper.accessor('jobTitle', {
          header: 'Job Title',
          size: 140,
          minSize: 100,
          cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('department', {
          header: 'Department',
          size: 120,
          minSize: 80,
          cell: (info) => {
            const dept = info.getValue();
            if (!dept) return '-';
            // Strip OU path prefixes
            return dept.startsWith('/') ? dept.split('/').filter(Boolean).pop() || dept : dept;
          },
        }),
        columnHelper.accessor('location', {
          header: 'Location',
          size: 120,
          minSize: 80,
          cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('role', {
          header: 'Role',
          size: 80,
          minSize: 60,
          cell: (info) => getRoleBadge(info.getValue()),
        }),
        columnHelper.display({
          id: 'platforms',
          header: 'Integrations',
          size: 80,
          minSize: 60,
          cell: (info) => <div className="platform-icon-cell">{getPlatformIcon(info.row.original)}</div>,
        }),
        columnHelper.accessor('status', {
          header: 'Status',
          size: 100,
          minSize: 80,
          cell: (info) => getStatusBadge(info.getValue() || 'active'),
        }),
        columnHelper.accessor('employeeType', {
          header: 'Employee Type',
          size: 115,
          minSize: 90,
          cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('lastLogin', {
          header: 'Last Login',
          size: 100,
          minSize: 80,
          cell: (info) => {
            const lastLogin = info.getValue();
            if (!lastLogin) return <span className="login-never">Never</span>;
            const date = new Date(lastLogin);
            const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
            if (days === 0) return <span className="login-recent">Today</span>;
            if (days === 1) return <span className="login-recent">Yesterday</span>;
            if (days <= 7) return <span className="login-active">{days} days ago</span>;
            if (days <= 30) return <span className="login-inactive">{days} days ago</span>;
            return <span className="login-warning">{Math.floor(days / 7)} weeks ago</span>;
          },
        }),
        createActionsColumn(renderActions),
      ];
    }

    if (userType === 'guests') {
      return [
        ...baseColumns,
        columnHelper.accessor('company', {
          header: 'Company',
          size: 120,
          minSize: 80,
          cell: (info) => info.getValue() || '-',
        }),
        columnHelper.accessor('role', {
          header: 'Access Level',
          size: 100,
          minSize: 80,
          cell: (info) => getRoleBadge(info.getValue()),
        }),
        columnHelper.accessor('guestExpiresAt', {
          header: 'Expires',
          size: 100,
          minSize: 80,
          cell: (info) => {
            const expires = info.getValue();
            return expires ? new Date(expires).toLocaleDateString() : 'No expiry';
          },
        }),
        columnHelper.accessor('status', {
          header: 'Status',
          size: 100,
          minSize: 80,
          cell: (info) => getStatusBadge(info.getValue() || 'active'),
        }),
        columnHelper.accessor('lastLogin', {
          header: 'Last Login',
          size: 100,
          minSize: 80,
          cell: (info) => info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : 'Never',
        }),
        createActionsColumn(renderActions),
      ];
    }

    // Contacts
    return [
      ...baseColumns,
      columnHelper.accessor('company', {
        header: 'Company',
        size: 120,
        minSize: 80,
        cell: (info) => info.getValue() || '-',
      }),
      columnHelper.accessor('workPhone', {
        header: 'Phone',
        size: 100,
        minSize: 80,
        cell: (info) => info.getValue() || info.row.original.mobilePhone || '-',
      }),
      columnHelper.accessor('jobTitle', {
        header: 'Title',
        size: 120,
        minSize: 80,
        cell: (info) => info.getValue() || '-',
      }),
      columnHelper.accessor('createdAt', {
        header: 'Added Date',
        size: 100,
        minSize: 80,
        cell: (info) => info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : '-',
      }),
      createActionsColumn(renderActions),
    ];
  }, [userType, actionMenuOpen, onNavigate, navigate]);

  // Handle row click
  const handleRowClick = useCallback((user: User) => {
    setSelectedUser(user);
    setShowViewModal(true);
  }, []);

  // Close action menu when clicking outside
  const handleTableClick = useCallback(() => {
    if (actionMenuOpen) {
      setActionMenuOpen(null);
    }
  }, [actionMenuOpen]);

  if (error) {
    return (
      <div className="user-table-error">
        <span>Error loading users: {error.message}</span>
      </div>
    );
  }

  return (
    <div className="user-table-container" onClick={handleTableClick}>
      {/* Bulk Action Bar */}
      {selectedUserIds.length > 0 && (
        <div className="bulk-action-bar">
          <div className="bulk-action-left">
            <span className="bulk-count">
              {selectedUserIds.length} user{selectedUserIds.length !== 1 ? 's' : ''} selected
            </span>
            <button className="btn-clear-selection" onClick={() => setRowSelection({})}>
              Clear
            </button>
          </div>
          <div className="bulk-action-right">
            <button className="btn-bulk-action" onClick={handleBulkActivate}>
              <CheckCircle size={14} /> Activate
            </button>
            <button className="btn-bulk-action" onClick={handleBulkSuspend}>
              <PauseCircle size={14} /> Suspend
            </button>
            <button className="btn-bulk-action btn-danger" onClick={handleBulkDelete}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={filteredUsers}
        columns={columns}
        onRowClick={handleRowClick}
        enableColumnResizing
        enableSorting
        enableRowSelection
        enablePagination
        pageSize={25}
        rowHeight={48}
        maxHeight="calc(100vh - 320px)"
        isLoading={isLoading}
        emptyMessage={
          platformFilter !== 'all'
            ? `No users found with selected integration`
            : statusFilter !== 'all'
              // A filtered view that happens to be empty is not a setup problem.
              // It used to tell admins to go connect Google Workspace, while
              // Google was connected, on a tab whose own count said 2.
              ? 'No users match this filter.'
              : 'No users found. Start by connecting to Google Workspace in Settings.'
        }
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={handleColumnVisibilityChange}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row.id}
      />

      {/* User Slide-Out Panel */}
      {showViewModal && selectedUser && (
        <UserSlideOut
          user={selectedUser}
          organizationId={organizationId}
          onClose={() => {
            setShowViewModal(false);
            setSelectedUser(null);
          }}
          onUserUpdated={() => {
            refetch();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Delete User: {userToDelete.firstName} {userToDelete.lastName}</h2>

            {userToDelete.googleWorkspaceId ? (
              <>
                <p>This user is synced from Google Workspace.</p>
                <p><strong>What should happen in Google Workspace?</strong></p>

                <div className="delete-options">
                  <label className={`delete-option ${googleAction === 'keep' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      value="keep"
                      checked={googleAction === 'keep'}
                      onChange={(e) => setGoogleAction(e.target.value as 'keep')}
                    />
                    <div className="option-content">
                      <strong>Keep Google account active</strong>
                      <p>User can still access Gmail, Drive, Calendar.</p>
                    </div>
                  </label>

                  <label className={`delete-option ${googleAction === 'suspend' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      value="suspend"
                      checked={googleAction === 'suspend'}
                      onChange={(e) => setGoogleAction(e.target.value as 'suspend')}
                    />
                    <div className="option-content">
                      <strong>Suspend Google account</strong>
                      <p className="warning-text">User cannot login but you are still billed.</p>
                    </div>
                  </label>

                  <label className={`delete-option ${googleAction === 'delete' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      value="delete"
                      checked={googleAction === 'delete'}
                      onChange={(e) => setGoogleAction(e.target.value as 'delete')}
                    />
                    <div className="option-content">
                      <strong>Permanently delete from Google Workspace</strong>
                      <p className="success-text">License will be freed immediately.</p>
                    </div>
                  </label>
                </div>
              </>
            ) : (
              <p>This will soft-delete the user. They can be restored within 30 days.</p>
            )}

            {deleteError && <p className="text-red-600" style={{ marginTop: 8 }}>{deleteError}</p>}

            <div className="modal-buttons">
              <button className="btn-secondary" onClick={() => { setShowDeleteModal(false); setDeleteError(null); }}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Confirmation Dialog */}
      <ConfirmDialog
        isOpen={suspendConfirmUser !== null}
        title="Suspend user"
        message={suspendConfirmUser ? `Suspend ${suspendConfirmUser.email}? They lose access on every connected platform until restored.` : ''}
        confirmText="Suspend"
        variant="warning"
        onConfirm={confirmQuickSuspend}
        onCancel={() => { setSuspendConfirmUser(null); setSuspendError(null); }}
      >
        {suspendError && <p className="text-red-600" style={{ marginTop: 8 }}>{suspendError}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={restoreNotice !== null}
        title="User re-created from snapshot"
        message={restoreNotice || ''}
        confirmText="OK"
        variant="info"
        onConfirm={() => setRestoreNotice(null)}
        onCancel={() => setRestoreNotice(null)}
      />
      <ConfirmDialog
        isOpen={restoreDeletedUser !== null}
        title="Restore deleted user"
        message={restoreDeletedUser ? `Restore ${restoreDeletedUser.email}? A Google Workspace account is restored in Google as well. Within 20 days of deletion Google undeletes it; after that Helios re-creates it from the snapshot taken before it was removed (profile, groups, licence), with a one-time password.` : ''}
        confirmText="Restore"
        variant="info"
        onConfirm={confirmRestoreDeleted}
        onCancel={() => { setRestoreDeletedUser(null); setRestoreError(null); }}
      >
        {restoreError && <p className="text-red-600" style={{ marginTop: 8 }}>{restoreError}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={bulkConfirmAction !== null}
        title={
          bulkConfirmAction === 'activate'
            ? 'Activate Users'
            : bulkConfirmAction === 'suspend'
            ? 'Suspend Users'
            : 'Delete Users'
        }
        message={
          bulkConfirmAction === 'activate'
            ? `Are you sure you want to activate ${selectedUserIds.length} user(s)? They will regain access to the platform.`
            : bulkConfirmAction === 'suspend'
            ? `Are you sure you want to suspend ${selectedUserIds.length} user(s)? They will lose access until restored.`
            : `Are you sure you want to delete ${selectedUserIds.length} user(s)? This action can be reversed within 30 days.`
        }
        variant={bulkConfirmAction === 'delete' ? 'danger' : bulkConfirmAction === 'suspend' ? 'warning' : 'info'}
        confirmText={
          bulkConfirmAction === 'activate'
            ? 'Activate'
            : bulkConfirmAction === 'suspend'
            ? 'Suspend'
            : 'Delete'
        }
        onConfirm={executeBulkAction}
        onCancel={() => setBulkConfirmAction(null)}
      />
    </div>
  );
}
