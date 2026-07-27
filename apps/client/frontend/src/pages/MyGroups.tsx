import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Loader2,
  Mail,
  AlertCircle,
  ExternalLink,
  Shield,
  Globe,
  Search,
} from 'lucide-react';
import { profileService, type UserGroup } from '../services/profile.service';
import './MyGroups.css';

interface MyGroupsProps {
  organizationId: string;
  onViewGroup?: (groupId: string) => void;
}

// Platform icons and colors
const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  google_workspace: { label: 'Google', color: '#4285f4' },
  microsoft_365: { label: 'Microsoft', color: '#00a4ef' },
  manual: { label: 'Manual', color: '#8b5cf6' },
};

export function MyGroups({ organizationId: _organizationId, onViewGroup }: MyGroupsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileService.getMyGroups();
      setGroups(data);
    } catch (err) {
      setError('An error occurred while loading groups');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleGroupClick = (groupId: string) => {
    if (onViewGroup) {
      onViewGroup(groupId);
    }
  };

  // Filter groups based on search query
  const filteredGroups = groups.filter(
    (group) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (group.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (group.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const renderGroupCard = (group: UserGroup) => {
    const platformConfig = PLATFORM_CONFIG[group.platform] || PLATFORM_CONFIG.manual;

    return (
      <div
        key={group.id}
        className="group-card"
        onClick={() => handleGroupClick(group.id)}
      >
        <div className="group-avatar">
          <Users size={24} />
        </div>
        <div className="group-info">
          <div className="group-header-row">
            <h3 className="group-name">{group.name}</h3>
            {group.memberType === 'owner' && (
              <span className="owner-badge">
                <Shield size={12} />
                Owner
              </span>
            )}
          </div>
          {group.description && (
            <p className="group-description">{group.description}</p>
          )}
          <div className="group-meta">
            <span className="group-member-count">
              <Users size={12} />
              {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
            </span>
            <span
              className="group-platform"
              style={{ backgroundColor: `${platformConfig.color}20`, color: platformConfig.color }}
            >
              {platformConfig.label}
            </span>
            {group.groupType === 'dynamic' && (
              <span className="group-type dynamic">Dynamic</span>
            )}
          </div>
        </div>
        <div className="group-actions">
          {group.email && (
            <a
              href={`mailto:${group.email}`}
              className="group-action-btn"
              onClick={(e) => e.stopPropagation()}
              title={`Email ${group.name}`}
            >
              <Mail size={16} />
            </a>
          )}
          {group.externalUrl && (
            <a
              href={group.externalUrl}
              className="group-action-btn"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open in external platform"
            >
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="my-groups-page">
        <div className="page-header">
          <h1>My Groups</h1>
          <p className="page-subtitle">Groups you are a member of</p>
        </div>
        <div className="loading-state">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading groups...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-groups-page">
        <div className="page-header">
          <h1>My Groups</h1>
          <p className="page-subtitle">Groups you are a member of</p>
        </div>
        <div className="error-state">
          <AlertCircle size={24} />
          <span>{error}</span>
          <button onClick={loadGroups} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasGroups = groups.length > 0;

  return (
    <div className="my-groups-page">
      <div className="page-header">
        <div className="header-content">
          <h1>My Groups</h1>
          <p className="page-subtitle">Groups you are a member of</p>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{groups.length}</span>
            <span className="stat-label">Total Groups</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">
              {groups.filter((g) => g.memberType === 'owner').length}
            </span>
            <span className="stat-label">Owner</span>
          </div>
        </div>
      </div>

      {hasGroups && (
        <div className="search-container">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search your groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      )}

      {!hasGroups ? (
        <div className="empty-groups-state">
          <Globe size={48} />
          <h3>No groups yet</h3>
          <p>
            You are not a member of any groups. When you are added to groups,
            they will appear here.
          </p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="empty-search-state">
          <Search size={32} />
          <h3>No groups found</h3>
          <p>
            No groups match &quot;{searchQuery}&quot;. Try a different search term.
          </p>
        </div>
      ) : (
        <div className="groups-list">
          {filteredGroups.map(renderGroupCard)}
        </div>
      )}
    </div>
  );
}
