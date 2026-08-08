import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen,
  Upload,
  Loader,
  Copy,
  Search,
  Trash2,
  X,
  Check,
  Tag,
  Users,
  User,
  HardDrive,
  ExternalLink,
  Image,
  FileText,
} from 'lucide-react';
import './Assets.css';
import { authFetch } from '../config/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface AssetsProps {
  organizationId: string;
}

interface Asset {
  id: string;
  organizationId: string;
  storageType: string;
  storagePath: string;
  name: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  accessToken: string;
  slug: string | null;
  scope: 'shared' | 'personal';
  tags: string[];
  accessCount: number;
  lastAccessedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publicUrl: string;
}

type ScopeFilter = 'all' | 'shared' | 'personal';

export function Assets({ organizationId: _organizationId }: AssetsProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadScope, setUploadScope] = useState<'shared' | 'personal'>('shared');
  const [uploadTags, setUploadTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Selected asset for detail panel
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Delete confirmation
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (scopeFilter !== 'all') {
        params.append('scope', scopeFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const url = `/api/v1/assets${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await authFetch(url);

      if (response.ok) {
        const data = await response.json();
        setAssets(data.data || []);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load assets');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load assets');
    } finally {
      setIsLoading(false);
    }
  }, [scopeFilter, searchQuery]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleUpload = async () => {
    if (!uploadFile) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadName || uploadFile.name.replace(/\.[^/.]+$/, ''));
      formData.append('scope', uploadScope);
      if (uploadTags) {
        formData.append('tags', uploadTags);
      }

      const response = await authFetch('/api/v1/assets/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadName('');
        setUploadScope('shared');
        setUploadTags('');
        fetchAssets();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!assetToDelete) return;

    try {
      const response = await authFetch(`/api/v1/assets/${assetToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setAssetToDelete(null);
        setSelectedAsset(null);
        fetchAssets();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Delete failed');
      }
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image size={16} className="file-icon" />;
    }
    return <FileText size={16} className="file-icon" />;
  };

  return (
    <div className="assets-page">
      <div className="assets-header">
        <div className="header-left">
          <h1><FolderOpen size={24} /> Assets</h1>
          <p>Manage images and files for signatures, templates, and more</p>
        </div>
        <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
          <Upload size={16} />
          Upload Asset
        </button>
      </div>

      {/* Scope Filter Tabs */}
      <div className="assets-tabs">
        <button
          className={`tab ${scopeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setScopeFilter('all')}
        >
          All
        </button>
        <button
          className={`tab ${scopeFilter === 'shared' ? 'active' : ''}`}
          onClick={() => setScopeFilter('shared')}
        >
          <Users size={14} />
          Shared
        </button>
        <button
          className={`tab ${scopeFilter === 'personal' ? 'active' : ''}`}
          onClick={() => setScopeFilter('personal')}
        >
          <User size={14} />
          Personal
        </button>
      </div>

      {/* Search */}
      <div className="assets-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="Search assets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="clear-search" onClick={() => setSearchQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* Assets List */}
      <div className="assets-content">
        <div className="assets-list">
          {isLoading ? (
            <div className="loading-state">
              <Loader className="spin" size={24} />
              <span>Loading assets...</span>
            </div>
          ) : assets.length === 0 ? (
            <div className="empty-state">
              <FolderOpen size={48} />
              <h3>No assets found</h3>
              <p>
                {scopeFilter === 'personal'
                  ? 'Upload your personal assets like certification badges'
                  : scopeFilter === 'shared'
                  ? 'Upload shared assets like company logos'
                  : 'Upload your first asset to get started'}
              </p>
              <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
                <Upload size={16} />
                Upload Asset
              </button>
            </div>
          ) : (
            <table className="assets-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Scope</th>
                  <th>Tags</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr
                    key={asset.id}
                    className={selectedAsset?.id === asset.id ? 'selected' : ''}
                    onClick={() => setSelectedAsset(asset)}
                  >
                    <td className="asset-name-cell">
                      {getFileIcon(asset.mimeType)}
                      <span className="asset-name">{asset.name}</span>
                    </td>
                    <td>
                      <span className={`scope-badge ${asset.scope}`}>
                        {asset.scope === 'shared' ? <Users size={12} /> : <User size={12} />}
                        {asset.scope}
                      </span>
                    </td>
                    <td className="tags-cell">
                      {asset.tags.length > 0 ? (
                        <div className="tags-list">
                          {asset.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                          {asset.tags.length > 2 && (
                            <span className="tag more">+{asset.tags.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="no-tags">—</span>
                      )}
                    </td>
                    <td>{formatFileSize(asset.sizeBytes)}</td>
                    <td>{formatDate(asset.createdAt)}</td>
                    <td>
                      <button
                        className="copy-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(asset.publicUrl, asset.id);
                        }}
                        title="Copy URL"
                      >
                        {copiedId === asset.id ? (
                          <Check size={14} className="copied" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail Panel */}
        {selectedAsset && (
          <div className="asset-detail-panel">
            <div className="panel-header">
              <h3>{selectedAsset.name}</h3>
              <button className="close-btn" onClick={() => setSelectedAsset(null)}>
                <X size={16} />
              </button>
            </div>

            {selectedAsset.mimeType.startsWith('image/') && (
              <div className="asset-preview">
                <img
                  src={selectedAsset.publicUrl}
                  alt={selectedAsset.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="panel-details">
              <div className="detail-row">
                <label>Filename</label>
                <span>{selectedAsset.filename}</span>
              </div>
              <div className="detail-row">
                <label>Type</label>
                <span>{selectedAsset.mimeType}</span>
              </div>
              <div className="detail-row">
                <label>Size</label>
                <span>{formatFileSize(selectedAsset.sizeBytes)}</span>
              </div>
              <div className="detail-row">
                <label>Scope</label>
                <span className={`scope-badge ${selectedAsset.scope}`}>
                  {selectedAsset.scope === 'shared' ? <Users size={12} /> : <User size={12} />}
                  {selectedAsset.scope}
                </span>
              </div>
              {selectedAsset.tags.length > 0 && (
                <div className="detail-row">
                  <label>Tags</label>
                  <div className="tags-list">
                    {selectedAsset.tags.map((tag) => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="detail-row">
                <label>Public URL</label>
                <div className="url-row">
                  <code>{selectedAsset.publicUrl}</code>
                  <button
                    className="copy-btn"
                    onClick={() => copyToClipboard(selectedAsset.publicUrl, selectedAsset.id + '-detail')}
                  >
                    {copiedId === selectedAsset.id + '-detail' ? (
                      <Check size={14} className="copied" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                  <a
                    href={selectedAsset.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="open-btn"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
              <div className="detail-row">
                <label>Views</label>
                <span>{selectedAsset.accessCount}</span>
              </div>
              <div className="detail-row">
                <label>Created</label>
                <span>{formatDate(selectedAsset.createdAt)}</span>
              </div>
            </div>

            <div className="panel-actions">
              <button
                className="btn-danger"
                onClick={() => setAssetToDelete(selectedAsset)}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Backups Coming Soon Card */}
      <div className="backups-card">
        <div className="backups-icon">
          <HardDrive size={24} />
        </div>
        <div className="backups-content">
          <h3>Backups</h3>
          <p>Configure automatic backups to Google Drive. Coming soon.</p>
        </div>
        <span className="coming-soon-badge">Coming Soon</span>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Upload Asset</h2>
              <button className="close-btn" onClick={() => setShowUploadModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>File</label>
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadFile(file);
                        if (!uploadName) {
                          setUploadName(file.name.replace(/\.[^/.]+$/, ''));
                        }
                      }
                    }}
                  />
                  {uploadFile ? (
                    <div className="file-selected">
                      <span>{uploadFile.name}</span>
                      <button onClick={() => setUploadFile(null)}><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="file-placeholder">
                      <Upload size={20} />
                      <span>Choose a file or drag it here</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Asset name"
                />
              </div>

              <div className="form-group">
                <label>Scope</label>
                <div className="scope-options">
                  <button
                    className={`scope-option ${uploadScope === 'shared' ? 'active' : ''}`}
                    onClick={() => setUploadScope('shared')}
                  >
                    <Users size={16} />
                    <div>
                      <strong>Shared</strong>
                      <span>Organization-wide asset</span>
                    </div>
                  </button>
                  <button
                    className={`scope-option ${uploadScope === 'personal' ? 'active' : ''}`}
                    onClick={() => setUploadScope('personal')}
                  >
                    <User size={16} />
                    <div>
                      <strong>Personal</strong>
                      <span>Your personal asset</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>
                  <Tag size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Tags (optional)
                </label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="certification_badge, headshot (comma-separated)"
                />
                <span className="help-text">
                  Tags let you reference assets dynamically in templates
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowUploadModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={!uploadFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader className="spin" size={14} />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!assetToDelete}
        title="Delete Asset"
        message={`Are you sure you want to delete "${assetToDelete?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Delete"
        onConfirm={handleDelete}
        onCancel={() => setAssetToDelete(null)}
      />
    </div>
  );
}
