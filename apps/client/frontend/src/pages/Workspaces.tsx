import { useState, useEffect } from 'react';
import { useEntityLabels } from '../contexts/LabelsContext';
import { ENTITIES } from '../config/entities';
import { Users, MessageSquare } from 'lucide-react';
import './Pages.css';
import { authFetch } from '../config/api';

interface Workspace {
  id: string;
  name: string;
  description: string;
  platform: string;
  memberCount?: number;
}

interface WorkspacesProps {
  organizationId: string;
}

export function Workspaces({ organizationId }: WorkspacesProps) {
  const labels = useEntityLabels(ENTITIES.WORKSPACE);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchWorkspaces();
  }, [organizationId]);

  const fetchWorkspaces = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(`/api/v1/organization/workspaces`);
      const data = await response.json();
      if (data.success) {
        setWorkspaces(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{labels.plural}</h1>
          <p>Collaboration spaces with chat, files, and tasks</p>
        </div>
      </div>

      <div className="page-content">
        {isLoading ? (
          <div className="loading-state">Loading {labels.plural.toLowerCase()}...</div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state">
            <MessageSquare size={48} />
            <h3>No {labels.plural} Yet</h3>
            <p>
              {labels.plural} are collaboration spaces like Google Chat Spaces.
            </p>
            <p>Enable Google Workspace integration in Settings to sync {labels.plural.toLowerCase()}.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{labels.singular} Name</th>
                  <th>Platform</th>
                  <th>Members</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map(workspace => (
                  <tr key={workspace.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={16} />
                        <strong>{workspace.name}</strong>
                      </div>
                      {workspace.description && (
                        <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '4px' }}>
                          {workspace.description}
                        </div>
                      )}
                    </td>
                    <td>{workspace.platform}</td>
                    <td>{workspace.memberCount || 0}</td>
                    <td>
                      <button className="btn-icon" title="View details">
                        <Users size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
