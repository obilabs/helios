/**
 * Task Card Component
 *
 * Displays a single lifecycle task with status, due date, and quick actions.
 */

import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Users,
  Briefcase,
  Monitor,
  ChevronRight,
  PlayCircle,
} from 'lucide-react';
import './TaskCard.css';

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
}

interface TaskCardProps {
  task: Task;
  onComplete?: () => void;
  onStart?: () => void;
  onClick?: () => void;
}

const ASSIGNEE_ICONS: Record<string, React.ReactNode> = {
  user: <User size={14} />,
  manager: <Briefcase size={14} />,
  hr: <Users size={14} />,
  it: <Monitor size={14} />,
  system: <Monitor size={14} />,
};

const ASSIGNEE_LABELS: Record<string, string> = {
  user: 'New Employee',
  manager: 'Manager',
  hr: 'HR Team',
  it: 'IT Team',
  system: 'System',
};

const CATEGORY_COLORS: Record<string, string> = {
  onboarding: '#10b981',
  offboarding: '#f59e0b',
  equipment: '#3b82f6',
  access: '#8b5cf6',
  training: '#ec4899',
  system: '#6b7280',
  notification: '#06b6d4',
};

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onComplete,
  onStart,
  onClick,
}) => {
  const isOverdue = task.due_date && task.status !== 'completed' &&
    task.due_date < new Date().toISOString().split('T')[0];

  const isToday = task.due_date === new Date().toISOString().split('T')[0];

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today';
    }
    if (dateStr === tomorrow.toISOString().split('T')[0]) {
      return 'Tomorrow';
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysOverdue = (dateStr: string): number => {
    const today = new Date();
    const dueDate = new Date(dateStr);
    const diffTime = today.getTime() - dueDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const categoryColor = CATEGORY_COLORS[task.category || 'system'] || '#6b7280';

  return (
    <div
      className={`task-card ${task.status} ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''}`}
      onClick={onClick}
    >
      <div className="task-status-indicator">
        {task.status === 'completed' ? (
          <CheckCircle2 size={20} className="status-icon completed" />
        ) : task.status === 'in_progress' ? (
          <PlayCircle size={20} className="status-icon in-progress" />
        ) : isOverdue ? (
          <AlertTriangle size={20} className="status-icon overdue" />
        ) : (
          <Clock size={20} className="status-icon pending" />
        )}
      </div>

      <div className="task-content">
        <div className="task-header">
          <h3 className="task-title">{task.title}</h3>
          {task.category && (
            <span
              className="task-category"
              style={{ backgroundColor: `${categoryColor}15`, color: categoryColor }}
            >
              {task.category}
            </span>
          )}
        </div>

        {task.request_name && (
          <div className="task-subject">
            <User size={12} />
            <span>{task.request_name}</span>
            {task.request_email && (
              <span className="task-email">({task.request_email})</span>
            )}
          </div>
        )}

        <div className="task-meta">
          <div className="task-assignee">
            {ASSIGNEE_ICONS[task.assignee_type]}
            <span>{ASSIGNEE_LABELS[task.assignee_type]}</span>
          </div>

          {task.due_date && task.status !== 'completed' && (
            <div className={`task-due-date ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''}`}>
              <Clock size={12} />
              <span>
                {isOverdue
                  ? `${getDaysOverdue(task.due_date)} days overdue`
                  : formatDate(task.due_date)}
              </span>
            </div>
          )}

          {task.status === 'completed' && task.completed_at && (
            <div className="task-completed-date">
              <CheckCircle2 size={12} />
              <span>Completed {formatDate(task.completed_at.split('T')[0])}</span>
            </div>
          )}
        </div>
      </div>

      <div className="task-actions">
        {task.status === 'pending' && (
          <>
            {onStart && (
              <button
                className="btn-start"
                onClick={(e) => {
                  e.stopPropagation();
                  onStart();
                }}
                title="Start task"
              >
                <PlayCircle size={16} />
              </button>
            )}
            {onComplete && (
              <button
                className="btn-complete"
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete();
                }}
                title="Complete task"
              >
                <CheckCircle2 size={16} />
              </button>
            )}
          </>
        )}

        {task.status === 'in_progress' && onComplete && (
          <button
            className="btn-complete"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
            title="Complete task"
          >
            <CheckCircle2 size={16} />
          </button>
        )}

        <ChevronRight size={18} className="chevron" />
      </div>
    </div>
  );
};

export default TaskCard;
