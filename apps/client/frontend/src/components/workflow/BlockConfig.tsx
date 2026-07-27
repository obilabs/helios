import { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { getBlockDefinition } from './blockDefinitions';
import { VariableDropdown } from './VariableDropdown';
import { BLOCK_CATEGORIES, type WorkflowBlock, WORKFLOW_VARIABLES } from './types';
import { authFetch } from '../../config/api';

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
}

interface Group {
  id: string;
  name: string;
  email?: string;
}

interface BlockConfigProps {
  block: WorkflowBlock;
  onUpdate: (updates: Partial<WorkflowBlock>) => void;
  onClose: () => void;
  readOnly?: boolean;
}

export function BlockConfig({ block, onUpdate, onClose, readOnly }: BlockConfigProps) {
  const definition = getBlockDefinition(block.type);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Fetch users and groups when component mounts
  useEffect(() => {
    fetchUsers();
    fetchGroups();
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await authFetch('/api/v1/users');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUsers(data.data || []);
        }
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchGroups = async () => {
    setLoadingGroups(true);
    try {
      const response = await authFetch('/api/v1/groups');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setGroups(data.data || []);
        }
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
    } finally {
      setLoadingGroups(false);
    }
  };

  if (!definition) {
    return (
      <div className="block-config">
        <div className="block-config-header">
          <h4>Unknown Block</h4>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="block-config-error">
          <AlertCircle size={16} />
          <span>Block type "{block.type}" not found</span>
        </div>
      </div>
    );
  }

  const categoryInfo = BLOCK_CATEGORIES[definition.category];

  const handleInputChange = (key: string, value: string | number | boolean) => {
    onUpdate({
      inputs: {
        ...block.inputs,
        [key]: value,
      },
    });
  };

  return (
    <div className="block-config">
      {/* Header */}
      <div className="block-config-header">
        <div className="block-config-title">
          <span
            className="block-config-icon"
            style={{ backgroundColor: `${definition.color}15`, color: definition.color }}
          >
            {getBlockEmoji(block.type)}
          </span>
          <div>
            <h4>{definition.name}</h4>
            <span
              className="block-config-category"
              style={{ color: categoryInfo.color }}
            >
              {categoryInfo.label}
            </span>
          </div>
        </div>
        <button className="btn-icon" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Description */}
      <p className="block-config-description">{definition.description}</p>

      {/* Inputs */}
      <div className="block-config-inputs">
        {definition.inputs.map((input) => (
          <div key={input.key} className="block-config-field">
            <label>
              {input.label}
              {input.required && <span className="required">*</span>}
            </label>

            {input.type === 'text' && (
              <input
                type="text"
                value={String(block.inputs[input.key] || '')}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                placeholder={input.placeholder}
                disabled={readOnly}
              />
            )}

            {input.type === 'email' && (
              <input
                type="email"
                value={String(block.inputs[input.key] || '')}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                placeholder={input.placeholder}
                disabled={readOnly}
              />
            )}

            {input.type === 'number' && (
              <input
                type="number"
                value={Number(block.inputs[input.key]) || 0}
                onChange={(e) => handleInputChange(input.key, parseInt(e.target.value) || 0)}
                placeholder={input.placeholder}
                disabled={readOnly}
              />
            )}

            {input.type === 'variable' && (
              <VariableDropdown
                value={String(block.inputs[input.key] || '')}
                onChange={(value) => handleInputChange(input.key, value)}
                placeholder={input.placeholder}
                disabled={readOnly}
              />
            )}

            {input.type === 'select' && input.options && (
              <select
                value={String(block.inputs[input.key] || '')}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                disabled={readOnly}
              >
                <option value="">Select...</option>
                {input.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {/* Dynamic select for user/group based on recipientType */}
            {input.type === 'select' && !input.options && input.key === 'recipientId' && (
              <select
                value={String(block.inputs[input.key] || '')}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                disabled={readOnly}
              >
                <option value="">Select recipient...</option>
                {block.inputs.recipientType === 'user' && (
                  loadingUsers ? (
                    <option disabled>Loading users...</option>
                  ) : (
                    users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName || user.first_name} {user.lastName || user.last_name} ({user.email})
                      </option>
                    ))
                  )
                )}
                {block.inputs.recipientType === 'group' && (
                  loadingGroups ? (
                    <option disabled>Loading groups...</option>
                  ) : (
                    groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} {group.email ? `(${group.email})` : ''}
                      </option>
                    ))
                  )
                )}
                {block.inputs.recipientType === 'context' && (
                  <>
                    {WORKFLOW_VARIABLES.filter(cat => ['user', 'manager', 'hr'].includes(cat.name))
                      .flatMap(cat => cat.variables)
                      .map((v) => (
                        <option key={v.key} value={`{{${v.key}}}`}>
                          {v.label}
                        </option>
                      ))
                    }
                  </>
                )}
              </select>
            )}

            {/* User select dropdown */}
            {input.type === 'user' && (
              <select
                value={String(block.inputs[input.key] || '')}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                disabled={readOnly}
              >
                <option value="">Select user...</option>
                {loadingUsers ? (
                  <option disabled>Loading users...</option>
                ) : (
                  users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.firstName || user.first_name} {user.lastName || user.last_name} ({user.email})
                    </option>
                  ))
                )}
              </select>
            )}

            {/* Group select dropdown */}
            {input.type === 'group' && (
              <select
                value={String(block.inputs[input.key] || '')}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                disabled={readOnly}
              >
                <option value="">Select group...</option>
                {loadingGroups ? (
                  <option disabled>Loading groups...</option>
                ) : (
                  groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} {group.email ? `(${group.email})` : ''}
                    </option>
                  ))
                )}
              </select>
            )}

            {input.type === 'boolean' && (
              <label className="block-config-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(block.inputs[input.key])}
                  onChange={(e) => handleInputChange(input.key, e.target.checked)}
                  disabled={readOnly}
                />
                <span>Enabled</span>
              </label>
            )}

            {input.type === 'template' && (
              <select
                value={String(block.inputs[input.key] || '')}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                disabled={readOnly}
                className="template-select"
              >
                <option value="">Select {input.templateType} template...</option>
                {/* Templates will be loaded from API */}
                <option value="placeholder">Loading templates...</option>
              </select>
            )}
          </div>
        ))}
      </div>

      {/* Enabled toggle */}
      <div className="block-config-footer">
        <label className="block-config-toggle">
          <span>Block enabled</span>
          <input
            type="checkbox"
            checked={block.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            disabled={readOnly}
          />
        </label>
      </div>
    </div>
  );
}

// Simple emoji mapping
function getBlockEmoji(type: string): string {
  const emojiMap: Record<string, string> = {
    create_user: '👤',
    update_user: '✏️',
    suspend_user: '🚫',
    delete_user: '🗑️',
    reset_password: '🔑',
    add_to_group: '➕',
    remove_from_group: '➖',
    create_group: '👥',
    send_email: '✉️',
    set_signature: '✍️',
    set_vacation_responder: '🏖️',
    remove_vacation_responder: '🔙',
    create_calendar_event: '📅',
    decline_future_meetings: '❌',
    transfer_calendar: '📆',
    grant_drive_access: '📁',
    revoke_drive_access: '🚷',
    transfer_drive_ownership: '📤',
    revoke_oauth_tokens: '🔐',
    sign_out_sessions: '🚪',
    wipe_mobile_device: '📱',
    notify_manager: '📣',
    notify_hr: '📢',
    notify_it: '🔔',
    send_notification: '📬',
    assign_training: '🎓',
    create_task: '✅',
    if_condition: '🔀',
    wait: '⏳',
    comment: '💬',
  };
  return emojiMap[type] || '⚡';
}

export default BlockConfig;
