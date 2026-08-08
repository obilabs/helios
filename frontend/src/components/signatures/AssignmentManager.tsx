/**
 * AssignmentManager Component
 *
 * Manages signature template assignments to users, groups, departments, etc.
 * Allows creating, editing, and deleting assignments with priority-based resolution.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Building2,
  UserCircle,
  Globe,
  FolderTree,
  Sparkles,
  Plus,
  Trash2,
  AlertCircle,
  Search,
  Loader2,
  Check,
  X
} from 'lucide-react';
import { authFetch } from '../../config/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import './AssignmentManager.css';

type AssignmentType = 'user' | 'group' | 'dynamic_group' | 'department' | 'ou' | 'organization';

interface AssignmentTarget {
  id: string;
  name: string;
  count?: number;
}

interface Assignment {
  id: string;
  templateId: string;
  assignmentType: AssignmentType;
  targetId: string | null;
  targetValue: string | null;
  priority: number;
  isActive: boolean;
  templateName?: string;
  targetName?: string;
  affectedUsers?: number;
}

interface CreateAssignmentData {
  template_id: string;
  assignment_type: AssignmentType;
  target_id?: string;
  target_value?: string;
  priority?: number;
  is_active?: boolean;
}

interface AssignmentManagerProps {
  templateId: string;
  templateName?: string;
  onClose?: () => void;
  onAssignmentChange?: () => void;
}

const ASSIGNMENT_TYPE_CONFIG: {
  type: AssignmentType;
  label: string;
  description: string;
  icon: React.ReactNode;
  priority: number;
}[] = [
  {
    type: 'user',
    label: 'Individual Users',
    description: 'Assign to specific users (highest priority)',
    icon: <UserCircle size={18} />,
    priority: 10,
  },
  {
    type: 'dynamic_group',
    label: 'Dynamic Groups',
    description: 'Assign based on rule-based group membership',
    icon: <Sparkles size={18} />,
    priority: 20,
  },
  {
    type: 'group',
    label: 'Static Groups',
    description: 'Assign to static access groups',
    icon: <Users size={18} />,
    priority: 30,
  },
  {
    type: 'department',
    label: 'Departments',
    description: 'Assign to all users in a department',
    icon: <Building2 size={18} />,
    priority: 40,
  },
  {
    type: 'ou',
    label: 'Organizational Units',
    description: 'Assign based on Google Workspace OU',
    icon: <FolderTree size={18} />,
    priority: 50,
  },
  {
    type: 'organization',
    label: 'Organization Default',
    description: 'Apply to all users (lowest priority)',
    icon: <Globe size={18} />,
    priority: 100,
  },
];

const AssignmentManager: React.FC<AssignmentManagerProps> = ({
  templateId,
  templateName,
  onClose,
  onAssignmentChange,
}) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New assignment form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedType, setSelectedType] = useState<AssignmentType | null>(null);
  const [availableTargets, setAvailableTargets] = useState<AssignmentTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<AssignmentTarget | null>(null);
  const [targetSearch, setTargetSearch] = useState('');

  // Preview state
  const [previewUsers, setPreviewUsers] = useState<{userId: string; email: string; firstName: string; lastName: string; department?: string}[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/signatures/v2/assignments?template_id=${templateId}&include_details=true`);
      const data = await response.json();
      if (data.success) {
        setAssignments(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch assignments');
      }
    } catch (err) {
      console.error('Error fetching assignments:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const fetchTargets = async (type: AssignmentType) => {
    setLoadingTargets(true);
    setAvailableTargets([]);
    try {
      const response = await authFetch(`/api/signatures/v2/assignments/targets/${type}`);
      const data = await response.json();
      if (data.success) {
        setAvailableTargets(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching targets:', err);
    } finally {
      setLoadingTargets(false);
    }
  };

  const handleTypeSelect = (type: AssignmentType) => {
    setSelectedType(type);
    setSelectedTarget(null);
    setTargetSearch('');

    if (type !== 'organization') {
      fetchTargets(type);
    } else {
      // Organization type doesn't need target selection
      setAvailableTargets([]);
    }
  };

  const handlePreview = async () => {
    if (!selectedType) return;

    setLoadingPreview(true);
    setShowPreview(true);
    try {
      const response = await authFetch('/api/signatures/v2/assignments/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignment_type: selectedType,
          target_id: selectedTarget?.id,
          target_value: selectedType === 'ou' ? selectedTarget?.id : undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setPreviewUsers(data.data?.users || []);
      }
    } catch (err) {
      console.error('Error previewing assignment:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCreateAssignment = async () => {
    if (!selectedType) return;
    if (selectedType !== 'organization' && !selectedTarget) {
      setError('Please select a target');
      return;
    }

    setSaving(true);
    setError(null);

    const typeConfig = ASSIGNMENT_TYPE_CONFIG.find(t => t.type === selectedType);
    const assignmentData: CreateAssignmentData = {
      template_id: templateId,
      assignment_type: selectedType,
      priority: typeConfig?.priority || 100,
      is_active: true,
    };

    if (selectedTarget) {
      if (selectedType === 'ou') {
        assignmentData.target_value = selectedTarget.id;
      } else {
        assignmentData.target_id = selectedTarget.id;
      }
    }

    try {
      const response = await authFetch('/api/signatures/v2/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assignmentData),
      });
      const data = await response.json();
      if (data.success) {
        setShowNewForm(false);
        setSelectedType(null);
        setSelectedTarget(null);
        setShowPreview(false);
        fetchAssignments();
        onAssignmentChange?.();
      } else {
        setError(data.error || 'Failed to create assignment');
      }
    } catch (err) {
      console.error('Error creating assignment:', err);
      setError('Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = (assignmentId: string) => {
    setAssignmentToDelete(assignmentId);
  };

  const confirmDeleteAssignment = async () => {
    if (!assignmentToDelete) return;

    try {
      const response = await authFetch(`/api/signatures/v2/assignments/${assignmentToDelete}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        fetchAssignments();
        onAssignmentChange?.();
      } else {
        setError(data.error || 'Failed to delete assignment');
      }
    } catch (err) {
      console.error('Error deleting assignment:', err);
      setError('Failed to delete assignment');
    }
    setAssignmentToDelete(null);
  };

  const handleToggleActive = async (assignment: Assignment) => {
    try {
      const response = await authFetch(`/api/signatures/v2/assignments/${assignment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !assignment.isActive }),
      });
      const data = await response.json();
      if (data.success) {
        fetchAssignments();
        onAssignmentChange?.();
      }
    } catch (err) {
      console.error('Error toggling assignment:', err);
    }
  };

  const getTypeIcon = (type: AssignmentType) => {
    const config = ASSIGNMENT_TYPE_CONFIG.find(t => t.type === type);
    return config?.icon || <Users size={18} />;
  };

  const getTypeLabel = (type: AssignmentType) => {
    const config = ASSIGNMENT_TYPE_CONFIG.find(t => t.type === type);
    return config?.label || type;
  };

  const filteredTargets = availableTargets.filter(target =>
    target.name.toLowerCase().includes(targetSearch.toLowerCase())
  );

  return (
    <div className="assignment-manager">
      <div className="assignment-manager-header">
        <div>
          <h3>Template Assignments</h3>
          {templateName && <p className="template-name">Template: {templateName}</p>}
        </div>
        <div className="header-actions">
          {!showNewForm && (
            <button className="btn-primary" onClick={() => setShowNewForm(true)}>
              <Plus size={16} />
              Add Assignment
            </button>
          )}
          {onClose && (
            <button className="btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* New Assignment Form */}
      {showNewForm && (
        <div className="new-assignment-form">
          <h4>Create New Assignment</h4>

          {/* Step 1: Select Type */}
          <div className="form-section">
            <label>1. Select assignment type</label>
            <div className="type-selector">
              {ASSIGNMENT_TYPE_CONFIG.map(config => (
                <button
                  key={config.type}
                  className={`type-option ${selectedType === config.type ? 'selected' : ''}`}
                  onClick={() => handleTypeSelect(config.type)}
                >
                  {config.icon}
                  <div className="type-info">
                    <span className="type-label">{config.label}</span>
                    <span className="type-desc">{config.description}</span>
                  </div>
                  {selectedType === config.type && <Check size={16} className="check-icon" />}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Select Target */}
          {selectedType && selectedType !== 'organization' && (
            <div className="form-section">
              <label>2. Select target {getTypeLabel(selectedType).toLowerCase()}</label>
              <div className="target-selector">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder={`Search ${getTypeLabel(selectedType).toLowerCase()}...`}
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                  />
                </div>
                {loadingTargets ? (
                  <div className="loading-state">
                    <Loader2 size={20} className="spinner" />
                    <span>Loading options...</span>
                  </div>
                ) : filteredTargets.length === 0 ? (
                  <div className="empty-state">
                    No {getTypeLabel(selectedType).toLowerCase()} found
                  </div>
                ) : (
                  <div className="target-list">
                    {filteredTargets.map(target => (
                      <button
                        key={target.id}
                        className={`target-option ${selectedTarget?.id === target.id ? 'selected' : ''}`}
                        onClick={() => setSelectedTarget(target)}
                      >
                        {getTypeIcon(selectedType)}
                        <span className="target-name">{target.name}</span>
                        {target.count !== undefined && (
                          <span className="target-count">{target.count} users</span>
                        )}
                        {selectedTarget?.id === target.id && <Check size={16} className="check-icon" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Organization type message */}
          {selectedType === 'organization' && (
            <div className="form-section">
              <div className="org-default-note">
                <Globe size={24} />
                <p>
                  This will apply the template to <strong>all users</strong> in your organization
                  as a fallback when no higher-priority assignment matches.
                </p>
              </div>
            </div>
          )}

          {/* Preview and Actions */}
          {(selectedType === 'organization' || selectedTarget) && (
            <div className="form-section">
              <div className="preview-toggle">
                <button
                  className="btn-secondary"
                  onClick={handlePreview}
                  disabled={loadingPreview}
                >
                  {loadingPreview ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      Loading preview...
                    </>
                  ) : showPreview ? (
                    'Refresh Preview'
                  ) : (
                    'Preview Affected Users'
                  )}
                </button>
              </div>

              {showPreview && (
                <div className="preview-panel">
                  <div className="preview-header">
                    <h5>Affected Users ({previewUsers.length})</h5>
                  </div>
                  {previewUsers.length === 0 ? (
                    <div className="empty-state">No users will be affected by this assignment</div>
                  ) : (
                    <div className="preview-list">
                      {previewUsers.slice(0, 10).map(user => (
                        <div key={user.userId} className="preview-user">
                          <span className="user-name">{user.firstName} {user.lastName}</span>
                          <span className="user-email">{user.email}</span>
                          {user.department && <span className="user-dept">{user.department}</span>}
                        </div>
                      ))}
                      {previewUsers.length > 10 && (
                        <div className="preview-more">
                          +{previewUsers.length - 10} more users
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="form-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowNewForm(false);
                    setSelectedType(null);
                    setSelectedTarget(null);
                    setShowPreview(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleCreateAssignment}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      Creating...
                    </>
                  ) : (
                    'Create Assignment'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Existing Assignments */}
      <div className="assignments-list">
        <h4>Current Assignments</h4>
        {loading ? (
          <div className="loading-state">
            <Loader2 size={20} className="spinner" />
            <span>Loading assignments...</span>
          </div>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            <Users size={32} />
            <p>No assignments yet</p>
            <span>Add assignments to apply this template to users</span>
          </div>
        ) : (
          <div className="assignment-items">
            {assignments.map(assignment => (
              <div
                key={assignment.id}
                className={`assignment-item ${!assignment.isActive ? 'inactive' : ''}`}
              >
                <div className="assignment-icon">
                  {getTypeIcon(assignment.assignmentType)}
                </div>
                <div className="assignment-info">
                  <div className="assignment-type">
                    {getTypeLabel(assignment.assignmentType)}
                  </div>
                  <div className="assignment-target">
                    {assignment.targetName || assignment.targetValue || 'All Users'}
                  </div>
                  {assignment.affectedUsers !== undefined && (
                    <div className="assignment-stats">
                      <Users size={12} />
                      <span>{assignment.affectedUsers} users affected</span>
                    </div>
                  )}
                </div>
                <div className="assignment-priority">
                  Priority: {assignment.priority}
                </div>
                <div className="assignment-actions">
                  <button
                    className={`btn-toggle ${assignment.isActive ? 'active' : ''}`}
                    onClick={() => handleToggleActive(assignment)}
                    title={assignment.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {assignment.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    className="btn-icon danger"
                    onClick={() => handleDeleteAssignment(assignment.id)}
                    title="Remove assignment"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={assignmentToDelete !== null}
        title="Remove Assignment"
        message="Are you sure you want to remove this assignment?"
        variant="warning"
        confirmText="Remove"
        onConfirm={confirmDeleteAssignment}
        onCancel={() => setAssignmentToDelete(null)}
      />
    </div>
  );
};

export default AssignmentManager;
