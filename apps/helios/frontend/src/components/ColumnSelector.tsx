import { useState, useEffect, useRef } from 'react';
import { X, Check, GripVertical, AlertCircle } from 'lucide-react';
import './ColumnSelector.css';

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  required?: boolean; // Cannot be hidden
}

interface ColumnSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnConfig[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
  storageKey?: string; // localStorage key for persistence
  maxColumns?: number; // Maximum number of visible columns (default: 8)
}

// Industry standard: most admin tools limit to 6-8 visible columns
const DEFAULT_MAX_COLUMNS = 8;

export function ColumnSelector({
  isOpen,
  onClose,
  columns,
  onColumnsChange,
  storageKey = 'helios_user_columns',
  maxColumns = DEFAULT_MAX_COLUMNS
}: ColumnSelectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [localColumns, setLocalColumns] = useState<ColumnConfig[]>(columns);

  // Load saved preferences on mount
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const savedVisibility = JSON.parse(saved) as Record<string, boolean>;
          const updatedColumns = columns.map(col => ({
            ...col,
            visible: savedVisibility[col.key] ?? col.visible
          }));
          setLocalColumns(updatedColumns);
          onColumnsChange(updatedColumns);
        } catch {
          // Invalid saved data, use defaults
        }
      }
    }
  }, [storageKey]);

  // Sync with parent columns prop
  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleToggleColumn = (key: string) => {
    const column = localColumns.find(c => c.key === key);
    if (!column || column.required) return;

    // Prevent adding more columns if at max limit
    if (!column.visible && visibleCount >= maxColumns) {
      return;
    }

    const updatedColumns = localColumns.map(col =>
      col.key === key ? { ...col, visible: !col.visible } : col
    );

    setLocalColumns(updatedColumns);
    onColumnsChange(updatedColumns);

    // Save to localStorage
    if (storageKey) {
      const visibility = updatedColumns.reduce((acc, col) => {
        acc[col.key] = col.visible;
        return acc;
      }, {} as Record<string, boolean>);
      localStorage.setItem(storageKey, JSON.stringify(visibility));
    }
  };

  const visibleCount = localColumns.filter(c => c.visible).length;
  const atMaxColumns = visibleCount >= maxColumns;

  const resetToDefaults = () => {
    // Reset to initial defaults (respecting max columns)
    const defaultVisibleKeys = ['firstName', 'lastName', 'email', 'department', 'role', 'platforms', 'status', 'lastLogin'];
    const defaultColumns: ColumnConfig[] = columns.map(col => ({
      ...col,
      visible: defaultVisibleKeys.includes(col.key) || col.required === true
    }));
    setLocalColumns(defaultColumns);
    onColumnsChange(defaultColumns);

    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="column-selector" ref={panelRef}>
      <div className="column-selector-header">
        <h3>Edit Columns</h3>
        <div className="column-selector-actions">
          <button className="btn-reset-columns" onClick={resetToDefaults}>
            Reset
          </button>
          <button className="btn-close-selector" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="column-selector-info">
        <span>{visibleCount} of {maxColumns} max columns</span>
      </div>

      {atMaxColumns && (
        <div className="column-selector-warning">
          <AlertCircle size={14} />
          <span>Maximum {maxColumns} columns. Hide one to add another.</span>
        </div>
      )}

      <div className="column-selector-list">
        {localColumns.map(column => {
          const isDisabled = column.required || (atMaxColumns && !column.visible);
          return (
            <label
              key={column.key}
              className={`column-item ${column.visible ? 'visible' : ''} ${column.required ? 'required' : ''} ${isDisabled && !column.visible ? 'disabled' : ''}`}
            >
              <div className="column-item-left">
                <GripVertical size={14} className="drag-handle" />
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={() => handleToggleColumn(column.key)}
                  disabled={isDisabled}
                />
                <span className="column-label">{column.label}</span>
              </div>
              {column.required && (
                <span className="required-badge">Required</span>
              )}
              {column.visible && !column.required && (
                <Check size={14} className="check-icon" />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
