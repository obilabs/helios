import { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Cloud,
  FolderOpen,
  Image,
  Upload,
  Settings,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Loader,
  ChevronRight,
  ExternalLink,
  Copy,
  Search,
  Trash2,
  X,
  FolderPlus,
  ChevronDown,
  File,
} from 'lucide-react';
import './FilesAssets.css';
import { authFetch } from '../config/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface FilesAssetsProps {
  organizationId: string;
}

interface SetupStatus {
  isConfigured: boolean;
  storageBackend: string | null;
  hasGoogleWorkspace: boolean;
  hasDriveAccess: boolean;
  sharedDriveName?: string;
  folderCount: number;
  assetCount: number;
}

interface Settings {
  organizationId: string;
  storageBackend: string;
  driveSharedDriveId: string | null;
  driveRootFolderId: string | null;
  cacheTtlSeconds: number;
  maxFileSizeMb: number;
  allowedMimeTypes: string[];
  isConfigured: boolean;
}

interface MediaAsset {
  id: string;
  organizationId: string;
  storageType: string;
  storagePath: string;
  name: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  category: string | null;
  accessToken: string;
  isPublic: boolean;
  accessCount: number;
  lastAccessedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publicUrl: string;
}

interface FolderTreeNode {
  id: string;
  name: string;
  path: string;
  driveFolderId?: string;
  children: FolderTreeNode[];
}

type ViewTab = 'overview' | 'assets' | 'settings';

export function FilesAssets({ organizationId: _organizationId }: FilesAssetsProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assets state
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [folders, setFolders] = useState<FolderTreeNode[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetsLoading, setAssetsLoading] = useState(false);

  // Setup wizard state
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Selected asset for preview
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);

  // New folder state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Delete confirmation state
  const [assetToDelete, setAssetToDelete] = useState<MediaAsset | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await authFetch('/api/v1/assets/status');

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStatus(data.data);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await authFetch('/api/v1/assets/settings');

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSettings(data.data);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch settings:', err);
    }
  }, []);

  const fetchAssets = useCallback(async (folderId?: string | null) => {
    try {
      setAssetsLoading(true);
      let url = '/api/v1/assets';
      const params = new URLSearchParams();
      if (folderId) {
        params.append('folderId', folderId);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await authFetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAssets(data.data.assets || []);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch assets:', err);
    } finally {
      setAssetsLoading(false);
    }
  }, [searchQuery]);

  const fetchFolders = useCallback(async () => {
    try {
      const response = await authFetch('/api/v1/assets/folders');

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFolders(data.data || []);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch folders:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        await Promise.all([fetchStatus(), fetchSettings()]);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [fetchStatus, fetchSettings]);

  useEffect(() => {
    if (status?.isConfigured && activeTab === 'assets') {
      fetchAssets(selectedFolder);
      fetchFolders();
    }
  }, [status?.isConfigured, activeTab, selectedFolder, fetchAssets, fetchFolders]);

  const handleSetup = async () => {
    setIsSettingUp(true);
    setSetupError(null);

    try {
      const response = await authFetch('/api/v1/assets/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ backend: 'google_drive' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to setup storage');
      }

      // Refresh status
      await fetchStatus();
      await fetchSettings();
      setShowSetupWizard(false);
      setSetupStep(1);
    } catch (err: any) {
      setSetupError(err.message);
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    setCreatingFolder(true);
    try {
      const response = await authFetch('/api/v1/assets/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentPath: selectedFolder || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create folder');
      }

      setNewFolderName('');
      setShowNewFolderModal(false);
      await fetchFolders();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteAsset = (asset: MediaAsset) => {
    setAssetToDelete(asset);
  };

  const confirmDeleteAsset = async () => {
    if (!assetToDelete) return;

    try {
      const response = await authFetch(`/api/v1/assets/${assetToDelete.id}?deleteFile=true`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete asset');
      }

      await fetchAssets(selectedFolder);
      setSelectedAsset(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setAssetToDelete(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image size={20} />;
    return <File size={20} />;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (isLoading) {
    return (
      <div className="page-container files-assets">
        <div className="loading-state">
          <Loader size={24} className="spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container files-assets">
        <div className="error-state">
          <AlertCircle size={24} />
          <span>{error}</span>
          <button className="btn-secondary" onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container files-assets">
      <div className="page-header">
        <div>
          <h1>Files & Assets</h1>
          <p>Manage images and files for signatures and templates</p>
        </div>
        {status?.isConfigured && (
          <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
            <Upload size={16} /> Upload File
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <HardDrive size={16} />
          <span>Overview</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'assets' ? 'active' : ''}`}
          onClick={() => setActiveTab('assets')}
          disabled={!status?.isConfigured}
        >
          <FolderOpen size={16} />
          <span>Assets</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content overview-tab">
          {/* Setup Status Card */}
          <div className="status-card">
            <div className="status-header">
              <div className="status-icon-wrapper">
                {status?.isConfigured ? (
                  <CheckCircle size={24} className="status-icon success" />
                ) : (
                  <AlertCircle size={24} className="status-icon warning" />
                )}
              </div>
              <div className="status-info">
                <h3>{status?.isConfigured ? 'Storage Configured' : 'Setup Required'}</h3>
                <p>
                  {status?.isConfigured
                    ? `Using ${status.storageBackend === 'google_drive' ? 'Google Drive' : 'MinIO'} for file storage`
                    : 'Configure storage to start managing assets'}
                </p>
              </div>
              {!status?.isConfigured && (
                <button className="btn-primary" onClick={() => setShowSetupWizard(true)}>
                  Configure Storage
                </button>
              )}
            </div>

            {status?.isConfigured && (
              <div className="status-stats">
                <div className="stat-item">
                  <span className="stat-value">{status.assetCount}</span>
                  <span className="stat-label">Total Assets</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{status.folderCount}</span>
                  <span className="stat-label">Folders</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    {status.storageBackend === 'google_drive' ? 'Google Drive' : 'MinIO'}
                  </span>
                  <span className="stat-label">Storage Backend</span>
                </div>
              </div>
            )}
          </div>

          {/* Prerequisites Card */}
          <div className="prereq-card">
            <h3>Prerequisites</h3>
            <ul className="prereq-list">
              <li className={status?.hasGoogleWorkspace ? 'complete' : ''}>
                {status?.hasGoogleWorkspace ? (
                  <CheckCircle size={16} className="prereq-icon success" />
                ) : (
                  <AlertCircle size={16} className="prereq-icon warning" />
                )}
                <span>Google Workspace Integration</span>
                {!status?.hasGoogleWorkspace && (
                  <span className="prereq-note">Enable in Settings &rarr; Modules</span>
                )}
              </li>
              <li className={status?.hasDriveAccess ? 'complete' : ''}>
                {status?.hasDriveAccess ? (
                  <CheckCircle size={16} className="prereq-icon success" />
                ) : (
                  <AlertCircle size={16} className="prereq-icon warning" />
                )}
                <span>Google Drive API Access</span>
                {!status?.hasDriveAccess && (
                  <span className="prereq-note">Service account needs Drive API scope</span>
                )}
              </li>
            </ul>
          </div>

          {/* How It Works */}
          <div className="info-card">
            <h3>How It Works</h3>
            <p>
              Files & Assets provides a way to host images and files that can be used in email
              signatures and templates. Assets are stored in your Google Shared Drive and served
              through public proxy URLs that work anywhere.
            </p>
            <div className="feature-list">
              <div className="feature-item">
                <Cloud size={20} />
                <div>
                  <strong>Cloud Storage</strong>
                  <span>Files stored in your Google Shared Drive</span>
                </div>
              </div>
              <div className="feature-item">
                <ExternalLink size={20} />
                <div>
                  <strong>Public URLs</strong>
                  <span>Direct embeddable URLs for signatures</span>
                </div>
              </div>
              <div className="feature-item">
                <RefreshCw size={20} />
                <div>
                  <strong>Caching</strong>
                  <span>Fast delivery with built-in caching</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assets Tab */}
      {activeTab === 'assets' && status?.isConfigured && (
        <div className="tab-content assets-tab">
          <div className="assets-layout">
            {/* Sidebar - Folders */}
            <div className="assets-sidebar">
              <div className="sidebar-header">
                <span>Folders</span>
                <button
                  className="btn-icon-small"
                  title="New folder"
                  onClick={() => setShowNewFolderModal(true)}
                >
                  <FolderPlus size={16} />
                </button>
              </div>
              <div className="folder-tree">
                <button
                  className={`folder-item ${selectedFolder === null ? 'active' : ''}`}
                  onClick={() => setSelectedFolder(null)}
                >
                  <FolderOpen size={16} />
                  <span>All Files</span>
                </button>
                {folders.map((folder) => (
                  <FolderTreeItem
                    key={folder.id}
                    folder={folder}
                    selectedFolder={selectedFolder}
                    onSelect={setSelectedFolder}
                    level={0}
                  />
                ))}
              </div>
            </div>

            {/* Main Content - Asset Grid */}
            <div className="assets-main">
              <div className="assets-toolbar">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search assets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button className="btn-secondary" onClick={() => fetchAssets(selectedFolder)}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              {assetsLoading ? (
                <div className="loading-state">
                  <Loader size={20} className="spinner" />
                  <span>Loading assets...</span>
                </div>
              ) : assets.length === 0 ? (
                <div className="empty-state">
                  <Image size={32} />
                  <h3>No assets yet</h3>
                  <p>Upload your first file to get started</p>
                  <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
                    <Upload size={16} /> Upload File
                  </button>
                </div>
              ) : (
                <div className="assets-grid">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`asset-card ${selectedAsset?.id === asset.id ? 'selected' : ''}`}
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <div className="asset-preview">
                        {asset.mimeType.startsWith('image/') ? (
                          <img src={asset.publicUrl} alt={asset.name} />
                        ) : (
                          <div className="asset-icon">{getFileIcon(asset.mimeType)}</div>
                        )}
                      </div>
                      <div className="asset-info">
                        <span className="asset-name" title={asset.name}>
                          {asset.name}
                        </span>
                        <span className="asset-meta">
                          {formatFileSize(asset.sizeBytes)} &middot; {formatDate(asset.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Panel - Asset Details */}
            {selectedAsset && (
              <div className="asset-detail-panel">
                <div className="detail-header">
                  <h3>Asset Details</h3>
                  <button className="btn-icon-small" onClick={() => setSelectedAsset(null)}>
                    <X size={16} />
                  </button>
                </div>

                <div className="detail-preview">
                  {selectedAsset.mimeType.startsWith('image/') ? (
                    <img src={selectedAsset.publicUrl} alt={selectedAsset.name} />
                  ) : (
                    <div className="preview-icon">{getFileIcon(selectedAsset.mimeType)}</div>
                  )}
                </div>

                <div className="detail-info">
                  <div className="detail-row">
                    <span className="detail-label">Name</span>
                    <span className="detail-value">{selectedAsset.name}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Filename</span>
                    <span className="detail-value">{selectedAsset.filename}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Type</span>
                    <span className="detail-value">{selectedAsset.mimeType}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Size</span>
                    <span className="detail-value">{formatFileSize(selectedAsset.sizeBytes)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Accessed</span>
                    <span className="detail-value">{selectedAsset.accessCount} times</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Created</span>
                    <span className="detail-value">{formatDate(selectedAsset.createdAt)}</span>
                  </div>
                </div>

                <div className="detail-url">
                  <span className="detail-label">Public URL</span>
                  <div className="url-box">
                    <input type="text" value={selectedAsset.publicUrl} readOnly />
                    <button
                      className="btn-icon-small"
                      title="Copy URL"
                      onClick={() => {
                        copyToClipboard(selectedAsset.publicUrl);
                        alert('URL copied!');
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>

                <div className="detail-actions">
                  <a
                    href={selectedAsset.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                  >
                    <ExternalLink size={14} /> Open
                  </a>
                  <button
                    className="btn-danger"
                    onClick={() => handleDeleteAsset(selectedAsset)}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="tab-content settings-tab">
          <div className="settings-card">
            <h3>Storage Configuration</h3>
            <div className="settings-form">
              <div className="form-group">
                <label>Storage Backend</label>
                <div className="storage-options">
                  <label className={`storage-option ${settings?.storageBackend === 'minio' || !settings?.storageBackend ? 'selected' : ''}`}>
                    <input type="radio" name="backend" value="minio" checked={settings?.storageBackend === 'minio' || !settings?.storageBackend} readOnly />
                    <HardDrive size={20} />
                    <div>
                      <strong>MinIO / S3</strong>
                      <span>Self-hosted object storage (default)</span>
                    </div>
                  </label>
                  <label className={`storage-option ${settings?.storageBackend === 'google_drive' ? 'selected' : ''}`}>
                    <input type="radio" name="backend" value="google_drive" checked={settings?.storageBackend === 'google_drive'} readOnly />
                    <Cloud size={20} />
                    <div>
                      <strong>Google Drive</strong>
                      <span>Store files in a Shared Drive (requires GWS)</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Cache TTL (seconds)</label>
                <input
                  type="number"
                  value={settings?.cacheTtlSeconds || 3600}
                  onChange={() => {}}
                  disabled
                />
                <p className="form-hint">How long to cache files before checking for updates</p>
              </div>

              <div className="form-group">
                <label>Max File Size (MB)</label>
                <input
                  type="number"
                  value={settings?.maxFileSizeMb || 10}
                  onChange={() => {}}
                  disabled
                />
              </div>

              <div className="form-group">
                <label>Allowed File Types</label>
                <div className="allowed-types">
                  {(settings?.allowedMimeTypes || []).map((type) => (
                    <span key={type} className="type-badge">
                      {type.split('/')[1]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {status?.isConfigured && (
            <div className="settings-card danger-zone">
              <h3>Danger Zone</h3>
              <p>These actions are destructive and cannot be undone.</p>
              <button className="btn-danger" disabled>
                Reset Storage Configuration
              </button>
            </div>
          )}
        </div>
      )}

      {/* Setup Wizard Modal */}
      {showSetupWizard && (
        <div className="modal-overlay" onClick={() => !isSettingUp && setShowSetupWizard(false)}>
          <div className="modal-content setup-wizard" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Set Up File Storage</h2>
              <button
                className="modal-close"
                onClick={() => setShowSetupWizard(false)}
                disabled={isSettingUp}
              >
                <X size={16} />
              </button>
            </div>

            <div className="wizard-content">
              {setupError && (
                <div className="error-banner">
                  <AlertCircle size={16} />
                  <span>{setupError}</span>
                </div>
              )}

              {setupStep === 1 && (
                <div className="wizard-step">
                  <div className="step-icon">
                    <Cloud size={32} />
                  </div>
                  <h3>Google Drive Storage</h3>
                  <p>
                    We'll create a "Helios Assets" Shared Drive in your Google Workspace to store
                    all uploaded files. The service account will be added as a manager.
                  </p>

                  <div className="prereq-check">
                    <h4>Requirements</h4>
                    <ul>
                      <li className={status?.hasGoogleWorkspace ? 'complete' : 'incomplete'}>
                        {status?.hasGoogleWorkspace ? (
                          <CheckCircle size={16} />
                        ) : (
                          <AlertCircle size={16} />
                        )}
                        Google Workspace module enabled
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {setupStep === 2 && (
                <div className="wizard-step">
                  <div className="step-icon">
                    <Loader size={32} className="spinner" />
                  </div>
                  <h3>Creating Shared Drive...</h3>
                  <p>This may take a moment. Please don't close this window.</p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowSetupWizard(false)}
                disabled={isSettingUp}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  if (setupStep === 1) {
                    setSetupStep(2);
                    handleSetup();
                  }
                }}
                disabled={isSettingUp || !status?.hasGoogleWorkspace}
              >
                {isSettingUp ? (
                  <>
                    <Loader size={14} className="spinner" /> Setting Up...
                  </>
                ) : (
                  <>
                    Create Shared Drive <ChevronRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div
          className="modal-overlay"
          onClick={() => !creatingFolder && setShowNewFolderModal(false)}
        >
          <div className="modal-content small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Folder</h2>
              <button
                className="modal-close"
                onClick={() => setShowNewFolderModal(false)}
                disabled={creatingFolder}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g., Logos"
                  disabled={creatingFolder}
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowNewFolderModal(false)}
                disabled={creatingFolder}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateFolder}
                disabled={creatingFolder || !newFolderName.trim()}
              >
                {creatingFolder ? (
                  <>
                    <Loader size={14} className="spinner" /> Creating...
                  </>
                ) : (
                  'Create Folder'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={() => {
            setShowUploadModal(false);
            fetchAssets(selectedFolder);
          }}
          selectedFolder={selectedFolder}
        />
      )}

      {/* Delete Asset Confirmation */}
      <ConfirmDialog
        isOpen={assetToDelete !== null}
        title="Delete Asset"
        message={`Are you sure you want to delete "${assetToDelete?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteAsset}
        onCancel={() => setAssetToDelete(null)}
      />
    </div>
  );
}

// Folder Tree Item Component
function FolderTreeItem({
  folder,
  selectedFolder,
  onSelect,
  level,
}: {
  folder: FolderTreeNode;
  selectedFolder: string | null;
  onSelect: (id: string) => void;
  level: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <div className="folder-tree-item">
      <button
        className={`folder-item ${selectedFolder === folder.id ? 'active' : ''}`}
        onClick={() => onSelect(folder.id)}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        {hasChildren && (
          <ChevronDown
            size={14}
            className={`expand-icon ${expanded ? 'expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          />
        )}
        <FolderOpen size={16} />
        <span>{folder.name}</span>
      </button>
      {hasChildren && expanded && (
        <div className="folder-children">
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Upload Modal Component
function UploadModal({
  onClose,
  onUploadComplete,
  selectedFolder,
}: {
  onClose: () => void;
  onUploadComplete: () => void;
  selectedFolder: string | null;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setName(file.name);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setName(file.name);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', name || selectedFile.name);
      if (selectedFolder) {
        formData.append('folderId', selectedFolder);
      }

      const response = await authFetch('/api/v1/assets/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      onUploadComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="modal-overlay" onClick={() => !isUploading && onClose()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload File</h2>
          <button className="modal-close" onClick={onClose} disabled={isUploading}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-banner">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept="image/*,.pdf,.svg"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={isUploading}
            />
            {selectedFile ? (
              <div className="selected-file-info">
                <Image size={24} />
                <div>
                  <div className="file-name">{selectedFile.name}</div>
                  <div className="file-size">{formatFileSize(selectedFile.size)}</div>
                </div>
                {!isUploading && (
                  <button
                    className="btn-icon-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setName('');
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <Upload size={32} />
                <p>Drag & drop a file or click to browse</p>
                <span className="hint">Images, PDFs, and SVG files up to 10MB</span>
              </>
            )}
          </div>

          {selectedFile && (
            <div className="form-group">
              <label>Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter a name for this asset"
                disabled={isUploading}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isUploading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? (
              <>
                <Loader size={14} className="spinner" /> Uploading...
              </>
            ) : (
              <>
                <Upload size={16} /> Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FilesAssets;
