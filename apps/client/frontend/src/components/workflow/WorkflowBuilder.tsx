import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Save, RotateCcw, Zap, AlertCircle, CheckCircle, Eye } from 'lucide-react';
import { BlockPalette } from './BlockPalette';
import { BlockCanvas } from './BlockCanvas';
import { BlockConfig } from './BlockConfig';
import { TriggerConfig } from './TriggerConfig';
import { BlockItem } from './BlockItem';
import type { WorkflowBlock, WorkflowTrigger, BlockDefinition } from './types';
import { getBlockDefinition } from './blockDefinitions';
import './WorkflowBuilder.css';

interface WorkflowBuilderProps {
  workflowType: 'onboarding' | 'offboarding';
  initialBlocks?: WorkflowBlock[];
  initialTrigger?: WorkflowTrigger;
  onSave: (blocks: WorkflowBlock[], trigger: WorkflowTrigger) => Promise<void>;
  onTest?: (blocks: WorkflowBlock[], trigger: WorkflowTrigger) => Promise<void>;
  readOnly?: boolean;
}

export function WorkflowBuilder({
  workflowType,
  initialBlocks = [],
  initialTrigger = { type: 'on_request_approved' },
  onSave,
  onTest,
  readOnly = false,
}: WorkflowBuilderProps) {
  const [blocks, setBlocks] = useState<WorkflowBlock[]>(initialBlocks);
  const [trigger, setTrigger] = useState<WorkflowTrigger>(initialTrigger);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDraggingNew, setIsDraggingNew] = useState(false);
  const [draggedBlockDef, setDraggedBlockDef] = useState<BlockDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSaveStatus, setLastSaveStatus] = useState<'saved' | 'error' | null>(null);

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

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  // Generate unique ID for new blocks
  const generateBlockId = () => `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    // Check if dragging from palette (new block)
    if (active.data.current?.type === 'palette-block') {
      setIsDraggingNew(true);
      setDraggedBlockDef(active.data.current.blockDefinition);
    }
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      setIsDraggingNew(false);
      setDraggedBlockDef(null);
      return;
    }

    // Adding new block from palette
    if (isDraggingNew && draggedBlockDef && over.id === 'canvas') {
      const newBlock: WorkflowBlock = {
        id: generateBlockId(),
        type: draggedBlockDef.type,
        inputs: {},
        enabled: true,
      };

      // Set default values from block definition
      draggedBlockDef.inputs.forEach(input => {
        if (input.defaultValue !== undefined) {
          newBlock.inputs[input.key] = input.defaultValue;
        }
      });

      setBlocks(prev => [...prev, newBlock]);
      setSelectedBlockId(newBlock.id);
      setHasChanges(true);
    }
    // Reordering existing blocks
    else if (!isDraggingNew && active.id !== over.id) {
      setBlocks(prev => {
        const oldIndex = prev.findIndex(b => b.id === active.id);
        const newIndex = prev.findIndex(b => b.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          setHasChanges(true);
          return arrayMove(prev, oldIndex, newIndex);
        }
        return prev;
      });
    }

    setActiveId(null);
    setIsDraggingNew(false);
    setDraggedBlockDef(null);
  };

  // Update block inputs
  const handleBlockUpdate = useCallback((blockId: string, updates: Partial<WorkflowBlock>) => {
    setBlocks(prev =>
      prev.map(b => (b.id === blockId ? { ...b, ...updates } : b))
    );
    setHasChanges(true);
  }, []);

  // Delete block
  const handleBlockDelete = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
    setHasChanges(true);
  }, [selectedBlockId]);

  // Duplicate block
  const handleBlockDuplicate = useCallback((blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (block) {
      const newBlock: WorkflowBlock = {
        ...block,
        id: generateBlockId(),
      };
      const index = blocks.findIndex(b => b.id === blockId);
      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      setBlocks(newBlocks);
      setSelectedBlockId(newBlock.id);
      setHasChanges(true);
    }
  }, [blocks]);

  // Toggle block enabled
  const handleBlockToggle = useCallback((blockId: string) => {
    setBlocks(prev =>
      prev.map(b => (b.id === blockId ? { ...b, enabled: !b.enabled } : b))
    );
    setHasChanges(true);
  }, []);

  // Handle trigger change
  const handleTriggerChange = useCallback((newTrigger: WorkflowTrigger) => {
    setTrigger(newTrigger);
    setHasChanges(true);
  }, []);

  // Save workflow
  const handleSave = async () => {
    setSaving(true);
    setLastSaveStatus(null);
    try {
      await onSave(blocks, trigger);
      setHasChanges(false);
      setLastSaveStatus('saved');
      setTimeout(() => setLastSaveStatus(null), 3000);
    } catch (error) {
      setLastSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Test workflow
  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    try {
      await onTest(blocks, trigger);
    } finally {
      setTesting(false);
    }
  };

  // Reset to initial
  const handleReset = () => {
    setBlocks(initialBlocks);
    setTrigger(initialTrigger);
    setSelectedBlockId(null);
    setHasChanges(false);
  };

  const activeBlockDef = activeId
    ? isDraggingNew
      ? draggedBlockDef
      : getBlockDefinition(blocks.find(b => b.id === activeId)?.type || '')
    : null;

  return (
    <div className="workflow-builder">
      {/* Header */}
      <div className="wb-header">
        <div className="wb-header-info">
          <h3>
            <Zap size={20} />
            {workflowType === 'onboarding' ? 'Onboarding' : 'Offboarding'} Workflow
          </h3>
          <p>
            Drag blocks from the palette to build your automation workflow
          </p>
        </div>
        <div className="wb-header-actions">
          {hasChanges && (
            <span className="wb-unsaved-badge">
              <AlertCircle size={14} />
              Unsaved changes
            </span>
          )}
          {lastSaveStatus === 'saved' && (
            <span className="wb-saved-badge">
              <CheckCircle size={14} />
              Saved
            </span>
          )}
          {lastSaveStatus === 'error' && (
            <span className="wb-error-badge">
              <AlertCircle size={14} />
              Save failed
            </span>
          )}
          {!readOnly && (
            <>
              <button
                className="btn-secondary"
                onClick={handleReset}
                disabled={!hasChanges || saving}
              >
                <RotateCcw size={16} />
                Reset
              </button>
              {onTest && (
                <button
                  className="btn-secondary"
                  onClick={handleTest}
                  disabled={testing || blocks.length === 0}
                >
                  <Eye size={16} />
                  {testing ? 'Testing...' : 'Test'}
                </button>
              )}
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Workflow'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Trigger Configuration */}
      <TriggerConfig
        trigger={trigger}
        workflowType={workflowType}
        onChange={handleTriggerChange}
        readOnly={readOnly}
      />

      {/* Main Builder Area */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="wb-main">
          {/* Block Palette */}
          {!readOnly && <BlockPalette />}

          {/* Canvas */}
          <SortableContext
            items={blocks.map(b => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <BlockCanvas
              blocks={blocks}
              selectedBlockId={selectedBlockId}
              onBlockSelect={setSelectedBlockId}
              onBlockDelete={handleBlockDelete}
              onBlockDuplicate={handleBlockDuplicate}
              onBlockToggle={handleBlockToggle}
              isDraggingNew={isDraggingNew}
              readOnly={readOnly}
            />
          </SortableContext>

          {/* Block Config Panel */}
          {selectedBlock && (
            <BlockConfig
              block={selectedBlock}
              onUpdate={(updates) => handleBlockUpdate(selectedBlock.id, updates)}
              onClose={() => setSelectedBlockId(null)}
              readOnly={readOnly}
            />
          )}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeBlockDef && (
            <BlockItem
              block={{
                id: 'drag-overlay',
                type: activeBlockDef.type,
                inputs: {},
                enabled: true,
              }}
              isOverlay
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default WorkflowBuilder;
