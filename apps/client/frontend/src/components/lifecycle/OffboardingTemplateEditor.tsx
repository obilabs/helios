/**
 * Offboarding Template Editor
 *
 * Form for creating and editing offboarding templates.
 * Supports all template settings including data handling, access revocation,
 * and account management options.
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Mail,
  Calendar,
  Shield,
  UserX,
  Bell,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Info,
  FileSignature,
  Clock,
} from 'lucide-react';
import { authFetch } from '../../config/api';
import TimelineEditor, { type TimelineEntry } from './TimelineEditor';
import './OnboardingTemplateEditor.css'; // Reuse the same styles

type DriveAction = 'transfer_manager' | 'transfer_user' | 'archive' | 'keep' | 'delete';
type EmailAction = 'forward_manager' | 'forward_user' | 'auto_reply' | 'archive' | 'keep';
type AccountAction = 'suspend_immediately' | 'suspend_on_last_day' | 'keep_active';
type LicenseAction = 'remove_immediately' | 'remove_on_suspension' | 'keep';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface OffboardingTemplate {
  id?: string;
  name: string;
  description: string;

  // Drive handling
  driveAction: DriveAction;
  driveTransferToUserId: string;
  driveArchiveSharedDriveId: string;
  driveDeleteAfterDays: number;

  // Email handling
  emailAction: EmailAction;
  emailForwardToUserId: string;
  emailForwardDurationDays: number;
  emailAutoReplyMessage: string;
  emailAutoReplySubject: string;

  // Calendar handling
  calendarDeclineFutureMeetings: boolean;
  calendarTransferMeetingOwnership: boolean;
  calendarTransferToManager: boolean;
  calendarTransferToUserId: string;

  // Access revocation
  removeFromAllGroups: boolean;
  removeFromSharedDrives: boolean;
  revokeOauthTokens: boolean;
  revokeAppPasswords: boolean;
  signOutAllDevices: boolean;
  resetPassword: boolean;

  // Signature
  removeSignature: boolean;
  setOffboardingSignature: boolean;
  offboardingSignatureText: string;

  // Mobile devices
  wipeMobileDevices: boolean;
  wipeRequiresConfirmation: boolean;

  // Account handling
  accountAction: AccountAction;
  deleteAccount: boolean;
  deleteAfterDays: number;

  // License handling
  licenseAction: LicenseAction;

  // Notifications
  notifyManager: boolean;
  notifyItAdmin: boolean;
  notifyHr: boolean;
  notificationEmailAddresses: string[];
  notificationMessage: string;

  // Status
  isActive: boolean;
  isDefault: boolean;

  // Timeline
  timeline: TimelineEntry[];
}

interface OffboardingTemplateEditorProps {
  templateId?: string;
  organizationId: string;
  onSave?: (template: OffboardingTemplate) => void;
  onCancel?: () => void;
}

const defaultTemplate: OffboardingTemplate = {
  name: '',
  description: '',

  // Drive handling
  driveAction: 'transfer_manager',
  driveTransferToUserId: '',
  driveArchiveSharedDriveId: '',
  driveDeleteAfterDays: 30,

  // Email handling
  emailAction: 'forward_manager',
  emailForwardToUserId: '',
  emailForwardDurationDays: 30,
  emailAutoReplyMessage: `Thank you for your email. {{first_name}} {{last_name}} is no longer with {{company_name}}. For assistance, please contact {{manager_email}}.`,
  emailAutoReplySubject: 'Out of Office',

  // Calendar handling
  calendarDeclineFutureMeetings: true,
  calendarTransferMeetingOwnership: true,
  calendarTransferToManager: true,
  calendarTransferToUserId: '',

  // Access revocation
  removeFromAllGroups: true,
  removeFromSharedDrives: true,
  revokeOauthTokens: true,
  revokeAppPasswords: true,
  signOutAllDevices: true,
  resetPassword: true,

  // Signature
  removeSignature: true,
  setOffboardingSignature: false,
  offboardingSignatureText: '',

  // Mobile devices
  wipeMobileDevices: false,
  wipeRequiresConfirmation: true,

  // Account handling
  accountAction: 'suspend_immediately',
  deleteAccount: false,
  deleteAfterDays: 90,

  // License handling
  licenseAction: 'remove_on_suspension',

  // Notifications
  notifyManager: true,
  notifyItAdmin: true,
  notifyHr: false,
  notificationEmailAddresses: [],
  notificationMessage: '',

  // Status
  isActive: true,
  isDefault: false,

  // Timeline
  timeline: [],
};

const driveActionLabels: Record<DriveAction, { label: string; description: string }> = {
  transfer_manager: { label: 'Transfer to manager', description: 'All Drive files will be transferred to the user\'s manager' },
  transfer_user: { label: 'Transfer to specific user', description: 'All Drive files will be transferred to a designated user' },
  archive: { label: 'Archive to Shared Drive', description: 'All Drive files will be copied to a Shared Drive for archival' },
  keep: { label: 'Keep files', description: 'Drive files will remain in the user\'s account' },
  delete: { label: 'Delete files', description: 'All Drive files will be permanently deleted after retention period' },
};

const emailActionLabels: Record<EmailAction, { label: string; description: string }> = {
  forward_manager: { label: 'Forward to manager', description: 'New emails will be forwarded to the user\'s manager' },
  forward_user: { label: 'Forward to specific user', description: 'New emails will be forwarded to a designated user' },
  auto_reply: { label: 'Set auto-reply', description: 'An automatic reply will be sent to incoming emails' },
  archive: { label: 'Archive emails', description: 'Emails will be archived and no forwarding will occur' },
  keep: { label: 'Keep mailbox', description: 'Mailbox will remain accessible without changes' },
};

const accountActionLabels: Record<AccountAction, { label: string; description: string }> = {
  suspend_immediately: { label: 'Suspend immediately', description: 'Account will be suspended as soon as offboarding runs' },
  suspend_on_last_day: { label: 'Suspend on last day', description: 'Account will be suspended on the user\'s last day' },
  keep_active: { label: 'Keep active', description: 'Account will remain active (not recommended)' },
};

const licenseActionLabels: Record<LicenseAction, { label: string; description: string }> = {
  remove_immediately: { label: 'Remove immediately', description: 'Licenses will be removed as soon as offboarding runs' },
  remove_on_suspension: { label: 'Remove on suspension', description: 'Licenses will be removed when account is suspended' },
  keep: { label: 'Keep licenses', description: 'Licenses will remain assigned to the account' },
};

const OffboardingTemplateEditor: React.FC<OffboardingTemplateEditorProps> = ({
  templateId,
  organizationId,
  onSave,
  onCancel,
}) => {
  const [template, setTemplate] = useState<OffboardingTemplate>(defaultTemplate);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    drive: true,
    email: false,
    calendar: false,
    access: true,
    signature: false,
    mobile: false,
    account: true,
    notifications: false,
    timeline: false,
  });
  const [newEmailAddress, setNewEmailAddress] = useState('');

  const isEditing = !!templateId;

  // Fetch template if editing
  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  // Fetch users for selection
  useEffect(() => {
    fetchUsers();
  }, [organizationId]);

  const fetchTemplate = async () => {
    try {
      const response = await authFetch(
        `/api/v1/lifecycle/offboarding-templates/${templateId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch template');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setTemplate({
          ...defaultTemplate,
          ...data.data,
          notificationEmailAddresses: data.data.notificationEmailAddresses || [],
          timeline: data.data.timeline || [],
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await authFetch('/api/v1/users');

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUsers(data.data || []);
        }
      }
    } catch (err) {
      console.error('Error fetching users:', err);
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
        ? `/api/v1/lifecycle/offboarding-templates/${templateId}`
        : '/api/v1/lifecycle/offboarding-templates';

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

  const addEmailAddress = () => {
    if (newEmailAddress && newEmailAddress.includes('@')) {
      setTemplate((prev) => ({
        ...prev,
        notificationEmailAddresses: [...prev.notificationEmailAddresses, newEmailAddress],
      }));
      setNewEmailAddress('');
    }
  };

  const removeEmailAddress = (email: string) => {
    setTemplate((prev) => ({
      ...prev,
      notificationEmailAddresses: prev.notificationEmailAddresses.filter((e) => e !== email),
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
        <h1>{isEditing ? 'Edit Template' : 'New Offboarding Template'}</h1>
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
                  placeholder="e.g., Standard Departure, Immediate Termination"
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

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.isActive}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span>Active (can be used for offboarding)</span>
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

        {/* Drive Handling */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('drive')}
          >
            <div className="section-title">
              <HardDrive size={18} />
              <span>Drive Data Handling</span>
            </div>
            {expandedSections.drive ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.drive && (
            <div className="section-content">
              <div className="form-group">
                <label>What should happen to Drive files?</label>
                <div className="radio-group">
                  {(Object.entries(driveActionLabels) as [DriveAction, typeof driveActionLabels[DriveAction]][]).map(([value, info]) => (
                    <label key={value} className="radio-label">
                      <input
                        type="radio"
                        name="driveAction"
                        value={value}
                        checked={template.driveAction === value}
                        onChange={() => setTemplate((prev) => ({ ...prev, driveAction: value }))}
                      />
                      <div className="radio-content">
                        <span className="radio-title">{info.label}</span>
                        <span className="radio-description">{info.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {template.driveAction === 'transfer_user' && (
                <div className="form-group">
                  <label htmlFor="driveTransferTo">Transfer files to</label>
                  <select
                    id="driveTransferTo"
                    value={template.driveTransferToUserId}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, driveTransferToUserId: e.target.value }))}
                  >
                    <option value="">Select a user...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {template.driveAction === 'delete' && (
                <div className="form-group">
                  <label htmlFor="driveDeleteDays">Delete files after (days)</label>
                  <input
                    id="driveDeleteDays"
                    type="number"
                    min="1"
                    max="365"
                    value={template.driveDeleteAfterDays}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, driveDeleteAfterDays: parseInt(e.target.value) || 30 }))}
                  />
                  <p className="form-hint">Files will be held for this many days before permanent deletion</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email Handling */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('email')}
          >
            <div className="section-title">
              <Mail size={18} />
              <span>Email Handling</span>
            </div>
            {expandedSections.email ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.email && (
            <div className="section-content">
              <div className="form-group">
                <label>What should happen to incoming emails?</label>
                <div className="radio-group">
                  {(Object.entries(emailActionLabels) as [EmailAction, typeof emailActionLabels[EmailAction]][]).map(([value, info]) => (
                    <label key={value} className="radio-label">
                      <input
                        type="radio"
                        name="emailAction"
                        value={value}
                        checked={template.emailAction === value}
                        onChange={() => setTemplate((prev) => ({ ...prev, emailAction: value }))}
                      />
                      <div className="radio-content">
                        <span className="radio-title">{info.label}</span>
                        <span className="radio-description">{info.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {template.emailAction === 'forward_user' && (
                <div className="form-group">
                  <label htmlFor="emailForwardTo">Forward emails to</label>
                  <select
                    id="emailForwardTo"
                    value={template.emailForwardToUserId}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, emailForwardToUserId: e.target.value }))}
                  >
                    <option value="">Select a user...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(template.emailAction === 'forward_manager' || template.emailAction === 'forward_user') && (
                <div className="form-group">
                  <label htmlFor="forwardDuration">Forward for (days)</label>
                  <input
                    id="forwardDuration"
                    type="number"
                    min="1"
                    max="365"
                    value={template.emailForwardDurationDays}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, emailForwardDurationDays: parseInt(e.target.value) || 30 }))}
                  />
                  <p className="form-hint">Email forwarding will automatically stop after this period</p>
                </div>
              )}

              {template.emailAction === 'auto_reply' && (
                <>
                  <div className="form-group">
                    <label htmlFor="autoReplySubject">Auto-reply Subject</label>
                    <input
                      id="autoReplySubject"
                      type="text"
                      value={template.emailAutoReplySubject}
                      onChange={(e) => setTemplate((prev) => ({ ...prev, emailAutoReplySubject: e.target.value }))}
                      placeholder="Out of Office"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="autoReplyMessage">Auto-reply Message</label>
                    <textarea
                      id="autoReplyMessage"
                      value={template.emailAutoReplyMessage}
                      onChange={(e) => setTemplate((prev) => ({ ...prev, emailAutoReplyMessage: e.target.value }))}
                      rows={4}
                    />
                    <p className="form-hint">
                      Available variables: {'{{first_name}}'}, {'{{last_name}}'}, {'{{company_name}}'}, {'{{manager_email}}'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Calendar Handling */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('calendar')}
          >
            <div className="section-title">
              <Calendar size={18} />
              <span>Calendar Handling</span>
            </div>
            {expandedSections.calendar ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.calendar && (
            <div className="section-content">
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.calendarDeclineFutureMeetings}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, calendarDeclineFutureMeetings: e.target.checked }))}
                  />
                  <span>Decline all future meetings</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.calendarTransferMeetingOwnership}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, calendarTransferMeetingOwnership: e.target.checked }))}
                  />
                  <span>Transfer ownership of meetings they organize</span>
                </label>
              </div>

              {template.calendarTransferMeetingOwnership && (
                <>
                  <div className="form-group checkbox-group" style={{ marginTop: '12px' }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={template.calendarTransferToManager}
                        onChange={(e) => setTemplate((prev) => ({
                          ...prev,
                          calendarTransferToManager: e.target.checked,
                          calendarTransferToUserId: e.target.checked ? '' : prev.calendarTransferToUserId
                        }))}
                      />
                      <span>Transfer to manager</span>
                    </label>
                  </div>

                  {!template.calendarTransferToManager && (
                    <div className="form-group">
                      <label htmlFor="calendarTransferTo">Transfer meetings to</label>
                      <select
                        id="calendarTransferTo"
                        value={template.calendarTransferToUserId}
                        onChange={(e) => setTemplate((prev) => ({ ...prev, calendarTransferToUserId: e.target.value }))}
                      >
                        <option value="">Select a user...</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.firstName} {user.lastName} ({user.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Access Revocation */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('access')}
          >
            <div className="section-title">
              <Shield size={18} />
              <span>Access Revocation</span>
              <span className="badge">
                {[
                  template.removeFromAllGroups,
                  template.removeFromSharedDrives,
                  template.revokeOauthTokens,
                  template.revokeAppPasswords,
                  template.signOutAllDevices,
                  template.resetPassword
                ].filter(Boolean).length}
              </span>
            </div>
            {expandedSections.access ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.access && (
            <div className="section-content">
              <p className="form-hint" style={{ marginBottom: '16px' }}>
                Select security actions to perform during offboarding. More actions = more secure.
              </p>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.removeFromAllGroups}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, removeFromAllGroups: e.target.checked }))}
                  />
                  <span>Remove from all groups</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.removeFromSharedDrives}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, removeFromSharedDrives: e.target.checked }))}
                  />
                  <span>Remove from all Shared Drives</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.revokeOauthTokens}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, revokeOauthTokens: e.target.checked }))}
                  />
                  <span>Revoke OAuth tokens (third-party app access)</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.revokeAppPasswords}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, revokeAppPasswords: e.target.checked }))}
                  />
                  <span>Revoke app passwords</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.signOutAllDevices}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, signOutAllDevices: e.target.checked }))}
                  />
                  <span>Sign out from all devices</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.resetPassword}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, resetPassword: e.target.checked }))}
                  />
                  <span>Reset password to random value</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Signature */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('signature')}
          >
            <div className="section-title">
              <FileSignature size={18} />
              <span>Email Signature</span>
            </div>
            {expandedSections.signature ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.signature && (
            <div className="section-content">
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.removeSignature}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, removeSignature: e.target.checked }))}
                  />
                  <span>Remove email signature</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.setOffboardingSignature}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, setOffboardingSignature: e.target.checked }))}
                  />
                  <span>Set offboarding signature (shows alternative contact)</span>
                </label>
              </div>

              {template.setOffboardingSignature && (
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label htmlFor="offboardingSignature">Offboarding Signature Text</label>
                  <textarea
                    id="offboardingSignature"
                    value={template.offboardingSignatureText}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, offboardingSignatureText: e.target.value }))}
                    placeholder="This mailbox is no longer monitored. Please contact support@company.com for assistance."
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile Devices */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('mobile')}
          >
            <div className="section-title">
              <Smartphone size={18} />
              <span>Mobile Devices</span>
            </div>
            {expandedSections.mobile ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.mobile && (
            <div className="section-content">
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.wipeMobileDevices}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, wipeMobileDevices: e.target.checked }))}
                  />
                  <span>Remote wipe mobile devices (company-owned devices only)</span>
                </label>
              </div>

              {template.wipeMobileDevices && (
                <div className="form-group checkbox-group" style={{ marginTop: '12px', marginLeft: '28px' }}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={template.wipeRequiresConfirmation}
                      onChange={(e) => setTemplate((prev) => ({ ...prev, wipeRequiresConfirmation: e.target.checked }))}
                    />
                    <span>Require manual confirmation before wiping</span>
                  </label>
                </div>
              )}

              <p className="form-hint" style={{ marginTop: '12px' }}>
                Warning: Remote wipe will erase all data on company-managed devices. Use with caution.
              </p>
            </div>
          )}
        </div>

        {/* Account Handling */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('account')}
          >
            <div className="section-title">
              <UserX size={18} />
              <span>Account & License</span>
            </div>
            {expandedSections.account ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.account && (
            <div className="section-content">
              <div className="form-group">
                <label>When should the account be suspended?</label>
                <div className="radio-group">
                  {(Object.entries(accountActionLabels) as [AccountAction, typeof accountActionLabels[AccountAction]][]).map(([value, info]) => (
                    <label key={value} className="radio-label">
                      <input
                        type="radio"
                        name="accountAction"
                        value={value}
                        checked={template.accountAction === value}
                        onChange={() => setTemplate((prev) => ({ ...prev, accountAction: value }))}
                      />
                      <div className="radio-content">
                        <span className="radio-title">{info.label}</span>
                        <span className="radio-description">{info.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '20px' }}>
                <label>When should licenses be removed?</label>
                <div className="radio-group">
                  {(Object.entries(licenseActionLabels) as [LicenseAction, typeof licenseActionLabels[LicenseAction]][]).map(([value, info]) => (
                    <label key={value} className="radio-label">
                      <input
                        type="radio"
                        name="licenseAction"
                        value={value}
                        checked={template.licenseAction === value}
                        onChange={() => setTemplate((prev) => ({ ...prev, licenseAction: value }))}
                      />
                      <div className="radio-content">
                        <span className="radio-title">{info.label}</span>
                        <span className="radio-description">{info.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group checkbox-group" style={{ marginTop: '20px' }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.deleteAccount}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, deleteAccount: e.target.checked }))}
                  />
                  <span>Schedule account for deletion</span>
                </label>
              </div>

              {template.deleteAccount && (
                <div className="form-group" style={{ marginLeft: '28px' }}>
                  <label htmlFor="deleteAfterDays">Delete account after (days)</label>
                  <input
                    id="deleteAfterDays"
                    type="number"
                    min="30"
                    max="365"
                    value={template.deleteAfterDays}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, deleteAfterDays: parseInt(e.target.value) || 90 }))}
                  />
                  <p className="form-hint">Account will be permanently deleted after this retention period</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="form-section">
          <button
            className="section-header"
            onClick={() => toggleSection('notifications')}
          >
            <div className="section-title">
              <Bell size={18} />
              <span>Notifications</span>
            </div>
            {expandedSections.notifications ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.notifications && (
            <div className="section-content">
              <p className="form-hint" style={{ marginBottom: '16px' }}>
                Select who should be notified when this offboarding template is executed.
              </p>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.notifyManager}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, notifyManager: e.target.checked }))}
                  />
                  <span>Notify user's manager</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.notifyItAdmin}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, notifyItAdmin: e.target.checked }))}
                  />
                  <span>Notify IT administrators</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={template.notifyHr}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, notifyHr: e.target.checked }))}
                  />
                  <span>Notify HR department</span>
                </label>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label>Additional email addresses</label>
                <div className="email-input-row" style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="email"
                    value={newEmailAddress}
                    onChange={(e) => setNewEmailAddress(e.target.value)}
                    placeholder="email@example.com"
                    onKeyPress={(e) => e.key === 'Enter' && addEmailAddress()}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={addEmailAddress}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Add
                  </button>
                </div>
                {template.notificationEmailAddresses.length > 0 && (
                  <div className="email-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {template.notificationEmailAddresses.map((email) => (
                      <span
                        key={email}
                        className="email-tag"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          background: '#f3f4f6',
                          borderRadius: '16px',
                          fontSize: '13px',
                        }}
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmailAddress(email)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0',
                            color: '#6b7280',
                            lineHeight: '1',
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label htmlFor="notificationMessage">Custom notification message (optional)</label>
                <textarea
                  id="notificationMessage"
                  value={template.notificationMessage}
                  onChange={(e) => setTemplate((prev) => ({ ...prev, notificationMessage: e.target.value }))}
                  placeholder="Add any additional context for the notification recipients..."
                  rows={3}
                />
              </div>
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
                requestType="offboard"
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

export default OffboardingTemplateEditor;
