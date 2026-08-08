/**
 * Action Editor Component
 *
 * Editor for timeline actions within a trigger point.
 * Supports task, email, system, and training action types.
 */

import React, { useState } from 'react';
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Mail,
  Cog,
  GraduationCap,
  User,
  Users,
  Briefcase,
  Monitor,
} from 'lucide-react';

export type ActionType = 'task' | 'email' | 'system' | 'training';
export type AssigneeType = 'user' | 'manager' | 'hr' | 'it' | 'system';

export interface TimelineAction {
  id: string;
  type: ActionType;
  title?: string;
  description?: string;
  assignee?: AssigneeType;
  category?: string;
  template?: string;
  to?: string;
  action?: string;
  platforms?: string[];
  content_ids?: string[];
  config?: Record<string, unknown>;
}

interface ActionEditorProps {
  actions: TimelineAction[];
  onChange: (actions: TimelineAction[]) => void;
  requestType?: 'onboard' | 'offboard';
}

const ACTION_TYPES: { value: ActionType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'task',
    label: 'Manual Task',
    icon: <CheckSquare size={16} />,
    description: 'A task assigned to someone to complete',
  },
  {
    value: 'email',
    label: 'Send Email',
    icon: <Mail size={16} />,
    description: 'Automatically send an email notification',
  },
  {
    value: 'system',
    label: 'System Action',
    icon: <Cog size={16} />,
    description: 'Automated system action (account creation, etc.)',
  },
  {
    value: 'training',
    label: 'Training Assignment',
    icon: <GraduationCap size={16} />,
    description: 'Assign training content to the user',
  },
];

const ASSIGNEE_OPTIONS: { value: AssigneeType; label: string; icon: React.ReactNode }[] = [
  { value: 'user', label: 'New Employee', icon: <User size={14} /> },
  { value: 'manager', label: 'Manager', icon: <Briefcase size={14} /> },
  { value: 'hr', label: 'HR Team', icon: <Users size={14} /> },
  { value: 'it', label: 'IT Team', icon: <Monitor size={14} /> },
];

const SYSTEM_ACTIONS = [
  { value: 'create_account', label: 'Create User Account' },
  { value: 'add_to_groups', label: 'Add to Groups' },
  { value: 'activate_user', label: 'Activate User' },
  { value: 'deactivate_user', label: 'Deactivate User' },
  { value: 'remove_from_groups', label: 'Remove from Groups' },
  { value: 'transfer_data', label: 'Transfer Data' },
  { value: 'archive_account', label: 'Archive Account' },
];

const EMAIL_TEMPLATES = [
  { value: 'welcome_email', label: 'Welcome Email' },
  { value: 'account_ready', label: 'Account Ready' },
  { value: 'first_day_info', label: 'First Day Information' },
  { value: 'manager_notification', label: 'Manager Notification' },
  { value: 'it_setup_request', label: 'IT Setup Request' },
  { value: 'offboarding_notice', label: 'Offboarding Notice' },
  { value: 'exit_interview', label: 'Exit Interview Reminder' },
];

const TASK_CATEGORIES = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'offboarding', label: 'Offboarding' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'access', label: 'Access & Permissions' },
  { value: 'training', label: 'Training' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'administrative', label: 'Administrative' },
];

const generateId = () => `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const ActionEditor: React.FC<ActionEditorProps> = ({
  actions,
  onChange,
  requestType = 'onboard',
}) => {
  const [expandedActions, setExpandedActions] = useState<Record<string, boolean>>({});

  const addAction = (type: ActionType) => {
    const newAction: TimelineAction = {
      id: generateId(),
      type,
      assignee: type === 'task' ? 'hr' : undefined,
      category: type === 'task' ? requestType : undefined,
    };
    onChange([...actions, newAction]);
    setExpandedActions((prev) => ({ ...prev, [newAction.id]: true }));
  };

  const removeAction = (id: string) => {
    onChange(actions.filter((action) => action.id !== id));
  };

  const updateAction = (id: string, updates: Partial<TimelineAction>) => {
    onChange(
      actions.map((action) =>
        action.id === id ? { ...action, ...updates } : action
      )
    );
  };

  const toggleAction = (id: string) => {
    setExpandedActions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getActionIcon = (type: ActionType) => {
    return ACTION_TYPES.find((t) => t.value === type)?.icon;
  };

  const getActionSummary = (action: TimelineAction): string => {
    switch (action.type) {
      case 'task':
        return action.title || 'Untitled task';
      case 'email':
        return `Send: ${EMAIL_TEMPLATES.find((t) => t.value === action.template)?.label || action.template || 'Select template'}`;
      case 'system':
        return SYSTEM_ACTIONS.find((a) => a.value === action.action)?.label || action.action || 'Select action';
      case 'training':
        return `Assign ${action.content_ids?.length || 0} training item(s)`;
      default:
        return 'Configure action';
    }
  };

  return (
    <div className="action-editor">
      <div className="action-list-header">
        <span className="action-list-title">Actions</span>
        <div className="action-add-buttons">
          {ACTION_TYPES.map((type) => (
            <button
              key={type.value}
              className="btn-add-action"
              onClick={() => addAction(type.value)}
              title={type.description}
            >
              {type.icon}
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {actions.length === 0 ? (
        <div className="actions-empty">
          <p>No actions configured for this trigger point</p>
          <span>Click a button above to add an action</span>
        </div>
      ) : (
        <div className="actions-list">
          {actions.map((action) => (
            <div key={action.id} className={`action-item action-type-${action.type}`}>
              <div
                className="action-item-header"
                onClick={() => toggleAction(action.id)}
              >
                <div className="action-icon">{getActionIcon(action.type)}</div>
                <div className="action-summary">
                  <span className="action-type-label">
                    {ACTION_TYPES.find((t) => t.value === action.type)?.label}
                  </span>
                  <span className="action-title">{getActionSummary(action)}</span>
                </div>
                <div className="action-controls">
                  <button
                    className="btn-icon btn-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAction(action.id);
                    }}
                    title="Remove action"
                  >
                    <Trash2 size={14} />
                  </button>
                  {expandedActions[action.id] ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </div>
              </div>

              {expandedActions[action.id] && (
                <div className="action-item-content">
                  {action.type === 'task' && (
                    <TaskActionForm
                      action={action}
                      onChange={(updates) => updateAction(action.id, updates)}
                    />
                  )}
                  {action.type === 'email' && (
                    <EmailActionForm
                      action={action}
                      onChange={(updates) => updateAction(action.id, updates)}
                    />
                  )}
                  {action.type === 'system' && (
                    <SystemActionForm
                      action={action}
                      onChange={(updates) => updateAction(action.id, updates)}
                    />
                  )}
                  {action.type === 'training' && (
                    <TrainingActionForm
                      action={action}
                      onChange={(updates) => updateAction(action.id, updates)}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Task Action Form
const TaskActionForm: React.FC<{
  action: TimelineAction;
  onChange: (updates: Partial<TimelineAction>) => void;
}> = ({ action, onChange }) => (
  <div className="action-form">
    <div className="form-group">
      <label>Task Title *</label>
      <input
        type="text"
        value={action.title || ''}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="e.g., Set up workstation"
      />
    </div>

    <div className="form-group">
      <label>Description</label>
      <textarea
        value={action.description || ''}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Detailed instructions for completing this task..."
        rows={3}
      />
    </div>

    <div className="form-row">
      <div className="form-group">
        <label>Assigned To *</label>
        <select
          value={action.assignee || 'hr'}
          onChange={(e) => onChange({ assignee: e.target.value as AssigneeType })}
        >
          {ASSIGNEE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Category</label>
        <select
          value={action.category || ''}
          onChange={(e) => onChange({ category: e.target.value })}
        >
          <option value="">Select category</option>
          {TASK_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  </div>
);

// Email Action Form
const EmailActionForm: React.FC<{
  action: TimelineAction;
  onChange: (updates: Partial<TimelineAction>) => void;
}> = ({ action, onChange }) => (
  <div className="action-form">
    <div className="form-group">
      <label>Email Template *</label>
      <select
        value={action.template || ''}
        onChange={(e) => onChange({ template: e.target.value })}
      >
        <option value="">Select template</option>
        {EMAIL_TEMPLATES.map((tmpl) => (
          <option key={tmpl.value} value={tmpl.value}>
            {tmpl.label}
          </option>
        ))}
      </select>
    </div>

    <div className="form-group">
      <label>Send To</label>
      <select
        value={action.to || 'user'}
        onChange={(e) => onChange({ to: e.target.value })}
      >
        <option value="user">New Employee</option>
        <option value="manager">Manager</option>
        <option value="hr">HR Team</option>
        <option value="it">IT Team</option>
        <option value="personal_email">Personal Email</option>
      </select>
      <p className="form-hint">
        Who should receive this email
      </p>
    </div>
  </div>
);

// System Action Form
const SystemActionForm: React.FC<{
  action: TimelineAction;
  onChange: (updates: Partial<TimelineAction>) => void;
}> = ({ action, onChange }) => (
  <div className="action-form">
    <div className="form-group">
      <label>System Action *</label>
      <select
        value={action.action || ''}
        onChange={(e) => onChange({ action: e.target.value })}
      >
        <option value="">Select action</option>
        {SYSTEM_ACTIONS.map((sa) => (
          <option key={sa.value} value={sa.value}>
            {sa.label}
          </option>
        ))}
      </select>
    </div>

    <div className="form-group">
      <label>Platforms</label>
      <div className="checkbox-grid">
        {['google_workspace', 'microsoft_365', 'local'].map((platform) => (
          <label key={platform} className="checkbox-label">
            <input
              type="checkbox"
              checked={(action.platforms || []).includes(platform)}
              onChange={(e) => {
                const platforms = action.platforms || [];
                if (e.target.checked) {
                  onChange({ platforms: [...platforms, platform] });
                } else {
                  onChange({ platforms: platforms.filter((p) => p !== platform) });
                }
              }}
            />
            <span>
              {platform === 'google_workspace' ? 'Google Workspace' :
               platform === 'microsoft_365' ? 'Microsoft 365' : 'Local'}
            </span>
          </label>
        ))}
      </div>
      <p className="form-hint">
        Which platforms should this action affect
      </p>
    </div>
  </div>
);

// Training Action Form
const TrainingActionForm: React.FC<{
  action: TimelineAction;
  onChange: (updates: Partial<TimelineAction>) => void;
}> = ({ action, onChange }) => (
  <div className="action-form">
    <div className="form-group">
      <label>Training Content</label>
      <p className="form-hint">
        Training content selection will be available once training modules are configured.
        For now, you can enter content IDs manually.
      </p>
      <textarea
        value={(action.content_ids || []).join('\n')}
        onChange={(e) =>
          onChange({
            content_ids: e.target.value.split('\n').filter((id) => id.trim()),
          })
        }
        placeholder="Enter content IDs, one per line"
        rows={3}
      />
    </div>
  </div>
);

export default ActionEditor;
