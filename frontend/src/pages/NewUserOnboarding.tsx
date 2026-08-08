/**
 * New User Onboarding Page
 *
 * Multi-step wizard for onboarding a new user.
 * Step 1: Basic info (name, email)
 * Step 2: Select template
 * Step 3: Review & customize
 * Step 4: Confirm & create
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  User,
  FileText,
  Settings,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Mail,
  Building2,
  Users,
  ChevronRight,
  Check,
} from 'lucide-react';
import './NewUserOnboarding.css';
import { authFetch } from '../config/api';

interface OnboardingTemplate {
  id: string;
  name: string;
  description?: string;
  departmentId?: string;
  departmentName?: string;
  groupIds: string[];
  isDefault: boolean;
  sendWelcomeEmail: boolean;
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

interface Manager {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string;
}

interface NewUserData {
  firstName: string;
  lastName: string;
  email: string;
  personalEmail: string;
  jobTitle: string;
  departmentId: string;
  managerId: string;
  startDate: string;
}

interface NewUserOnboardingProps {
  organizationId: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

const STEPS = [
  { id: 1, title: 'User Info', icon: User },
  { id: 2, title: 'Template', icon: FileText },
  { id: 3, title: 'Review', icon: Settings },
  { id: 4, title: 'Confirm', icon: CheckCircle },
];

const NewUserOnboarding: React.FC<NewUserOnboardingProps> = ({
  organizationId,
  onComplete,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [userData, setUserData] = useState<NewUserData>({
    firstName: '',
    lastName: '',
    email: '',
    personalEmail: '',
    jobTitle: '',
    departmentId: '',
    managerId: '',
    startDate: new Date().toISOString().split('T')[0],
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<OnboardingTemplate | null>(null);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [customizations, setCustomizations] = useState<{
    groupIds: string[];
    sendWelcomeEmail: boolean;
    scheduleFor: 'now' | 'start_date' | 'custom';
    customScheduleDate: string;
  }>({
    groupIds: [],
    sendWelcomeEmail: true,
    scheduleFor: 'now',
    customScheduleDate: '',
  });

  // Fetch templates, departments, groups on mount
  useEffect(() => {
    fetchData();
  }, [organizationId]);

  // Update customizations when template changes
  useEffect(() => {
    if (selectedTemplate) {
      setCustomizations((prev) => ({
        ...prev,
        groupIds: selectedTemplate.groupIds || [],
        sendWelcomeEmail: selectedTemplate.sendWelcomeEmail,
      }));
    }
  }, [selectedTemplate]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [templatesRes, departmentsRes, groupsRes, managersRes] = await Promise.all([
        authFetch('/api/v1/lifecycle/onboarding-templates'),
        authFetch('/api/v1/departments'),
        authFetch('/api/v1/groups'),
        authFetch('/api/v1/users?role=manager,admin'),
      ]);

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        const activeTemplates = (data.data || []).filter((t: OnboardingTemplate) => t.isDefault !== undefined);
        setTemplates(activeTemplates);

        // Pre-select default template
        const defaultTemplate = activeTemplates.find((t: OnboardingTemplate) => t.isDefault);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
          setSelectedTemplate(defaultTemplate);
        }
      }

      if (departmentsRes.ok) {
        const data = await departmentsRes.json();
        setDepartments(data.data || []);
      }

      if (groupsRes.ok) {
        const data = await groupsRes.json();
        setGroups(data.data || []);
      }

      if (managersRes.ok) {
        const data = await managersRes.json();
        setManagers(data.data || []);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    setSelectedTemplate(template || null);
  };

  const handleNext = () => {
    if (currentStep === 1) {
      // Validate user data
      if (!userData.firstName.trim() || !userData.lastName.trim() || !userData.email.trim()) {
        setError('Please fill in all required fields');
        return;
      }
      if (!userData.email.includes('@')) {
        setError('Please enter a valid email address');
        return;
      }
    }

    if (currentStep === 2) {
      if (!selectedTemplateId) {
        setError('Please select an onboarding template');
        return;
      }
    }

    setError(null);
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // Determine schedule time
      let scheduledFor: string | undefined;
      if (customizations.scheduleFor === 'start_date' && userData.startDate) {
        scheduledFor = new Date(userData.startDate).toISOString();
      } else if (customizations.scheduleFor === 'custom' && customizations.customScheduleDate) {
        scheduledFor = new Date(customizations.customScheduleDate).toISOString();
      }

      const payload = {
        // User details
        targetEmail: userData.email,
        targetFirstName: userData.firstName,
        targetLastName: userData.lastName,
        targetPersonalEmail: userData.personalEmail || undefined,

        // Template
        onboardingTemplateId: selectedTemplateId,

        // Customizations
        configOverrides: {
          jobTitle: userData.jobTitle,
          departmentId: userData.departmentId,
          managerId: userData.managerId,
          groupIds: customizations.groupIds,
          sendWelcomeEmail: customizations.sendWelcomeEmail,
        },

        // Scheduling
        scheduledFor: scheduledFor || undefined,
        actionType: 'onboard',
      };

      const response = await authFetch('/api/v1/lifecycle/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create user');
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    setCustomizations((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter((id) => id !== groupId)
        : [...prev.groupIds, groupId],
    }));
  };

  const getGroupName = (groupId: string) => {
    return groups.find((g) => g.id === groupId)?.name || groupId;
  };

  const getDepartmentName = (deptId: string) => {
    return departments.find((d) => d.id === deptId)?.name || deptId;
  };

  const getManagerName = (managerId: string) => {
    const manager = managers.find((m) => m.id === managerId);
    return manager ? `${manager.firstName} ${manager.lastName}` : managerId;
  };

  if (loading) {
    return (
      <div className="new-user-onboarding">
        <div className="loading-state">
          <RefreshCw className="animate-spin" size={24} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="new-user-onboarding">
        <div className="success-state">
          <div className="success-icon">
            <CheckCircle size={64} />
          </div>
          <h2>User Onboarding Initiated</h2>
          <p>
            {customizations.scheduleFor === 'now'
              ? `${userData.firstName} ${userData.lastName} is being set up now.`
              : `Onboarding for ${userData.firstName} ${userData.lastName} has been scheduled.`
            }
          </p>
          <p className="success-email">
            A confirmation email will be sent to <strong>{userData.email}</strong>
          </p>
          <div className="success-actions">
            <button className="btn-secondary" onClick={onComplete}>
              Back to Dashboard
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setSuccess(false);
                setCurrentStep(1);
                setUserData({
                  firstName: '',
                  lastName: '',
                  email: '',
                  personalEmail: '',
                  jobTitle: '',
                  departmentId: '',
                  managerId: '',
                  startDate: new Date().toISOString().split('T')[0],
                });
              }}
            >
              Add Another User
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="new-user-onboarding">
      <div className="onboarding-header">
        <button className="back-btn" onClick={onCancel}>
          <ArrowLeft size={16} />
          Cancel
        </button>
        <h1>New User Onboarding</h1>
      </div>

      {/* Progress Steps */}
      <div className="progress-steps">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;

          return (
            <React.Fragment key={step.id}>
              <div className={`step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                <div className="step-icon">
                  {isCompleted ? <Check size={16} /> : <StepIcon size={16} />}
                </div>
                <span className="step-title">{step.title}</span>
              </div>
              {index < STEPS.length - 1 && <div className={`step-connector ${isCompleted ? 'completed' : ''}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="step-content">
        {/* Step 1: User Info */}
        {currentStep === 1 && (
          <div className="step-form">
            <h2>User Information</h2>
            <p className="step-description">Enter the basic details for the new user.</p>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">First Name *</label>
                <input
                  id="firstName"
                  type="text"
                  value={userData.firstName}
                  onChange={(e) => setUserData((prev) => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                />
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Last Name *</label>
                <input
                  id="lastName"
                  type="text"
                  value={userData.lastName}
                  onChange={(e) => setUserData((prev) => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">Work Email *</label>
                <input
                  id="email"
                  type="email"
                  value={userData.email}
                  onChange={(e) => setUserData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="john.smith@company.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="personalEmail">Personal Email</label>
                <input
                  id="personalEmail"
                  type="email"
                  value={userData.personalEmail}
                  onChange={(e) => setUserData((prev) => ({ ...prev, personalEmail: e.target.value }))}
                  placeholder="john@personal.com"
                />
                <p className="form-hint">Optional - for sending welcome instructions</p>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="jobTitle">Job Title</label>
                <input
                  id="jobTitle"
                  type="text"
                  value={userData.jobTitle}
                  onChange={(e) => setUserData((prev) => ({ ...prev, jobTitle: e.target.value }))}
                  placeholder="Software Engineer"
                />
              </div>
              <div className="form-group">
                <label htmlFor="department">Department</label>
                <select
                  id="department"
                  value={userData.departmentId}
                  onChange={(e) => setUserData((prev) => ({ ...prev, departmentId: e.target.value }))}
                >
                  <option value="">Select department...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="manager">Manager</label>
                <select
                  id="manager"
                  value={userData.managerId}
                  onChange={(e) => setUserData((prev) => ({ ...prev, managerId: e.target.value }))}
                >
                  <option value="">Select manager...</option>
                  {managers.map((mgr) => (
                    <option key={mgr.id} value={mgr.id}>
                      {mgr.firstName} {mgr.lastName} {mgr.jobTitle ? `(${mgr.jobTitle})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="startDate">Start Date</label>
                <input
                  id="startDate"
                  type="date"
                  value={userData.startDate}
                  onChange={(e) => setUserData((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Select Template */}
        {currentStep === 2 && (
          <div className="step-form">
            <h2>Select Onboarding Template</h2>
            <p className="step-description">Choose a template to define the user's initial setup.</p>

            {templates.length === 0 ? (
              <div className="empty-templates">
                <FileText size={48} />
                <h3>No Templates Available</h3>
                <p>Create an onboarding template first to use the wizard.</p>
              </div>
            ) : (
              <div className="templates-list">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`template-option ${selectedTemplateId === template.id ? 'selected' : ''}`}
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <div className="template-radio">
                      <input
                        type="radio"
                        name="template"
                        checked={selectedTemplateId === template.id}
                        onChange={() => handleTemplateSelect(template.id)}
                      />
                    </div>
                    <div className="template-info">
                      <div className="template-header">
                        <h3>{template.name}</h3>
                        {template.isDefault && <span className="default-badge">Default</span>}
                      </div>
                      {template.description && <p>{template.description}</p>}
                      <div className="template-meta">
                        {template.departmentName && (
                          <span><Building2 size={12} /> {template.departmentName}</span>
                        )}
                        {template.groupIds?.length > 0 && (
                          <span><Users size={12} /> {template.groupIds.length} groups</span>
                        )}
                        {template.sendWelcomeEmail && (
                          <span><Mail size={12} /> Welcome email</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="chevron" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review & Customize */}
        {currentStep === 3 && (
          <div className="step-form">
            <h2>Review & Customize</h2>
            <p className="step-description">Review the settings and make any adjustments.</p>

            <div className="review-section">
              <h3>User Details</h3>
              <div className="review-grid">
                <div className="review-item">
                  <span className="label">Name</span>
                  <span className="value">{userData.firstName} {userData.lastName}</span>
                </div>
                <div className="review-item">
                  <span className="label">Email</span>
                  <span className="value">{userData.email}</span>
                </div>
                {userData.jobTitle && (
                  <div className="review-item">
                    <span className="label">Job Title</span>
                    <span className="value">{userData.jobTitle}</span>
                  </div>
                )}
                {userData.departmentId && (
                  <div className="review-item">
                    <span className="label">Department</span>
                    <span className="value">{getDepartmentName(userData.departmentId)}</span>
                  </div>
                )}
                {userData.managerId && (
                  <div className="review-item">
                    <span className="label">Manager</span>
                    <span className="value">{getManagerName(userData.managerId)}</span>
                  </div>
                )}
                <div className="review-item">
                  <span className="label">Start Date</span>
                  <span className="value">{new Date(userData.startDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="review-section">
              <h3>Template: {selectedTemplate?.name}</h3>
              {selectedTemplate?.description && <p className="template-desc">{selectedTemplate.description}</p>}
            </div>

            <div className="review-section">
              <h3>Group Memberships</h3>
              <p className="section-hint">Select which groups the user should be added to.</p>
              <div className="groups-checklist">
                {groups.map((group) => (
                  <label key={group.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={customizations.groupIds.includes(group.id)}
                      onChange={() => toggleGroup(group.id)}
                    />
                    <span>{group.name}</span>
                    {group.email && <span className="group-email">({group.email})</span>}
                  </label>
                ))}
              </div>
            </div>

            <div className="review-section">
              <h3>Execution Schedule</h3>
              <div className="schedule-options">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="schedule"
                    checked={customizations.scheduleFor === 'now'}
                    onChange={() => setCustomizations((prev) => ({ ...prev, scheduleFor: 'now' }))}
                  />
                  <span>Execute immediately</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="schedule"
                    checked={customizations.scheduleFor === 'start_date'}
                    onChange={() => setCustomizations((prev) => ({ ...prev, scheduleFor: 'start_date' }))}
                  />
                  <span>Execute on start date ({new Date(userData.startDate).toLocaleDateString()})</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="schedule"
                    checked={customizations.scheduleFor === 'custom'}
                    onChange={() => setCustomizations((prev) => ({ ...prev, scheduleFor: 'custom' }))}
                  />
                  <span>Custom date</span>
                </label>
              </div>
              {customizations.scheduleFor === 'custom' && (
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <input
                    type="date"
                    value={customizations.customScheduleDate}
                    onChange={(e) => setCustomizations((prev) => ({ ...prev, customScheduleDate: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="review-section">
              <h3>Notifications</h3>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={customizations.sendWelcomeEmail}
                  onChange={(e) => setCustomizations((prev) => ({ ...prev, sendWelcomeEmail: e.target.checked }))}
                />
                <span>Send welcome email to user</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {currentStep === 4 && (
          <div className="step-form">
            <h2>Confirm Onboarding</h2>
            <p className="step-description">Review the summary and confirm to create the user.</p>

            <div className="confirmation-summary">
              <div className="summary-card">
                <div className="summary-header">
                  <User size={24} />
                  <div>
                    <h3>{userData.firstName} {userData.lastName}</h3>
                    <p>{userData.email}</p>
                  </div>
                </div>

                <div className="summary-details">
                  <div className="summary-row">
                    <span className="label">Template</span>
                    <span className="value">{selectedTemplate?.name}</span>
                  </div>
                  {userData.jobTitle && (
                    <div className="summary-row">
                      <span className="label">Job Title</span>
                      <span className="value">{userData.jobTitle}</span>
                    </div>
                  )}
                  {userData.departmentId && (
                    <div className="summary-row">
                      <span className="label">Department</span>
                      <span className="value">{getDepartmentName(userData.departmentId)}</span>
                    </div>
                  )}
                  {userData.managerId && (
                    <div className="summary-row">
                      <span className="label">Reports To</span>
                      <span className="value">{getManagerName(userData.managerId)}</span>
                    </div>
                  )}
                  <div className="summary-row">
                    <span className="label">Groups</span>
                    <span className="value">
                      {customizations.groupIds.length === 0
                        ? 'None'
                        : customizations.groupIds.map(getGroupName).join(', ')
                      }
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Schedule</span>
                    <span className="value">
                      {customizations.scheduleFor === 'now'
                        ? 'Execute immediately'
                        : customizations.scheduleFor === 'start_date'
                          ? `On ${new Date(userData.startDate).toLocaleDateString()}`
                          : `On ${new Date(customizations.customScheduleDate).toLocaleDateString()}`
                      }
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Welcome Email</span>
                    <span className="value">{customizations.sendWelcomeEmail ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>

              <div className="confirmation-warning">
                <AlertCircle size={16} />
                <span>
                  {customizations.scheduleFor === 'now'
                    ? 'The user account will be created immediately when you click Create User.'
                    : 'The onboarding action will be scheduled and executed at the specified time.'
                  }
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="step-footer">
        {currentStep > 1 && (
          <button className="btn-secondary" onClick={handleBack} disabled={submitting}>
            <ArrowLeft size={16} />
            Back
          </button>
        )}
        <div className="footer-spacer" />
        {currentStep < 4 ? (
          <button className="btn-primary" onClick={handleNext}>
            Next
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <RefreshCw className="animate-spin" size={16} />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Create User
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default NewUserOnboarding;
