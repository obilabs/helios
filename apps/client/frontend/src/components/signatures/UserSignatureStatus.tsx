/**
 * UserSignatureStatus Component
 *
 * Displays a user's current signature status including:
 * - Current assigned template
 * - Assignment source (direct, group, department, etc.)
 * - Sync status
 * - Re-sync button
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Users,
  Building2,
  UserCircle,
  Globe,
  FolderTree,
  Sparkles,
  Loader2,
  Eye
} from 'lucide-react';
import { authFetch } from '../../config/api';
import './UserSignatureStatus.css';

type AssignmentSource = 'user' | 'group' | 'dynamic_group' | 'department' | 'ou' | 'organization' | null;
type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'error' | 'skipped';

interface EffectiveSignature {
  userId: string;
  organizationId: string;
  assignmentId: string;
  templateId: string;
  source: AssignmentSource;
}

interface SignatureStatus {
  id: string;
  userId: string;
  currentTemplateId: string | null;
  templateName?: string;
  templateHtml?: string;
  assignmentSource: AssignmentSource;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  lastSyncAttemptAt: string | null;
  syncError: string | null;
  syncAttempts: number;
  renderedHtml: string | null;
}

interface UserSignatureStatusProps {
  userId: string;
  userName?: string;
  userEmail?: string;
  compact?: boolean;
  showPreview?: boolean;
  onSyncComplete?: () => void;
}

const SOURCE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  user: { label: 'Direct Assignment', icon: <UserCircle size={14} />, color: '#8b5cf6' },
  dynamic_group: { label: 'Dynamic Group', icon: <Sparkles size={14} />, color: '#ec4899' },
  group: { label: 'Static Group', icon: <Users size={14} />, color: '#3b82f6' },
  department: { label: 'Department', icon: <Building2 size={14} />, color: '#10b981' },
  ou: { label: 'Organizational Unit', icon: <FolderTree size={14} />, color: '#f59e0b' },
  organization: { label: 'Organization Default', icon: <Globe size={14} />, color: '#6b7280' },
};

const SYNC_STATUS_CONFIG: Record<SyncStatus, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: 'Pending', icon: <Clock size={14} />, color: '#f59e0b' },
  syncing: { label: 'Syncing', icon: <RefreshCw size={14} className="spinning" />, color: '#3b82f6' },
  synced: { label: 'Synced', icon: <CheckCircle size={14} />, color: '#10b981' },
  failed: { label: 'Failed', icon: <XCircle size={14} />, color: '#ef4444' },
  error: { label: 'Error', icon: <AlertCircle size={14} />, color: '#ef4444' },
  skipped: { label: 'Skipped', icon: <Clock size={14} />, color: '#9ca3af' },
};

const UserSignatureStatus: React.FC<UserSignatureStatusProps> = ({
  userId,
  userName,
  userEmail,
  compact = false,
  showPreview = true,
  onSyncComplete,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [effectiveSignature, setEffectiveSignature] = useState<EffectiveSignature | null>(null);
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch effective signature assignment
      const effectiveRes = await authFetch(`/api/signatures/v2/assignments/user/${userId}/effective`);
      const effectiveData = await effectiveRes.json();

      if (effectiveData.success) {
        setEffectiveSignature(effectiveData.data);
      }

      // Also fetch user signature status from the v1 API
      const statusRes = await authFetch(`/api/signatures/users/${userId}`);
      const statusData = await statusRes.json();

      if (statusData.success && statusData.data) {
        setSignatureStatus({
          id: statusData.data.id,
          userId: statusData.data.user_id,
          currentTemplateId: statusData.data.current_template_id,
          templateName: statusData.data.template_name,
          templateHtml: statusData.data.template_html,
          assignmentSource: statusData.data.assignment_source,
          syncStatus: statusData.data.sync_status || 'pending',
          lastSyncedAt: statusData.data.last_synced_at,
          lastSyncAttemptAt: statusData.data.last_sync_attempt_at,
          syncError: statusData.data.sync_error,
          syncAttempts: statusData.data.sync_attempts || 0,
          renderedHtml: statusData.data.rendered_html,
        });
      }
    } catch (err) {
      console.error('Error fetching signature status:', err);
      setError('Failed to load signature status');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleResync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await authFetch(`/api/signatures/users/${userId}/sync`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        await fetchStatus();
        onSyncComplete?.();
      } else {
        setError(data.error || 'Sync failed');
      }
    } catch (err) {
      console.error('Error syncing signature:', err);
      setError('Failed to sync signature');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getSourceInfo = (source: AssignmentSource) => {
    if (!source) return { label: 'None', icon: <Mail size={14} />, color: '#9ca3af' };
    return SOURCE_CONFIG[source] || { label: source, icon: <Mail size={14} />, color: '#9ca3af' };
  };

  const getSyncStatusInfo = (status: SyncStatus) => {
    return SYNC_STATUS_CONFIG[status] || SYNC_STATUS_CONFIG.pending;
  };

  if (loading) {
    return (
      <div className={`user-signature-status ${compact ? 'compact' : ''}`}>
        <div className="status-loading">
          <Loader2 size={20} className="spinning" />
          <span>Loading signature status...</span>
        </div>
      </div>
    );
  }

  const hasAssignment = effectiveSignature || signatureStatus?.currentTemplateId;
  const sourceInfo = getSourceInfo(effectiveSignature?.source || signatureStatus?.assignmentSource || null);
  const syncInfo = getSyncStatusInfo(signatureStatus?.syncStatus || 'pending');

  if (compact) {
    return (
      <div className="user-signature-status compact">
        <div className="compact-content">
          <div className="signature-indicator" style={{ backgroundColor: sourceInfo.color }}>
            {sourceInfo.icon}
          </div>
          <div className="compact-info">
            <span className="template-name">
              {signatureStatus?.templateName || (hasAssignment ? 'Template Assigned' : 'No signature')}
            </span>
            <span className="source-label">{sourceInfo.label}</span>
          </div>
          <div className="sync-badge" style={{ color: syncInfo.color }}>
            {syncInfo.icon}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-signature-status">
      {userName && (
        <div className="status-header">
          <div className="user-info">
            <Mail size={18} />
            <div>
              <span className="user-name">{userName}</span>
              {userEmail && <span className="user-email">{userEmail}</span>}
            </div>
          </div>
          <button
            className="btn-resync"
            onClick={handleResync}
            disabled={syncing}
            title="Re-sync signature"
          >
            {syncing ? (
              <Loader2 size={14} className="spinning" />
            ) : (
              <RefreshCw size={14} />
            )}
            {syncing ? 'Syncing...' : 'Re-sync'}
          </button>
        </div>
      )}

      {error && (
        <div className="status-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="status-content">
        {/* Assignment Info */}
        <div className="status-section">
          <h4>Current Assignment</h4>
          {hasAssignment ? (
            <div className="assignment-info">
              <div className="source-badge" style={{ backgroundColor: sourceInfo.color + '20', color: sourceInfo.color }}>
                {sourceInfo.icon}
                <span>{sourceInfo.label}</span>
              </div>
              {signatureStatus?.templateName && (
                <div className="template-info">
                  <span className="label">Template:</span>
                  <span className="value">{signatureStatus.templateName}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="no-assignment">
              <Mail size={24} />
              <p>No signature template assigned</p>
              <span>This user will use their default Gmail signature</span>
            </div>
          )}
        </div>

        {/* Sync Status */}
        <div className="status-section">
          <h4>Sync Status</h4>
          <div className="sync-info">
            <div className="sync-status-badge" style={{ backgroundColor: syncInfo.color + '20', color: syncInfo.color }}>
              {syncInfo.icon}
              <span>{syncInfo.label}</span>
            </div>
            <div className="sync-details">
              <div className="detail-row">
                <span className="label">Last synced:</span>
                <span className="value">{formatDate(signatureStatus?.lastSyncedAt || null)}</span>
              </div>
              {signatureStatus?.syncError && (
                <div className="detail-row error">
                  <span className="label">Error:</span>
                  <span className="value">{signatureStatus.syncError}</span>
                </div>
              )}
              {signatureStatus?.syncAttempts && signatureStatus.syncAttempts > 1 && (
                <div className="detail-row">
                  <span className="label">Attempts:</span>
                  <span className="value">{signatureStatus.syncAttempts}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        {showPreview && signatureStatus?.renderedHtml && (
          <div className="status-section">
            <button
              className="preview-toggle"
              onClick={() => setPreviewExpanded(!previewExpanded)}
            >
              <Eye size={14} />
              <span>{previewExpanded ? 'Hide Preview' : 'Show Preview'}</span>
            </button>
            {previewExpanded && (
              <div className="signature-preview">
                <div
                  className="preview-content"
                  dangerouslySetInnerHTML={{ __html: signatureStatus.renderedHtml }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {!userName && (
        <div className="status-footer">
          <button
            className="btn-resync"
            onClick={handleResync}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <Loader2 size={14} className="spinning" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Re-sync Signature
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default UserSignatureStatus;
