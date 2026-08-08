import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Users,
  UsersRound,
  Mail,
  Calendar,
  HardDrive,
  Shield,
  Bell,
  GraduationCap,
  GitBranch,
  Wrench,
} from 'lucide-react';
import { getBlockCategories } from './blockDefinitions';
import { BLOCK_CATEGORIES, type BlockCategory, type BlockDefinition } from './types';

// Icon mapping
const CATEGORY_ICONS: Record<BlockCategory, React.ComponentType<{ size?: number; className?: string }>> = {
  user_management: Users,
  groups: UsersRound,
  communication: Mail,
  calendar: Calendar,
  drive: HardDrive,
  security: Shield,
  notifications: Bell,
  training: GraduationCap,
  conditions: GitBranch,
  utility: Wrench,
};

interface DraggableBlockProps {
  block: BlockDefinition;
}

function DraggableBlock({ block }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${block.type}`,
    data: {
      type: 'palette-block',
      blockDefinition: block,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      className="palette-block"
      style={style}
      {...listeners}
      {...attributes}
    >
      <div
        className="palette-block-icon"
        style={{ backgroundColor: `${block.color}15`, color: block.color }}
      >
        <span className="palette-block-icon-emoji">
          {getBlockEmoji(block.type)}
        </span>
      </div>
      <div className="palette-block-info">
        <span className="palette-block-name">{block.name}</span>
        <span className="palette-block-desc">{block.description}</span>
      </div>
    </div>
  );
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

export function BlockPalette() {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['user_management', 'communication']) // Default expanded
  );

  const categories = getBlockCategories();

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Filter blocks by search
  const filteredCategories = categories.map(cat => ({
    ...cat,
    blocks: cat.blocks.filter(
      block =>
        block.name.toLowerCase().includes(search.toLowerCase()) ||
        block.description.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.blocks.length > 0);

  return (
    <div className="block-palette">
      <div className="palette-header">
        <h4>Blocks</h4>
        <div className="palette-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search blocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="palette-categories">
        {filteredCategories.map(({ category, blocks }) => {
          const categoryInfo = BLOCK_CATEGORIES[category];
          const Icon = CATEGORY_ICONS[category];
          const isExpanded = expandedCategories.has(category) || search.length > 0;

          return (
            <div key={category} className="palette-category">
              <button
                className="palette-category-header"
                onClick={() => toggleCategory(category)}
              >
                <div className="palette-category-title">
                  <span style={{ color: categoryInfo.color, display: 'flex' }}>
                    <Icon size={14} />
                  </span>
                  <span>{categoryInfo.label}</span>
                  <span className="palette-category-count">{blocks.length}</span>
                </div>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {isExpanded && (
                <div className="palette-category-blocks">
                  {blocks.map(block => (
                    <DraggableBlock key={block.type} block={block} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="palette-hint">
        <p>Drag blocks to the canvas to build your workflow</p>
      </div>
    </div>
  );
}

export default BlockPalette;
