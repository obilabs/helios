/**
 * Timeline Editor Component
 *
 * Visual editor for creating and managing template timelines.
 * Allows configuring trigger-based actions for onboarding/offboarding.
 * Supports drag-and-drop reordering using @dnd-kit.
 */

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  PlayCircle,
  Calendar,
  GripVertical,
  AlertCircle,
} from 'lucide-react';
import ActionEditor, { type TimelineAction } from './ActionEditor';
import './TimelineEditor.css';

export type TriggerType = 'on_approval' | 'days_before_start' | 'on_start_date' | 'days_after_start';

export interface TimelineEntry {
  id: string;
  trigger: TriggerType;
  offset?: number;
  actions: TimelineAction[];
}

interface TimelineEditorProps {
  timeline: TimelineEntry[];
  onChange: (timeline: TimelineEntry[]) => void;
  requestType?: 'onboard' | 'offboard';
}

const TRIGGER_OPTIONS: { value: TriggerType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'on_approval',
    label: 'On Approval',
    icon: <PlayCircle size={16} />,
    description: 'Execute immediately when request is approved',
  },
  {
    value: 'days_before_start',
    label: 'Days Before Start',
    icon: <Clock size={16} />,
    description: 'Execute X days before the start/end date',
  },
  {
    value: 'on_start_date',
    label: 'On Start Date',
    icon: <Calendar size={16} />,
    description: 'Execute on the start/end date',
  },
  {
    value: 'days_after_start',
    label: 'Days After Start',
    icon: <Clock size={16} />,
    description: 'Execute X days after the start/end date',
  },
];

const generateId = () => `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Sortable Timeline Entry component
interface SortableEntryProps {
  entry: TimelineEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (updates: Partial<TimelineEntry>) => void;
  getTriggerLabel: (trigger: TriggerType, offset?: number) => string;
  requestType: 'onboard' | 'offboard';
}

const SortableEntry: React.FC<SortableEntryProps> = ({
  entry,
  isExpanded,
  onToggle,
  onRemove,
  onUpdate,
  getTriggerLabel,
  requestType,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="timeline-entry">
      <div className="entry-header" onClick={onToggle}>
        <div
          className="entry-drag"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </div>
        <div className="entry-trigger-badge">
          {TRIGGER_OPTIONS.find((t) => t.value === entry.trigger)?.icon}
          <span>{getTriggerLabel(entry.trigger, entry.offset)}</span>
        </div>
        <div className="entry-actions-count">
          {entry.actions.length} action{entry.actions.length !== 1 ? 's' : ''}
        </div>
        <div className="entry-controls">
          <button
            className="btn-icon btn-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remove entry"
          >
            <Trash2 size={16} />
          </button>
          {isExpanded ? (
            <ChevronUp size={18} />
          ) : (
            <ChevronDown size={18} />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="entry-content">
          <div className="entry-trigger-config">
            <div className="form-group">
              <label>Trigger Type</label>
              <select
                value={entry.trigger}
                onChange={(e) =>
                  onUpdate({
                    trigger: e.target.value as TriggerType,
                    offset: e.target.value === 'on_approval' || e.target.value === 'on_start_date' ? 0 : entry.offset,
                  })
                }
              >
                {TRIGGER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="form-hint">
                {TRIGGER_OPTIONS.find((t) => t.value === entry.trigger)?.description}
              </p>
            </div>

            {(entry.trigger === 'days_before_start' || entry.trigger === 'days_after_start') && (
              <div className="form-group offset-input">
                <label>
                  {entry.trigger === 'days_before_start' ? 'Days Before' : 'Days After'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={Math.abs(entry.offset || 0)}
                  onChange={(e) =>
                    onUpdate({
                      offset: entry.trigger === 'days_before_start'
                        ? -Math.abs(parseInt(e.target.value) || 0)
                        : Math.abs(parseInt(e.target.value) || 0),
                    })
                  }
                />
              </div>
            )}
          </div>

          <div className="entry-actions-section">
            <ActionEditor
              actions={entry.actions}
              onChange={(actions) => onUpdate({ actions })}
              requestType={requestType}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const TimelineEditor: React.FC<TimelineEditorProps> = ({
  timeline,
  onChange,
  requestType = 'onboard',
}) => {
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addEntry = () => {
    const newEntry: TimelineEntry = {
      id: generateId(),
      trigger: 'on_approval',
      offset: 0,
      actions: [],
    };
    onChange([...timeline, newEntry]);
    setExpandedEntries((prev) => ({ ...prev, [newEntry.id]: true }));
  };

  const removeEntry = (id: string) => {
    onChange(timeline.filter((entry) => entry.id !== id));
  };

  const updateEntry = (id: string, updates: Partial<TimelineEntry>) => {
    onChange(
      timeline.map((entry) =>
        entry.id === id ? { ...entry, ...updates } : entry
      )
    );
  };

  const toggleEntry = (id: string) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = timeline.findIndex((e) => e.id === active.id);
      const newIndex = timeline.findIndex((e) => e.id === over.id);
      onChange(arrayMove(timeline, oldIndex, newIndex));
    }
  };

  const getTriggerLabel = (trigger: TriggerType, offset?: number): string => {
    switch (trigger) {
      case 'on_approval':
        return 'On Approval';
      case 'days_before_start':
        return `${Math.abs(offset || 0)} days before ${requestType === 'offboard' ? 'end' : 'start'}`;
      case 'on_start_date':
        return `On ${requestType === 'offboard' ? 'End' : 'Start'} Date`;
      case 'days_after_start':
        return `${offset || 0} days after ${requestType === 'offboard' ? 'end' : 'start'}`;
      default:
        return trigger;
    }
  };

  // Sort for preview (but not for the actual list - that's user-controlled now)
  const sortedForPreview = [...timeline].sort((a, b) => {
    const orderMap: Record<TriggerType, number> = {
      on_approval: 0,
      days_before_start: 1,
      on_start_date: 2,
      days_after_start: 3,
    };
    const orderDiff = orderMap[a.trigger] - orderMap[b.trigger];
    if (orderDiff !== 0) return orderDiff;
    return (a.offset || 0) - (b.offset || 0);
  });

  return (
    <div className="timeline-editor">
      <div className="timeline-header">
        <div className="timeline-info">
          <h3>Timeline Actions</h3>
          <p className="timeline-description">
            Configure when actions should be executed during the {requestType === 'offboard' ? 'offboarding' : 'onboarding'} process.
            Drag to reorder entries.
          </p>
        </div>
        <button className="btn-add-entry" onClick={addEntry}>
          <Plus size={16} />
          Add Trigger Point
        </button>
      </div>

      {timeline.length === 0 ? (
        <div className="timeline-empty">
          <AlertCircle size={24} />
          <p>No timeline entries configured</p>
          <span>Add trigger points to define when actions should occur</span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={timeline.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="timeline-entries">
              {timeline.map((entry) => (
                <SortableEntry
                  key={entry.id}
                  entry={entry}
                  isExpanded={expandedEntries[entry.id] || false}
                  onToggle={() => toggleEntry(entry.id)}
                  onRemove={() => removeEntry(entry.id)}
                  onUpdate={(updates) => updateEntry(entry.id, updates)}
                  getTriggerLabel={getTriggerLabel}
                  requestType={requestType}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {timeline.length > 0 && (
        <div className="timeline-preview">
          <h4>Timeline Preview (chronological order)</h4>
          <div className="preview-track">
            {sortedForPreview.map((entry) => (
              <div key={entry.id} className="preview-point">
                <div className="preview-dot" />
                <div className="preview-label">
                  {getTriggerLabel(entry.trigger, entry.offset)}
                </div>
                <div className="preview-count">
                  {entry.actions.length} task{entry.actions.length !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineEditor;
