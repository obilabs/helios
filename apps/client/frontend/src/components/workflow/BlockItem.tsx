import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Copy, ToggleLeft, ToggleRight } from 'lucide-react';
import { getBlockDefinition } from './blockDefinitions';
import { BLOCK_CATEGORIES, type WorkflowBlock } from './types';

interface BlockItemProps {
  block: WorkflowBlock;
  isSelected?: boolean;
  isOverlay?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onToggle?: () => void;
  readOnly?: boolean;
}

// Simple emoji mapping for blocks
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

export function BlockItem({
  block,
  isSelected,
  isOverlay,
  onClick,
  onDelete,
  onDuplicate,
  onToggle,
  readOnly,
}: BlockItemProps) {
  const definition = getBlockDefinition(block.type);
  const categoryInfo = definition ? BLOCK_CATEGORIES[definition.category] : null;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    disabled: readOnly || isOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (!definition) {
    return (
      <div className="block-item block-item-error">
        <span>Unknown block type: {block.type}</span>
      </div>
    );
  }

  // Get preview text from inputs
  const getPreviewText = () => {
    const previewInputs = definition.inputs.filter(i => i.required).slice(0, 2);
    const previews = previewInputs
      .map(input => {
        const value = block.inputs[input.key];
        if (!value) return null;
        return String(value);
      })
      .filter(Boolean);

    if (previews.length === 0) return 'Click to configure';
    return previews.join(' → ');
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block-item ${isSelected ? 'block-item-selected' : ''} ${
        !block.enabled ? 'block-item-disabled' : ''
      } ${isOverlay ? 'block-item-overlay' : ''}`}
      onClick={onClick}
    >
      {/* Drag handle */}
      {!readOnly && !isOverlay && (
        <div className="block-drag-handle" {...attributes} {...listeners}>
          <GripVertical size={16} />
        </div>
      )}

      {/* Block icon */}
      <div
        className="block-icon"
        style={{
          backgroundColor: `${definition.color}15`,
          color: definition.color,
          borderColor: `${definition.color}30`,
        }}
      >
        <span className="block-emoji">{getBlockEmoji(block.type)}</span>
      </div>

      {/* Block content */}
      <div className="block-content">
        <div className="block-header">
          <span className="block-name">{definition.name}</span>
          {categoryInfo && (
            <span
              className="block-category-badge"
              style={{ backgroundColor: `${categoryInfo.color}15`, color: categoryInfo.color }}
            >
              {categoryInfo.label}
            </span>
          )}
        </div>
        <div className="block-preview">
          {getPreviewText()}
        </div>
      </div>

      {/* Block actions */}
      {!readOnly && !isOverlay && (
        <div className="block-actions">
          <button
            className="block-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
            title={block.enabled ? 'Disable block' : 'Enable block'}
          >
            {block.enabled ? (
              <ToggleRight size={16} className="toggle-on" />
            ) : (
              <ToggleLeft size={16} className="toggle-off" />
            )}
          </button>
          <button
            className="block-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate?.();
            }}
            title="Duplicate block"
          >
            <Copy size={14} />
          </button>
          <button
            className="block-action-btn block-action-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            title="Delete block"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default BlockItem;
