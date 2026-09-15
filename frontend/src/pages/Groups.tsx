import { useState, useMemo } from 'react';
import { useEntityLabels } from '../contexts/LabelsContext';
import { ENTITIES } from '../config/entities';
import { Search, RefreshCw, Plus, Users, Loader2 } from 'lucide-react';
import { PlatformIcon } from '../components/ui/PlatformIcon';
import { GroupSlideOut } from '../components/GroupSlideOut';
import { DataTable, createColumnHelper } from '../components/ui/DataTable';
import { useGroups, useSyncGroups, useCreateGroup, useCreateMicrosoftGroup } from '../hooks/queries/useGroups';
import type { Group } from '../hooks/queries/useGroups';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import {
  GROUP_SCENARIOS_FLAG,
  useCreateGroupFromScenario,
  useGroupScenarioStatus,
  useGroupScenarios,
  type CreateFromScenarioResult,
} from '../hooks/queries/useGroupScenarios';
import { GroupScenarioPanel } from '../components/groups/GroupScenarioPanel';
import { GroupScenarioResult } from '../components/groups/GroupScenarioResult';
import { parseList, parseMembers, scopeView } from '../components/groups/groupScenarioView';
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
  const [newGroupPlatform, setNewGroupPlatform] = useState('google_workspace');
  const [newGroupEmail, setNewGroupEmail] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [scenarioKey, setScenarioKey] = useState('');
  const [aliasesText, setAliasesText] = useState('');
  const [membersText, setMembersText] = useState('');
  const [scenarioResult, setScenarioResult] = useState<CreateFromScenarioResult | null>(null);

  // Group scenarios (preview flag). Scenario content and the scope state come from the API.
  const { isEnabled } = useFeatureFlags();
  const scenariosOn = isEnabled(GROUP_SCENARIOS_FLAG);
  const scenariosQuery = useGroupScenarios();
  const scenarioStatusQuery = useGroupScenarioStatus();
  const createFromScenarioMutation = useCreateGroupFromScenario();
  const scenarioScope = scopeView(scenarioStatusQuery.data, scenarioStatusQuery.isLoading);

  // TanStack Query hooks
  const { data: groups = [], isLoading, error, refetch } = useGroups({
    platform: filterPlatform,
    search: searchTerm
  });

  const syncMutation = useSyncGroups();
  const createMutation = useCreateGroup();
  const createMsMutation = useCreateMicrosoftGroup();
  const creating = createMutation.isPending || createMsMutation.isPending || createFromScenarioMutation.isPending;
  const showScenarios = scenariosOn && newGroupPlatform === 'google_workspace';
  const useScenario = showScenarios && scenarioKey !== '';

  const handleSyncGroups = async () => {
    try {
      await syncMutation.mutateAsync(organizationId);
    } catch (err: any) {
      // Error handled by mutation
    }
  };

  const resetCreateForm = () => {
    setShowCreateModal(false);
    setNewGroupEmail('');
    setNewGroupName('');
    setNewGroupDescription('');
    setCreateError(null);
    setScenarioKey('');
    setAliasesText('');
    setMembersText('');
    setScenarioResult(null);
  };

  const handleCreateGroup = async () => {
    const isMicrosoft = newGroupPlatform === 'microsoft_365';
    if (!newGroupName || (!isMicrosoft && !newGroupEmail)) {
      setCreateError(isMicrosoft ? 'Please provide a group name' : 'Please provide both email and group name');
      return;
    }

    try {
      setCreateError(null);
      if (useScenario) {
        const { members, problems } = parseMembers(membersText);
        if (problems.length) {
          setCreateError(problems.join(' '));
          return;
        }
        // Stay open: the result (verified, mismatch or partial) must be read.
        const result = await createFromScenarioMutation.mutateAsync({
          scenarioKey,
          email: newGroupEmail,
          name: newGroupName,
          description: newGroupDescription,
          aliases: parseList(aliasesText),
          members,
        });
        setScenarioResult(result);
        return;
      }
      if (isMicrosoft) {
        // App-only Graph can create pure security groups; Unified/mail-enabled
        // need extra support, so we create a security group here.
        await createMsMutation.mutateAsync({
          displayName: newGroupName,
          description: newGroupDescription,
          securityEnabled: true,
          mailEnabled: false,
        });
      } else {
        await createMutation.mutateAsync({
          organizationId,
          email: newGroupEmail,
          name: newGroupName,
          description: newGroupDescription,
        });
      }
      resetCreateForm();
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
          <Search className="search-icon" size={16} />
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
          <option value="microsoft_365">Microsoft 365</option>
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
          onClick={() => { if (!creating) resetCreateForm(); }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '2rem',
              width: '90%',
              maxWidth: showScenarios ? '760px' : '500px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>{scenarioResult ? 'Group created from scenario' : 'Create New Group'}</h2>

            {scenarioResult ? (
              <>
                <GroupScenarioResult result={scenarioResult} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary" onClick={resetCreateForm}>Done</button>
                </div>
              </>
            ) : (
            <>

            {createError && (
              <div className="error-message" style={{ margin: '1rem 0', padding: '1rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626' }}>
                {createError}
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                Platform
              </label>
              <select
                value={newGroupPlatform}
                onChange={(e) => setNewGroupPlatform(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
                disabled={creating}
              >
                <option value="google_workspace">Google Workspace</option>
                <option value="microsoft_365">Microsoft 365 (security group)</option>
              </select>
            </div>

            {showScenarios && (
              <GroupScenarioPanel
                scenarios={scenariosQuery.data || []}
                loading={scenariosQuery.isLoading}
                loadError={scenariosQuery.error ? (scenariosQuery.error as Error).message : null}
                scope={scenarioScope}
                selectedKey={scenarioKey}
                onSelect={setScenarioKey}
                disabled={creating}
              />
            )}

            {newGroupPlatform !== 'microsoft_365' && (
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
                  disabled={creating}
                />
              </div>
            )}

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
                disabled={creating}
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
                disabled={creating}
              />
            </div>

            {useScenario && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    Aliases (optional)
                  </label>
                  <input
                    type="text"
                    value={aliasesText}
                    onChange={(e) => setAliasesText(e.target.value)}
                    placeholder="info@example.com, sales@example.com"
                    style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem' }}
                    disabled={creating}
                  />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    Members (optional, one per line: email and OWNER, MANAGER or MEMBER)
                  </label>
                  <textarea
                    value={membersText}
                    onChange={(e) => setMembersText(e.target.value)}
                    placeholder={'owner@example.com OWNER\nstaff@example.com MANAGER'}
                    rows={3}
                    style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', resize: 'vertical' }}
                    disabled={creating}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary"
                onClick={resetCreateForm}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateGroup}
                disabled={creating || !newGroupName || (newGroupPlatform !== 'microsoft_365' && !newGroupEmail)}
              >
                <Plus size={14} />
                {creating ? (useScenario ? 'Creating and verifying...' : 'Creating...') : useScenario ? 'Create and verify' : 'Create Group'}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* Group SlideOut */}
      {selectedGroupId && (
        <GroupSlideOut
          groupId={selectedGroupId}
          platform={groups.find(g => g.id === selectedGroupId)?.platform}
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
