import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Image, Upload, Copy, Check, Search, FolderOpen, File } from 'lucide-react';
import { authFetch } from '../config/api';
import './AssetPickerModal.css';

interface Asset {
  id: string;
  name: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  category?: string;
  publicUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

interface Folder {
  id: string;
  name: string;
  path: string;
  children?: Folder[];
}

interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  title?: string;
  acceptedTypes?: string[]; // e.g., ['image/png', 'image/jpeg']
  category?: string; // Filter by category
}

const API_BASE = '/api/v1';

export function AssetPickerModal({
  isOpen,
  onClose,
  onSelect,
  title = 'Select Asset',
  acceptedTypes,
  category,
}: AssetPickerModalProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [copied, setCopied] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Hide folder sidebar for user-specific categories (profiles, avatars)
  const hideFolders = category === 'profiles' || category === 'avatar' || category === 'profile';

  // Fetch assets
  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedFolder) params.append('folderId', selectedFolder);
      if (category) params.append('category', category);
      if (searchQuery) params.append('search', searchQuery);

      const response = await authFetch(`${API_BASE}/assets?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch assets');
      }

      const data = await response.json();
      // API returns { data: { assets: [...], total, limit, offset } }
      let assetList = data.data?.assets || data.data || [];

      // Ensure assetList is an array
      if (!Array.isArray(assetList)) {
        assetList = [];
      }

      // Filter by accepted types if specified
      if (acceptedTypes && acceptedTypes.length > 0) {
        assetList = assetList.filter((a: Asset) =>
          acceptedTypes.some(t => a.mimeType.startsWith(t.replace('/*', '')))
        );
      }

      setAssets(assetList);
    } catch (err: any) {
      setError(err.message);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFolder, category, searchQuery, acceptedTypes]);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const response = await authFetch(`${API_BASE}/assets/folders`);

      if (response.ok) {
        const data = await response.json();
        setFolders(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchAssets();
      fetchFolders();
    }
  }, [isOpen, fetchAssets, fetchFolders]);

  // Handle file upload
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', files[0]);
      if (selectedFolder) {
        formData.append('folderId', selectedFolder);
      }
      if (category) {
        formData.append('category', category);
      }

      const response = await authFetch(`${API_BASE}/assets/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      // Refresh assets list
      await fetchAssets();
      setShowUpload(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Copy URL to clipboard
  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Check if asset is an image
  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  if (!isOpen) return null;

  return (
    <div className="asset-picker-overlay" onClick={onClose}>
      <div className="asset-picker-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="asset-picker-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="asset-picker-toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className="btn-secondary"
            onClick={() => setShowUpload(!showUpload)}
          >
            <Upload size={16} />
            Upload
          </button>
        </div>

        {/* Upload area */}
        {showUpload && (
          <div className="upload-area">
            <input
              type="file"
              id="asset-upload"
              accept={acceptedTypes?.join(',') || 'image/*'}
              onChange={e => handleUpload(e.target.files)}
              disabled={uploading}
            />
            <label htmlFor="asset-upload" className="upload-zone">
              {uploading ? (
                <Loader2 size={24} className="spin" />
              ) : (
                <>
                  <Upload size={24} />
                  <span>Click or drag file to upload</span>
                </>
              )}
            </label>
          </div>
        )}

        {/* Main content */}
        <div className={`asset-picker-content ${hideFolders ? 'no-sidebar' : ''}`}>
          {/* Folder sidebar - hidden for profile/avatar categories */}
          {!hideFolders && (
            <div className="folder-sidebar">
              <div
                className={`folder-item ${!selectedFolder ? 'active' : ''}`}
                onClick={() => setSelectedFolder(null)}
              >
                <FolderOpen size={16} />
                <span>All Files</span>
              </div>
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className={`folder-item ${selectedFolder === folder.id ? 'active' : ''}`}
                  onClick={() => setSelectedFolder(folder.id)}
                >
                  <FolderOpen size={16} />
                  <span>{folder.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Asset grid */}
          <div className="asset-grid-container">
            {loading ? (
              <div className="loading-state">
                <Loader2 size={32} className="spin" />
                <span>Loading assets...</span>
              </div>
            ) : error ? (
              <div className="error-state">
                <span>{error}</span>
                <button onClick={fetchAssets}>Try Again</button>
              </div>
            ) : assets.length === 0 ? (
              <div className="empty-state">
                <Image size={48} />
                <span>No assets found</span>
                <button onClick={() => setShowUpload(true)}>Upload First Asset</button>
              </div>
            ) : (
              <div className="asset-grid">
                {assets.map(asset => (
                  <div
                    key={asset.id}
                    className={`asset-item ${selectedAsset?.id === asset.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAsset(asset)}
                    onDoubleClick={() => onSelect(asset)}
                  >
                    {isImage(asset.mimeType) ? (
                      <img
                        src={asset.publicUrl || asset.thumbnailUrl}
                        alt={asset.name}
                        className="asset-thumbnail"
                      />
                    ) : (
                      <div className="asset-thumbnail file-icon">
                        <File size={32} />
                      </div>
                    )}
                    <div className="asset-name">{asset.name}</div>
                    <div className="asset-size">{formatSize(asset.sizeBytes)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedAsset && (
            <div className="asset-detail-panel">
              <h3>Selected Asset</h3>
              {isImage(selectedAsset.mimeType) && (
                <img
                  src={selectedAsset.publicUrl}
                  alt={selectedAsset.name}
                  className="detail-preview"
                />
              )}
              <div className="detail-info">
                <div className="detail-row">
                  <span className="label">Name:</span>
                  <span className="value">{selectedAsset.name}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Type:</span>
                  <span className="value">{selectedAsset.mimeType}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Size:</span>
                  <span className="value">{formatSize(selectedAsset.sizeBytes)}</span>
                </div>
              </div>
              {selectedAsset.publicUrl && (
                <div className="url-section">
                  <label>Public URL:</label>
                  <div className="url-box">
                    <input
                      type="text"
                      value={selectedAsset.publicUrl}
                      readOnly
                    />
                    <button
                      className="btn-icon"
                      onClick={() => handleCopyUrl(selectedAsset.publicUrl!)}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="asset-picker-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!selectedAsset}
            onClick={() => selectedAsset && onSelect(selectedAsset)}
          >
            Select Asset
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssetPickerModal;
