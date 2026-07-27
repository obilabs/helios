/**
 * User Offboarding Page
 *
 * Multi-step wizard for offboarding a user.
 * Step 1: Select user to offboard
 * Step 2: Select template or customize
 * Step 3: Choose immediate or scheduled
 * Step 4: Confirmation
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  UserMinus,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  HardDrive,
  Mail,
  Shield,
  ChevronRight,
  Check,
  X,
  Users,
  UserCheck,
} from 'lucide-react';
import { authFetch } from '../config/api';
import './UserOffboarding.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string;
  department?: string;
  managerId?: string;
  managerName?: string;
  photoUrl?: string;
  directReportCount?: number;
}

interface DirectReport {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string;
  photoUrl?: string;
  newManagerId?: string;
}

interface ReassignmentMode {
  type: 'all_to_one' | 'individual';
  targetManagerId?: string;
  individualAssignments: Map<string, string>;
}

interface OffboardingTemplate {
  id: string;
  name: string;
  description?: string;
  driveAction: string;
  emailAction: string;
  accountAction: string;
  removeFromAllGroups: boolean;
  revokeOauthTokens: boolean;
  signOutAllDevices: boolean;
  isDefault: boolean;
}

interface OffboardingCustomization {
  templateId: string | null;
  lastDay: string;
  scheduleFor: 'now' | 'last_day' | 'custom';
  customScheduleDate: string;
  notifyManager: boolean;
  customMessage: string;
}

interface UserOffboardingProps {
  organizationId: string;
  preselectedUserId?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

const STEPS = [
  { id: 1, title: 'Select User', icon: UserMinus },
  { id: 2, title: 'Direct Reports', icon: Users },
  { id: 3, title: 'Template', icon: FileText },
  { id: 4, title: 'Schedule', icon: Clock },
  { id: 5, title: 'Confirm', icon: CheckCircle },
];

const driveActionLabels: Record<string, string> = {
  transfer_manager: 'Transfer to manager',
  transfer_user: 'Transfer to user',
  archive: 'Archive',
  keep: 'Keep files',
  delete: 'Delete',
};

const emailActionLabels: Record<string, string> = {
  forward_manager: 'Forward to manager',
  forward_user: 'Forward to user',
  auto_reply: 'Auto-reply',
  archive: 'Archive',
  keep: 'Keep',
};

const accountActionLabels: Record<string, string> = {
  suspend_immediately: 'Suspend immediately',
  suspend_on_last_day: 'Suspend on last day',
  keep_active: 'Keep active',
};

const UserOffboarding: React.FC<UserOffboardingProps> = ({
  organizationId,
  preselectedUserId,
  onComplete,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState(preselectedUserId ? 2 : 1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(preselectedUserId || null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<OffboardingTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<OffboardingTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Direct reports management
  const [directReports, setDirectReports] = useState<DirectReport[]>([]);
  const [loadingDirectReports, setLoadingDirectReports] = useState(false);
  const [reassignment, setReassignment] = useState<ReassignmentMode>({
    type: 'all_to_one',
    targetManagerId: undefined,
    individualAssignments: new Map(),
  });
  const [managerSearchQuery, setManagerSearchQuery] = useState('');

  const [customization, setCustomization] = useState<OffboardingCustomization>({
    templateId: null,
    lastDay: new Date().toISOString().split('T')[0],
    scheduleFor: 'now',
    customScheduleDate: '',
    notifyManager: true,
    customMessage: '',
  });

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, [organizationId]);

  // Update selected user when userId changes
  useEffect(() => {
    if (selectedUserId) {
      const user = users.find((u) => u.id === selectedUserId);
      setSelectedUser(user || null);
    }
  }, [selectedUserId, users]);

  // Fetch direct reports when user is selected and we move to step 2
  useEffect(() => {
    if (selectedUserId && currentStep === 2) {
      fetchDirectReports(selectedUserId);
    }
  }, [selectedUserId, currentStep]);

  const fetchDirectReports = async (userId: string) => {
    setLoadingDirectReports(true);
    try {
      const response = await authFetch(`/api/v1/organization/users/${userId}/direct-reports`);

      if (response.ok) {
        const data = await response.json();
        // Transform API response to match DirectReport interface
        const reports = (data.data || []).map((r: any) => {
          // Backend returns userId, name, title - need to transform
          const nameParts = (r.name || '').split(' ');
          return {
            id: r.userId,
            firstName: nameParts[0] || '',
            lastName: nameParts.slice(1).join(' ') || '',
            email: r.email,
            jobTitle: r.title,
            photoUrl: r.photoUrl,
          };
        });
        setDirectReports(reports);

        // Auto-suggest the departing user's manager as target
        if (selectedUser?.managerId) {
          setReassignment(prev => ({
            ...prev,
            targetManagerId: selectedUser.managerId,
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching direct reports:', err);
    } finally {
      setLoadingDirectReports(false);
    }
  };

  // Pre-select default template
  useEffect(() => {
    if (templates.length > 0 && !customization.templateId) {
      const defaultTemplate = templates.find((t) => t.isDefault);
      if (defaultTemplate) {
        setCustomization((prev) => ({ ...prev, templateId: defaultTemplate.id }));
        setSelectedTemplate(defaultTemplate);
      }
    }
  }, [templates]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [usersRes, templatesRes] = await Promise.all([
        authFetch('/api/v1/users?is_active=true'),
        authFetch('/api/v1/lifecycle/offboarding-templates'),
      ]);

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.data || []);

        // If preselected, find the user
        if (preselectedUserId) {
          const user = (data.data || []).find((u: User) => u.id === preselectedUserId);
          setSelectedUser(user || null);
        }
      }

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.data || []);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    const user = users.find((u) => u.id === userId);
    setSelectedUser(user || null);
  };

  const handleTemplateSelect = (templateId: string) => {
    setCustomization((prev) => ({ ...prev, templateId }));
    const template = templates.find((t) => t.id === templateId);
    setSelectedTemplate(template || null);
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!selectedUserId) {
        setError('Please select a user to offboard');
        return;
      }
    }

    // Step 2: Direct Reports - validate reassignments if there are any
    if (currentStep === 2 && directReports.length > 0) {
      if (reassignment.type === 'all_to_one') {
        if (!reassignment.targetManagerId) {
          setError('Please select a manager to reassign all direct reports to');
          return;
        }
      } else {
        // Individual mode - check all are assigned
        const unassigned = directReports.filter(
          dr => !reassignment.individualAssignments.get(dr.id)
        );
        if (unassigned.length > 0) {
          setError(`Please assign a new manager for all ${unassigned.length} direct reports`);
          return;
        }
      }
    }

    if (currentStep === 3) {
      if (!customization.templateId) {
        setError('Please select an offboarding template');
        return;
      }
    }

    if (currentStep === 4) {
      if (customization.scheduleFor === 'custom' && !customization.customScheduleDate) {
        setError('Please select a date for the scheduled offboarding');
        return;
      }
    }

    setError(null);
    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // Step 1: Reassign direct reports first (if any)
      if (directReports.length > 0 && selectedUserId) {
        const hasReassignments = reassignment.type === 'all_to_one'
          ? !!reassignment.targetManagerId
          : reassignment.individualAssignments.size > 0;

        if (hasReassignments) {
          const reassignPayload = reassignment.type === 'all_to_one'
            ? {
                mode: 'all_to_one' as const,
                targetManagerId: reassignment.targetManagerId,
              }
            : {
                mode: 'individual' as const,
                assignments: Array.from(reassignment.individualAssignments.entries())
                  .map(([reportId, newManagerId]) => ({ reportId, newManagerId })),
              };

          const reassignResponse = await authFetch(`/api/v1/organization/users/${selectedUserId}/reassign-reports`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(reassignPayload),
          });

          if (!reassignResponse.ok) {
            const data = await reassignResponse.json();
            throw new Error(data.error || 'Failed to reassign direct reports');
          }
        }
      }

      // Step 2: Determine schedule time
      let scheduledFor: string | undefined;
      if (customization.scheduleFor === 'last_day' && customization.lastDay) {
        scheduledFor = new Date(customization.lastDay).toISOString();
      } else if (customization.scheduleFor === 'custom' && customization.customScheduleDate) {
        scheduledFor = new Date(customization.customScheduleDate).toISOString();
      }

      // Step 3: Call the lifecycle offboard endpoint
      const payload = {
        userId: selectedUserId,
        templateId: customization.templateId,
        scheduledFor: scheduledFor || undefined,
        lastDay: customization.lastDay,
        configOverrides: {
          notifyManager: customization.notifyManager,
          notificationMessage: customization.customMessage || undefined,
        },
      };

      const response = await authFetch('/api/v1/lifecycle/offboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to initiate offboarding');
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('Error initiating offboarding:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.firstName.toLowerCase().includes(query) ||
      user.lastName.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.jobTitle?.toLowerCase().includes(query) ||
      user.department?.toLowerCase().includes(query)
    );
  });

  const countSecurityFeatures = (template: OffboardingTemplate) => {
    let count = 0;
    if (template.removeFromAllGroups) count++;
    if (template.revokeOauthTokens) count++;
    if (template.signOutAllDevices) count++;
    return count;
  };

  if (loading) {
    return (
      <div className="user-offboarding">
        <div className="loading-state">
          <RefreshCw className="animate-spin" size={24} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="user-offboarding">
        <div className="success-state">
          <div className="success-icon">
            <CheckCircle size={64} />
          </div>
          <h2>Offboarding Initiated</h2>
          <p>
            {customization.scheduleFor === 'now'
              ? `${selectedUser?.firstName} ${selectedUser?.lastName}'s offboarding has started.`
              : `Offboarding for ${selectedUser?.firstName} ${selectedUser?.lastName} has been scheduled.`
            }
          </p>
          {customization.notifyManager && selectedUser?.managerName && (
            <p className="success-email">
              {selectedUser.managerName} will be notified.
            </p>
          )}
          <div className="success-actions">
            <button className="btn-secondary" onClick={onComplete}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-offboarding">
      <div className="offboarding-header">
        <button className="back-btn" onClick={onCancel}>
          <ArrowLeft size={16} />
          Cancel
        </button>
        <h1>Offboard User</h1>
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
        {/* Step 1: Select User */}
        {currentStep === 1 && (
          <div className="step-form">
            <h2>Select User to Offboard</h2>
            <p className="step-description">Search for and select the user you want to offboard.</p>

            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by name, email, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-btn" onClick={() => setSearchQuery('')}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="users-list">
              {filteredUsers.length === 0 ? (
                <div className="empty-users">
                  <UserMinus size={48} />
                  <p>No users found</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`user-option ${selectedUserId === user.id ? 'selected' : ''}`}
                    onClick={() => handleUserSelect(user.id)}
                  >
                    <div className="user-radio">
                      <input
                        type="radio"
                        name="user"
                        checked={selectedUserId === user.id}
                        onChange={() => handleUserSelect(user.id)}
                      />
                    </div>
                    <div className="user-avatar">
                      {user.photoUrl ? (
                        <img src={user.photoUrl} alt={`${user.firstName} ${user.lastName}`} />
                      ) : (
                        <div className="avatar-placeholder">
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                      )}
                    </div>
                    <div className="user-info">
                      <h3>{user.firstName} {user.lastName}</h3>
                      <p>{user.email}</p>
                      <div className="user-meta">
                        {user.jobTitle && <span>{user.jobTitle}</span>}
                        {user.department && <span>{user.department}</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} className="chevron" />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 2: Direct Reports */}
        {currentStep === 2 && (
          <div className="step-form">
            <h2>Reassign Direct Reports</h2>
            <p className="step-description">
              {directReports.length > 0
                ? `${selectedUser?.firstName} has ${directReports.length} direct report${directReports.length > 1 ? 's' : ''}. Choose how to reassign them.`
                : `${selectedUser?.firstName} has no direct reports. You can proceed to the next step.`
              }
            </p>

            {selectedUser && (
              <div className="selected-user-card">
                <div className="user-avatar">
                  {selectedUser.photoUrl ? (
                    <img src={selectedUser.photoUrl} alt={`${selectedUser.firstName} ${selectedUser.lastName}`} />
                  ) : (
                    <div className="avatar-placeholder">
                      {selectedUser.firstName[0]}{selectedUser.lastName[0]}
                    </div>
                  )}
                </div>
                <div>
                  <h3>{selectedUser.firstName} {selectedUser.lastName}</h3>
                  <p>{selectedUser.email}</p>
                </div>
              </div>
            )}

            {loadingDirectReports ? (
              <div className="loading-state" style={{ padding: '40px' }}>
                <RefreshCw className="animate-spin" size={24} />
                <span>Loading direct reports...</span>
              </div>
            ) : directReports.length === 0 ? (
              <div className="empty-direct-reports">
                <UserCheck size={48} />
                <h3>No Direct Reports</h3>
                <p>This user has no one reporting to them. You can proceed to the next step.</p>
              </div>
            ) : (
              <>
                {/* Reassignment mode selection */}
                <div className="reassignment-mode">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="reassignment-mode"
                      checked={reassignment.type === 'all_to_one'}
                      onChange={() => setReassignment(prev => ({ ...prev, type: 'all_to_one' }))}
                    />
                    <div className="radio-content">
                      <span className="radio-title">Transfer all to one manager</span>
                      <span className="radio-description">Assign all direct reports to a single person</span>
                    </div>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="reassignment-mode"
                      checked={reassignment.type === 'individual'}
                      onChange={() => setReassignment(prev => ({ ...prev, type: 'individual' }))}
                    />
                    <div className="radio-content">
                      <span className="radio-title">Assign individually</span>
                      <span className="radio-description">Choose a different manager for each person</span>
                    </div>
                  </label>
                </div>

                {/* All to one mode */}
                {reassignment.type === 'all_to_one' && (
                  <div className="reassignment-target">
                    <label>Select new manager for all {directReports.length} direct reports:</label>
                    <div className="manager-search">
                      <Search size={16} />
                      <input
                        type="text"
                        placeholder="Search for a manager..."
                        value={managerSearchQuery}
                        onChange={(e) => setManagerSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="manager-list">
                      {users
                        .filter(u => u.id !== selectedUserId && !directReports.some(dr => dr.id === u.id))
                        .filter(u => {
                          if (!managerSearchQuery) return true;
                          const q = managerSearchQuery.toLowerCase();
                          return u.firstName.toLowerCase().includes(q) ||
                                 u.lastName.toLowerCase().includes(q) ||
                                 u.email.toLowerCase().includes(q);
                        })
                        .slice(0, 10)
                        .map(user => (
                          <div
                            key={user.id}
                            className={`manager-option ${reassignment.targetManagerId === user.id ? 'selected' : ''}`}
                            onClick={() => setReassignment(prev => ({ ...prev, targetManagerId: user.id }))}
                          >
                            <div className="user-avatar-small">
                              {user.photoUrl ? (
                                <img src={user.photoUrl} alt="" />
                              ) : (
                                <span>{user.firstName[0]}{user.lastName[0]}</span>
                              )}
                            </div>
                            <div className="manager-info">
                              <span className="manager-name">{user.firstName} {user.lastName}</span>
                              <span className="manager-title">{user.jobTitle || user.email}</span>
                            </div>
                            {reassignment.targetManagerId === user.id && <Check size={16} className="check-icon" />}
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}

                {/* Individual mode */}
                {reassignment.type === 'individual' && (
                  <div className="individual-assignments">
                    <label>Assign each direct report to their new manager:</label>
                    <div className="direct-reports-list">
                      {directReports.map(report => {
                        const assignedManagerId = reassignment.individualAssignments.get(report.id);
                        const assignedManager = users.find(u => u.id === assignedManagerId);
                        return (
                          <div key={report.id} className="direct-report-row">
                            <div className="direct-report-info">
                              <div className="user-avatar-small">
                                {report.photoUrl ? (
                                  <img src={report.photoUrl} alt="" />
                                ) : (
                                  <span>{report.firstName[0]}{report.lastName[0]}</span>
                                )}
                              </div>
                              <div>
                                <span className="report-name">{report.firstName} {report.lastName}</span>
                                <span className="report-title">{report.jobTitle || report.email}</span>
                              </div>
                            </div>
                            <div className="assignment-select">
                              <select
                                value={assignedManagerId || ''}
                                onChange={(e) => {
                                  const newMap = new Map(reassignment.individualAssignments);
                                  if (e.target.value) {
                                    newMap.set(report.id, e.target.value);
                                  } else {
                                    newMap.delete(report.id);
                                  }
                                  setReassignment(prev => ({ ...prev, individualAssignments: newMap }));
                                }}
                              >
                                <option value="">Select manager...</option>
                                {users
                                  .filter(u => u.id !== selectedUserId && u.id !== report.id)
                                  .map(u => (
                                    <option key={u.id} value={u.id}>
                                      {u.firstName} {u.lastName}
                                    </option>
                                  ))
                                }
                              </select>
                              {assignedManager && (
                                <span className="assigned-badge">
                                  <Check size={12} /> Assigned
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="reassignment-summary">
                  <Users size={16} />
                  <span>
                    {reassignment.type === 'all_to_one' && reassignment.targetManagerId
                      ? `All ${directReports.length} direct reports will be reassigned to ${users.find(u => u.id === reassignment.targetManagerId)?.firstName} ${users.find(u => u.id === reassignment.targetManagerId)?.lastName}`
                      : reassignment.type === 'individual'
                        ? `${reassignment.individualAssignments.size} of ${directReports.length} direct reports assigned`
                        : 'Select a manager to continue'
                    }
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3: Select Template */}
        {currentStep === 3 && (
          <div className="step-form">
            <h2>Select Offboarding Template</h2>
            <p className="step-description">Choose a template to define the offboarding process.</p>

            {selectedUser && (
              <div className="selected-user-card">
                <div className="user-avatar">
                  {selectedUser.photoUrl ? (
                    <img src={selectedUser.photoUrl} alt={`${selectedUser.firstName} ${selectedUser.lastName}`} />
                  ) : (
                    <div className="avatar-placeholder">
                      {selectedUser.firstName[0]}{selectedUser.lastName[0]}
                    </div>
                  )}
                </div>
                <div>
                  <h3>{selectedUser.firstName} {selectedUser.lastName}</h3>
                  <p>{selectedUser.email}</p>
                </div>
              </div>
            )}

            {templates.length === 0 ? (
              <div className="empty-templates">
                <FileText size={48} />
                <h3>No Templates Available</h3>
                <p>Create an offboarding template first to use the wizard.</p>
              </div>
            ) : (
              <div className="templates-list">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`template-option ${customization.templateId === template.id ? 'selected' : ''}`}
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <div className="template-radio">
                      <input
                        type="radio"
                        name="template"
                        checked={customization.templateId === template.id}
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
                        <span><HardDrive size={12} /> {driveActionLabels[template.driveAction] || template.driveAction}</span>
                        <span><Mail size={12} /> {emailActionLabels[template.emailAction] || template.emailAction}</span>
                        <span><Shield size={12} /> {countSecurityFeatures(template)} security actions</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="chevron" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Schedule */}
        {currentStep === 4 && (
          <div className="step-form">
            <h2>Schedule Offboarding</h2>
            <p className="step-description">Configure when the offboarding should occur.</p>

            <div className="form-group">
              <label htmlFor="lastDay">User's Last Day</label>
              <input
                id="lastDay"
                type="date"
                value={customization.lastDay}
                onChange={(e) => setCustomization((prev) => ({ ...prev, lastDay: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>When should offboarding run?</label>
              <div className="schedule-options">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="schedule"
                    checked={customization.scheduleFor === 'now'}
                    onChange={() => setCustomization((prev) => ({ ...prev, scheduleFor: 'now' }))}
                  />
                  <div className="radio-content">
                    <span className="radio-title">Execute immediately</span>
                    <span className="radio-description">Start the offboarding process right now</span>
                  </div>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="schedule"
                    checked={customization.scheduleFor === 'last_day'}
                    onChange={() => setCustomization((prev) => ({ ...prev, scheduleFor: 'last_day' }))}
                  />
                  <div className="radio-content">
                    <span className="radio-title">Execute on last day</span>
                    <span className="radio-description">Run on {new Date(customization.lastDay).toLocaleDateString()}</span>
                  </div>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="schedule"
                    checked={customization.scheduleFor === 'custom'}
                    onChange={() => setCustomization((prev) => ({ ...prev, scheduleFor: 'custom' }))}
                  />
                  <div className="radio-content">
                    <span className="radio-title">Custom date</span>
                    <span className="radio-description">Choose a specific date and time</span>
                  </div>
                </label>
              </div>
              {customization.scheduleFor === 'custom' && (
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <input
                    type="date"
                    value={customization.customScheduleDate}
                    onChange={(e) => setCustomization((prev) => ({ ...prev, customScheduleDate: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={customization.notifyManager}
                  onChange={(e) => setCustomization((prev) => ({ ...prev, notifyManager: e.target.checked }))}
                />
                <span>Notify user's manager</span>
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="customMessage">Additional notes (optional)</label>
              <textarea
                id="customMessage"
                value={customization.customMessage}
                onChange={(e) => setCustomization((prev) => ({ ...prev, customMessage: e.target.value }))}
                placeholder="Add any special instructions or notes..."
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 5: Confirm */}
        {currentStep === 5 && (
          <div className="step-form">
            <h2>Confirm Offboarding</h2>
            <p className="step-description">Review the details and confirm to start the offboarding process.</p>

            <div className="warning-banner">
              <AlertTriangle size={20} />
              <div>
                <strong>This action cannot be undone</strong>
                <p>Once confirmed, the offboarding process will begin and the user's access will be revoked according to the selected template.</p>
              </div>
            </div>

            <div className="confirmation-summary">
              <div className="summary-card">
                <div className="summary-header danger">
                  <UserMinus size={24} />
                  <div>
                    <h3>{selectedUser?.firstName} {selectedUser?.lastName}</h3>
                    <p>{selectedUser?.email}</p>
                  </div>
                </div>

                <div className="summary-details">
                  {directReports.length > 0 && (
                    <div className="summary-row highlight">
                      <span className="label">Direct Reports</span>
                      <span className="value">
                        {directReports.length} will be reassigned
                        {reassignment.type === 'all_to_one' && reassignment.targetManagerId && (
                          <> to {users.find(u => u.id === reassignment.targetManagerId)?.firstName} {users.find(u => u.id === reassignment.targetManagerId)?.lastName}</>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="summary-row">
                    <span className="label">Template</span>
                    <span className="value">{selectedTemplate?.name}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Last Day</span>
                    <span className="value">{new Date(customization.lastDay).toLocaleDateString()}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Schedule</span>
                    <span className="value">
                      {customization.scheduleFor === 'now'
                        ? 'Execute immediately'
                        : customization.scheduleFor === 'last_day'
                          ? `On ${new Date(customization.lastDay).toLocaleDateString()}`
                          : `On ${new Date(customization.customScheduleDate).toLocaleDateString()}`
                      }
                    </span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Drive Files</span>
                    <span className="value">{driveActionLabels[selectedTemplate?.driveAction || ''] || selectedTemplate?.driveAction}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Email</span>
                    <span className="value">{emailActionLabels[selectedTemplate?.emailAction || ''] || selectedTemplate?.emailAction}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Account</span>
                    <span className="value">{accountActionLabels[selectedTemplate?.accountAction || ''] || selectedTemplate?.accountAction}</span>
                  </div>
                  <div className="summary-row">
                    <span className="label">Notify Manager</span>
                    <span className="value">{customization.notifyManager ? 'Yes' : 'No'}</span>
                  </div>
                </div>
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
        {currentStep < 5 ? (
          <button className="btn-primary" onClick={handleNext}>
            Next
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            className="btn-danger"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <RefreshCw className="animate-spin" size={16} />
                Processing...
              </>
            ) : (
              <>
                <UserMinus size={16} />
                Confirm Offboarding
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default UserOffboarding;
