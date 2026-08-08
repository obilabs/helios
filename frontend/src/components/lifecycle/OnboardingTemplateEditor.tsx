/**
 * Onboarding Template Editor
 *
 * Form for creating and editing onboarding templates.
 * Supports all template settings including Google Workspace configuration.
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  AlertCircle,
  RefreshCw,
  Users,
  Mail,
  Building2,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
} from 'lucide-react';
import { authFetch } from '../../config/api';
import TimelineEditor, { type TimelineEntry } from './TimelineEditor';
import './OnboardingTemplateEditor.css';

interface GoogleServices {
  gmail?: boolean;
  drive?: boolean;
  calendar?: boolean;
  meet?: boolean;
  chat?: boolean;
  docs?: boolean;
  sheets?: boolean;
  slides?: boolean;
}

interface SharedDriveAccess {
  driveId: string;
  driveName?: string;
  role: 'reader' | 'commenter' | 'writer' | 'fileOrganizer' | 'organizer';
}

interface OnboardingTemplate {
  id?: string;
  name: string;
  description: string;
  departmentId: string;
  googleLicenseSku: string;
  googleOrgUnitPath: string;
  googleServices: GoogleServices;
  groupIds: string[];
  sharedDriveAccess: SharedDriveAccess[];
  calendarSubscriptions: string[];
  signatureTemplateId: string;
  defaultJobTitle: string;
  defaultManagerId: string;
  sendWelcomeEmail: boolean;
  welcomeEmailSubject: string;
  welcomeEmailBody: string;
  isActive: boolean;
  isDefault: boolean;
  timeline: TimelineEntry[];
}

interface Department {
  id: string;
  name: string;
}

interface Group {
  id: string;
  name: string;
  email?: string;
}

interface OnboardingTemplateEditorProps {
  templateId?: string;
  organizationId: string;
  onSave?: (template: OnboardingTemplate) => void;
  onCancel?: () => void;
}

const defaultTemplate: OnboardingTemplate = {
  name: '',
  description: '',
  departmentId: '',
  googleLicenseSku: '',
  googleOrgUnitPath: '',
  googleServices: {
    gmail: true,
    drive: true,
    calendar: true,
    meet: true,
    chat: false,
    docs: true,
    sheets: true,
    slides: true,
  },
  groupIds: [],
  sharedDriveAccess: [],
  calendarSubscriptions: [],
  signatureTemplateId: '',
  defaultJobTitle: '',
  defaultManagerId: '',
  sendWelcomeEmail: true,
  welcomeEmailSubject: 'Welcome to {{company_name}}!',
  welcomeEmailBody: `Hi {{first_name}},

Welcome to the team! Your account has been created.

Email: {{work_email}}
Temporary Password: {{temp_password}}

Please sign in and change your password immediately.

Best regards,
The IT Team`,
  isActive: true,
  isDefault: false,
  timeline: [],
};

const OnboardingTemplateEditor: React.FC<OnboardingTemplateEditorProps> = ({
  templateId,
  organizationId,
  onSave,
  onCancel,
}) => {
  const [template, setTemplate] = useState<OnboardingTemplate>(defaultTemplate);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    google: false,
    groups: false,
    email: true,
    timeline: false,
    options: false,
  });

  const isEditing = !!templateId;

  // Fetch template if editing
  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  // Fetch departments and groups
  useEffect(() => {
    fetchDepartments();
    fetchGroups();
  }, [organizationId]);

  const fetchTemplate = async () => {
    try {
      const response = await authFetch(
        `/api/v1/lifecycle/onboarding-templates/${templateId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch template');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setTemplate({
          ...defaultTemplate,
          ...data.data,
          googleServices: data.data.googleServices || defaultTemplate.googleServices,
          timeline: data.data.timeline || [],
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  const fetchGroups = async () => {
    try {
      const response = await authFetch('/api/v1/groups');

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setGroups(data.data || []);
        }
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
    }
  };

  const handleSave = async () => {
    if (!template.name.trim()) {
      setError('Template name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/v1/lifecycle/onboarding-templates/${templateId}`
        : '/api/v1/lifecycle/onboarding-templates';

      const response = await authFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save template');
      }

      const data = await response.json();
      if (data.success) {
        onSave?.(data.data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleGroup = (groupId: string) => {
    setTemplate((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter((id) => id !== groupId)
        : [...prev.groupIds, groupId],
    }));
  };

  const toggleGoogleService = (service: keyof GoogleServices) => {
    setTemplate((prev) => ({
      ...prev,
      googleServices: {
        ...prev.googleServices,
        [service]: !prev.googleServices[service],
      },
    }));
  };

  if (loading) {
    return (
      <div className="template-editor">
        <div className="loading-state">
          <RefreshCw className="animate-spin" size={24} />
          <span>Loading template...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="template-editor">
      <div className="editor-header">
        <button className="back-btn" onClick={onCancel}>
          <ArrowLeft size={16} />
          Back to Templates
        </button>
        <h1>{isEditing ? 'Edit Template' : 'New Onboarding Template'}</h1>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="editor-form">
        {/* Basic Information */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('basic')}
          >
            <div className="section-title">
              <Info size={18} />
              <span>Basic Information</span>
            </div>
            {expandedSections.basic ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.basic && (
            <div className="section-content">
              <div className="form-group">
                <label htmlFor="name">Template Name *</label>
                <input
                  id="name"
                  type="text"
                  value={template.name}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Standard Employee, Engineering Team"
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={template.description}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe when this template should be used..."
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="department">Department</label>
                  <select
                    id="department"
                    value={template.departmentId}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, departmentId: e.target.value }))}
                  >
                    <option value="">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="jobTitle">Default Job Title</label>
                  <input
                    id="jobTitle"
                    type="text"
                    value={template.defaultJobTitle}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, defaultJobTitle: e.target.value }))}
                    placeholder="e.g., Software Engineer"
                  />
                </div>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.isActive}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span>Active (can be used for onboarding)</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.isDefault}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, isDefault: e.target.checked }))}
                  />
                  <span>Set as default template</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Google Workspace Settings */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('google')}
          >
            <div className="section-title">
              <Building2 size={18} />
              <span>Google Workspace Settings</span>
            </div>
            {expandedSections.google ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.google && (
            <div className="section-content">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="orgUnit">Organizational Unit Path</label>
                  <input
                    id="orgUnit"
                    type="text"
                    value={template.googleOrgUnitPath}
                    onChange={(e) =>
                      setTemplate((prev) => ({ ...prev, googleOrgUnitPath: e.target.value }))
                    }
                    placeholder="e.g., /Employees/Engineering"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="license">License SKU</label>
                  <input
                    id="license"
                    type="text"
                    value={template.googleLicenseSku}
                    onChange={(e) =>
                      setTemplate((prev) => ({ ...prev, googleLicenseSku: e.target.value }))
                    }
                    placeholder="e.g., Google-Apps-For-Business"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Google Services</label>
                <p className="form-hint">Select which services to enable for new users</p>
                <div className="services-grid">
                  {Object.entries({
                    gmail: 'Gmail',
                    drive: 'Drive',
                    calendar: 'Calendar',
                    meet: 'Meet',
                    chat: 'Chat',
                    docs: 'Docs',
                    sheets: 'Sheets',
                    slides: 'Slides',
                  }).map(([key, label]) => (
                    <label key={key} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={template.googleServices[key as keyof GoogleServices] || false}
                        onChange={() => toggleGoogleService(key as keyof GoogleServices)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Group Memberships */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('groups')}
          >
            <div className="section-title">
              <Users size={18} />
              <span>Group Memberships</span>
              {template.groupIds.length > 0 && (
                <span className="badge">{template.groupIds.length}</span>
              )}
            </div>
            {expandedSections.groups ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.groups && (
            <div className="section-content">
              <p className="form-hint">
                Select groups that new users will automatically be added to
              </p>
              {groups.length === 0 ? (
                <p className="empty-message">No groups available</p>
              ) : (
                <div className="groups-list">
                  {groups.map((group) => (
                    <label key={group.id} className="checkbox-label group-item">
                      <input
                        type="checkbox"
                        checked={template.groupIds.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <div className="group-info">
                        <span className="group-name">{group.name}</span>
                        {group.email && <span className="group-email">{group.email}</span>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Welcome Email */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('email')}
          >
            <div className="section-title">
              <Mail size={18} />
              <span>Welcome Email</span>
            </div>
            {expandedSections.email ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.email && (
            <div className="section-content">
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.sendWelcomeEmail}
                    onChange={(e) =>
                      setTemplate((prev) => ({ ...prev, sendWelcomeEmail: e.target.checked }))
                    }
                  />
                  <span>Send welcome email to new users</span>
                </label>
              </div>

              {template.sendWelcomeEmail && (
                <>
                  <div className="form-group">
                    <label htmlFor="emailSubject">Email Subject</label>
                    <input
                      id="emailSubject"
                      type="text"
                      value={template.welcomeEmailSubject}
                      onChange={(e) =>
                        setTemplate((prev) => ({ ...prev, welcomeEmailSubject: e.target.value }))
                      }
                      placeholder="Welcome to {{company_name}}!"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="emailBody">Email Body</label>
                    <textarea
                      id="emailBody"
                      value={template.welcomeEmailBody}
                      onChange={(e) =>
                        setTemplate((prev) => ({ ...prev, welcomeEmailBody: e.target.value }))
                      }
                      rows={8}
                    />
                    <p className="form-hint">
                      Available variables: {'{{first_name}}'}, {'{{last_name}}'}, {'{{work_email}}'},{' '}
                      {'{{temp_password}}'}, {'{{company_name}}'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Timeline Actions */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('timeline')}
          >
            <div className="section-title">
              <Clock size={18} />
              <span>Timeline Actions</span>
              {template.timeline.length > 0 && (
                <span className="badge">{template.timeline.length}</span>
              )}
            </div>
            {expandedSections.timeline ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.timeline && (
            <div className="section-content">
              <TimelineEditor
                timeline={template.timeline}
                onChange={(timeline) => setTemplate((prev) => ({ ...prev, timeline }))}
                requestType="onboard"
              />
            </div>
          )}
        </div>
      </div>

      <div className="editor-footer">
        <button className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="animate-spin" size={16} />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} />
              {isEditing ? 'Save Changes' : 'Create Template'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default OnboardingTemplateEditor;
