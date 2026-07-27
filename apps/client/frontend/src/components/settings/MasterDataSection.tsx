import { useState, useEffect } from 'react';
import { Building, MapPin, DollarSign, AlertTriangle, ChevronRight, ChevronDown, Plus, Edit2, Trash2, Users, RefreshCw, X } from 'lucide-react';
import { authFetch } from '../../config/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import './MasterDataSection.css';

interface MasterDataSectionProps {
  organizationId: string;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  parentDepartmentId: string | null;
  parentDepartmentName: string | null;
  orgUnitId: string | null;
  orgUnitPath: string | null;
  autoSyncToOu: boolean;
  isActive: boolean;
  userCount: number;
  createdAt: string;
  children?: Department[];
  // Flattened aliases for tree building
  parent_id?: string | null;
  user_count?: number;
}

interface Location {
  id: string;
  name: string;
  code: string | null;
  type: 'headquarters' | 'office' | 'remote' | 'region' | 'warehouse' | 'datacenter';
  description: string | null;
  parentId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string | null;
  isActive: boolean;
  userCount: number;
  createdAt: string;
  children?: Location[];
  // Flattened aliases for tree building
  parent_id?: string | null;
  user_count?: number;
}

interface CostCenter {
  id: string;
  code: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  budgetAmount: number | null;
  budgetCurrency: string;
  fiscalYear: number | null;
  isActive: boolean;
  userCount: number;
  createdAt: string;
  // Flattened aliases
  is_active?: boolean;
  user_count?: number;
}

interface DataQualityIssue {
  field: string;
  value: string;
  user_count: number;
  suggested_match?: string;
}

type MasterDataTab = 'departments' | 'locations' | 'costcenters' | 'quality';

// Form data types
interface DepartmentForm {
  name: string;
  description: string;
  parentDepartmentId: string;
  orgUnitPath: string;
  autoSyncToOu: boolean;
}

interface LocationForm {
  name: string;
  code: string;
  type: Location['type'];
  description: string;
  parentId: string;
  addressLine1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  timezone: string;
}

interface CostCenterForm {
  code: string;
  name: string;
  description: string;
  departmentId: string;
  isActive: boolean;
}

export function MasterDataSection({ organizationId }: MasterDataSectionProps) {
  const [activeTab, setActiveTab] = useState<MasterDataTab>('departments');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [flatDepartments, setFlatDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [flatLocations, setFlatLocations] = useState<Location[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [qualityIssues, setQualityIssues] = useState<DataQualityIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'department' | 'location' | 'costcenter' } | null>(null);

  // Form states
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>({
    name: '',
    description: '',
    parentDepartmentId: '',
    orgUnitPath: '',
    autoSyncToOu: false
  });

  const [locationForm, setLocationForm] = useState<LocationForm>({
    name: '',
    code: '',
    type: 'office',
    description: '',
    parentId: '',
    addressLine1: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: '',
    timezone: ''
  });

  const [costCenterForm, setCostCenterForm] = useState<CostCenterForm>({
    code: '',
    name: '',
    description: '',
    departmentId: '',
    isActive: true
  });

  useEffect(() => {
    fetchData();
  }, [activeTab, organizationId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      switch (activeTab) {
        case 'departments':
          await fetchDepartments();
          break;
        case 'locations':
          await fetchLocations();
          break;
        case 'costcenters':
          await fetchCostCenters();
          break;
        case 'quality':
          await fetchQualityIssues();
          break;
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    const response = await authFetch('/api/v1/organization/departments');
    const data = await response.json();
    if (data.success) {
      // Normalize data to handle both camelCase and snake_case from API
      const normalized: Department[] = data.data.map((d: any) => ({
        ...d,
        parent_id: d.parentDepartmentId || d.parent_id,
        user_count: d.userCount || d.user_count || 0
      }));
      setFlatDepartments(normalized);
      setDepartments(buildTree<Department>(normalized, 'parent_id'));
    }
  };

  const fetchLocations = async () => {
    const response = await authFetch('/api/v1/organization/locations');
    const data = await response.json();
    if (data.success) {
      // Normalize data
      const normalized: Location[] = data.data.map((l: any) => ({
        ...l,
        parent_id: l.parentId || l.parent_id,
        user_count: l.userCount || l.user_count || 0
      }));
      setFlatLocations(normalized);
      setLocations(buildTree<Location>(normalized, 'parent_id'));
    }
  };

  const fetchCostCenters = async () => {
    const response = await authFetch('/api/v1/organization/cost-centers');
    const data = await response.json();
    if (data.success) {
      // Normalize data
      const normalized = data.data.map((c: any) => ({
        ...c,
        is_active: c.isActive ?? c.is_active ?? true,
        user_count: c.userCount || c.user_count || 0
      }));
      setCostCenters(normalized);
    }
  };

  const fetchQualityIssues = async () => {
    const response = await authFetch('/api/v1/organization/data-quality/orphans');
    const data = await response.json();
    if (data.success) {
      setQualityIssues(data.data);
    }
  };

  // Build hierarchical tree from flat list
  const buildTree = <T extends { id: string; children?: T[] }>(
    items: T[],
    parentKey: keyof T
  ): T[] => {
    const itemMap = new Map<string, T>();
    const roots: T[] = [];

    // First pass: create map
    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Second pass: build tree
    items.forEach(item => {
      const node = itemMap.get(item.id)!;
      const parentId = (item as any)[parentKey] as string | null | undefined;
      if (parentId && itemMap.has(parentId)) {
        const parent = itemMap.get(parentId)!;
        parent.children = parent.children || [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const renderTreeNode = (
    item: Department | Location,
    depth: number = 0,
    type: 'department' | 'location'
  ) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);

    return (
      <div key={item.id}>
        <div
          className="tree-node"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          <button
            className="expand-btn"
            onClick={() => hasChildren && toggleExpand(item.id)}
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <span className="node-name">{item.name}</span>
          <span className="node-count">
            <Users size={14} />
            {item.user_count || 0}
          </span>
          <div className="node-actions">
            <button
              className="action-btn"
              onClick={() => openEditModal(item, type)}
              title="Edit"
            >
              <Edit2 size={14} />
            </button>
            <button
              className="action-btn danger"
              onClick={() => handleDelete(item.id, type)}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="tree-children">
            {item.children!.map(child =>
              renderTreeNode(child, depth + 1, type)
            )}
          </div>
        )}
      </div>
    );
  };

  const handleDelete = (id: string, type: 'department' | 'location' | 'costcenter') => {
    setItemToDelete({ id, type });
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    const endpoints: Record<string, string> = {
      department: 'departments',
      location: 'locations',
      costcenter: 'cost-centers'
    };

    try {
      const response = await authFetch(
        `/api/v1/organization/${endpoints[itemToDelete.type]}/${itemToDelete.id}`,
        {
          method: 'DELETE'
        }
      );
      const data = await response.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete item');
    }
    setItemToDelete(null);
  };

  // Reset forms and close modal
  const closeModal = () => {
    setShowAddModal(false);
    setEditingItem(null);
    setModalError(null);
    setDepartmentForm({
      name: '',
      description: '',
      parentDepartmentId: '',
      orgUnitPath: '',
      autoSyncToOu: false
    });
    setLocationForm({
      name: '',
      code: '',
      type: 'office',
      description: '',
      parentId: '',
      addressLine1: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: '',
      timezone: ''
    });
    setCostCenterForm({
      code: '',
      name: '',
      description: '',
      departmentId: '',
      isActive: true
    });
  };

  // Open edit modal with item data
  const openEditModal = (item: any, type: 'department' | 'location' | 'costcenter') => {
    setEditingItem({ ...item, type });
    setModalError(null);

    if (type === 'department') {
      setDepartmentForm({
        name: item.name || '',
        description: item.description || '',
        parentDepartmentId: item.parentDepartmentId || item.parent_id || '',
        orgUnitPath: item.orgUnitPath || '',
        autoSyncToOu: item.autoSyncToOu || false
      });
    } else if (type === 'location') {
      setLocationForm({
        name: item.name || '',
        code: item.code || '',
        type: item.type || 'office',
        description: item.description || '',
        parentId: item.parentId || item.parent_id || '',
        addressLine1: item.addressLine1 || '',
        city: item.city || '',
        stateProvince: item.stateProvince || '',
        postalCode: item.postalCode || '',
        country: item.country || '',
        timezone: item.timezone || ''
      });
    } else if (type === 'costcenter') {
      setCostCenterForm({
        code: item.code || '',
        name: item.name || '',
        description: item.description || '',
        departmentId: item.departmentId || '',
        isActive: item.isActive ?? item.is_active ?? true
      });
    }
  };

  // Handle Department form submit
  const handleDepartmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setModalError(null);

    const isEdit = !!editingItem;
    const url = isEdit
      ? `/api/v1/organization/departments/${editingItem.id}`
      : `/api/v1/organization/departments`;

    try {
      const response = await authFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: departmentForm.name.trim(),
          description: departmentForm.description.trim() || null,
          parentDepartmentId: departmentForm.parentDepartmentId || null,
          orgUnitPath: departmentForm.orgUnitPath.trim() || null,
          autoSyncToOu: departmentForm.autoSyncToOu
        })
      });

      const data = await response.json();
      if (data.success) {
        closeModal();
        fetchData();
      } else {
        setModalError(data.error || 'Failed to save department');
      }
    } catch (error: any) {
      setModalError(error.message || 'Failed to save department');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Location form submit
  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setModalError(null);

    const isEdit = !!editingItem;
    const url = isEdit
      ? `/api/v1/organization/locations/${editingItem.id}`
      : `/api/v1/organization/locations`;

    try {
      const response = await authFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: locationForm.name.trim(),
          code: locationForm.code.trim() || null,
          type: locationForm.type,
          description: locationForm.description.trim() || null,
          parentId: locationForm.parentId || null,
          addressLine1: locationForm.addressLine1.trim() || null,
          city: locationForm.city.trim() || null,
          stateProvince: locationForm.stateProvince.trim() || null,
          postalCode: locationForm.postalCode.trim() || null,
          country: locationForm.country.trim() || null,
          timezone: locationForm.timezone.trim() || null
        })
      });

      const data = await response.json();
      if (data.success) {
        closeModal();
        fetchData();
      } else {
        setModalError(data.error || 'Failed to save location');
      }
    } catch (error: any) {
      setModalError(error.message || 'Failed to save location');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Cost Center form submit
  const handleCostCenterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setModalError(null);

    const isEdit = !!editingItem;
    const url = isEdit
      ? `/api/v1/organization/cost-centers/${editingItem.id}`
      : `/api/v1/organization/cost-centers`;

    try {
      const response = await authFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: costCenterForm.code.trim(),
          name: costCenterForm.name.trim(),
          description: costCenterForm.description.trim() || null,
          departmentId: costCenterForm.departmentId || null,
          isActive: costCenterForm.isActive
        })
      });

      const data = await response.json();
      if (data.success) {
        closeModal();
        fetchData();
      } else {
        setModalError(data.error || 'Failed to save cost center');
      }
    } catch (error: any) {
      setModalError(error.message || 'Failed to save cost center');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Master Data</h2>
        <p>Manage organizational structure used for dynamic group rules and reporting</p>
      </div>

      <div className="masterdata-tabs">
        <button
          className={`masterdata-tab ${activeTab === 'departments' ? 'active' : ''}`}
          onClick={() => setActiveTab('departments')}
        >
          <Building size={16} />
          Departments
        </button>
        <button
          className={`masterdata-tab ${activeTab === 'locations' ? 'active' : ''}`}
          onClick={() => setActiveTab('locations')}
        >
          <MapPin size={16} />
          Locations
        </button>
        <button
          className={`masterdata-tab ${activeTab === 'costcenters' ? 'active' : ''}`}
          onClick={() => setActiveTab('costcenters')}
        >
          <DollarSign size={16} />
          Cost Centers
        </button>
        <button
          className={`masterdata-tab ${activeTab === 'quality' ? 'active' : ''}`}
          onClick={() => setActiveTab('quality')}
        >
          <AlertTriangle size={16} />
          Data Quality
          {qualityIssues.length > 0 && (
            <span className="badge">{qualityIssues.length}</span>
          )}
        </button>
      </div>

      <div className="masterdata-content">
        {isLoading ? (
          <div className="loading-state">
            <RefreshCw className="spinning" size={24} />
            <p>Loading...</p>
          </div>
        ) : (
          <>
            {activeTab === 'departments' && (
              <div className="masterdata-panel">
                <div className="panel-header">
                  <h3>Departments</h3>
                  <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                    <Plus size={14} />
                    Add Department
                  </button>
                </div>
                <div className="tree-view">
                  {departments.length === 0 ? (
                    <div className="empty-state">
                      <Building size={48} strokeWidth={1} />
                      <h4>No departments defined</h4>
                      <p>Add departments to organize your users and enable department-based dynamic groups.</p>
                      <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={14} />
                        Add First Department
                      </button>
                    </div>
                  ) : (
                    departments.map(dept => renderTreeNode(dept, 0, 'department'))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'locations' && (
              <div className="masterdata-panel">
                <div className="panel-header">
                  <h3>Locations</h3>
                  <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                    <Plus size={14} />
                    Add Location
                  </button>
                </div>
                <div className="tree-view">
                  {locations.length === 0 ? (
                    <div className="empty-state">
                      <MapPin size={48} strokeWidth={1} />
                      <h4>No locations defined</h4>
                      <p>Add locations (regions, offices, remote) to enable location-based dynamic groups.</p>
                      <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={14} />
                        Add First Location
                      </button>
                    </div>
                  ) : (
                    locations.map(loc => renderTreeNode(loc, 0, 'location'))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'costcenters' && (
              <div className="masterdata-panel">
                <div className="panel-header">
                  <h3>Cost Centers</h3>
                  <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                    <Plus size={14} />
                    Add Cost Center
                  </button>
                </div>
                <div className="list-view">
                  {costCenters.length === 0 ? (
                    <div className="empty-state">
                      <DollarSign size={48} strokeWidth={1} />
                      <h4>No cost centers defined</h4>
                      <p>Add cost centers for budget tracking and cost center-based dynamic groups.</p>
                      <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={14} />
                        Add First Cost Center
                      </button>
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Name</th>
                          <th>Users</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costCenters.map(cc => (
                          <tr key={cc.id}>
                            <td className="code-cell">{cc.code}</td>
                            <td>{cc.name}</td>
                            <td className="count-cell">
                              <Users size={14} />
                              {cc.user_count || 0}
                            </td>
                            <td>
                              <span className={`status-badge ${cc.is_active ? 'active' : 'inactive'}`}>
                                {cc.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <div className="table-actions">
                                <button
                                  className="action-btn"
                                  onClick={() => openEditModal(cc, 'costcenter')}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  className="action-btn danger"
                                  onClick={() => handleDelete(cc.id, 'costcenter')}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'quality' && (
              <div className="masterdata-panel">
                <div className="panel-header">
                  <h3>Data Quality</h3>
                  <button className="btn-secondary" onClick={fetchQualityIssues}>
                    <RefreshCw size={14} />
                    Scan for Issues
                  </button>
                </div>
                <div className="quality-content">
                  {qualityIssues.length === 0 ? (
                    <div className="empty-state success">
                      <AlertTriangle size={48} strokeWidth={1} />
                      <h4>No issues found</h4>
                      <p>All user data values match master data definitions. Great job!</p>
                    </div>
                  ) : (
                    <div className="issues-list">
                      <p className="issues-summary">
                        Found {qualityIssues.length} orphaned values that don't match master data.
                      </p>
                      {qualityIssues.map((issue, idx) => (
                        <div key={idx} className="issue-card">
                          <div className="issue-header">
                            <span className="issue-field">{issue.field}</span>
                            <span className="issue-value">"{issue.value}"</span>
                          </div>
                          <div className="issue-details">
                            <span className="user-count">{issue.user_count} users affected</span>
                            {issue.suggested_match && (
                              <span className="suggested-match">
                                Did you mean: <strong>{issue.suggested_match}</strong>?
                              </span>
                            )}
                          </div>
                          <div className="issue-actions">
                            <button className="btn-secondary btn-sm">
                              Map to Existing
                            </button>
                            <button className="btn-secondary btn-sm">
                              Create New
                            </button>
                            <button className="btn-secondary btn-sm">
                              Ignore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingItem) && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content masterdata-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3>
                {editingItem ? 'Edit' : 'Add'}{' '}
                {activeTab === 'departments' ? 'Department' : activeTab === 'locations' ? 'Location' : 'Cost Center'}
              </h3>
              <button className="modal-close-btn" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div className="modal-error">
                {modalError}
              </div>
            )}

            {activeTab === 'departments' && (
              <form onSubmit={handleDepartmentSubmit}>
                <div className="form-group">
                  <label htmlFor="dept-name">Name *</label>
                  <input
                    id="dept-name"
                    type="text"
                    className="form-input"
                    value={departmentForm.name}
                    onChange={e => setDepartmentForm({...departmentForm, name: e.target.value})}
                    placeholder="e.g., Engineering"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dept-description">Description</label>
                  <textarea
                    id="dept-description"
                    className="form-input"
                    value={departmentForm.description}
                    onChange={e => setDepartmentForm({...departmentForm, description: e.target.value})}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dept-parent">Parent Department</label>
                  <select
                    id="dept-parent"
                    className="form-input"
                    value={departmentForm.parentDepartmentId}
                    onChange={e => setDepartmentForm({...departmentForm, parentDepartmentId: e.target.value})}
                  >
                    <option value="">None (Top-level)</option>
                    {flatDepartments
                      .filter(d => d.id !== editingItem?.id)
                      .map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))
                    }
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="dept-ou">Google Org Unit Path</label>
                  <input
                    id="dept-ou"
                    type="text"
                    className="form-input"
                    value={departmentForm.orgUnitPath}
                    onChange={e => setDepartmentForm({...departmentForm, orgUnitPath: e.target.value})}
                    placeholder="e.g., /Engineering"
                  />
                  <span className="form-hint">Optional: Map to Google Workspace Organizational Unit</span>
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={departmentForm.autoSyncToOu}
                      onChange={e => setDepartmentForm({...departmentForm, autoSyncToOu: e.target.checked})}
                    />
                    <span>Auto-sync to Google OU</span>
                  </label>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeModal} disabled={isSaving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={isSaving}>
                    {isSaving ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'locations' && (
              <form onSubmit={handleLocationSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="loc-name">Name *</label>
                    <input
                      id="loc-name"
                      type="text"
                      className="form-input"
                      value={locationForm.name}
                      onChange={e => setLocationForm({...locationForm, name: e.target.value})}
                      placeholder="e.g., San Francisco HQ"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="loc-code">Code</label>
                    <input
                      id="loc-code"
                      type="text"
                      className="form-input"
                      value={locationForm.code}
                      onChange={e => setLocationForm({...locationForm, code: e.target.value})}
                      placeholder="e.g., SF-HQ"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="loc-type">Type *</label>
                    <select
                      id="loc-type"
                      className="form-input"
                      value={locationForm.type}
                      onChange={e => setLocationForm({...locationForm, type: e.target.value as Location['type']})}
                    >
                      <option value="headquarters">Headquarters</option>
                      <option value="office">Office</option>
                      <option value="remote">Remote</option>
                      <option value="region">Region</option>
                      <option value="warehouse">Warehouse</option>
                      <option value="datacenter">Datacenter</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="loc-parent">Parent Location</label>
                    <select
                      id="loc-parent"
                      className="form-input"
                      value={locationForm.parentId}
                      onChange={e => setLocationForm({...locationForm, parentId: e.target.value})}
                    >
                      <option value="">None (Top-level)</option>
                      {flatLocations
                        .filter(l => l.id !== editingItem?.id)
                        .map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="loc-description">Description</label>
                  <textarea
                    id="loc-description"
                    className="form-input"
                    value={locationForm.description}
                    onChange={e => setLocationForm({...locationForm, description: e.target.value})}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="loc-address">Address</label>
                  <input
                    id="loc-address"
                    type="text"
                    className="form-input"
                    value={locationForm.addressLine1}
                    onChange={e => setLocationForm({...locationForm, addressLine1: e.target.value})}
                    placeholder="Street address"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="loc-city">City</label>
                    <input
                      id="loc-city"
                      type="text"
                      className="form-input"
                      value={locationForm.city}
                      onChange={e => setLocationForm({...locationForm, city: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="loc-state">State/Province</label>
                    <input
                      id="loc-state"
                      type="text"
                      className="form-input"
                      value={locationForm.stateProvince}
                      onChange={e => setLocationForm({...locationForm, stateProvince: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="loc-postal">Postal Code</label>
                    <input
                      id="loc-postal"
                      type="text"
                      className="form-input"
                      value={locationForm.postalCode}
                      onChange={e => setLocationForm({...locationForm, postalCode: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="loc-country">Country</label>
                    <input
                      id="loc-country"
                      type="text"
                      className="form-input"
                      value={locationForm.country}
                      onChange={e => setLocationForm({...locationForm, country: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="loc-timezone">Timezone</label>
                  <input
                    id="loc-timezone"
                    type="text"
                    className="form-input"
                    value={locationForm.timezone}
                    onChange={e => setLocationForm({...locationForm, timezone: e.target.value})}
                    placeholder="e.g., America/New_York"
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeModal} disabled={isSaving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={isSaving}>
                    {isSaving ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'costcenters' && (
              <form onSubmit={handleCostCenterSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="cc-code">Code *</label>
                    <input
                      id="cc-code"
                      type="text"
                      className="form-input"
                      value={costCenterForm.code}
                      onChange={e => setCostCenterForm({...costCenterForm, code: e.target.value})}
                      placeholder="e.g., CC-1001"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="cc-name">Name *</label>
                    <input
                      id="cc-name"
                      type="text"
                      className="form-input"
                      value={costCenterForm.name}
                      onChange={e => setCostCenterForm({...costCenterForm, name: e.target.value})}
                      placeholder="e.g., Engineering Operations"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="cc-description">Description</label>
                  <textarea
                    id="cc-description"
                    className="form-input"
                    value={costCenterForm.description}
                    onChange={e => setCostCenterForm({...costCenterForm, description: e.target.value})}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="cc-department">Linked Department</label>
                  <select
                    id="cc-department"
                    className="form-input"
                    value={costCenterForm.departmentId}
                    onChange={e => setCostCenterForm({...costCenterForm, departmentId: e.target.value})}
                  >
                    <option value="">None</option>
                    {flatDepartments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={costCenterForm.isActive}
                      onChange={e => setCostCenterForm({...costCenterForm, isActive: e.target.checked})}
                    />
                    <span>Active</span>
                  </label>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeModal} disabled={isSaving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={isSaving}>
                    {isSaving ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={itemToDelete !== null}
        title="Delete Item"
        message="Are you sure you want to delete this item? Users assigned to it will need to be reassigned."
        variant="danger"
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}

export default MasterDataSection;
