/**
 * Scheduled Actions Page
 *
 * View and manage scheduled user lifecycle actions (onboarding, offboarding, etc.)
 * Supports calendar and list views, filtering, cancellation, and approval workflows.
 */

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  List,
  Filter,
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  UserPlus,
  UserMinus,
  Pause,
  Play,
  Trash2,
  X,
  Check,
  Eye,
  Loader2,
} from 'lucide-react';
import { DataTable, createColumnHelper } from '../../components/ui/DataTable';
import {
  useScheduledActions,
  useActionLogs,
  useCancelAction,
  useApproveAction,
  useRejectAction,
} from '../../hooks/queries/useScheduledActions';
import type { ScheduledAction } from '../../hooks/queries/useScheduledActions';
import ActionTimeline from '../../components/lifecycle/ActionTimeline';
import './ScheduledActions.css';

const columnHelper = createColumnHelper<ScheduledAction>();

interface ScheduledActionsProps {
  organizationId: string;
}

// Action type labels and icons
const actionTypeConfig: Record<string, { label: string; color: string }> = {
  onboard: { label: 'Onboard', color: '#10b981' },
  offboard: { label: 'Offboard', color: '#f59e0b' },
  suspend: { label: 'Suspend', color: '#ef4444' },
  unsuspend: { label: 'Unsuspend', color: '#3b82f6' },
  delete: { label: 'Delete', color: '#dc2626' },
  restore: { label: 'Restore', color: '#8b5cf6' },
  manual: { label: 'Manual', color: '#6b7280' },
};

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: '#6b7280', bgColor: '#f3f4f6' },
  in_progress: { label: 'In Progress', color: '#6d28d9', bgColor: '#ede9fe' },
  completed: { label: 'Completed', color: '#065f46', bgColor: '#d1fae5' },
  failed: { label: 'Failed', color: '#991b1b', bgColor: '#fee2e2' },
  cancelled: { label: 'Cancelled', color: '#6b7280', bgColor: '#f3f4f6' },
};

// Get action type icon
const getActionIcon = (type: string) => {
  switch (type) {
    case 'onboard':
      return <UserPlus size={16} />;
    case 'offboard':
      return <UserMinus size={16} />;
    case 'suspend':
      return <Pause size={16} />;
    case 'unsuspend':
      return <Play size={16} />;
    case 'delete':
      return <Trash2 size={16} />;
    default:
      return <Clock size={16} />;
  }
};

// Get status icon
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle size={14} />;
    case 'failed':
      return <XCircle size={14} />;
    case 'cancelled':
      return <X size={14} />;
    case 'in_progress':
      return <RefreshCw size={14} className="animate-spin" />;
    default:
      return <Clock size={14} />;
  }
};

const ScheduledActions: React.FC<ScheduledActionsProps> = ({ organizationId: _organizationId }) => {
  // State
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<ScheduledAction | null>(null);
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');

  // TanStack Query hooks
  const { data: actions = [], isLoading, error, refetch } = useScheduledActions({
    status: filterStatus,
    actionType: filterType,
    search: searchQuery,
  });

  const { data: actionLogs = [], isLoading: logsLoading } = useActionLogs(selectedAction?.id || null);

  const cancelMutation = useCancelAction();
  const approveMutation = useApproveAction();
  const rejectMutation = useRejectAction();

  // Handle action selection
  const handleSelectAction = (action: ScheduledAction) => {
    setSelectedAction(action);
  };

  // Cancel action
  const handleCancelAction = async () => {
    if (!showCancelModal) return;

    try {
      await cancelMutation.mutateAsync({ actionId: showCancelModal, reason: cancelReason });
      setShowCancelModal(null);
      setCancelReason('');
      if (selectedAction?.id === showCancelModal) {
        setSelectedAction(null);
      }
    } catch (err) {
      // Error handled by mutation
    }
  };

  // Approve/Reject action
  const handleApprovalAction = async () => {
    if (!showApprovalModal) return;

    try {
      if (showApprovalModal.type === 'approve') {
        await approveMutation.mutateAsync({ actionId: showApprovalModal.id, notes: approvalNotes });
      } else {
        await rejectMutation.mutateAsync({ actionId: showApprovalModal.id, reason: approvalNotes });
      }
      setShowApprovalModal(null);
      setApprovalNotes('');
    } catch (err) {
      // Error handled by mutation
    }
  };

  // Group actions by date for calendar view
  const actionsByDate = useMemo(() => {
    return actions.reduce((acc, action) => {
      const date = new Date(action.scheduledFor).toDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(action);
      return acc;
    }, {} as Record<string, ScheduledAction[]>);
  }, [actions]);

  // Define columns using TanStack Table
  const columns = useMemo(() => [
    columnHelper.display({
      id: 'user',
      header: 'User',
      cell: ({ row }) => {
        const action = row.original;
        return (
          <div className="user-info">
            <span className="user-name">
              {action.targetFirstName} {action.targetLastName}
            </span>
            <span className="user-email">{action.targetEmail}</span>
          </div>
        );
      },
      size: 200,
    }),
    columnHelper.accessor('actionType', {
      header: 'Action',
      cell: ({ getValue }) => {
        const actionType = getValue();
        return (
          <span
            className="action-type-badge"
            style={{ color: actionTypeConfig[actionType]?.color || '#6b7280' }}
          >
            {getActionIcon(actionType)}
            {actionTypeConfig[actionType]?.label || actionType}
          </span>
        );
      },
      size: 120,
    }),
    columnHelper.accessor('scheduledFor', {
      header: 'Scheduled For',
      cell: ({ getValue }) => {
        const date = new Date(getValue());
        return (
          <div className="date-info">
            <span className="date">{date.toLocaleDateString()}</span>
            <span className="time">
              {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        );
      },
      size: 140,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: ({ row }) => {
        const action = row.original;
        const status = action.status;
        return (
          <div className="status-wrapper">
            <span
              className="status-badge"
              style={{
                color: statusConfig[status]?.color,
                backgroundColor: statusConfig[status]?.bgColor,
              }}
            >
              {getStatusIcon(status)}
              {statusConfig[status]?.label}
            </span>
            {action.requiresApproval && status === 'pending' && !action.approvedAt && (
              <span className="approval-badge">Needs Approval</span>
            )}
          </div>
        );
      },
      size: 150,
    }),
    columnHelper.display({
      id: 'progress',
      header: 'Progress',
      cell: ({ row }) => {
        const action = row.original;
        if (action.totalSteps <= 0) return null;
        const percent = (action.completedSteps / action.totalSteps) * 100;
        return (
          <div className="progress-wrapper">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="progress-text">
              {action.completedSteps}/{action.totalSteps}
            </span>
          </div>
        );
      },
      size: 120,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const action = row.original;
        return (
          <div className="actions-cell" onClick={(e) => e.stopPropagation()}>
            <button
              className="icon-btn"
              onClick={() => handleSelectAction(action)}
              title="View details"
            >
              <Eye size={16} />
            </button>
            {action.status === 'pending' && (
              <>
                {action.requiresApproval && !action.approvedAt && (
                  <>
                    <button
                      className="icon-btn approve"
                      onClick={() => setShowApprovalModal({ id: action.id, type: 'approve' })}
                      title="Approve"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="icon-btn reject"
                      onClick={() => setShowApprovalModal({ id: action.id, type: 'reject' })}
                      title="Reject"
                    >
                      <X size={16} />
                    </button>
                  </>
                )}
                <button
                  className="icon-btn cancel"
                  onClick={() => setShowCancelModal(action.id)}
                  title="Cancel"
                >
                  <XCircle size={16} />
                </button>
              </>
            )}
          </div>
        );
      },
      size: 140,
    }),
  ], []);

  // Render loading state
  if (isLoading) {
    return (
      <div className="scheduled-actions-page">
        <div className="loading-state">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading scheduled actions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="scheduled-actions-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>Scheduled Actions</h1>
          <p className="header-subtitle">
            View and manage upcoming user lifecycle actions
          </p>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List size={16} />
            </button>
            <button
              className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
              title="Calendar view"
            >
              <Calendar size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {(error || cancelMutation.error || approveMutation.error || rejectMutation.error) && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>
            {(error as Error)?.message ||
              (cancelMutation.error as Error)?.message ||
              (approveMutation.error as Error)?.message ||
              (rejectMutation.error as Error)?.message}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filters">
          <div className="filter-group">
            <Filter size={14} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="filter-group">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="onboard">Onboarding</option>
              <option value="offboard">Offboarding</option>
              <option value="suspend">Suspend</option>
              <option value="unsuspend">Unsuspend</option>
              <option value="delete">Delete</option>
            </select>
          </div>
        </div>

        <button className="btn-secondary" onClick={() => refetch()}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Main Content Area */}
      <div className={`content-area ${selectedAction ? 'with-panel' : ''}`}>
        {/* Actions List */}
        {actions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Clock size={48} />
            </div>
            <h2>No scheduled actions</h2>
            <p>Schedule user onboarding or offboarding to see actions here.</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="actions-list">
            <DataTable
              data={actions}
              columns={columns}
              onRowClick={handleSelectAction}
              enableSorting={true}
              enableFiltering={false}
              rowHeight={56}
              emptyMessage="No scheduled actions"
              getRowId={(row) => row.id}
            />
          </div>
        ) : (
          /* Calendar View */
          <div className="calendar-view">
            {Object.entries(actionsByDate)
              .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
              .map(([date, dateActions]) => (
                <div key={date} className="calendar-day">
                  <div className="day-header">
                    <span className="day-date">
                      {new Date(date).toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="day-count">{dateActions.length} actions</span>
                  </div>
                  <div className="day-actions">
                    {dateActions.map((action) => (
                      <div
                        key={action.id}
                        className={`calendar-action ${action.status}`}
                        onClick={() => handleSelectAction(action)}
                      >
                        <span
                          className="action-indicator"
                          style={{
                            backgroundColor: actionTypeConfig[action.actionType]?.color,
                          }}
                        />
                        <div className="action-info">
                          <span className="action-name">
                            {action.targetFirstName} {action.targetLastName}
                          </span>
                          <span className="action-type">
                            {actionTypeConfig[action.actionType]?.label}
                          </span>
                        </div>
                        <span className="action-time">
                          {new Date(action.scheduledFor).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Detail Panel */}
        {selectedAction && (
          <div className="detail-panel">
            <div className="panel-header">
              <h3>Action Details</h3>
              <button
                className="close-btn"
                onClick={() => setSelectedAction(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="panel-content">
              <div className="detail-section">
                <h4>Target User</h4>
                <div className="detail-row">
                  <span className="detail-label">Name</span>
                  <span className="detail-value">
                    {selectedAction.targetFirstName} {selectedAction.targetLastName}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{selectedAction.targetEmail}</span>
                </div>
              </div>

              <div className="detail-section">
                <h4>Action Info</h4>
                <div className="detail-row">
                  <span className="detail-label">Type</span>
                  <span
                    className="action-type-badge"
                    style={{
                      color: actionTypeConfig[selectedAction.actionType]?.color,
                    }}
                  >
                    {getActionIcon(selectedAction.actionType)}
                    {actionTypeConfig[selectedAction.actionType]?.label}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span
                    className="status-badge"
                    style={{
                      color: statusConfig[selectedAction.status]?.color,
                      backgroundColor: statusConfig[selectedAction.status]?.bgColor,
                    }}
                  >
                    {getStatusIcon(selectedAction.status)}
                    {statusConfig[selectedAction.status]?.label}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Scheduled For</span>
                  <span className="detail-value">
                    {new Date(selectedAction.scheduledFor).toLocaleString()}
                  </span>
                </div>
                {selectedAction.isRecurring && (
                  <div className="detail-row">
                    <span className="detail-label">Recurrence</span>
                    <span className="detail-value">{selectedAction.recurrenceInterval}</span>
                  </div>
                )}
              </div>

              {selectedAction.requiresApproval && (
                <div className="detail-section">
                  <h4>Approval</h4>
                  {selectedAction.approvedAt ? (
                    <div className="approval-info approved">
                      <CheckCircle size={16} />
                      <span>Approved on {new Date(selectedAction.approvedAt).toLocaleString()}</span>
                    </div>
                  ) : selectedAction.rejectedAt ? (
                    <div className="approval-info rejected">
                      <XCircle size={16} />
                      <span>Rejected: {selectedAction.rejectionReason}</span>
                    </div>
                  ) : (
                    <div className="approval-actions">
                      <button
                        className="btn-primary"
                        onClick={() =>
                          setShowApprovalModal({ id: selectedAction.id, type: 'approve' })
                        }
                      >
                        <Check size={14} />
                        Approve
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          setShowApprovalModal({ id: selectedAction.id, type: 'reject' })
                        }
                      >
                        <X size={14} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedAction.errorMessage && (
                <div className="detail-section">
                  <h4>Error</h4>
                  <div className="error-message">
                    <AlertCircle size={16} />
                    {selectedAction.errorMessage}
                  </div>
                </div>
              )}

              <div className="detail-section timeline-section">
                <h4>Execution Timeline</h4>
                {logsLoading ? (
                  <div className="loading-state small">
                    <Loader2 className="animate-spin" size={16} />
                    <span>Loading...</span>
                  </div>
                ) : actionLogs.length > 0 ? (
                  <ActionTimeline
                    steps={actionLogs.map((log) => ({
                      id: log.id,
                      step: log.actionStep,
                      stepDescription: log.stepDescription,
                      stepOrder: log.stepOrder,
                      status: log.status,
                      durationMs: log.durationMs,
                      errorMessage: log.errorMessage,
                      executedAt: log.executedAt,
                      details: log.details,
                    }))}
                    actionType={selectedAction.actionType}
                  />
                ) : (
                  <p className="no-logs">No execution logs yet.</p>
                )}
              </div>

              {selectedAction.status === 'pending' && (
                <div className="panel-actions">
                  <button
                    className="btn-danger"
                    onClick={() => setShowCancelModal(selectedAction.id)}
                  >
                    <XCircle size={14} />
                    Cancel Action
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Cancel Scheduled Action</h3>
            <p>Are you sure you want to cancel this action? This cannot be undone.</p>
            <div className="form-group">
              <label>Reason (optional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancellation..."
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCancelModal(null);
                  setCancelReason('');
                }}
                disabled={cancelMutation.isPending}
              >
                Keep Action
              </button>
              <button
                className="btn-danger"
                onClick={handleCancelAction}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Cancelling...
                  </>
                ) : (
                  'Cancel Action'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>
              {showApprovalModal.type === 'approve' ? 'Approve Action' : 'Reject Action'}
            </h3>
            <p>
              {showApprovalModal.type === 'approve'
                ? 'This action will be executed at the scheduled time.'
                : 'This action will be cancelled and marked as rejected.'}
            </p>
            <div className="form-group">
              <label>
                {showApprovalModal.type === 'approve' ? 'Notes (optional)' : 'Reason (required)'}
              </label>
              <textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder={
                  showApprovalModal.type === 'approve'
                    ? 'Add any notes...'
                    : 'Enter reason for rejection...'
                }
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowApprovalModal(null);
                  setApprovalNotes('');
                }}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                Cancel
              </button>
              <button
                className={showApprovalModal.type === 'approve' ? 'btn-primary' : 'btn-danger'}
                onClick={handleApprovalAction}
                disabled={
                  approveMutation.isPending ||
                  rejectMutation.isPending ||
                  (showApprovalModal.type === 'reject' && !approvalNotes.trim())
                }
              >
                {approveMutation.isPending || rejectMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Processing...
                  </>
                ) : showApprovalModal.type === 'approve' ? (
                  <>
                    <Check size={14} />
                    Approve
                  </>
                ) : (
                  <>
                    <X size={14} />
                    Reject
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduledActions;
