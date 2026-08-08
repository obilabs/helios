import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Users,
  BarChart3,
  Search,
  Filter,
  Play,
  Pause,
  Edit3,
  Trash2,
  CheckCircle,
  Clock,
  Target,
  Copy,
  Eye,
  Star,
  AlertCircle,
  X,
  Save,
  Shield,
  LayoutDashboard,
  TrendingUp
} from 'lucide-react';
import './Signatures.css';
import { TemplateEditor, TemplatePreview, CampaignEditor, CampaignAnalytics, SignaturePermissions, DeploymentStatus } from '../components/signatures';
import { authFetch } from '../config/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface SignatureTemplate {
  id: string;
  name: string;
  description: string;
  html_content: string;
  plain_text_content?: string;
  mobile_html_content?: string;
  thumbnail_url?: string;
  category?: string;
  variables_used?: string[];
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  created_by_email?: string;
  created_by_name?: string;
  assignment_count: number;
  usage_count: number;
}

interface SignatureCampaign {
  id: string;
  name: string;
  description: string;
  template_id: string;
  template_name: string;
  target_type: 'all' | 'users' | 'groups' | 'departments' | 'org_units';
  target_ids: string[];
  priority: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'completed' | 'cancelled';
  start_date: string;
  end_date: string;
  created_at: string;
  created_by_name: string;
  approval_status?: string;
  approved_by_name?: string;
  approved_at?: string;
  applied_count: number;
  total_target_count: number;
}

interface TemplateFormData {
  name: string;
  description: string;
  html_content: string;
  plain_text_content: string;
  is_active: boolean;
  is_default: boolean;
}

const Signatures: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'campaigns' | 'analytics' | 'permissions'>('overview');
  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<SignatureCampaign[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SignatureTemplate | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<SignatureCampaign | null>(null);
  const [analyticsCampaignId, setAnalyticsCampaignId] = useState<string | null>(null);
  const [showCampaignWizard, setShowCampaignWizard] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<SignatureTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    html_content: '',
    plain_text_content: '',
    is_active: true,
    is_default: false,
  });

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchTemplates();
      fetchCampaigns();
    } else if (activeTab === 'templates') {
      fetchTemplates();
    } else if (activeTab === 'campaigns' || activeTab === 'analytics') {
      fetchCampaigns();
    }
  }, [activeTab]);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/api/signatures/templates');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch templates');
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/api/signatures/campaigns');
      const data = await response.json();
      if (data.success) {
        setCampaigns(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch campaigns');
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const openTemplateEditor = useCallback((template?: SignatureTemplate) => {
    if (template) {
      setSelectedTemplate(template);
      setFormData({
        name: template.name,
        description: template.description || '',
        html_content: template.html_content || '',
        plain_text_content: template.plain_text_content || '',
        is_active: template.is_active,
        is_default: template.is_default,
      });
    } else {
      setSelectedTemplate(null);
      setFormData({
        name: '',
        description: '',
        html_content: getDefaultTemplate(),
        plain_text_content: '',
        is_active: true,
        is_default: false,
      });
    }
    setShowTemplateEditor(true);
  }, []);

  const closeTemplateEditor = useCallback(() => {
    setShowTemplateEditor(false);
    setSelectedTemplate(null);
    setFormData({
      name: '',
      description: '',
      html_content: '',
      plain_text_content: '',
      is_active: true,
      is_default: false,
    });
  }, []);

  const saveTemplate = async () => {
    if (!formData.name.trim()) {
      setError('Template name is required');
      return;
    }
    if (!formData.html_content.trim()) {
      setError('Template content is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = selectedTemplate
        ? `/api/signatures/templates/${selectedTemplate.id}`
        : '/api/signatures/templates';
      const method = selectedTemplate ? 'PUT' : 'POST';

      const response = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        closeTemplateEditor();
        fetchTemplates();
      } else {
        setError(data.error || 'Failed to save template');
      }
    } catch (err) {
      console.error('Error saving template:', err);
      setError('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = (templateId: string) => {
    setTemplateToDelete(templateId);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      const response = await authFetch(`/api/signatures/templates/${templateToDelete}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        fetchTemplates();
      } else {
        setError(data.error || 'Failed to delete template');
      }
    } catch (err) {
      console.error('Error deleting template:', err);
      setError('Failed to delete template');
    } finally {
      setTemplateToDelete(null);
    }
  };

  const handleCloneTemplate = async (template: SignatureTemplate) => {
    setFormData({
      name: `${template.name} (Copy)`,
      description: template.description || '',
      html_content: template.html_content,
      plain_text_content: template.plain_text_content || '',
      is_active: false,
      is_default: false,
    });
    setSelectedTemplate(null);
    setShowTemplateEditor(true);
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const response = await authFetch(`/api/signatures/templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_default: true }),
      });
      const data = await response.json();
      if (data.success) {
        fetchTemplates();
      }
    } catch (err) {
      console.error('Error setting default template:', err);
    }
  };

  const handleCampaignStatusChange = async (campaignId: string, newStatus: string) => {
    try {
      const response = await authFetch(`/api/signatures/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();
      if (data.success) {
        fetchCampaigns();
      }
    } catch (err) {
      console.error('Error updating campaign status:', err);
    }
  };

  const handleManualSync = async () => {
    try {
      const response = await authFetch('/api/signatures/sync', {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        alert(`Signature sync initiated for ${data.data?.userCount || 0} users`);
      } else {
        alert(data.error || 'Sync not available');
      }
    } catch (err) {
      console.error('Error initiating sync:', err);
      alert('Failed to initiate sync');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active': return 'badge-active';
      case 'approved': return 'badge-approved';
      case 'draft': return 'badge-draft';
      case 'pending_approval': return 'badge-pending';
      case 'paused': return 'badge-paused';
      case 'completed': return 'badge-completed';
      case 'cancelled': return 'badge-cancelled';
      default: return 'badge-default';
    }
  };

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || campaign.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="signatures-container">
      <div className="signatures-header">
        <div className="header-content">
          <h1>Email Signature Management</h1>
          <p>Create and manage email signature templates and campaigns</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleManualSync}>
            <Play size={16} />
            Manual Sync
          </button>
          <button className="btn-primary" onClick={() => {
            if (activeTab === 'templates') {
              openTemplateEditor();
            } else if (activeTab === 'campaigns') {
              setShowCampaignWizard(true);
            }
          }}>
            <Plus size={16} />
            {activeTab === 'templates' ? 'New Template' : 'New Campaign'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="signatures-tabs">
        <button
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutDashboard size={16} />
          Overview
        </button>
        <button
          className={`tab-button ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <FileText size={16} />
          Templates
        </button>
        <button
          className={`tab-button ${activeTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaigns')}
        >
          <Target size={16} />
          Campaigns
        </button>
        <button
          className={`tab-button ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={16} />
          Analytics
        </button>
        <button
          className={`tab-button ${activeTab === 'permissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('permissions')}
        >
          <Shield size={16} />
          Permissions
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="overview-section">
          {/* Deployment Status */}
          <DeploymentStatus showActions={true} />

          {/* Quick Stats */}
          <div className="overview-stats">
            <div className="stat-card">
              <div className="stat-icon templates">
                <FileText size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{templates.length}</span>
                <span className="stat-label">Templates</span>
              </div>
              <button
                className="stat-action"
                onClick={() => setActiveTab('templates')}
              >
                View All
              </button>
            </div>

            <div className="stat-card">
              <div className="stat-icon campaigns">
                <Target size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">
                  {campaigns.filter(c => c.status === 'active').length}
                </span>
                <span className="stat-label">Active Campaigns</span>
              </div>
              <button
                className="stat-action"
                onClick={() => setActiveTab('campaigns')}
              >
                View All
              </button>
            </div>

            <div className="stat-card">
              <div className="stat-icon scheduled">
                <Clock size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">
                  {campaigns.filter(c => c.status === 'approved' || c.status === 'pending_approval').length}
                </span>
                <span className="stat-label">Scheduled</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon analytics">
                <TrendingUp size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">
                  {campaigns.filter(c => c.status === 'completed').length}
                </span>
                <span className="stat-label">Completed</span>
              </div>
              <button
                className="stat-action"
                onClick={() => setActiveTab('analytics')}
              >
                Analytics
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="overview-actions">
            <h3>Quick Actions</h3>
            <div className="action-buttons">
              <button
                className="action-btn primary"
                onClick={() => {
                  setActiveTab('templates');
                  setTimeout(() => openTemplateEditor(), 100);
                }}
              >
                <Plus size={16} />
                Create Template
              </button>
              <button
                className="action-btn secondary"
                onClick={() => {
                  setActiveTab('campaigns');
                  setTimeout(() => setShowCampaignWizard(true), 100);
                }}
              >
                <Target size={16} />
                New Campaign
              </button>
              <button className="action-btn secondary" onClick={handleManualSync}>
                <Play size={16} />
                Manual Sync
              </button>
            </div>
          </div>

          {/* Recent Activity */}
          {campaigns.length > 0 && (
            <div className="overview-recent">
              <h3>Recent Campaigns</h3>
              <div className="recent-list">
                {campaigns.slice(0, 5).map(campaign => (
                  <div key={campaign.id} className="recent-item">
                    <div className="recent-info">
                      <span className="recent-name">{campaign.name}</span>
                      <span className="recent-meta">
                        {campaign.template_name} &bull; {campaign.applied_count}/{campaign.total_target_count} users
                      </span>
                    </div>
                    <span className={`status-badge ${getStatusBadgeClass(campaign.status)}`}>
                      {campaign.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="templates-section">
          <div className="section-toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="loading-state">Loading templates...</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <h3>No templates found</h3>
              <p>Create your first signature template to get started</p>
              <button className="btn-primary" onClick={() => openTemplateEditor()}>
                <Plus size={16} />
                Create Template
              </button>
            </div>
          ) : (
            <div className="templates-grid">
              {filteredTemplates.map(template => (
                <div key={template.id} className={`template-card ${template.is_default ? 'default' : ''}`}>
                  <div className="template-header">
                    <h3>{template.name}</h3>
                    <div className="template-badges">
                      {template.is_default && (
                        <span className="badge badge-primary">
                          <Star size={10} />
                          Default
                        </span>
                      )}
                      {template.is_active ? (
                        <span className="badge badge-active">Active</span>
                      ) : (
                        <span className="badge badge-inactive">Inactive</span>
                      )}
                    </div>
                  </div>
                  <p className="template-description">{template.description || 'No description'}</p>
                  <div className="template-stats">
                    <div className="stat">
                      <Users size={14} />
                      <span>{template.assignment_count || 0} assignments</span>
                    </div>
                    <div className="stat">
                      <CheckCircle size={14} />
                      <span>{template.usage_count || 0} users</span>
                    </div>
                  </div>
                  <div className="template-preview-box">
                    <div
                      className="template-preview-content"
                      dangerouslySetInnerHTML={{ __html: template.html_content?.substring(0, 300) + '...' }}
                    />
                    <div className="template-preview-fade" />
                  </div>
                  <div className="template-actions">
                    <button
                      className="btn-icon"
                      onClick={() => {
                        setPreviewTemplate(template);
                        setShowPreview(true);
                      }}
                      title="Preview"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => openTemplateEditor(template)}
                      title="Edit template"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleCloneTemplate(template)}
                      title="Clone template"
                    >
                      <Copy size={16} />
                    </button>
                    {!template.is_default && (
                      <button
                        className="btn-icon"
                        onClick={() => handleSetDefault(template.id)}
                        title="Set as default"
                      >
                        <Star size={16} />
                      </button>
                    )}
                    <button
                      className="btn-icon"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setShowCampaignWizard(true);
                      }}
                      title="Create campaign"
                    >
                      <Target size={16} />
                    </button>
                    <button
                      className="btn-icon danger"
                      onClick={() => handleDeleteTemplate(template.id)}
                      title="Delete template"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div className="campaigns-section">
          <div className="section-toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="filter-dropdown">
              <Filter size={16} />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading-state">Loading campaigns...</div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="empty-state">
              <Target size={48} />
              <h3>No campaigns found</h3>
              <p>Create your first signature campaign to engage your audience</p>
              <button className="btn-primary" onClick={() => setShowCampaignWizard(true)}>
                <Plus size={16} />
                Create Campaign
              </button>
            </div>
          ) : (
            <div className="campaigns-list">
              {filteredCampaigns.map(campaign => (
                <div key={campaign.id} className="campaign-card">
                  <div className="campaign-header">
                    <div className="campaign-info">
                      <h3>{campaign.name}</h3>
                      <p>{campaign.description}</p>
                    </div>
                    <span className={`status-badge ${getStatusBadgeClass(campaign.status)}`}>
                      {campaign.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="campaign-details">
                    <div className="detail-group">
                      <span className="detail-label">Template:</span>
                      <span className="detail-value">{campaign.template_name}</span>
                    </div>
                    <div className="detail-group">
                      <span className="detail-label">Target:</span>
                      <span className="detail-value">{campaign.target_type}</span>
                    </div>
                    <div className="detail-group">
                      <span className="detail-label">Duration:</span>
                      <span className="detail-value">
                        {new Date(campaign.start_date).toLocaleDateString()} - {new Date(campaign.end_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="detail-group">
                      <span className="detail-label">Progress:</span>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{width: `${campaign.total_target_count ? (campaign.applied_count / campaign.total_target_count) * 100 : 0}%`}}
                        />
                      </div>
                      <span className="detail-value">{campaign.applied_count}/{campaign.total_target_count}</span>
                    </div>
                  </div>
                  <div className="campaign-actions">
                    {campaign.status === 'draft' && (
                      <button
                        className="btn-secondary"
                        onClick={() => handleCampaignStatusChange(campaign.id, 'pending_approval')}
                      >
                        Submit for Approval
                      </button>
                    )}
                    {campaign.status === 'approved' && (
                      <button
                        className="btn-primary"
                        onClick={() => handleCampaignStatusChange(campaign.id, 'active')}
                      >
                        <Play size={16} />
                        Activate
                      </button>
                    )}
                    {campaign.status === 'active' && (
                      <button
                        className="btn-secondary"
                        onClick={() => handleCampaignStatusChange(campaign.id, 'paused')}
                      >
                        <Pause size={16} />
                        Pause
                      </button>
                    )}
                    {campaign.status === 'paused' && (
                      <button
                        className="btn-primary"
                        onClick={() => handleCampaignStatusChange(campaign.id, 'active')}
                      >
                        <Play size={16} />
                        Resume
                      </button>
                    )}
                    <button
                      className="btn-icon"
                      onClick={() => {
                        setEditingCampaign(campaign);
                        setShowCampaignWizard(true);
                      }}
                      title="Edit campaign"
                    >
                      <Edit3 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="analytics-section">
          {analyticsCampaignId ? (
            <CampaignAnalytics
              campaignId={analyticsCampaignId}
              onBack={() => setAnalyticsCampaignId(null)}
            />
          ) : (
            <div className="analytics-campaign-selector">
              <div className="selector-header">
                <h2>Campaign Analytics</h2>
                <p>Select a campaign to view detailed analytics and performance metrics</p>
              </div>
              {campaigns.length === 0 ? (
                <div className="empty-state">
                  <BarChart3 size={48} />
                  <h3>No campaigns available</h3>
                  <p>Create a campaign to start tracking analytics</p>
                  <button className="btn-primary" onClick={() => {
                    setActiveTab('campaigns');
                    setShowCampaignWizard(true);
                  }}>
                    <Plus size={16} />
                    Create Campaign
                  </button>
                </div>
              ) : (
                <div className="campaign-cards-grid">
                  {campaigns.map(campaign => (
                    <div
                      key={campaign.id}
                      className="campaign-analytics-card"
                      onClick={() => setAnalyticsCampaignId(campaign.id)}
                    >
                      <div className="card-header">
                        <h3>{campaign.name}</h3>
                        <span className={`status-badge ${getStatusBadgeClass(campaign.status)}`}>
                          {campaign.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="card-description">{campaign.description || 'No description'}</p>
                      <div className="card-meta">
                        <span>
                          <Clock size={14} />
                          {new Date(campaign.start_date).toLocaleDateString()} - {new Date(campaign.end_date).toLocaleDateString()}
                        </span>
                        <span>
                          <Users size={14} />
                          {campaign.applied_count}/{campaign.total_target_count} users
                        </span>
                      </div>
                      <button className="btn-view-analytics">
                        <BarChart3 size={16} />
                        View Analytics
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="permissions-section">
          <SignaturePermissions />
        </div>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <div className="modal-overlay" onClick={closeTemplateEditor}>
          <div className="modal-content extra-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedTemplate ? 'Edit Template' : 'Create Template'}</h2>
              <button className="btn-close" onClick={closeTemplateEditor}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body template-editor-modal">
              <div className="editor-form">
                <div className="form-row">
                  <div className="form-field">
                    <label>Template Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter template name"
                    />
                  </div>
                  <div className="form-field">
                    <label>Description</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter a brief description"
                    />
                  </div>
                </div>

                <div className="form-row checkboxes">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    />
                    <span>Active</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.is_default}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                    />
                    <span>Set as default template</span>
                  </label>
                </div>

                <div className="editor-layout">
                  <div className="editor-panel">
                    <label>Signature Content</label>
                    <TemplateEditor
                      value={formData.html_content}
                      onChange={(html) => setFormData(prev => ({ ...prev, html_content: html }))}
                      placeholder="Design your email signature..."
                    />
                  </div>
                  <div className="preview-panel">
                    <TemplatePreview
                      htmlContent={formData.html_content}
                      plainTextContent={formData.plain_text_content}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeTemplateEditor}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={saveTemplate}
                disabled={saving}
              >
                <Save size={16} />
                {saving ? 'Saving...' : (selectedTemplate ? 'Update Template' : 'Create Template')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && previewTemplate && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Preview: {previewTemplate.name}</h2>
              <button className="btn-close" onClick={() => setShowPreview(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <TemplatePreview
                htmlContent={previewTemplate.html_content}
                plainTextContent={previewTemplate.plain_text_content}
              />
            </div>
          </div>
        </div>
      )}

      {/* Campaign Editor Modal */}
      {showCampaignWizard && (
        <CampaignEditor
          campaign={editingCampaign ? {
            id: editingCampaign.id,
            name: editingCampaign.name,
            description: editingCampaign.description,
            template_id: editingCampaign.template_id,
            start_date: editingCampaign.start_date,
            end_date: editingCampaign.end_date,
            status: editingCampaign.status,
          } : undefined}
          preselectedTemplateId={selectedTemplate?.id}
          onClose={() => {
            setShowCampaignWizard(false);
            setSelectedTemplate(null);
            setEditingCampaign(null);
          }}
          onSave={() => {
            setShowCampaignWizard(false);
            setSelectedTemplate(null);
            setEditingCampaign(null);
            fetchCampaigns();
          }}
        />
      )}

      {/* Delete Template Confirmation */}
      <ConfirmDialog
        isOpen={templateToDelete !== null}
        title="Delete Template"
        message="Are you sure you want to delete this template? This action cannot be undone."
        variant="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteTemplate}
        onCancel={() => setTemplateToDelete(null)}
      />
    </div>
  );
};

// Default signature template
function getDefaultTemplate(): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 14px; color: #333333;">
  <tr>
    <td style="padding-right: 16px; border-right: 2px solid #8b5cf6;">
      <!-- Profile image placeholder -->
      <div style="width: 80px; height: 80px; background: #e5e7eb; border-radius: 4px;"></div>
    </td>
    <td style="padding-left: 16px; vertical-align: top;">
      <div style="font-weight: 600; font-size: 16px; color: #1f2937; margin-bottom: 4px;">{{full_name}}</div>
      <div style="color: #6b7280; margin-bottom: 8px;">{{job_title}}</div>
      <div style="font-size: 13px; color: #4b5563;">
        <div style="margin-bottom: 2px;">{{email}}</div>
        <div style="margin-bottom: 2px;">{{work_phone}}</div>
        <div style="color: #8b5cf6;">{{company_website}}</div>
      </div>
    </td>
  </tr>
</table>`;
}

export default Signatures;
