import { useState, useMemo } from 'react';
import { useEntityLabels } from '../contexts/LabelsContext';
import { ENTITIES } from '../config/entities';
import { Search, RefreshCw, Plus, Users, Loader2 } from 'lucide-react';
import { PlatformIcon } from '../components/ui/PlatformIcon';
import { GroupSlideOut } from '../components/GroupSlideOut';
import { DataTable, createColumnHelper } from '../components/ui/DataTable';
import { useGroups, useSyncGroups, useCreateGroup } from '../hooks/queries/useGroups';
import type { Group } from '../hooks/queries/useGroups';
import './Pages.css';

interface GroupsProps {
  organizationId: string;
  customLabel?: string;
  onSelectGroup?: (groupId: string) => void;
}

const columnHelper = createColumnHelper<Group>();

export function Groups({ organizationId, customLabel: _customLabel, onSelectGroup }: GroupsProps) {
  const labels = useEntityLabels(ENTITIES.ACCESS_GROUP);
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupEmail, setNewGroupEmail] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // TanStack Query hooks
  const { data: groups = [], isLoading, error, refetch } = useGroups({
    platform: filterPlatform,
    search: searchTerm
  });

  const syncMutation = useSyncGroups();
  const createMutation = useCreateGroup();

  const handleSyncGroups = async () => {
    try {
      await syncMutation.mutateAsync(organizationId);
    } catch (err: any) {
      // Error handled by mutation
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupEmail || !newGroupName) {
      setCreateError('Please provide both email and group name');
      return;
    }

    try {
      setCreateError(null);
      await createMutation.mutateAsync({
        email: newGroupEmail,
        name: newGroupName,
        description: newGroupDescription
      });
      setShowCreateModal(false);
      setNewGroupEmail('');
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create group');
    }
  };

  const handleRowClick = (group: Group) => {
    if (onSelectGroup) {
      onSelectGroup(group.id);
    } else {
      setSelectedGroupId(group.id);
    }
  };

  // Define columns using TanStack Table
  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'Group Name',
      cell: ({ row }) => (
        <div className="item-info">
          <Users className="item-icon" size={20} />
          <div>
            <div className="item-name">{row.original.name}</div>
            {row.original.description && (
              <div className="item-description">{row.original.description}</div>
            )}
          </div>
        </div>
      ),
      size: 300,
    }),
    columnHelper.accessor('memberCount', {
      header: 'Members',
      cell: ({ getValue }) => (
        <span className="member-count">{getValue()} members</span>
      ),
      size: 120,
    }),
    columnHelper.accessor('platform', {
      header: 'Platform',
      cell: ({ getValue }) => {
        const platform = getValue();
        return (
          <PlatformIcon
            platform={platform === 'google_workspace' ? 'google' : platform === 'microsoft_365' ? 'microsoft' : 'helios'}
            size={28}
          />
        );
      },
      size: 80,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      cell: ({ getValue }) => (
        <span className="email-text">{getValue()}</span>
      ),
      size: 250,
    }),
  ], []);

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="loading-spinner">
          <Loader2 className="spin" size={24} />
          Loading groups...
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{labels.plural}</h1>
          <p>Manage groups and distribution lists from connected platforms</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={14} /> Create Group
        </button>
      </div>

      {(error || syncMutation.error) && (
        <div className="error-message" style={{ margin: '1rem 0', padding: '1rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626' }}>
          {(error as Error)?.message || (syncMutation.error as Error)?.message}
        </div>
      )}

      <div className="page-controls">
        <div className="search-box">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            placeholder="Search groups..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
        >
          <option value="all">All Sources</option>
          <option value="google_workspace">Google Workspace</option>
          <option value="manual">Local Only</option>
        </select>

        <button
          className="btn-secondary"
          onClick={handleSyncGroups}
          disabled={syncMutation.isPending}
        >
          <RefreshCw size={14} className={syncMutation.isPending ? 'spinning' : ''} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync Groups'}
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <Users className="empty-icon" size={48} strokeWidth={1.5} />
          <h3>No groups found</h3>
          <p>Start by syncing groups from your connected platforms</p>
        </div>
      ) : (
        <DataTable
          data={groups}
          columns={columns}
          onRowClick={handleRowClick}
          enableSorting={true}
          enableFiltering={false}
          rowHeight={56}
          emptyMessage="No groups found"
        />
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '2rem',
              width: '90%',
              maxWidth: '500px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Create New Group</h2>

            {createError && (
              <div className="error-message" style={{ margin: '1rem 0', padding: '1rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626' }}>
                {createError}
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Group Email <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="email"
                value={newGroupEmail}
                onChange={(e) => setNewGroupEmail(e.target.value)}
                placeholder="group@example.com"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
                disabled={createMutation.isPending}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Group Name <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="My Team"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
                disabled={createMutation.isPending}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Description (Optional)
              </label>
              <textarea
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Group description..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
                disabled={createMutation.isPending}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewGroupEmail('');
                  setNewGroupName('');
                  setNewGroupDescription('');
                  setCreateError(null);
                }}
                disabled={createMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateGroup}
                disabled={createMutation.isPending || !newGroupEmail || !newGroupName}
              >
                <Plus size={14} />
                {createMutation.isPending ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group SlideOut */}
      {selectedGroupId && (
        <GroupSlideOut
          groupId={selectedGroupId}
          organizationId={organizationId}
          onClose={() => setSelectedGroupId(null)}
          onGroupUpdated={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
}
