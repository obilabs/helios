import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Download, Grid3x3, List, Network, Loader, AlertCircle, ChevronsDownUp, ChevronsUpDown, ChevronDown, ArrowDownUp, ArrowLeftRight } from 'lucide-react';
import OrgChartTree from '../components/OrgChartTree';
import OrgChartList from '../components/OrgChartList';
import OrgChartCard from '../components/OrgChartCard';
import { authFetch } from '../config/api';
import './OrgChart.css';

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

interface OrgChartData {
  root: OrgNode | null;
  orphans: OrgNode[];
  stats: {
    totalUsers: number;
    maxDepth: number;
    avgSpan: number;
  };
  isEmpty?: boolean;
  message?: string;
}

type ViewMode = 'tree' | 'list' | 'card';
type TreeOrientation = 'horizontal' | 'vertical';

const OrgChart: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<OrgChartData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [treeOrientation, setTreeOrientation] = useState<TreeOrientation>('vertical');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrgChart();
  }, []);

  const fetchOrgChart = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch('/api/v1/organization/org-chart');

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch organization chart');
        } else {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned invalid response format. Please ensure the database migration for manager relationships has been run.');
      }

      const result = await response.json();
      if (result.success && result.data) {
        setData(result.data);

        // Auto-expand first two levels
        const nodesToExpand = new Set<string>();
        const expandLevel = (node: OrgNode, level: number) => {
          if (level < 2) {
            nodesToExpand.add(node.userId);
            node.directReports.forEach(child => expandLevel(child, level + 1));
          }
        };
        if (result.data.root) {
          expandLevel(result.data.root, 0);
        }
        setExpandedNodes(nodesToExpand);
      } else {
        throw new Error(result.error || 'Failed to load data');
      }
    } catch (err) {
      let errorMessage = 'An error occurred while loading the organization chart';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      console.error('Error fetching org chart:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      // Import html2canvas dynamically
      const html2canvas = (await import('html2canvas')).default;

      const element = document.getElementById('org-chart-content');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });

      // Convert to PDF using browser print
      const imgData = canvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Organization Chart</title>
              <style>
                @page { size: landscape; margin: 0; }
                body { margin: 0; }
                img { width: 100%; height: auto; }
              </style>
            </head>
            <body>
              <img src="${imgData}" />
              <script>
                window.onload = function() {
                  window.print();
                  window.onafterprint = function() {
                    window.close();
                  };
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      alert('Failed to export chart. Please try again.');
    }
  };

  const handleExportPNG = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;

      const element = document.getElementById('org-chart-content');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });

      // Download as PNG
      const link = document.createElement('a');
      link.download = `org-chart-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (err) {
      console.error('Error exporting to PNG:', err);
      alert('Failed to export chart. Please try again.');
    }
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(nodeId);
  };

  const handleNodeToggle = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Collect all node IDs from the tree
  const collectAllNodeIds = useCallback((node: OrgNode): string[] => {
    const ids = [node.userId];
    node.directReports.forEach(child => {
      ids.push(...collectAllNodeIds(child));
    });
    return ids;
  }, []);

  // Collect nodes at a specific level
  const collectNodesAtLevel = useCallback((node: OrgNode, targetLevel: number, currentLevel: number = 0): string[] => {
    if (currentLevel === targetLevel) {
      return [node.userId];
    }
    const ids: string[] = [];
    node.directReports.forEach(child => {
      ids.push(...collectNodesAtLevel(child, targetLevel, currentLevel + 1));
    });
    return ids;
  }, []);

  // Get current max expanded level
  const getCurrentMaxExpandedLevel = useCallback((): number => {
    if (!data?.root) return 0;
    let maxLevel = 0;
    const checkLevel = (node: OrgNode, level: number) => {
      if (expandedNodes.has(node.userId)) {
        maxLevel = Math.max(maxLevel, level);
        node.directReports.forEach(child => checkLevel(child, level + 1));
      }
    };
    checkLevel(data.root, 0);
    return maxLevel;
  }, [data, expandedNodes]);

  const handleExpandAll = () => {
    if (!data?.root) return;
    const allIds = collectAllNodeIds(data.root);
    setExpandedNodes(new Set(allIds));
  };

  const handleCollapseAll = () => {
    // Keep only root expanded
    if (data?.root) {
      setExpandedNodes(new Set([data.root.userId]));
    } else {
      setExpandedNodes(new Set());
    }
  };

  const handleExpandNextLevel = () => {
    if (!data?.root) return;
    const currentMax = getCurrentMaxExpandedLevel();
    const nextLevelNodes = collectNodesAtLevel(data.root, currentMax + 1);
    setExpandedNodes(prev => {
      const next = new Set(prev);
      nextLevelNodes.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleOrientation = () => {
    setTreeOrientation(prev => prev === 'horizontal' ? 'vertical' : 'horizontal');
  };

  const handleNodeOpen = (node: OrgNode) => {
    // Navigate to user settings page with the user's email
    // The UserSettings page can look up the user by email
    navigate(`/admin/user-settings?email=${encodeURIComponent(node.email)}`);
  };

  const filterNodes = (node: OrgNode): OrgNode | null => {
    if (!searchTerm) return node;

    const matches = node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   node.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   (node.title && node.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
                   (node.department && node.department.toLowerCase().includes(searchTerm.toLowerCase()));

    const filteredChildren = node.directReports
      .map(child => filterNodes(child))
      .filter(child => child !== null) as OrgNode[];

    if (matches || filteredChildren.length > 0) {
      return {
        ...node,
        directReports: filteredChildren
      };
    }

    return null;
  };

  if (isLoading) {
    return (
      <div className="org-chart-loading">
        <Loader className="spinner" size={32} />
        <p>Loading organization chart...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="org-chart-error">
        <AlertCircle size={48} />
        <h2>Unable to Load Organization Chart</h2>
        <p>{error}</p>
        <button onClick={fetchOrgChart} className="retry-button">
          Try Again
        </button>
      </div>
    );
  }

  // Handle empty state - no data or isEmpty flag
  if (!data || data.isEmpty || !data.root) {
    return (
      <div className="org-chart-empty">
        <Network size={64} strokeWidth={1} />
        <h2>Organization Chart</h2>
        <p className="empty-message">
          {data?.message || 'No organization structure found yet.'}
        </p>
        <div className="empty-hints">
          <p>To build your org chart:</p>
          <ul>
            <li>Sync users from Google Workspace in Settings</li>
            <li>Add users manually and set their reporting managers</li>
          </ul>
        </div>
        <button onClick={fetchOrgChart} className="retry-button">
          Refresh
        </button>
      </div>
    );
  }

  const filteredData = searchTerm ? {
    ...data,
    root: filterNodes(data.root) || data.root
  } : data;

  return (
    <div className="org-chart-container">
      <div className="org-chart-header">
        <div className="org-chart-title">
          <Network size={24} />
          <h1>Organization Chart</h1>
          <div className="org-stats">
            <span>{data.stats.totalUsers} employees</span>
            <span>{data.stats.maxDepth} levels</span>
            <span>{Math.round(data.stats.avgSpan)} avg. reports</span>
          </div>
        </div>

        <div className="org-chart-controls">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="view-modes">
            <button
              className={`view-mode-btn ${viewMode === 'tree' ? 'active' : ''}`}
              onClick={() => setViewMode('tree')}
              title="Tree View"
            >
              <Network size={16} />
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={16} />
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'card' ? 'active' : ''}`}
              onClick={() => setViewMode('card')}
              title="Card View"
            >
              <Grid3x3 size={16} />
            </button>
          </div>

          {/* Tree-specific controls */}
          {viewMode === 'tree' && (
            <div className="tree-controls">
              <button
                className="tree-control-btn"
                onClick={toggleOrientation}
                title={treeOrientation === 'horizontal' ? 'Switch to Vertical' : 'Switch to Horizontal'}
              >
                {treeOrientation === 'horizontal' ? <ArrowDownUp size={16} /> : <ArrowLeftRight size={16} />}
              </button>
              <button
                className="tree-control-btn"
                onClick={handleExpandNextLevel}
                title="Expand Next Level"
              >
                <ChevronDown size={16} />
              </button>
              <button
                className="tree-control-btn"
                onClick={handleExpandAll}
                title="Expand All"
              >
                <ChevronsUpDown size={16} />
              </button>
              <button
                className="tree-control-btn"
                onClick={handleCollapseAll}
                title="Collapse All"
              >
                <ChevronsDownUp size={16} />
              </button>
            </div>
          )}

          <div className="export-controls">
            <button
              className="export-btn"
              onClick={handleExportPDF}
              title="Export as PDF"
            >
              <Download size={16} />
              PDF
            </button>
            <button
              className="export-btn"
              onClick={handleExportPNG}
              title="Export as Image"
            >
              <Download size={16} />
              PNG
            </button>
          </div>
        </div>
      </div>

      <div id="org-chart-content" className="org-chart-content">
        {viewMode === 'tree' && filteredData.root && (
          <OrgChartTree
            data={filteredData.root}
            expandedNodes={expandedNodes}
            selectedNode={selectedNode}
            searchTerm={searchTerm}
            orientation={treeOrientation}
            onNodeClick={handleNodeClick}
            onNodeToggle={handleNodeToggle}
            onNodeOpen={handleNodeOpen}
          />
        )}

        {viewMode === 'list' && filteredData.root && (
          <OrgChartList
            data={filteredData.root}
            expandedNodes={expandedNodes}
            selectedNode={selectedNode}
            searchTerm={searchTerm}
            onNodeClick={handleNodeClick}
            onNodeToggle={handleNodeToggle}
          />
        )}

        {viewMode === 'card' && filteredData.root && (
          <OrgChartCard
            data={filteredData.root}
            selectedNode={selectedNode}
            searchTerm={searchTerm}
            onNodeClick={handleNodeClick}
          />
        )}

        {data.orphans.length > 0 && (
          <div className="orphans-section">
            <h3>
              <AlertCircle size={16} />
              Users Without Valid Manager ({data.orphans.length})
            </h3>
            <div className="orphans-list">
              {data.orphans.map(orphan => (
                <div key={orphan.userId} className="orphan-item">
                  <Users size={16} />
                  <span>{orphan.name}</span>
                  <span className="orphan-email">{orphan.email}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrgChart;