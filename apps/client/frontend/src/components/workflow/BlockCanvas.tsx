import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Play, ArrowDown } from 'lucide-react';
import { BlockItem } from './BlockItem';
import type { WorkflowBlock } from './types';

interface BlockCanvasProps {
  blocks: WorkflowBlock[];
  selectedBlockId: string | null;
  onBlockSelect: (id: string | null) => void;
  onBlockDelete: (id: string) => void;
  onBlockDuplicate: (id: string) => void;
  onBlockToggle: (id: string) => void;
  isDraggingNew: boolean;
  readOnly?: boolean;
}

export function BlockCanvas({
  blocks,
  selectedBlockId,
  onBlockSelect,
  onBlockDelete,
  onBlockDuplicate,
  onBlockToggle,
  isDraggingNew,
  readOnly,
}: BlockCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas',
  });

  return (
    <div
      ref={setNodeRef}
      className={`block-canvas ${isOver && isDraggingNew ? 'canvas-drop-active' : ''}`}
    >
      {/* Start indicator */}
      <div className="canvas-start">
        <div className="canvas-start-badge">
          <Play size={12} />
          <span>Workflow Start</span>
        </div>
      </div>

      {/* Blocks */}
      <SortableContext
        items={blocks.map(b => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="canvas-blocks">
          {blocks.map((block, index) => (
            <div key={block.id} className="canvas-block-wrapper">
              {/* Connection line */}
              {index > 0 && (
                <div className="canvas-connector">
                  <ArrowDown size={16} />
                </div>
              )}

              <BlockItem
                block={block}
                isSelected={selectedBlockId === block.id}
                onClick={() => onBlockSelect(block.id)}
                onDelete={() => onBlockDelete(block.id)}
                onDuplicate={() => onBlockDuplicate(block.id)}
                onToggle={() => onBlockToggle(block.id)}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      </SortableContext>

      {/* Drop zone indicator */}
      {isDraggingNew && blocks.length > 0 && (
        <div className="canvas-drop-zone">
          <ArrowDown size={16} />
          <span>Drop here to add block</span>
        </div>
      )}

      {/* Empty state drop zone */}
      {blocks.length === 0 && (
        <div className={`canvas-empty ${isDraggingNew && isOver ? 'canvas-empty-active' : ''}`}>
          <div className="canvas-empty-icon">
            <ArrowDown size={32} />
          </div>
          <p>Drop your first block here</p>
        </div>
      )}

      {/* End indicator */}
      {blocks.length > 0 && (
        <div className="canvas-end">
          <div className="canvas-connector">
            <ArrowDown size={16} />
          </div>
          <div className="canvas-end-badge">
            <span>Workflow Complete</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default BlockCanvas;
