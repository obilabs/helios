// Media Asset Types for Google Drive Asset Proxy
// These types support the public asset proxy feature for email signatures

// ============================================================================
// Storage Types
// ============================================================================

export type StorageBackend = 'google_drive' | 'minio' | 's3';
export type AssetCategory = 'brand' | 'signature' | 'profile' | 'campaign';

// ============================================================================
// Database Entity Types
// ============================================================================

export interface MediaAsset {
  id: string;
  organizationId: string;

  // Storage
  storageType: StorageBackend;
  storagePath: string; // Google Drive file ID or MinIO path

  // Metadata
  name: string;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;

  // Organization
  folderId: string | null;
  category: AssetCategory | null;

  // Access
  accessToken: string; // URL-safe token for public URL
  isPublic: boolean;

  // Tracking
  accessCount: number;
  lastAccessedAt: Date | null;

  // Audit
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaAssetFolder {
  id: string;
  organizationId: string;
  name: string;
  path: string; // e.g., '/brand', '/signatures/banners'
  parentId: string | null;
  driveFolderId: string | null; // Google Drive folder ID
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaAssetSettings {
  organizationId: string;
  storageBackend: StorageBackend;
  driveSharedDriveId: string | null;
  driveRootFolderId: string | null;
  cacheTtlSeconds: number;
  maxFileSizeMb: number;
  allowedMimeTypes: string[];
  isConfigured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

// Create Asset
export interface CreateMediaAssetRequest {
  name: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  folderId?: string;
  category?: AssetCategory;
  storagePath: string; // Drive file ID or MinIO path
  storageType?: StorageBackend;
}

// Upload Asset (multipart form data)
export interface UploadMediaAssetRequest {
  name: string;
  folderId?: string;
  category?: AssetCategory;
}

// Update Asset
export interface UpdateMediaAssetRequest {
  name?: string;
  folderId?: string;
  category?: AssetCategory;
}

// Asset with public URL
export interface MediaAssetWithUrl extends MediaAsset {
  publicUrl: string;
}

// List Assets Query
export interface ListMediaAssetsQuery {
  folderId?: string;
  category?: AssetCategory;
  search?: string;
  limit?: number;
  offset?: number;
}

// List Assets Response
export interface ListMediaAssetsResponse {
  assets: MediaAssetWithUrl[];
  total: number;
  limit: number;
  offset: number;
}

// Create Folder
export interface CreateMediaAssetFolderRequest {
  name: string;
  parentPath?: string; // e.g., '/signatures'
}

// Folder Tree Node (for UI)
export interface FolderTreeNode {
  id: string;
  name: string;
  path: string;
  driveFolderId: string | null;
  children: FolderTreeNode[];
}

// Asset Settings Update
export interface UpdateMediaAssetSettingsRequest {
  storageBackend?: StorageBackend;
  cacheTtlSeconds?: number;
  maxFileSizeMb?: number;
  allowedMimeTypes?: string[];
}

// Setup Status
export interface MediaAssetSetupStatus {
  isConfigured: boolean;
  storageBackend: StorageBackend;
  hasGoogleWorkspace: boolean;
  hasDriveAccess: boolean;
  sharedDriveName?: string;
  folderCount: number;
  assetCount: number;
}

// ============================================================================
// Service Types
// ============================================================================

// Storage Service Interface
export interface IAssetStorageService {
  uploadFile(file: Buffer, filename: string, mimeType: string, folderId?: string): Promise<StorageUploadResult>;
  getFile(storagePath: string): Promise<Buffer>;
  deleteFile(storagePath: string): Promise<void>;
  createFolder(name: string, parentFolderId?: string): Promise<string>;
  listFiles(folderId?: string): Promise<StorageFile[]>;
}

export interface StorageUploadResult {
  storagePath: string; // Drive file ID or MinIO path
  webViewLink?: string; // Optional link to view in Drive
}

export interface StorageFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: Date;
  modifiedTime: Date;
}

// Cache Service Interface
export interface IAssetCacheService {
  get(accessToken: string): Promise<CachedAsset | null>;
  set(accessToken: string, data: Buffer, mimeType: string, ttlSeconds?: number): Promise<void>;
  invalidate(accessToken: string): Promise<void>;
  invalidateAll(organizationId: string): Promise<void>;
}

export interface CachedAsset {
  data: Buffer;
  mimeType: string;
  cachedAt: Date;
}

// ============================================================================
// Proxy Types
// ============================================================================

// Proxy Response Headers
export interface AssetProxyHeaders {
  'Content-Type': string;
  'Content-Length': string;
  'Cache-Control': string;
  'ETag'?: string;
  'Last-Modified'?: string;
  'X-Asset-Id'?: string;
}

// Proxy Error Types
export class AssetNotFoundError extends Error {
  constructor(message = 'Asset not found') {
    super(message);
    this.name = 'AssetNotFoundError';
  }
}

export class AssetAccessDeniedError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'AssetAccessDeniedError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = 'Storage temporarily unavailable') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

// ============================================================================
// Event Types (for analytics)
// ============================================================================

export interface AssetAccessEvent {
  assetId: string;
  accessToken: string;
  organizationId: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
}

// ============================================================================
// Validation Constants
// ============================================================================

export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const;

export const DEFAULT_CACHE_TTL_SECONDS = 3600; // 1 hour
export const DEFAULT_MAX_FILE_SIZE_MB = 10;
export const MAX_CACHEABLE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB - larger files not cached

export const DEFAULT_FOLDERS = [
  { name: 'Brand', path: '/brand' },
  { name: 'Signatures', path: '/signatures' },
  { name: 'Banners', path: '/signatures/banners', parent: '/signatures' },
  { name: 'Social Icons', path: '/signatures/social-icons', parent: '/signatures' },
  { name: 'Profiles', path: '/profiles' },
  { name: 'Campaigns', path: '/campaigns' },
] as const;
