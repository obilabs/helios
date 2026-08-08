/**
 * ActionTimeline Component
 *
 * Visual timeline showing the step-by-step execution of a lifecycle action.
 * Displays status for each step (success, failed, pending, skipped).
 */

import React from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  SkipForward,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import './ActionTimeline.css';

export interface TimelineStep {
  id: string;
  step: string;
  stepDescription?: string;
  stepOrder: number;
  status: 'success' | 'failed' | 'pending' | 'skipped' | 'warning' | 'in_progress';
  durationMs?: number;
  errorMessage?: string;
  executedAt?: string;
  details?: Record<string, unknown>;
}

interface ActionTimelineProps {
  steps: TimelineStep[];
  actionType: 'onboard' | 'offboard' | 'suspend' | 'unsuspend' | 'delete' | 'restore' | 'manual';
  showDetails?: boolean;
  onRetry?: (stepId: string) => void;
}

// Step labels for display
const stepLabels: Record<string, string> = {
  // Onboarding steps
  validate_config: 'Validate Configuration',
  create_helios_user: 'Create Helios User',
  create_google_account: 'Create Google Account',
  set_org_unit: 'Set Organizational Unit',
  assign_license: 'Assign License',
  add_to_groups: 'Add to Groups',
  add_to_shared_drives: 'Add to Shared Drives',
  subscribe_to_calendars: 'Subscribe to Calendars',
  set_signature: 'Set Email Signature',
  send_welcome_email: 'Send Welcome Email',
  finalize: 'Finalize Onboarding',
  // Offboarding steps
  transfer_drive_files: 'Transfer Drive Files',
  setup_email_forwarding: 'Setup Email Forwarding',
  set_auto_reply: 'Set Auto Reply',
  decline_future_meetings: 'Decline Future Meetings',
  transfer_calendar_events: 'Transfer Calendar Events',
  remove_from_groups: 'Remove from Groups',
  remove_from_shared_drives: 'Remove from Shared Drives',
  revoke_oauth_tokens: 'Revoke OAuth Tokens',
  revoke_app_passwords: 'Revoke App Passwords',
  sign_out_devices: 'Sign Out All Devices',
  reset_password: 'Reset Password',
  remove_signature: 'Remove Signature',
  set_offboarding_signature: 'Set Offboarding Signature',
  wipe_mobile_devices: 'Wipe Mobile Devices',
  suspend_account: 'Suspend Account',
  schedule_deletion: 'Schedule Account Deletion',
  send_notifications: 'Send Notifications',
};

const getStepLabel = (step: string): string => {
  return stepLabels[step] || step.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};

const formatDuration = (ms?: number): string => {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

const ActionTimeline: React.FC<ActionTimelineProps> = ({
  steps,
  actionType,
  showDetails = false,
  onRetry,
}) => {
  // Sort steps by order
  const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);

  const getStatusIcon = (status: TimelineStep['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={18} className="status-icon success" />;
      case 'failed':
        return <XCircle size={18} className="status-icon failed" />;
      case 'pending':
        return <Clock size={18} className="status-icon pending" />;
      case 'skipped':
        return <SkipForward size={18} className="status-icon skipped" />;
      case 'warning':
        return <AlertTriangle size={18} className="status-icon warning" />;
      case 'in_progress':
        return <RefreshCw size={18} className="status-icon in-progress animate-spin" />;
      default:
        return <Clock size={18} className="status-icon pending" />;
    }
  };

  const getStatusLabel = (status: TimelineStep['status']) => {
    switch (status) {
      case 'success':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      case 'skipped':
        return 'Skipped';
      case 'warning':
        return 'Warning';
      case 'in_progress':
        return 'In Progress';
      default:
        return status;
    }
  };

  if (steps.length === 0) {
    return (
      <div className="action-timeline empty">
        <p>No steps recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="action-timeline">
      <div className="timeline-header">
        <h4>
          {actionType === 'onboard' ? 'Onboarding' : actionType === 'offboard' ? 'Offboarding' : actionType.charAt(0).toUpperCase() + actionType.slice(1)} Steps
        </h4>
        <span className="step-count">
          {sortedSteps.filter((s) => s.status === 'success').length} / {sortedSteps.length} completed
        </span>
      </div>

      <div className="timeline-steps">
        {sortedSteps.map((step, index) => (
          <div
            key={step.id}
            className={`timeline-step ${step.status}`}
          >
            <div className="step-connector">
              <div className="connector-line top" />
              <div className="step-dot">
                {getStatusIcon(step.status)}
              </div>
              {index < sortedSteps.length - 1 && (
                <div className="connector-line bottom" />
              )}
            </div>

            <div className="step-content">
              <div className="step-header">
                <span className="step-label">{getStepLabel(step.step)}</span>
                <div className="step-meta">
                  {step.durationMs !== undefined && step.durationMs > 0 && (
                    <span className="step-duration">{formatDuration(step.durationMs)}</span>
                  )}
                  <span className={`step-status ${step.status}`}>
                    {getStatusLabel(step.status)}
                  </span>
                </div>
              </div>

              {step.stepDescription && (
                <p className="step-description">{step.stepDescription}</p>
              )}

              {step.errorMessage && (
                <div className="step-error">
                  <AlertTriangle size={14} />
                  <span>{step.errorMessage}</span>
                  {onRetry && step.status === 'failed' && (
                    <button
                      className="retry-btn"
                      onClick={() => onRetry(step.id)}
                    >
                      <RefreshCw size={12} />
                      Retry
                    </button>
                  )}
                </div>
              )}

              {showDetails && step.details && Object.keys(step.details).length > 0 && (
                <div className="step-details">
                  <details>
                    <summary>Details</summary>
                    <pre>{JSON.stringify(step.details, null, 2)}</pre>
                  </details>
                </div>
              )}

              {step.executedAt && (
                <span className="step-timestamp">
                  {new Date(step.executedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActionTimeline;
