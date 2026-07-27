/**
 * CampaignEditor Component
 *
 * Multi-step wizard for creating and editing signature campaigns.
 * Includes campaign details, template/banner selection, audience assignment,
 * and review/launch functionality.
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  FileText,
  Users,
  Image,
  Target,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  Loader2,
  Upload,
  Trash2,
  ExternalLink,
  Play,
  Save,
  UserCircle,
  Building2,
  Globe,
  FolderTree,
  Sparkles,
  Search,
  Info
} from 'lucide-react';
import { authFetch } from '../../config/api';
import './CampaignEditor.css';

interface SignatureTemplate {
  id: string;
  name: string;
  description: string;
  html_content: string;
  is_active: boolean;
  is_default: boolean;
}

interface CampaignAssignment {
  id?: string;
  assignment_type: AssignmentType;
  target_id?: string;
  target_value?: string;
  target_name?: string;
}

type AssignmentType = 'user' | 'group' | 'dynamic_group' | 'department' | 'ou' | 'organization';

interface CampaignFormData {
  name: string;
  description: string;
  template_id: string;
  banner_url: string;
  banner_link: string;
  banner_alt_text: string;
  start_date: string;
  end_date: string;
  timezone: string;
  tracking_enabled: boolean;
  auto_revert: boolean;
}

interface AssignmentTarget {
  id: string;
  name: string;
  count?: number;
}

interface CampaignEditorProps {
  campaign?: {
    id: string;
    name: string;
    description: string;
    template_id: string;
    banner_url?: string;
    banner_link?: string;
    banner_alt_text?: string;
    start_date: string;
    end_date: string;
    timezone?: string;
    tracking_enabled?: boolean;
    auto_revert?: boolean;
    status: string;
  };
  preselectedTemplateId?: string;
  onClose: () => void;
  onSave: () => void;
}

const STEPS = [
  { id: 'details', title: 'Campaign Details', icon: <FileText size={18} /> },
  { id: 'template', title: 'Template & Banner', icon: <Image size={18} /> },
  { id: 'audience', title: 'Audience', icon: <Users size={18} /> },
  { id: 'review', title: 'Review & Launch', icon: <Target size={18} /> },
];

const ASSIGNMENT_TYPES = [
  {
    type: 'user' as AssignmentType,
    label: 'Individual Users',
    description: 'Target specific users by name',
    icon: <UserCircle size={18} />,
  },
  {
    type: 'group' as AssignmentType,
    label: 'Groups',
    description: 'Target members of specific groups',
    icon: <Users size={18} />,
  },
  {
    type: 'dynamic_group' as AssignmentType,
    label: 'Dynamic Groups',
    description: 'Target rule-based group membership',
    icon: <Sparkles size={18} />,
  },
  {
    type: 'department' as AssignmentType,
    label: 'Departments',
    description: 'Target all users in a department',
    icon: <Building2 size={18} />,
  },
  {
    type: 'ou' as AssignmentType,
    label: 'Organizational Units',
    description: 'Target Google Workspace OUs',
    icon: <FolderTree size={18} />,
  },
  {
    type: 'organization' as AssignmentType,
    label: 'Entire Organization',
    description: 'Apply to all users',
    icon: <Globe size={18} />,
  },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
];

const CampaignEditor: React.FC<CampaignEditorProps> = ({
  campaign,
  preselectedTemplateId,
  onClose,
  onSave,
}) => {
  const isEditing = !!campaign;
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Form data
  const [formData, setFormData] = useState<CampaignFormData>({
    name: campaign?.name || '',
    description: campaign?.description || '',
    template_id: campaign?.template_id || preselectedTemplateId || '',
    banner_url: campaign?.banner_url || '',
    banner_link: campaign?.banner_link || '',
    banner_alt_text: campaign?.banner_alt_text || '',
    start_date: campaign?.start_date ? campaign.start_date.split('T')[0] : '',
    end_date: campaign?.end_date ? campaign.end_date.split('T')[0] : '',
    timezone: campaign?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    tracking_enabled: campaign?.tracking_enabled ?? true,
    auto_revert: campaign?.auto_revert ?? true,
  });

  // Audience assignments
  const [assignments, setAssignments] = useState<CampaignAssignment[]>([]);
  const [selectedAssignmentType, setSelectedAssignmentType] = useState<AssignmentType | null>(null);
  const [availableTargets, setAvailableTargets] = useState<AssignmentTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetSearch, setTargetSearch] = useState('');

  // Banner upload
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    fetchTemplates();
    if (isEditing && campaign?.id) {
      fetchCampaignAssignments(campaign.id);
    }
  }, []);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await authFetch('/api/signatures/templates?status=active');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const fetchCampaignAssignments = async (campaignId: string) => {
    try {
      const response = await authFetch(`/api/signatures/campaigns/${campaignId}/assignments`);
      const data = await response.json();
      if (data.success) {
        setAssignments(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching campaign assignments:', err);
    }
  };

  const fetchTargets = async (type: AssignmentType) => {
    if (type === 'organization') {
      setAvailableTargets([{ id: 'org', name: 'All Users in Organization' }]);
      return;
    }

    setLoadingTargets(true);
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

  const handleAddAssignment = (target: AssignmentTarget) => {
    if (!selectedAssignmentType) return;

    const newAssignment: CampaignAssignment = {
      assignment_type: selectedAssignmentType,
      target_id: selectedAssignmentType !== 'organization' && selectedAssignmentType !== 'department' ? target.id : undefined,
      target_value: selectedAssignmentType === 'department' ? target.name : undefined,
      target_name: target.name,
    };

    // Check for duplicates
    const isDuplicate = assignments.some(
      a => a.assignment_type === newAssignment.assignment_type &&
           a.target_id === newAssignment.target_id &&
           a.target_value === newAssignment.target_value
    );

    if (!isDuplicate) {
      setAssignments([...assignments, newAssignment]);
    }

    setSelectedAssignmentType(null);
    setTargetSearch('');
    setAvailableTargets([]);
  };

  const handleRemoveAssignment = (index: number) => {
    setAssignments(assignments.filter((_, i) => i !== index));
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB');
      return;
    }

    setUploadingBanner(true);
    setError(null);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('type', 'campaign-banner');

      const response = await authFetch('/api/media/upload', {
        method: 'POST',
        body: formDataUpload,
      });

      const data = await response.json();
      if (data.success) {
        setFormData(prev => ({ ...prev, banner_url: data.data.url }));
      } else {
        setError(data.error || 'Failed to upload banner');
      }
    } catch (err) {
      console.error('Error uploading banner:', err);
      setError('Failed to upload banner');
    } finally {
      setUploadingBanner(false);
    }
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0: // Details
        if (!formData.name.trim()) {
          setError('Campaign name is required');
          return false;
        }
        if (!formData.start_date || !formData.end_date) {
          setError('Start and end dates are required');
          return false;
        }
        if (new Date(formData.end_date) <= new Date(formData.start_date)) {
          setError('End date must be after start date');
          return false;
        }
        return true;
      case 1: // Template
        if (!formData.template_id) {
          setError('Please select a template');
          return false;
        }
        return true;
      case 2: // Audience
        if (assignments.length === 0) {
          setError('Please add at least one audience assignment');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    setError(null);
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSaveDraft = async () => {
    if (!formData.name.trim()) {
      setError('Campaign name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/signatures/campaigns/${campaign.id}`
        : '/api/signatures/campaigns';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          status: 'draft',
        }),
      });

      const data = await response.json();
      if (data.success) {
        const campaignId = data.data.id;

        // Save assignments
        if (assignments.length > 0) {
          for (const assignment of assignments) {
            if (!assignment.id) {
              await authFetch(`/api/signatures/campaigns/${campaignId}/assignments`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(assignment),
              });
            }
          }
        }

        onSave();
      } else {
        setError(data.error || 'Failed to save campaign');
      }
    } catch (err) {
      console.error('Error saving campaign:', err);
      setError('Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  const handleLaunch = async () => {
    // Validate all steps
    for (let i = 0; i < 3; i++) {
      if (!validateStep(i)) {
        setCurrentStep(i);
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      // First save the campaign
      const url = isEditing
        ? `/api/signatures/campaigns/${campaign.id}`
        : '/api/signatures/campaigns';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!data.success) {
        setError(data.error || 'Failed to save campaign');
        return;
      }

      const campaignId = data.data.id;

      // Save assignments
      for (const assignment of assignments) {
        if (!assignment.id) {
          await authFetch(`/api/signatures/campaigns/${campaignId}/assignments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(assignment),
          });
        }
      }

      // Launch the campaign
      const launchResponse = await authFetch(`/api/signatures/campaigns/${campaignId}/launch`, {
        method: 'POST',
      });

      const launchData = await launchResponse.json();
      if (launchData.success) {
        onSave();
      } else {
        setError(launchData.error || 'Failed to launch campaign');
      }
    } catch (err) {
      console.error('Error launching campaign:', err);
      setError('Failed to launch campaign');
    } finally {
      setSaving(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === formData.template_id);
  const filteredTargets = availableTargets.filter(t =>
    t.name.toLowerCase().includes(targetSearch.toLowerCase())
  );

  const getAssignmentIcon = (type: AssignmentType) => {
    const config = ASSIGNMENT_TYPES.find(t => t.type === type);
    return config?.icon || <Users size={16} />;
  };

  const getAssignmentLabel = (type: AssignmentType) => {
    const config = ASSIGNMENT_TYPES.find(t => t.type === type);
    return config?.label || type;
  };

  return (
    <div className="campaign-editor-overlay" onClick={onClose}>
      <div className="campaign-editor" onClick={e => e.stopPropagation()}>
        <div className="campaign-editor-header">
          <h2>{isEditing ? 'Edit Campaign' : 'Create Campaign'}</h2>
          <button className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="campaign-steps">
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`campaign-step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              onClick={() => index < currentStep && setCurrentStep(index)}
            >
              <div className="step-indicator">
                {index < currentStep ? <Check size={16} /> : step.icon}
              </div>
              <span className="step-title">{step.title}</span>
            </div>
          ))}
        </div>

        {error && (
          <div className="campaign-error">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="campaign-editor-body">
          {/* Step 1: Campaign Details */}
          {currentStep === 0 && (
            <div className="campaign-step-content">
              <h3>Campaign Details</h3>
              <p className="step-description">
                Define the basic information and schedule for your campaign.
              </p>

              <div className="form-grid">
                <div className="form-field full-width">
                  <label>Campaign Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Holiday Promotion 2025"
                  />
                </div>

                <div className="form-field full-width">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the purpose of this campaign..."
                    rows={3}
                  />
                </div>

                <div className="form-field">
                  <label>Start Date *</label>
                  <div className="input-with-icon">
                    <Calendar size={16} />
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>End Date *</label>
                  <div className="input-with-icon">
                    <Calendar size={16} />
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={e => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>Timezone</label>
                  <div className="input-with-icon">
                    <Clock size={16} />
                    <select
                      value={formData.timezone}
                      onChange={e => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field checkbox-field">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.auto_revert}
                      onChange={e => setFormData(prev => ({ ...prev, auto_revert: e.target.checked }))}
                    />
                    <span>Auto-revert signatures when campaign ends</span>
                  </label>
                  <p className="field-hint">
                    When enabled, user signatures will automatically return to their normal template after the campaign ends.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Template & Banner */}
          {currentStep === 1 && (
            <div className="campaign-step-content">
              <h3>Template & Banner</h3>
              <p className="step-description">
                Select a signature template and optionally add a promotional banner.
              </p>

              <div className="template-section">
                <h4>Select Template *</h4>
                {loadingTemplates ? (
                  <div className="loading-state">
                    <Loader2 className="spin" size={24} />
                    <span>Loading templates...</span>
                  </div>
                ) : templates.length === 0 ? (
                  <div className="empty-templates">
                    <FileText size={32} />
                    <p>No active templates found. Create a template first.</p>
                  </div>
                ) : (
                  <div className="template-selector">
                    {templates.map(template => (
                      <div
                        key={template.id}
                        className={`template-option ${formData.template_id === template.id ? 'selected' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, template_id: template.id }))}
                      >
                        <div className="template-option-header">
                          <span className="template-name">{template.name}</span>
                          {template.is_default && <span className="default-badge">Default</span>}
                        </div>
                        <p className="template-description">{template.description || 'No description'}</p>
                        {formData.template_id === template.id && (
                          <div className="selected-indicator">
                            <Check size={16} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedTemplate && (
                <div className="template-preview-section">
                  <h4>Template Preview</h4>
                  <div className="template-preview-box">
                    <div dangerouslySetInnerHTML={{ __html: selectedTemplate.html_content }} />
                  </div>
                </div>
              )}

              <div className="banner-section">
                <h4>Campaign Banner (Optional)</h4>
                <p className="section-hint">
                  Add a promotional banner image that will appear below the signature during the campaign.
                </p>

                {formData.banner_url ? (
                  <div className="banner-preview">
                    <img src={formData.banner_url} alt="Campaign banner" />
                    <button
                      className="remove-banner"
                      onClick={() => setFormData(prev => ({ ...prev, banner_url: '' }))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="banner-upload">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBannerUpload}
                      disabled={uploadingBanner}
                    />
                    {uploadingBanner ? (
                      <>
                        <Loader2 className="spin" size={24} />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={24} />
                        <span>Click to upload banner</span>
                        <span className="upload-hint">PNG, JPG, or GIF up to 2MB</span>
                      </>
                    )}
                  </label>
                )}

                {formData.banner_url && (
                  <div className="banner-options">
                    <div className="form-field">
                      <label>Banner Link URL</label>
                      <div className="input-with-icon">
                        <ExternalLink size={16} />
                        <input
                          type="url"
                          value={formData.banner_link}
                          onChange={e => setFormData(prev => ({ ...prev, banner_link: e.target.value }))}
                          placeholder="https://example.com/promo"
                        />
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Alt Text</label>
                      <input
                        type="text"
                        value={formData.banner_alt_text}
                        onChange={e => setFormData(prev => ({ ...prev, banner_alt_text: e.target.value }))}
                        placeholder="Describe the banner for accessibility"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="tracking-section">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.tracking_enabled}
                    onChange={e => setFormData(prev => ({ ...prev, tracking_enabled: e.target.checked }))}
                  />
                  <span>Enable tracking pixel</span>
                </label>
                <p className="field-hint">
                  Track email opens with a 1x1 transparent pixel embedded in the signature.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Audience */}
          {currentStep === 2 && (
            <div className="campaign-step-content">
              <h3>Target Audience</h3>
              <p className="step-description">
                Define who will receive this campaign signature.
              </p>

              <div className="audience-section">
                <div className="assignment-types">
                  <h4>Add by</h4>
                  <div className="type-buttons">
                    {ASSIGNMENT_TYPES.map(type => (
                      <button
                        key={type.type}
                        className={`type-button ${selectedAssignmentType === type.type ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedAssignmentType(type.type);
                          setTargetSearch('');
                          fetchTargets(type.type);
                        }}
                      >
                        {type.icon}
                        <span>{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedAssignmentType && (
                  <div className="target-selector">
                    <h4>Select {getAssignmentLabel(selectedAssignmentType)}</h4>
                    {selectedAssignmentType !== 'organization' && (
                      <div className="target-search">
                        <Search size={16} />
                        <input
                          type="text"
                          value={targetSearch}
                          onChange={e => setTargetSearch(e.target.value)}
                          placeholder={`Search ${getAssignmentLabel(selectedAssignmentType).toLowerCase()}...`}
                        />
                      </div>
                    )}

                    {loadingTargets ? (
                      <div className="loading-targets">
                        <Loader2 className="spin" size={20} />
                        <span>Loading...</span>
                      </div>
                    ) : (
                      <div className="target-list">
                        {filteredTargets.map(target => (
                          <button
                            key={target.id}
                            className="target-item"
                            onClick={() => handleAddAssignment(target)}
                          >
                            <span className="target-name">{target.name}</span>
                            {target.count !== undefined && (
                              <span className="target-count">{target.count} users</span>
                            )}
                          </button>
                        ))}
                        {filteredTargets.length === 0 && !loadingTargets && (
                          <p className="no-targets">No matches found</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="current-assignments">
                  <h4>
                    Current Assignments
                    {assignments.length > 0 && <span className="count">({assignments.length})</span>}
                  </h4>

                  {assignments.length === 0 ? (
                    <div className="no-assignments">
                      <Info size={20} />
                      <p>No assignments yet. Add at least one target group above.</p>
                    </div>
                  ) : (
                    <div className="assignment-list">
                      {assignments.map((assignment, index) => (
                        <div key={index} className="assignment-item">
                          <div className="assignment-icon">
                            {getAssignmentIcon(assignment.assignment_type)}
                          </div>
                          <div className="assignment-info">
                            <span className="assignment-type">{getAssignmentLabel(assignment.assignment_type)}</span>
                            <span className="assignment-target">{assignment.target_name || assignment.target_value || 'All'}</span>
                          </div>
                          <button
                            className="remove-assignment"
                            onClick={() => handleRemoveAssignment(index)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Launch */}
          {currentStep === 3 && (
            <div className="campaign-step-content">
              <h3>Review & Launch</h3>
              <p className="step-description">
                Review your campaign settings before launching.
              </p>

              <div className="review-section">
                <div className="review-card">
                  <h4>Campaign Details</h4>
                  <div className="review-grid">
                    <div className="review-item">
                      <span className="label">Name</span>
                      <span className="value">{formData.name}</span>
                    </div>
                    {formData.description && (
                      <div className="review-item full">
                        <span className="label">Description</span>
                        <span className="value">{formData.description}</span>
                      </div>
                    )}
                    <div className="review-item">
                      <span className="label">Start Date</span>
                      <span className="value">{new Date(formData.start_date).toLocaleDateString()}</span>
                    </div>
                    <div className="review-item">
                      <span className="label">End Date</span>
                      <span className="value">{new Date(formData.end_date).toLocaleDateString()}</span>
                    </div>
                    <div className="review-item">
                      <span className="label">Timezone</span>
                      <span className="value">
                        {TIMEZONES.find(tz => tz.value === formData.timezone)?.label || formData.timezone}
                      </span>
                    </div>
                    <div className="review-item">
                      <span className="label">Auto-revert</span>
                      <span className="value">{formData.auto_revert ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                </div>

                <div className="review-card">
                  <h4>Template</h4>
                  <div className="review-template">
                    <span className="template-name">{selectedTemplate?.name || 'Unknown'}</span>
                    {formData.banner_url && (
                      <div className="review-banner">
                        <span className="label">Campaign Banner</span>
                        <img src={formData.banner_url} alt="Banner preview" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="review-card">
                  <h4>Target Audience</h4>
                  <div className="review-assignments">
                    {assignments.map((assignment, index) => (
                      <div key={index} className="review-assignment">
                        {getAssignmentIcon(assignment.assignment_type)}
                        <span>{assignment.target_name || assignment.target_value || getAssignmentLabel(assignment.assignment_type)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="review-card">
                  <h4>Options</h4>
                  <div className="review-options">
                    <div className="option-item">
                      <span className={`option-status ${formData.tracking_enabled ? 'enabled' : 'disabled'}`}>
                        {formData.tracking_enabled ? <Check size={14} /> : <X size={14} />}
                      </span>
                      <span>Tracking pixel</span>
                    </div>
                    <div className="option-item">
                      <span className={`option-status ${formData.auto_revert ? 'enabled' : 'disabled'}`}>
                        {formData.auto_revert ? <Check size={14} /> : <X size={14} />}
                      </span>
                      <span>Auto-revert on end</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="campaign-editor-footer">
          <div className="footer-left">
            {currentStep > 0 && (
              <button className="btn-secondary" onClick={handleBack}>
                <ChevronLeft size={16} />
                Back
              </button>
            )}
          </div>
          <div className="footer-right">
            <button className="btn-secondary" onClick={handleSaveDraft} disabled={saving}>
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            {currentStep < STEPS.length - 1 ? (
              <button className="btn-primary" onClick={handleNext}>
                Next
                <ChevronRight size={16} />
              </button>
            ) : (
              <button className="btn-primary launch" onClick={handleLaunch} disabled={saving}>
                <Play size={16} />
                {saving ? 'Launching...' : 'Launch Campaign'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignEditor;
