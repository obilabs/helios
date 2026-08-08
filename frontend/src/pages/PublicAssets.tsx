import { useState, useEffect, useRef } from 'react';
import { Image, FileText, Video, Music, Paperclip, Upload, Search, RefreshCw, Package, Eye, Copy, Trash2, X, FolderOpen, Plus, Loader } from 'lucide-react';
import './PublicAssets.css';
import { authFetch } from '../config/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface Asset {
  id: string;
  asset_key: string;
  asset_type: string;
  module_source?: string;
  file_name: string;
  original_file_name: string;
  public_url: string;
  mime_type: string;
  file_size_bytes: number;
  width?: number;
  height?: number;
  tags?: string[];
  usage_count: number;
  uploaded_by_name?: string;
  created_at: string;
  last_accessed_at?: string;
}

interface PublicAssetsProps {
  organizationId: string;
}

export function PublicAssets({ organizationId }: PublicAssetsProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [assetKey, setAssetKey] = useState('');
  const [assetType, setAssetType] = useState('image');
  const [moduleSource, setModuleSource] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAssets();
  }, [organizationId]);

  const fetchAssets = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch('/api/v1/public-files');

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setAssets(data.data);
        } else {
          setAssets([]);
        }
      } else {
        setAssets([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load assets');
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select a file to upload');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', selectedFile);
      if (assetKey) formData.append('asset_key', assetKey);
      formData.append('asset_type', assetType);
      if (moduleSource) formData.append('module_source', moduleSource);
      if (tags.length > 0) formData.append('tags', JSON.stringify(tags));

      const response = await authFetch('/api/v1/public-files/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Success - close modal and refresh
      setShowUploadModal(false);
      setSelectedFile(null);
      setAssetKey('');
      setAssetType('image');
      setModuleSource('');
      setTags([]);
      setUploadProgress(0);
      await fetchAssets();

    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAsset = (asset: Asset) => {
    if (asset.usage_count > 0) {
      alert(`Cannot delete "${asset.original_file_name}" - it is being used in ${asset.usage_count} place(s)`);
      return;
    }
    setAssetToDelete(asset);
  };

  const confirmDeleteAsset = async () => {
    if (!assetToDelete) return;

    try {
      const response = await authFetch(`/api/v1/public-files/${assetToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete asset');
      }

      await fetchAssets();
    } catch (err: any) {
      alert(`Error deleting asset: ${err.message}`);
    } finally {
      setAssetToDelete(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image size={24} />;
    if (mimeType === 'application/pdf') return <FileText size={24} />;
    if (mimeType.startsWith('video/')) return <Video size={24} />;
    if (mimeType.startsWith('audio/')) return <Music size={24} />;
    return <Paperclip size={24} />;
  };

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.original_file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.asset_key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' ||
                       (filterType === 'image' && asset.mime_type.startsWith('image/')) ||
                       (filterType === 'pdf' && asset.mime_type === 'application/pdf') ||
                       (filterType === 'other' && !asset.mime_type.startsWith('image/') && asset.mime_type !== 'application/pdf');
    return matchesSearch && matchesType;
  });

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="loading-spinner">Loading assets...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Public Assets</h1>
          <p>Manage images, logos, and files used across templates and modules</p>
        </div>
        <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
          <Upload size={16} /> Upload Asset
        </button>
      </div>

      {/* Controls */}
      <div className="page-controls">
        <div className="search-box">
          <span className="search-icon"><Search size={16} /></span>
          <input
            type="text"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="image">Images</option>
          <option value="pdf">PDFs</option>
          <option value="other">Other</option>
        </select>
        <button className="btn-secondary" onClick={fetchAssets}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Assets Grid */}
      {filteredAssets.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Package size={32} /></span>
          <h3>No assets found</h3>
          <p>
            {searchQuery || filterType !== 'all'
              ? 'Try adjusting your filters'
              : 'Upload your first asset to get started'
            }
          </p>
          {!searchQuery && filterType === 'all' && (
            <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
              <Upload size={16} /> Upload Asset
            </button>
          )}
        </div>
      ) : (
        <div className="assets-grid">
          {filteredAssets.map(asset => {
            const isImage = asset.mime_type.startsWith('image/');
            return (
              <div key={asset.id} className="asset-card">
                <div className="asset-card-preview">
                  {isImage ? (
                    <img
                      src={`${asset.public_url}`}
                      alt={asset.original_file_name}
                      className="asset-image"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling!.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`asset-icon-placeholder ${isImage ? 'hidden' : ''}`}>
                    <span className="file-icon">{getFileIcon(asset.mime_type)}</span>
                  </div>
                  {asset.usage_count > 0 && (
                    <span className="usage-badge">{asset.usage_count} use{asset.usage_count !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="asset-card-info">
                  <h4 className="asset-name" title={asset.original_file_name}>
                    {asset.original_file_name}
                  </h4>
                  <div className="asset-meta">
                    <span className="asset-size">{formatFileSize(asset.file_size_bytes)}</span>
                    {asset.width && asset.height && (
                      <span className="asset-dimensions">{asset.width}×{asset.height}</span>
                    )}
                  </div>
                  {asset.tags && asset.tags.length > 0 && (
                    <div className="asset-tags">
                      {asset.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="asset-tag">{tag}</span>
                      ))}
                      {asset.tags.length > 2 && (
                        <span className="asset-tag">+{asset.tags.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="asset-card-actions">
                  <button
                    className="btn-icon"
                    title="View asset"
                    onClick={() => {
                      setSelectedAsset(asset);
                      setShowPreviewModal(true);
                    }}
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    className="btn-icon"
                    title="Copy URL"
                    onClick={() => {
                      navigator.clipboard.writeText(`${asset.public_url}`);
                      alert('URL copied to clipboard!');
                    }}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="btn-icon danger"
                    title="Delete asset"
                    onClick={() => handleDeleteAsset(asset)}
                    disabled={asset.usage_count > 0}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => !isUploading && setShowUploadModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Upload Asset</h2>
              <button
                className="modal-close"
                onClick={() => setShowUploadModal(false)}
                disabled={isUploading}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {uploadError && (
                <div className="error-message">{uploadError}</div>
              )}

              {/* File Drop Zone */}
              <div
                className={`file-drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                  disabled={isUploading}
                />
                {selectedFile ? (
                  <div className="selected-file">
                    <span className="file-icon">{getFileIcon(selectedFile.type)}</span>
                    <div className="file-info">
                      <div className="file-name">{selectedFile.name}</div>
                      <div className="file-size">{formatFileSize(selectedFile.size)}</div>
                    </div>
                    {!isUploading && (
                      <button
                        className="remove-file"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="drop-icon"><FolderOpen size={32} /></div>
                    <p className="drop-text">Drag & drop a file here or click to browse</p>
                    <p className="drop-hint">Supported: Images (JPG, PNG, GIF, WebP, SVG) and PDF files</p>
                  </>
                )}
              </div>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="upload-progress">
                  <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
                  <span className="progress-text">{uploadProgress}%</span>
                </div>
              )}

              <div className="form-group">
                <label>Asset Key (optional)</label>
                <input
                  type="text"
                  value={assetKey}
                  onChange={(e) => setAssetKey(e.target.value)}
                  placeholder="logo-2024"
                  disabled={isUploading}
                />
                <p className="form-hint">Unique identifier for referencing this asset in templates</p>
              </div>

              <div className="form-group">
                <label>Asset Type</label>
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value)}
                  disabled={isUploading}
                >
                  <option value="image">Image</option>
                  <option value="icon">Icon</option>
                  <option value="logo">Logo</option>
                  <option value="banner">Banner</option>
                  <option value="document">Document</option>
                </select>
              </div>

              <div className="form-group">
                <label>Module Source (optional)</label>
                <select
                  value={moduleSource}
                  onChange={(e) => setModuleSource(e.target.value)}
                  disabled={isUploading}
                >
                  <option value="">None</option>
                  <option value="template_studio">Template Studio</option>
                  <option value="email_signatures">Email Signatures</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tag-input-container">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add a tag and press Enter"
                    disabled={isUploading}
                  />
                  <button
                    className="btn-add-tag"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim() || isUploading}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="tag-list">
                    {tags.map(tag => (
                      <span key={tag} className="tag-item">
                        {tag}
                        <button
                          className="remove-tag"
                          onClick={() => handleRemoveTag(tag)}
                          disabled={isUploading}
                        >
                          <X size={16} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowUploadModal(false)}
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? <><Loader size={14} className="spin" /> Uploading...</> : <><Upload size={16} /> Upload Asset</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && selectedAsset && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedAsset.original_file_name}</h2>
              <button className="modal-close" onClick={() => setShowPreviewModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div className="asset-preview">
                {selectedAsset.mime_type.startsWith('image/') ? (
                  <img
                    src={`${selectedAsset.public_url}`}
                    alt={selectedAsset.original_file_name}
                    className="preview-image"
                  />
                ) : (
                  <div className="preview-placeholder">
                    <span className="preview-icon">{getFileIcon(selectedAsset.mime_type)}</span>
                    <p>Preview not available for this file type</p>
                  </div>
                )}
              </div>

              <div className="asset-details">
                <div className="detail-row">
                  <span className="detail-label">Asset Key:</span>
                  <span className="detail-value">{selectedAsset.asset_key}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">File Name:</span>
                  <span className="detail-value">{selectedAsset.file_name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">{selectedAsset.asset_type}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Size:</span>
                  <span className="detail-value">{formatFileSize(selectedAsset.file_size_bytes)}</span>
                </div>
                {selectedAsset.width && selectedAsset.height && (
                  <div className="detail-row">
                    <span className="detail-label">Dimensions:</span>
                    <span className="detail-value">{selectedAsset.width} × {selectedAsset.height} px</span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-label">Usage Count:</span>
                  <span className="detail-value">{selectedAsset.usage_count} place(s)</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">URL:</span>
                  <span className="detail-value url">{`${selectedAsset.public_url}`}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Uploaded:</span>
                  <span className="detail-value">{new Date(selectedAsset.created_at).toLocaleString()}</span>
                </div>
                {selectedAsset.uploaded_by_name && (
                  <div className="detail-row">
                    <span className="detail-label">Uploaded by:</span>
                    <span className="detail-value">{selectedAsset.uploaded_by_name}</span>
                  </div>
                )}
                {selectedAsset.tags && selectedAsset.tags.length > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Tags:</span>
                    <div className="detail-value">
                      <div className="tag-list">
                        {selectedAsset.tags.map(tag => (
                          <span key={tag} className="tag-item readonly">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowPreviewModal(false)}>
                Close
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  navigator.clipboard.writeText(`${selectedAsset.public_url}`);
                  alert('URL copied to clipboard!');
                }}
              >
                <Copy size={16} /> Copy URL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Asset Confirmation */}
      <ConfirmDialog
        isOpen={assetToDelete !== null}
        title="Delete Asset"
        message={`Are you sure you want to delete "${assetToDelete?.original_file_name}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteAsset}
        onCancel={() => setAssetToDelete(null)}
      />
    </div>
  );
}
