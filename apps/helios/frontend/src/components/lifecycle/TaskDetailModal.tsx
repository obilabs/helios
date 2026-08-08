/**
 * Task Detail Modal
 *
 * Shows full task details with completion form.
 */

import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Users,
  Briefcase,
  Monitor,
  Calendar,
  Link,
  SkipForward,
  PlayCircle,
} from 'lucide-react';
import './TaskDetailModal.css';

interface Task {
  id: string;
  title: string;
  description?: string;
  category?: string;
  assignee_type: 'user' | 'manager' | 'hr' | 'it' | 'system';
  due_date?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
  request_id?: string;
  request_email?: string;
  request_name?: string;
  request_start_date?: string;
  completed_at?: string;
  completed_by_name?: string;
  completion_notes?: string;
}

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  onComplete: (taskId: string, notes?: string) => void;
  onSkip: (taskId: string, reason?: string) => void;
  onStart: (taskId: string) => void;
}

const ASSIGNEE_ICONS: Record<string, React.ReactNode> = {
  user: <User size={16} />,
  manager: <Briefcase size={16} />,
  hr: <Users size={16} />,
  it: <Monitor size={16} />,
  system: <Monitor size={16} />,
};

const ASSIGNEE_LABELS: Record<string, string> = {
  user: 'New Employee',
  manager: 'Manager',
  hr: 'HR Team',
  it: 'IT Team',
  system: 'System',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: '#6b7280', icon: <Clock size={16} /> },
  in_progress: { label: 'In Progress', color: '#8b5cf6', icon: <PlayCircle size={16} /> },
  completed: { label: 'Completed', color: '#10b981', icon: <CheckCircle2 size={16} /> },
  skipped: { label: 'Skipped', color: '#f59e0b', icon: <SkipForward size={16} /> },
  blocked: { label: 'Blocked', color: '#ef4444', icon: <AlertTriangle size={16} /> },
};

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  onClose,
  onComplete,
  onSkip,
  onStart,
}) => {
  const [notes, setNotes] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [showSkipForm, setShowSkipForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isOverdue = task.due_date && task.status !== 'completed' &&
    task.due_date < new Date().toISOString().split('T')[0];

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleComplete = async () => {
    setSubmitting(true);
    await onComplete(task.id, notes || undefined);
    setSubmitting(false);
  };

  const handleSkip = async () => {
    setSubmitting(true);
    await onSkip(task.id, skipReason || undefined);
    setSubmitting(false);
  };

  const handleStart = async () => {
    await onStart(task.id);
  };

  const statusConfig = STATUS_CONFIG[task.status];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="task-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-section">
            <div
              className="status-badge"
              style={{ backgroundColor: `${statusConfig.color}15`, color: statusConfig.color }}
            >
              {statusConfig.icon}
              {statusConfig.label}
            </div>
            <h2>{task.title}</h2>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Task Description */}
          {task.description && (
            <div className="detail-section">
              <h3>Description</h3>
              <p className="task-description">{task.description}</p>
            </div>
          )}

          {/* Task Info */}
          <div className="detail-section">
            <h3>Details</h3>
            <div className="detail-grid">
              {task.request_name && (
                <div className="detail-item">
                  <span className="detail-label">
                    <User size={14} />
                    For
                  </span>
                  <span className="detail-value">
                    {task.request_name}
                    {task.request_email && (
                      <span className="detail-secondary"> ({task.request_email})</span>
                    )}
                  </span>
                </div>
              )}

              <div className="detail-item">
                <span className="detail-label">
                  {ASSIGNEE_ICONS[task.assignee_type]}
                  Assigned to
                </span>
                <span className="detail-value">{ASSIGNEE_LABELS[task.assignee_type]}</span>
              </div>

              {task.category && (
                <div className="detail-item">
                  <span className="detail-label">Category</span>
                  <span className="detail-value category-tag">{task.category}</span>
                </div>
              )}

              {task.due_date && (
                <div className="detail-item">
                  <span className="detail-label">
                    <Calendar size={14} />
                    Due Date
                  </span>
                  <span className={`detail-value ${isOverdue ? 'overdue' : ''}`}>
                    {formatDate(task.due_date)}
                    {isOverdue && <AlertTriangle size={14} className="overdue-icon" />}
                  </span>
                </div>
              )}

              {task.request_start_date && (
                <div className="detail-item">
                  <span className="detail-label">
                    <Calendar size={14} />
                    Start Date
                  </span>
                  <span className="detail-value">{formatDate(task.request_start_date)}</span>
                </div>
              )}

              {task.request_id && (
                <div className="detail-item">
                  <span className="detail-label">
                    <Link size={14} />
                    Request
                  </span>
                  <a href={`/requests/${task.request_id}`} className="detail-link">
                    View Request
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Completion Info */}
          {task.status === 'completed' && (
            <div className="detail-section completed-section">
              <h3>Completion</h3>
              <div className="detail-grid">
                {task.completed_at && (
                  <div className="detail-item">
                    <span className="detail-label">Completed At</span>
                    <span className="detail-value">
                      {new Date(task.completed_at).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                )}
                {task.completed_by_name && (
                  <div className="detail-item">
                    <span className="detail-label">Completed By</span>
                    <span className="detail-value">{task.completed_by_name}</span>
                  </div>
                )}
                {task.completion_notes && (
                  <div className="detail-item full-width">
                    <span className="detail-label">Notes</span>
                    <p className="completion-notes">{task.completion_notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Forms */}
          {task.status !== 'completed' && task.status !== 'skipped' && (
            <div className="detail-section action-section">
              {!showSkipForm ? (
                <>
                  <h3>Complete Task</h3>
                  <div className="form-group">
                    <label htmlFor="completion-notes">Notes (optional)</label>
                    <textarea
                      id="completion-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about completing this task..."
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <>
                  <h3>Skip Task</h3>
                  <div className="form-group">
                    <label htmlFor="skip-reason">Reason for skipping</label>
                    <textarea
                      id="skip-reason"
                      value={skipReason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      placeholder="Explain why this task is being skipped..."
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {task.status !== 'completed' && task.status !== 'skipped' && (
          <div className="modal-footer">
            <div className="footer-left">
              {!showSkipForm ? (
                <button
                  className="btn-skip"
                  onClick={() => setShowSkipForm(true)}
                >
                  <SkipForward size={16} />
                  Skip Task
                </button>
              ) : (
                <button
                  className="btn-secondary"
                  onClick={() => setShowSkipForm(false)}
                >
                  Cancel Skip
                </button>
              )}
            </div>
            <div className="footer-right">
              {!showSkipForm ? (
                <>
                  {task.status === 'pending' && (
                    <button className="btn-secondary" onClick={handleStart}>
                      <PlayCircle size={16} />
                      Start Task
                    </button>
                  )}
                  <button
                    className="btn-primary"
                    onClick={handleComplete}
                    disabled={submitting}
                  >
                    <CheckCircle2 size={16} />
                    {submitting ? 'Completing...' : 'Mark Complete'}
                  </button>
                </>
              ) : (
                <button
                  className="btn-warning"
                  onClick={handleSkip}
                  disabled={submitting}
                >
                  <SkipForward size={16} />
                  {submitting ? 'Skipping...' : 'Confirm Skip'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskDetailModal;
