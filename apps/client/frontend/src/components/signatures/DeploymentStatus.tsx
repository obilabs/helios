/**
 * DeploymentStatus Component
 *
 * Displays overall signature deployment status for an organization:
 * - Summary stats (synced, pending, failed counts)
 * - Deploy all button
 * - Force resync all button
 * - Last sync timestamp
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  Play,
  Users,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { authFetch } from '../../config/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import './DeploymentStatus.css';

interface SyncSummary {
  totalUsers: number;
  synced: number;
  pending: number;
  failed: number;
  error: number;
  skipped: number;
  noAssignment: number;
  lastSyncAt: string | null;
}

interface DeployResult {
  synced: number;
  failed: number;
  skipped: number;
}

interface DeploymentStatusProps {
  onSyncComplete?: () => void;
  showActions?: boolean;
  compact?: boolean;
}

const DeploymentStatus: React.FC<DeploymentStatusProps> = ({
  onSyncComplete,
  showActions = true,
  compact = false
}) => {
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDeployResult, setLastDeployResult] = useState<DeployResult | null>(null);
  const [showForceResyncConfirm, setShowForceResyncConfirm] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await authFetch('/api/signatures/sync/status');
      const data = await response.json();

      if (data.success) {
        setSummary(data.data);
      } else {
        setError(data.error || 'Failed to fetch sync status');
      }
    } catch (err) {
      console.error('Error fetching sync status:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    // Refresh every 30 seconds
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const handleDeployPending = async () => {
    setDeploying(true);
    setError(null);
    setLastDeployResult(null);

    try {
      const response = await authFetch('/api/signatures/sync/deploy', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setLastDeployResult({
          synced: data.data.successCount,
          failed: data.data.failureCount,
          skipped: data.data.skippedCount,
        });
        await fetchSummary();
        onSyncComplete?.();
      } else {
        setError(data.error || 'Deployment failed');
      }
    } catch (err) {
      console.error('Error deploying signatures:', err);
      setError('Failed to deploy signatures');
    } finally {
      setDeploying(false);
    }
  };

  const handleForceResync = () => {
    setShowForceResyncConfirm(true);
  };

  const confirmForceResync = async () => {
    setShowForceResyncConfirm(false);
    setForceSyncing(true);
    setError(null);
    setLastDeployResult(null);

    try {
      const response = await authFetch('/api/signatures/sync/deploy/all', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setLastDeployResult({
          synced: data.data.successCount,
          failed: data.data.failureCount,
          skipped: data.data.skippedCount,
        });
        await fetchSummary();
        onSyncComplete?.();
      } else {
        setError(data.error || 'Force resync failed');
      }
    } catch (err) {
      console.error('Error force resyncing signatures:', err);
      setError('Failed to force resync signatures');
    } finally {
      setForceSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    setDeploying(true);
    setError(null);

    try {
      const response = await authFetch('/api/signatures/sync/retry', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setLastDeployResult({
          synced: data.data.successCount,
          failed: data.data.failureCount,
          skipped: data.data.skippedCount,
        });
        await fetchSummary();
        onSyncComplete?.();
      } else {
        setError(data.error || 'Retry failed');
      }
    } catch (err) {
      console.error('Error retrying failed signatures:', err);
      setError('Failed to retry');
    } finally {
      setDeploying(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getHealthStatus = () => {
    if (!summary) return { status: 'unknown', color: '#9ca3af' };
    const { totalUsers, synced, failed, error: errorCount } = summary;

    if (totalUsers === 0) return { status: 'No users', color: '#9ca3af' };

    const failedPercent = ((failed + errorCount) / totalUsers) * 100;
    const syncedPercent = (synced / totalUsers) * 100;

    if (failedPercent > 10) return { status: 'Critical', color: '#ef4444' };
    if (failedPercent > 0) return { status: 'Issues', color: '#f59e0b' };
    if (syncedPercent === 100) return { status: 'Healthy', color: '#10b981' };
    if (syncedPercent > 50) return { status: 'Syncing', color: '#3b82f6' };
    return { status: 'Pending', color: '#f59e0b' };
  };

  if (loading) {
    return (
      <div className={`deployment-status ${compact ? 'compact' : ''}`}>
        <div className="status-loading">
          <Loader2 size={20} className="spinning" />
          <span>Loading deployment status...</span>
        </div>
      </div>
    );
  }

  const health = getHealthStatus();

  if (compact) {
    return (
      <div className="deployment-status compact">
        <div className="compact-stats">
          <div className="stat synced">
            <CheckCircle size={14} />
            <span>{summary?.synced || 0}</span>
          </div>
          <div className="stat pending">
            <Clock size={14} />
            <span>{summary?.pending || 0}</span>
          </div>
          <div className="stat failed">
            <XCircle size={14} />
            <span>{(summary?.failed || 0) + (summary?.error || 0)}</span>
          </div>
        </div>
        <div className="health-indicator" style={{ backgroundColor: health.color }}>
          {health.status}
        </div>
      </div>
    );
  }

  return (
    <div className="deployment-status">
      <div className="status-header">
        <div className="header-left">
          <Users size={20} />
          <div>
            <h3>Signature Deployment Status</h3>
            <span className="last-sync">Last sync: {formatDate(summary?.lastSyncAt || null)}</span>
          </div>
        </div>
        <div className="health-badge" style={{ backgroundColor: health.color + '20', color: health.color }}>
          {health.status}
        </div>
      </div>

      {error && (
        <div className="status-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {lastDeployResult && (
        <div className="deploy-result">
          <CheckCircle size={14} />
          <span>
            Deployed: {lastDeployResult.synced} synced, {lastDeployResult.failed} failed, {lastDeployResult.skipped} skipped
          </span>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card synced">
          <div className="stat-icon">
            <CheckCircle size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{summary?.synced || 0}</span>
            <span className="stat-label">Synced</span>
          </div>
        </div>

        <div className="stat-card pending">
          <div className="stat-icon">
            <Clock size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{summary?.pending || 0}</span>
            <span className="stat-label">Pending</span>
          </div>
        </div>

        <div className="stat-card failed">
          <div className="stat-icon">
            <XCircle size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{(summary?.failed || 0) + (summary?.error || 0)}</span>
            <span className="stat-label">Failed/Error</span>
          </div>
        </div>

        <div className="stat-card skipped">
          <div className="stat-icon">
            <AlertCircle size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{(summary?.skipped || 0) + (summary?.noAssignment || 0)}</span>
            <span className="stat-label">No Assignment</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {summary && summary.totalUsers > 0 && (
        <div className="sync-progress">
          <div className="progress-bar">
            <div
              className="progress-segment synced"
              style={{ width: `${(summary.synced / summary.totalUsers) * 100}%` }}
            />
            <div
              className="progress-segment pending"
              style={{ width: `${(summary.pending / summary.totalUsers) * 100}%` }}
            />
            <div
              className="progress-segment failed"
              style={{ width: `${((summary.failed + summary.error) / summary.totalUsers) * 100}%` }}
            />
          </div>
          <span className="progress-label">
            {summary.synced} / {summary.totalUsers} users synced
          </span>
        </div>
      )}

      {showActions && (
        <div className="status-actions">
          <button
            className="btn-primary"
            onClick={handleDeployPending}
            disabled={deploying || forceSyncing || (summary?.pending || 0) === 0}
          >
            {deploying ? (
              <>
                <Loader2 size={14} className="spinning" />
                Deploying...
              </>
            ) : (
              <>
                <Play size={14} />
                Deploy Pending ({summary?.pending || 0})
              </>
            )}
          </button>

          {(summary?.failed || 0) + (summary?.error || 0) > 0 && (
            <button
              className="btn-secondary"
              onClick={handleRetryFailed}
              disabled={deploying || forceSyncing}
            >
              <RotateCcw size={14} />
              Retry Failed ({(summary?.failed || 0) + (summary?.error || 0)})
            </button>
          )}

          <button
            className="btn-secondary"
            onClick={handleForceResync}
            disabled={deploying || forceSyncing}
          >
            {forceSyncing ? (
              <>
                <Loader2 size={14} className="spinning" />
                Resyncing All...
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Force Resync All
              </>
            )}
          </button>

          <button
            className="btn-icon"
            onClick={fetchSummary}
            title="Refresh status"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={showForceResyncConfirm}
        title="Force Resync All Signatures"
        message="This will re-sync signatures for ALL users. This may take several minutes. Continue?"
        variant="warning"
        confirmText="Resync All"
        onConfirm={confirmForceResync}
        onCancel={() => setShowForceResyncConfirm(false)}
      />
    </div>
  );
};

export default DeploymentStatus;
