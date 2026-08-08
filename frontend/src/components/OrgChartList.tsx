import React, { useState } from 'react';
import { ChevronRight, ChevronDown, User } from 'lucide-react';
import './OrgChartList.css';

interface OrgNode {
  userId: string;
  name: string;
  email: string;
  title: string;
  department: string;
  photoUrl?: string;
  managerId?: string;
  level: number;
  directReports: OrgNode[];
  totalReports: number;
}

interface OrgChartListProps {
  data: OrgNode;
  expandedNodes: Set<string>;
  selectedNode: string | null;
  searchTerm: string;
  onNodeClick: (nodeId: string) => void;
  onNodeToggle: (nodeId: string) => void;
}

// Get level title based on hierarchy depth
const getLevelTitle = (level: number): string => {
  switch (level) {
    case 0: return 'Leadership';
    case 1: return 'Senior Management';
    case 2: return 'Management';
    default: return 'Team Members';
  }
};

const OrgChartList: React.FC<OrgChartListProps> = ({
  data,
  selectedNode,
  searchTerm,
  onNodeClick
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [departmentFilter, setDepartmentFilter] = useState<string>('');

  // Flatten the tree to get all nodes
  const flattenTree = (node: OrgNode): OrgNode[] => {
    return [node, ...node.directReports.flatMap(child => flattenTree(child))];
  };

  const allNodes = flattenTree(data);

  // Get unique departments
  const departments = Array.from(new Set(allNodes.map(node => node.department).filter(Boolean))).sort();

  // Filter nodes based on search and department
  const filteredNodes = allNodes.filter(node => {
    const matchesSearch = !searchTerm || (
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.title && node.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (node.department && node.department.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const matchesDepartment = !departmentFilter || node.department === departmentFilter;

    return matchesSearch && matchesDepartment;
  });

  // Group by level, consolidating level 3+ into "Team Members"
  const groupedByLevel = filteredNodes.reduce((acc, node) => {
    const groupLevel = Math.min(node.level, 3); // Consolidate 3+ into same group
    if (!acc[groupLevel]) acc[groupLevel] = [];
    acc[groupLevel].push(node);
    return acc;
  }, {} as Record<number, OrgNode[]>);

  // Sort each group by name
  Object.values(groupedByLevel).forEach(group => {
    group.sort((a, b) => a.name.localeCompare(b.name));
  });

  const toggleSection = (level: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const renderUserRow = (node: OrgNode) => {
    const isSelected = selectedNode === node.userId;
    const matchesSearch = searchTerm && (
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.title && node.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (node.department && node.department.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
      <div
        key={node.userId}
        className={`org-list-row ${isSelected ? 'selected' : ''} ${matchesSearch ? 'highlighted' : ''}`}
        onClick={() => onNodeClick(node.userId)}
      >
        <div className="row-avatar">
          {node.photoUrl ? (
            <img src={node.photoUrl} alt={node.name} />
          ) : (
            <div className="avatar-placeholder">
              <User size={16} />
            </div>
          )}
        </div>

        <div className="row-main">
          <div className="row-name">{node.name}</div>
          <div className="row-title">{node.title || 'No title'}</div>
        </div>

        <div className="row-email">{node.email}</div>

        {node.department && (
          <div className="row-department">{node.department}</div>
        )}

        {node.directReports.length > 0 && (
          <div className="row-reports">
            {node.directReports.length} direct report{node.directReports.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    );
  };

  const sortedLevels = Object.keys(groupedByLevel)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="org-chart-list">
      <div className="list-header">
        <select
          className="department-filter"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map(dept => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        <div className="results-count">
          {filteredNodes.length} {filteredNodes.length === 1 ? 'employee' : 'employees'}
        </div>
      </div>

      <div className="list-content">
        {sortedLevels.map(level => {
          const nodes = groupedByLevel[level];
          const isCollapsed = collapsedSections.has(level);
          const title = getLevelTitle(level);

          return (
            <div key={level} className="level-group">
              <div
                className="level-header"
                onClick={() => toggleSection(level)}
              >
                <button className="collapse-btn">
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
                <span className="level-title">{title}</span>
                <span className="level-count">{nodes.length}</span>
              </div>

              {!isCollapsed && (
                <div className="level-rows">
                  {nodes.map(node => renderUserRow(node))}
                </div>
              )}
            </div>
          );
        })}

        {filteredNodes.length === 0 && (
          <div className="no-results">
            <User size={32} />
            <p>No employees match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrgChartList;