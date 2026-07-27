import { useState, useEffect } from 'react';
import { googleWorkspaceService } from '../services/google-workspace.service';
import { Building2, MapPin, User, FolderTree, Plus, Pencil, Trash2, Check, AlertTriangle, FileEdit, Loader, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';
import { useEntityLabels } from '../contexts/LabelsContext';
import { ENTITIES } from '../config/entities';
import './Pages.css';

interface OrgUnit {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
  userCount: number;
  childCount: number;
  platform: string;
  description: string;
  syncStatus?: 'synced' | 'modified' | 'manual' | 'conflict';
  lastSynced?: string;
  location?: {
    name?: string;
    city?: string;
    country?: string;
  };
}

interface OrgUnitsProps {
  organizationId: string;
  customLabel?: string; // Allow custom label like "Departments"
}

export function OrgUnits({ organizationId, customLabel }: OrgUnitsProps) {
  // Get dynamic labels from context (allows customization like "Departments" instead of "Org Units")
  const policyContainerLabels = useEntityLabels(ENTITIES.POLICY_CONTAINER);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  // Use custom label prop, or labels from context, or fallback
  const label = customLabel || policyContainerLabels.plural;

  useEffect(() => {
    fetchOrgUnits();
  }, [organizationId]);

  const fetchOrgUnits = async () => {
    try {
      setIsLoading(true);
      setSyncError(null);

      const result = await googleWorkspaceService.getOrgUnits(organizationId);

      if (result.success && result.data?.orgUnits) {
        const formattedOrgUnits = result.data.orgUnits.map((unit: any) => ({
          id: unit.orgUnitId || unit.id,
          name: unit.name,
          path: unit.orgUnitPath || unit.path,
          parentPath: unit.parentOrgUnitPath || unit.parentPath || '/',
          userCount: unit.userCount || 0,
          childCount: unit.childCount || 0,
          platform: 'google_workspace',
          description: unit.description || '',
          syncStatus: 'synced' as const,
          lastSynced: unit.lastSynced || new Date().toISOString()
        }));
        setOrgUnits(formattedOrgUnits);
        setLastSyncTime(new Date().toISOString());

        // Expand root units by default
        const rootUnits = formattedOrgUnits.filter((u: OrgUnit) => !u.parentPath || u.parentPath === '/');
        if (rootUnits.length > 0) {
          setExpandedUnits(new Set(rootUnits.map((u: OrgUnit) => u.id)));
        }
      } else {
        setOrgUnits([]);
        if (result.error) {
          setSyncError(result.error);
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch org units:', error);
      setSyncError('Failed to load organizational units');
      setOrgUnits([]);
    } finally {
      setIsLoading(false);
    }
  };

  const syncOrgUnits = async () => {
    try {
      setIsSyncing(true);
      setSyncError(null);

      const result = await googleWorkspaceService.syncOrgUnits(organizationId);

      if (result.success) {
        await fetchOrgUnits();
      } else {
        setSyncError(result.error || 'Failed to sync organizational units');
      }
    } catch (error: any) {
      console.error('Sync failed:', error);
      setSyncError('Failed to sync with Google Workspace');
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleExpand = (unitId: string) => {
    const newExpanded = new Set(expandedUnits);
    if (newExpanded.has(unitId)) {
      newExpanded.delete(unitId);
    } else {
      newExpanded.add(unitId);
    }
    setExpandedUnits(newExpanded);
  };

  const renderOrgUnit = (unit: OrgUnit, level: number = 0) => {
    const hasChildren = orgUnits.some(u => u.parentPath === unit.path);
    const isExpanded = expandedUnits.has(unit.id);
    const children = orgUnits.filter(u => u.parentPath === unit.path);

    const getSyncStatusBadge = () => {
      switch (unit.syncStatus) {
        case 'synced':
          return <span className="sync-badge synced" title="Synced with Google Workspace"><Check size={12} /> Synced</span>;
        case 'modified':
          return <span className="sync-badge modified" title="Modified locally"><Pencil size={12} /> Modified</span>;
        case 'conflict':
          return <span className="sync-badge conflict" title="Sync conflict - needs resolution"><AlertTriangle size={12} /> Conflict</span>;
        case 'manual':
        default:
          return <span className="sync-badge manual" title="Created manually"><FileEdit size={12} /> Manual</span>;
      }
    };

    return (
      <div key={unit.id} className="org-unit-item">
        <div className="org-unit-row" style={{ paddingLeft: `${level * 32 + 16}px` }}>
          <div className="org-unit-info">
            {hasChildren && (
              <button
                className="expand-button"
                onClick={() => toggleExpand(unit.id)}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            )}
            {!hasChildren && <span className="no-expand"></span>}
            <div className="unit-icon"><Building2 size={20} /></div>
            <div>
              <div className="unit-name">{unit.name}</div>
              <div className="unit-path">{unit.path}</div>
              {unit.location?.name && (
                <div className="unit-location"><MapPin size={12} /> {unit.location.name}</div>
              )}
            </div>
          </div>
          <div className="org-unit-stats">
            {getSyncStatusBadge()}
            <span className="stat-item">
              <span className="stat-icon"><User size={14} /></span>
              {unit.userCount || 0} users
            </span>
            {hasChildren && (
              <span className="stat-item">
                <span className="stat-icon"><FolderTree size={14} /></span>
                {children.length} sub-units
              </span>
            )}
          </div>
          <div className="org-unit-actions">
            <button className="btn-icon" title="Add sub-unit"><Plus size={16} /></button>
            <button className="btn-icon" title="Edit"><Pencil size={16} /></button>
            <button className="btn-icon danger" title="Delete"><Trash2 size={16} /></button>
          </div>
        </div>
        {isExpanded && children.map(child => renderOrgUnit(child, level + 1))}
      </div>
    );
  };

  const rootUnits = orgUnits.filter(u => !u.parentPath || u.parentPath === '/' || u.path === '/');

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{label}</h1>
          <p>Manage organizational structure and hierarchy</p>
        </div>
        <button className="btn-primary">
          <Plus size={16} /> Create {customLabel || 'Unit'}
        </button>
      </div>

      <div className="org-units-tree">
        <div className="tree-header">
          <div className="sync-info">
            {lastSyncTime && (
              <span className="last-sync">
                Last synced: {new Date(lastSyncTime).toLocaleString()}
              </span>
            )}
            {syncError && (
              <span className="sync-error"><AlertTriangle size={14} /> {syncError}</span>
            )}
          </div>
          <div className="tree-controls">
            <button className="btn-secondary" onClick={() => setExpandedUnits(new Set(orgUnits.map(u => u.id)))}>
              Expand All
            </button>
            <button className="btn-secondary" onClick={() => setExpandedUnits(new Set())}>
              Collapse All
            </button>
            <button
              className="btn-secondary"
              onClick={syncOrgUnits}
              disabled={isSyncing}
            >
              {isSyncing ? <><Loader size={14} className="spin" /> Syncing...</> : <><RefreshCw size={14} /> Sync from Google</>}
            </button>
          </div>
        </div>

        <div className="tree-content">
          {isLoading ? (
            <div className="empty-state">
              <span className="empty-icon"><Loader size={32} className="spin" /></span>
              <h3>Loading {label.toLowerCase()}...</h3>
            </div>
          ) : rootUnits.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon"><Building2 size={32} /></span>
              <h3>No {label.toLowerCase()} found</h3>
              <p>Click "Sync from Google" to import your organizational structure</p>
              <button className="btn-primary" onClick={syncOrgUnits} disabled={isSyncing}>
                {isSyncing ? <><Loader size={14} className="spin" /> Syncing...</> : <><RefreshCw size={14} /> Sync from Google</>}
              </button>
            </div>
          ) : (
            rootUnits.map(unit => renderOrgUnit(unit))
          )}
        </div>
      </div>
    </div>
  );
}