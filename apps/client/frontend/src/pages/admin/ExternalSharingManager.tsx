import React, { useState, useEffect } from 'react';
import {
  Shield,
  Search,
  AlertTriangle,
  ExternalLink,
  Trash2,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Filter,
  Users,
  Globe,
  Link2,
  FileText,
  AlertCircle
} from 'lucide-react';
import { authFetch } from '../../config/api';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import './ExternalSharingManager.css';

// Types
interface ExternalShare {
  fileId: string;
  fileName: string;
  fileType: string;
  sharedWith: string;
  shareType: 'user' | 'domain' | 'anyone';
  permissionId: string;
  role: string;
  isPersonalAccount: boolean;
  sharedByEmail?: string;
  riskLevel: 'high' | 'medium' | 'low';
  webViewLink?: string;
}

interface AuditSummary {
  totalFiles: number;
  totalSharedExternally: number;
  sharedWithExternalDomains: number;
  sharedWithPersonalAccounts: number;
  sharedWithAnyone: number;
  highRiskFiles: number;
  mediumRiskFiles: number;
  lowRiskFiles: number;
  lastScanAt?: string;
}

type RiskFilter = 'all' | 'high' | 'medium' | 'low';

export const ExternalSharingManager: React.FC = () => {
  // State
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [shares, setShares] = useState<ExternalShare[]>([]);
  const [selectedShares, setSelectedShares] = useState<Set<string>>(new Set());
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'fileName' | 'riskLevel' | 'shareType'>('riskLevel');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [revoking, setRevoking] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Confirmation dialog state
  const [showBulkRevokeConfirm, setShowBulkRevokeConfirm] = useState(false);
  const [shareToRevoke, setShareToRevoke] = useState<ExternalShare | null>(null);

  // Fetch summary on mount
  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/api/v1/external-sharing/summary');
      const data = await response.json();
      if (data.success) {
        setSummary(data.summary);
      } else {
        setError(data.error || 'Failed to fetch summary');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const runFullScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const response = await authFetch('/api/v1/external-sharing/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxFiles: 1000 })
      });
      const data = await response.json();
      if (data.success) {
        setShares(data.shares || []);
        setSummary(data.summary);
        setSelectedShares(new Set());
      } else {
        setError(data.error || 'Scan failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to server');
    } finally {
      setScanning(false);
    }
  };

  const handleBulkRevokeClick = () => {
    if (selectedShares.size === 0) return;
    setShowBulkRevokeConfirm(true);
  };

  const revokeSelected = async () => {
    setShowBulkRevokeConfirm(false);
    setRevoking(true);
    setError(null);

    const sharesToRevoke = shares
      .filter(s => selectedShares.has(`${s.fileId}-${s.permissionId}`))
      .map(s => ({ fileId: s.fileId, permissionId: s.permissionId }));

    try {
      const response = await authFetch('/api/v1/external-sharing/bulk-revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shares: sharesToRevoke })
      });
      const data = await response.json();

      if (data.successCount > 0) {
        // Remove revoked shares from list
        const revokedIds = new Set(
          data.results
            .filter((r: any) => r.success)
            .map((r: any) => `${r.fileId}-${r.permissionId}`)
        );
        setShares(prev => prev.filter(s => !revokedIds.has(`${s.fileId}-${s.permissionId}`)));
        setSelectedShares(new Set());

        // Refresh summary
        fetchSummary();
      }

      if (data.failureCount > 0) {
        setError(`${data.failureCount} revocation(s) failed. ${data.successCount} succeeded.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to revoke access');
    } finally {
      setRevoking(false);
    }
  };

  const revokeSingleShare = async () => {
    if (!shareToRevoke) return;

    try {
      const response = await authFetch('/api/v1/external-sharing/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: shareToRevoke.fileId,
          permissionId: shareToRevoke.permissionId
        })
      });
      const data = await response.json();
      if (data.success) {
        setShares(prev =>
          prev.filter(s =>
            !(s.fileId === shareToRevoke.fileId && s.permissionId === shareToRevoke.permissionId)
          )
        );
        fetchSummary();
      } else {
        setError(data.error || 'Failed to revoke access');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to revoke access');
    } finally {
      setShareToRevoke(null);
    }
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      const response = await authFetch('/api/v1/external-sharing/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riskLevel: riskFilter === 'all' ? undefined : riskFilter })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `external-sharing-report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await response.json();
        setError(data.error || 'Export failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  // Filter and sort shares
  const filteredShares = shares
    .filter(share => {
      if (riskFilter !== 'all' && share.riskLevel !== riskFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          share.fileName.toLowerCase().includes(query) ||
          share.sharedWith.toLowerCase().includes(query) ||
          share.sharedByEmail?.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortField === 'fileName') {
        comparison = a.fileName.localeCompare(b.fileName);
      } else if (sortField === 'riskLevel') {
        const order = { high: 3, medium: 2, low: 1 };
        comparison = order[a.riskLevel] - order[b.riskLevel];
      } else if (sortField === 'shareType') {
        comparison = a.shareType.localeCompare(b.shareType);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedShares.size === filteredShares.length) {
      setSelectedShares(new Set());
    } else {
      setSelectedShares(new Set(filteredShares.map(s => `${s.fileId}-${s.permissionId}`)));
    }
  };

  const toggleShare = (share: ExternalShare) => {
    const key = `${share.fileId}-${share.permissionId}`;
    setSelectedShares(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const getRiskBadgeClass = (level: string) => {
    switch (level) {
      case 'high': return 'risk-badge risk-high';
      case 'medium': return 'risk-badge risk-medium';
      case 'low': return 'risk-badge risk-low';
      default: return 'risk-badge';
    }
  };

  const getShareTypeIcon = (type: string) => {
    switch (type) {
      case 'anyone': return <Globe size={14} />;
      case 'domain': return <Users size={14} />;
      case 'user': return <FileText size={14} />;
      default: return <Link2 size={14} />;
    }
  };

  return (
    <div className="external-sharing-manager">
      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <div className="header-icon">
            <Shield size={24} />
          </div>
          <div className="header-text">
            <h1>External Sharing Manager</h1>
            <p>Audit and manage files shared outside your organization</p>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={exportReport}
            disabled={exporting || shares.length === 0}
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            className="btn btn-primary"
            onClick={runFullScan}
            disabled={scanning}
          >
            <RefreshCw size={16} className={scanning ? 'spin' : ''} />
            {scanning ? 'Scanning...' : 'Run Full Scan'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="summary-grid">
          <div className="summary-card">
            <div className="card-icon total">
              <FileText size={20} />
            </div>
            <div className="card-content">
              <div className="card-value">{summary.totalSharedExternally}</div>
              <div className="card-label">External Shares</div>
            </div>
          </div>
          <div className="summary-card clickable" onClick={() => setRiskFilter('high')}>
            <div className="card-icon high">
              <AlertTriangle size={20} />
            </div>
            <div className="card-content">
              <div className="card-value">{summary.highRiskFiles}</div>
              <div className="card-label">High Risk</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="card-icon personal">
              <Users size={20} />
            </div>
            <div className="card-content">
              <div className="card-value">{summary.sharedWithPersonalAccounts}</div>
              <div className="card-label">Personal Accounts</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="card-icon anyone">
              <Globe size={20} />
            </div>
            <div className="card-content">
              <div className="card-value">{summary.sharedWithAnyone}</div>
              <div className="card-label">Anyone with Link</div>
            </div>
          </div>
        </div>
      )}

      {/* No Scan Yet */}
      {!loading && shares.length === 0 && !scanning && (
        <div className="empty-state">
          <Shield size={48} />
          <h2>No scan results yet</h2>
          <p>Run a full scan to discover files shared outside your organization.</p>
          <button className="btn btn-primary" onClick={runFullScan}>
            <RefreshCw size={16} />
            Start Scan
          </button>
        </div>
      )}

      {/* Results Table */}
      {shares.length > 0 && (
        <div className="results-section">
          {/* Toolbar */}
          <div className="results-toolbar">
            <div className="toolbar-left">
              <div className="search-input">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search files or users..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="filter-dropdown">
                <Filter size={16} />
                <select value={riskFilter} onChange={e => setRiskFilter(e.target.value as RiskFilter)}>
                  <option value="all">All Risk Levels</option>
                  <option value="high">High Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="low">Low Risk</option>
                </select>
              </div>
            </div>
            <div className="toolbar-right">
              {selectedShares.size > 0 && (
                <button
                  className="btn btn-danger"
                  onClick={handleBulkRevokeClick}
                  disabled={revoking}
                >
                  <Trash2 size={16} />
                  {revoking ? 'Revoking...' : `Revoke ${selectedShares.size} Selected`}
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedShares.size === filteredShares.length && filteredShares.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="sortable" onClick={() => toggleSort('fileName')}>
                    File Name
                    {sortField === 'fileName' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </th>
                  <th>Shared With</th>
                  <th className="sortable" onClick={() => toggleSort('shareType')}>
                    Type
                    {sortField === 'shareType' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </th>
                  <th className="sortable" onClick={() => toggleSort('riskLevel')}>
                    Risk
                    {sortField === 'riskLevel' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </th>
                  <th>Owner</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredShares.map(share => (
                  <tr key={`${share.fileId}-${share.permissionId}`}>
                    <td className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedShares.has(`${share.fileId}-${share.permissionId}`)}
                        onChange={() => toggleShare(share)}
                      />
                    </td>
                    <td className="file-name-cell">
                      <div className="file-name">
                        {share.fileName}
                        {share.webViewLink && (
                          <a
                            href={share.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="external-link"
                            title="Open in Drive"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <div className="file-type">{share.fileType}</div>
                    </td>
                    <td>
                      <div className="shared-with">
                        {share.sharedWith}
                        {share.isPersonalAccount && (
                          <span className="personal-badge" title="Personal email account">
                            Personal
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="share-type">
                        {getShareTypeIcon(share.shareType)}
                        {share.shareType}
                      </span>
                    </td>
                    <td>
                      <span className={getRiskBadgeClass(share.riskLevel)}>
                        {share.riskLevel}
                      </span>
                    </td>
                    <td className="owner-cell">
                      {share.sharedByEmail || 'Unknown'}
                    </td>
                    <td className="actions-cell">
                      <button
                        className="btn btn-sm btn-icon"
                        title="Revoke access"
                        onClick={() => setShareToRevoke(share)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Results Footer */}
          <div className="results-footer">
            <span>
              Showing {filteredShares.length} of {shares.length} shares
              {selectedShares.size > 0 && ` (${selectedShares.size} selected)`}
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {(loading || scanning) && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <RefreshCw size={32} className="spin" />
            <p>{scanning ? 'Scanning files for external shares...' : 'Loading...'}</p>
          </div>
        </div>
      )}

      {/* Bulk Revoke Confirmation */}
      <ConfirmDialog
        isOpen={showBulkRevokeConfirm}
        title="Revoke External Access"
        message={`Are you sure you want to revoke access for ${selectedShares.size} share(s)? This action cannot be undone.`}
        variant="danger"
        confirmText="Revoke Access"
        onConfirm={revokeSelected}
        onCancel={() => setShowBulkRevokeConfirm(false)}
      />

      {/* Single Share Revoke Confirmation */}
      <ConfirmDialog
        isOpen={shareToRevoke !== null}
        title="Revoke External Access"
        message={`Revoke external access for "${shareToRevoke?.fileName}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Revoke"
        onConfirm={revokeSingleShare}
        onCancel={() => setShareToRevoke(null)}
      />
    </div>
  );
};

export default ExternalSharingManager;
