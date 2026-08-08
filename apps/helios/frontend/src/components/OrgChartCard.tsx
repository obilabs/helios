import React, { useState } from 'react';
import { User, Mail, Building, Users } from 'lucide-react';
import './OrgChartCard.css';

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

interface OrgChartCardProps {
  data: OrgNode;
  selectedNode: string | null;
  searchTerm: string;
  onNodeClick: (nodeId: string) => void;
}

const OrgChartCard: React.FC<OrgChartCardProps> = ({
  data,
  selectedNode,
  searchTerm,
  onNodeClick
}) => {
  const [departmentFilter, setDepartmentFilter] = useState<string>('');

  // Flatten the tree to get all nodes
  const flattenTree = (node: OrgNode): OrgNode[] => {
    return [node, ...node.directReports.flatMap(child => flattenTree(child))];
  };

  const allNodes = flattenTree(data);

  // Get unique departments
  const departments = Array.from(new Set(allNodes.map(node => node.department).filter(Boolean)));

  // Filter nodes
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

  // Group by level
  const nodesByLevel = filteredNodes.reduce((acc, node) => {
    const level = node.level;
    if (!acc[level]) acc[level] = [];
    acc[level].push(node);
    return acc;
  }, {} as Record<number, OrgNode[]>);

  const renderCard = (node: OrgNode) => {
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
        className={`org-card ${isSelected ? 'selected' : ''} ${matchesSearch ? 'highlighted' : ''}`}
        onClick={() => onNodeClick(node.userId)}
      >
        <div className="card-header">
          <div className="card-avatar">
            {node.photoUrl ? (
              <img src={node.photoUrl} alt={node.name} />
            ) : (
              <div className="avatar-placeholder">
                <User size={24} />
              </div>
            )}
          </div>
          <div className="card-info">
            <h3 className="card-name">{node.name}</h3>
            <p className="card-title">{node.title || 'No title'}</p>
          </div>
        </div>

        <div className="card-details">
          <div className="card-detail">
            <Mail size={14} />
            <span>{node.email}</span>
          </div>
          {node.department && (
            <div className="card-detail">
              <Building size={14} />
              <span>{node.department}</span>
            </div>
          )}
          {node.directReports.length > 0 && (
            <div className="card-detail">
              <Users size={14} />
              <span>{node.directReports.length} direct reports</span>
            </div>
          )}
        </div>

        {node.level === 0 && (
          <div className="card-badge">CEO</div>
        )}
      </div>
    );
  };

  return (
    <div className="org-chart-card">
      <div className="card-filters">
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

      <div className="card-grid">
        {Object.entries(nodesByLevel).map(([level, nodes]) => (
          <div key={level} className="level-section">
            {parseInt(level) === 0 && nodes.length > 0 && (
              <h2 className="level-title">Leadership</h2>
            )}
            {parseInt(level) === 1 && nodes.length > 0 && (
              <h2 className="level-title">Senior Management</h2>
            )}
            {parseInt(level) === 2 && nodes.length > 0 && (
              <h2 className="level-title">Management</h2>
            )}
            {parseInt(level) > 2 && nodes.length > 0 && (
              <h2 className="level-title">Team Members</h2>
            )}
            <div className="cards-row">
              {nodes.map(node => renderCard(node))}
            </div>
          </div>
        ))}
      </div>

      {filteredNodes.length === 0 && (
        <div className="no-results">
          <User size={48} />
          <p>No employees match your filters</p>
        </div>
      )}
    </div>
  );
};

export default OrgChartCard;