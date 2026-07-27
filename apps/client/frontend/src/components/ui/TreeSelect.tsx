import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronRight, ChevronDown, X, Check, FolderTree } from 'lucide-react';
import './ui.css';

export interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  userCount?: number;
  children?: TreeNode[];
  [key: string]: any;
}

export interface TreeSelectProps {
  label?: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  data: TreeNode[];
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  showUserCount?: boolean;
  showSearch?: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  parentIdField?: string;
  nameField?: string;
  idField?: string;
  userCountField?: string;
  emptyMessage?: string;
}

/**
 * TreeSelect Component
 *
 * A hierarchical dropdown selector for tree-structured data like departments,
 * locations, or organizational units.
 *
 * @example
 * ```tsx
 * // Basic usage with departments
 * <TreeSelect
 *   label="Department"
 *   value={selectedDeptId}
 *   onChange={(id) => setSelectedDeptId(id as string)}
 *   data={departments}
 *   placeholder="Select department..."
 *   showUserCount
 * />
 *
 * // Multiple selection
 * <TreeSelect
 *   label="Locations"
 *   value={selectedLocationIds}
 *   onChange={(ids) => setSelectedLocationIds(ids as string[])}
 *   data={locations}
 *   multiple
 *   showSearch
 * />
 * ```
 */
export const TreeSelect: React.FC<TreeSelectProps> = ({
  label,
  value,
  onChange,
  data,
  multiple = false,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  showUserCount = false,
  showSearch = true,
  allowClear = true,
  disabled = false,
  parentIdField = 'parentId',
  nameField = 'name',
  idField = 'id',
  userCountField = 'userCount',
  emptyMessage = 'No items available'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Build tree structure from flat data
  const tree = useMemo(() => {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // First pass: create nodes
    data.forEach(item => {
      // Extract known fields first, then spread remaining properties
      const { [idField]: itemId, [nameField]: itemName, [parentIdField]: itemParentId, [userCountField]: itemUserCount, ...rest } = item;
      const node: TreeNode = {
        ...rest,
        id: itemId,
        name: itemName,
        parentId: itemParentId,
        userCount: itemUserCount,
        children: []
      };
      nodeMap.set(node.id, node);
    });

    // Second pass: build hierarchy
    nodeMap.forEach(node => {
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children = parent.children || [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort children by name
    const sortChildren = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach(node => {
        if (node.children?.length) {
          sortChildren(node.children);
        }
      });
    };
    sortChildren(roots);

    return roots;
  }, [data, idField, nameField, parentIdField, userCountField]);

  // Filter tree based on search term
  const filteredTree = useMemo(() => {
    if (!searchTerm.trim()) return tree;

    const term = searchTerm.toLowerCase();
    const matchingIds = new Set<string>();
    const parentIds = new Set<string>();

    // Find all matching nodes and their ancestors
    const findMatches = (node: TreeNode, ancestors: string[] = []) => {
      const matches = node.name.toLowerCase().includes(term);

      if (matches) {
        matchingIds.add(node.id);
        ancestors.forEach(id => parentIds.add(id));
      }

      node.children?.forEach(child => {
        findMatches(child, [...ancestors, node.id]);
      });
    };

    tree.forEach(root => findMatches(root));

    // Filter tree to only include matching nodes and their ancestors
    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes
        .filter(node => matchingIds.has(node.id) || parentIds.has(node.id))
        .map(node => ({
          ...node,
          children: node.children ? filterNodes(node.children) : []
        }));
    };

    // Auto-expand matching parent nodes when searching
    if (searchTerm) {
      setExpandedNodes(new Set([...expandedNodes, ...parentIds]));
    }

    return filterNodes(tree);
  }, [tree, searchTerm]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when opening
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Toggle expanded state for a node
  const toggleExpanded = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Handle node selection
  const handleSelect = (nodeId: string) => {
    if (multiple) {
      const currentValue = Array.isArray(value) ? value : [];
      const newValue = currentValue.includes(nodeId)
        ? currentValue.filter(id => id !== nodeId)
        : [...currentValue, nodeId];
      onChange(newValue);
    } else {
      onChange(nodeId);
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  // Check if a node is selected
  const isSelected = (nodeId: string): boolean => {
    if (multiple && Array.isArray(value)) {
      return value.includes(nodeId);
    }
    return value === nodeId;
  };

  // Get display text for selected value(s)
  const getDisplayText = (): string => {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return '';
    }

    const selectedIds = Array.isArray(value) ? value : [value];
    const selectedNames = selectedIds
      .map(id => data.find(item => item[idField] === id)?.[nameField])
      .filter(Boolean);

    if (multiple) {
      return selectedNames.length > 0
        ? `${selectedNames.length} selected`
        : '';
    }
    return selectedNames[0] || '';
  };

  // Clear selection
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(multiple ? [] : '');
  };

  // Render a tree node
  const renderNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const selected = isSelected(node.id);

    return (
      <div key={node.id} className="helios-tree-node">
        <div
          className={`helios-tree-node-content ${selected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => handleSelect(node.id)}
        >
          <span
            className={`helios-tree-expand ${hasChildren ? 'has-children' : ''}`}
            onClick={(e) => hasChildren && toggleExpanded(node.id, e)}
          >
            {hasChildren && (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            )}
          </span>

          <span className="helios-tree-node-name">
            {node.name}
          </span>

          {showUserCount && node.userCount !== undefined && (
            <span className="helios-tree-node-count">
              {node.userCount}
            </span>
          )}

          {selected && (
            <Check size={14} className="helios-tree-check" />
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="helios-tree-children">
            {node.children!.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const displayText = getDisplayText();
  const hasValue = displayText !== '';

  return (
    <div className={`helios-tree-select ${disabled ? 'disabled' : ''}`} ref={dropdownRef}>
      {label && (
        <label className="helios-tree-select-label">
          {label}
        </label>
      )}

      <div
        className={`helios-tree-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <FolderTree size={16} className="helios-tree-select-icon" />
        <span className={`helios-tree-select-value ${!hasValue ? 'placeholder' : ''}`}>
          {hasValue ? displayText : placeholder}
        </span>

        {hasValue && allowClear && !disabled && (
          <button
            className="helios-tree-select-clear"
            onClick={handleClear}
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        )}

        <ChevronDown
          size={16}
          className={`helios-tree-select-arrow ${isOpen ? 'open' : ''}`}
        />
      </div>

      {isOpen && (
        <div className="helios-tree-select-dropdown">
          {showSearch && (
            <div className="helios-tree-select-search">
              <Search size={14} className="helios-tree-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <button
                  className="helios-tree-search-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchTerm('');
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          <div className="helios-tree-select-list">
            {filteredTree.length === 0 ? (
              <div className="helios-tree-select-empty">
                {searchTerm ? `No results for "${searchTerm}"` : emptyMessage}
              </div>
            ) : (
              filteredTree.map(node => renderNode(node))
            )}
          </div>
        </div>
      )}

      {/* Selected items chips for multiple selection */}
      {multiple && Array.isArray(value) && value.length > 0 && (
        <div className="helios-tree-select-chips">
          {value.map(id => {
            const item = data.find(d => d[idField] === id);
            if (!item) return null;
            return (
              <div key={id} className="helios-tree-chip">
                <span>{item[nameField]}</span>
                <button
                  className="helios-tree-chip-remove"
                  onClick={() => handleSelect(id)}
                  aria-label={`Remove ${item[nameField]}`}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TreeSelect;
