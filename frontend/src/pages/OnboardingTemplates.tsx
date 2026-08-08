/**
 * Onboarding Templates Page
 *
 * List view for managing user onboarding templates.
 * Templates define default settings for new user provisioning.
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  Star,
  Building2,
  Users,
  Mail,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import './OnboardingTemplates.css';
import { authFetch } from '../config/api';

interface OnboardingTemplate {
  id: string;
  name: string;
  description?: string;
  departmentId?: string;
  departmentName?: string;
  googleOrgUnitPath?: string;
  groupIds: string[];
  sendWelcomeEmail: boolean;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Department {
  id: string;
  name: string;
}

interface OnboardingTemplatesProps {
  organizationId: string;
  onNavigateToEditor?: (templateId?: string) => void;
}

const OnboardingTemplates: React.FC<OnboardingTemplatesProps> = ({
  organizationId,
  onNavigateToEditor,
}) => {
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch templates
  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/api/v1/lifecycle/onboarding-templates');

      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      if (data.success) {
        setTemplates(data.data || []);
      } else {
        throw new Error(data.error || 'Failed to fetch templates');
      }
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch departments
  const fetchDepartments = async () => {
    try {
      const response = await authFetch('/api/v1/departments');

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDepartments(data.data || []);
        }
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchDepartments();
  }, [organizationId]);

  // Delete template
  const handleDelete = async (templateId: string) => {
    setDeleteLoading(true);
    try {
      const response = await authFetch(`/api/v1/lifecycle/onboarding-templates/${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete template');
      }

      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setShowDeleteModal(null);
    } catch (err: any) {
      console.error('Error deleting template:', err);
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Duplicate template
  const handleDuplicate = async (template: OnboardingTemplate) => {
    try {
      const response = await authFetch('/api/v1/lifecycle/onboarding-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          description: template.description,
          departmentId: template.departmentId,
          groupIds: template.groupIds,
          sendWelcomeEmail: template.sendWelcomeEmail,
          isActive: false, // Start as inactive
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to duplicate template');
      }

      const data = await response.json();
      if (data.success) {
        setTemplates((prev) => [...prev, data.data]);
      }
    } catch (err: any) {
      console.error('Error duplicating template:', err);
      setError(err.message);
    }
  };

  // Set default template
  const handleSetDefault = async (templateId: string) => {
    try {
      const response = await authFetch(`/api/v1/lifecycle/onboarding-templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isDefault: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to set default template');
      }

      // Refresh templates to get updated default status
      fetchTemplates();
    } catch (err: any) {
      console.error('Error setting default template:', err);
      setError(err.message);
    }
  };

  // Toggle active status
  const handleToggleActive = async (templateId: string, isActive: boolean) => {
    try {
      const response = await authFetch(`/api/v1/lifecycle/onboarding-templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (!response.ok) {
        throw new Error('Failed to update template');
      }

      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, isActive: !isActive } : t))
      );
    } catch (err: any) {
      console.error('Error updating template:', err);
      setError(err.message);
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !template.name.toLowerCase().includes(query) &&
        !template.description?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Department filter
    if (filterDepartment !== 'all' && template.departmentId !== filterDepartment) {
      return false;
    }

    // Active filter
    if (filterActive === 'active' && !template.isActive) {
      return false;
    }
    if (filterActive === 'inactive' && template.isActive) {
      return false;
    }

    return true;
  });

  const getDepartmentName = (departmentId?: string) => {
    if (!departmentId) return 'All Departments';
    const dept = departments.find((d) => d.id === departmentId);
    return dept?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="onboarding-templates-page">
        <div className="loading-state">
          <RefreshCw className="animate-spin" size={24} />
          <span>Loading templates...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-templates-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Onboarding Templates</h1>
          <p className="header-subtitle">
            Create templates to streamline new user provisioning with pre-configured settings
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => onNavigateToEditor?.()}
        >
          <Plus size={16} />
          New Template
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filters">
          <div className="filter-group">
            <Filter size={14} />
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <button className="btn-secondary" onClick={fetchTemplates}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Users size={48} />
          </div>
          <h2>No templates found</h2>
          {templates.length === 0 ? (
            <>
              <p>Create your first onboarding template to streamline user provisioning.</p>
              <button
                className="btn-primary"
                onClick={() => onNavigateToEditor?.()}
              >
                <Plus size={16} />
                Create Template
              </button>
            </>
          ) : (
            <p>Try adjusting your search or filters.</p>
          )}
        </div>
      ) : (
        <div className="templates-grid">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={`template-card ${template.isDefault ? 'is-default' : ''} ${!template.isActive ? 'is-inactive' : ''}`}
            >
              <div className="card-header">
                <div className="card-title-row">
                  <h3>{template.name}</h3>
                  {template.isDefault && (
                    <span className="default-badge">
                      <Star size={12} />
                      Default
                    </span>
                  )}
                </div>
                <div className="card-status">
                  {template.isActive ? (
                    <span className="status-badge active">
                      <CheckCircle size={12} />
                      Active
                    </span>
                  ) : (
                    <span className="status-badge inactive">
                      <XCircle size={12} />
                      Inactive
                    </span>
                  )}
                </div>
              </div>

              {template.description && (
                <p className="card-description">{template.description}</p>
              )}

              <div className="card-details">
                <div className="detail-item">
                  <Building2 size={14} />
                  <span>{getDepartmentName(template.departmentId)}</span>
                </div>
                <div className="detail-item">
                  <Users size={14} />
                  <span>{template.groupIds?.length || 0} groups</span>
                </div>
                <div className="detail-item">
                  <Mail size={14} />
                  <span>{template.sendWelcomeEmail ? 'Welcome email enabled' : 'No welcome email'}</span>
                </div>
              </div>

              <div className="card-actions">
                <button
                  className="action-btn"
                  onClick={() => onNavigateToEditor?.(template.id)}
                  title="Edit template"
                >
                  <Edit size={14} />
                  Edit
                </button>
                <button
                  className="action-btn"
                  onClick={() => handleDuplicate(template)}
                  title="Duplicate template"
                >
                  <Copy size={14} />
                  Copy
                </button>
                {!template.isDefault && (
                  <button
                    className="action-btn"
                    onClick={() => handleSetDefault(template.id)}
                    title="Set as default"
                  >
                    <Star size={14} />
                    Set Default
                  </button>
                )}
                <button
                  className="action-btn toggle"
                  onClick={() => handleToggleActive(template.id, template.isActive)}
                  title={template.isActive ? 'Deactivate' : 'Activate'}
                >
                  {template.isActive ? <XCircle size={14} /> : <CheckCircle size={14} />}
                  {template.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="action-btn danger"
                  onClick={() => setShowDeleteModal(template.id)}
                  title="Delete template"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="card-footer">
                <span className="timestamp">
                  Updated {new Date(template.updatedAt).toLocaleDateString()}
                </span>
                <ChevronRight size={14} className="chevron" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete Template</h3>
            <p>Are you sure you want to delete this template? This action cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteModal(null)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(showDeleteModal)}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingTemplates;
