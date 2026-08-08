import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import { googleDriveService } from './google-drive.service.js';
import { s3Service } from './s3.service.js';
import crypto from 'crypto';
import type {
  StorageBackend,
  StorageUploadResult,
  StorageFile,
  MediaAssetSettings,
} from '../types/media-assets.js';

/**
 * Media Asset Storage Service
 *
 * Provides a unified interface for storing and retrieving media assets
 * across different storage backends (Google Drive, MinIO).
 *
 * This service handles:
 * - File upload to the configured storage backend
 * - File download/retrieval
 * - Folder management
 * - Backend-agnostic operations
 *
 * Note: This service requires organizationId for all operations since
 * credentials are stored per-organization. This differs from the generic
 * IAssetStorageService interface which is organization-agnostic.
 */
export class MediaAssetStorageService {
  /**
   * Get storage settings for an organization
   */
  async getSettings(organizationId: string): Promise<MediaAssetSettings | null> {
    try {
      const result = await db.query(
        `SELECT
          organization_id,
          storage_backend,
          drive_shared_drive_id,
          drive_root_folder_id,
          cache_ttl_seconds,
          max_file_size_mb,
          allowed_mime_types,
          is_configured,
          created_at,
          updated_at
        FROM media_asset_settings
        WHERE organization_id = $1`,
        [organizationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        organizationId: row.organization_id,
        storageBackend: row.storage_backend as StorageBackend,
        driveSharedDriveId: row.drive_shared_drive_id,
        driveRootFolderId: row.drive_root_folder_id,
        cacheTtlSeconds: row.cache_ttl_seconds,
        maxFileSizeMb: row.max_file_size_mb,
        allowedMimeTypes: row.allowed_mime_types || [],
        isConfigured: row.is_configured,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('Failed to get storage settings', { organizationId, error });
      return null;
    }
  }

  /**
   * Initialize or update storage settings
   */
  async updateSettings(
    organizationId: string,
    settings: Partial<MediaAssetSettings>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await db.query(
        `INSERT INTO media_asset_settings (
          organization_id,
          storage_backend,
          drive_shared_drive_id,
          drive_root_folder_id,
          cache_ttl_seconds,
          max_file_size_mb,
          allowed_mime_types,
          is_configured
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (organization_id) DO UPDATE SET
          storage_backend = COALESCE($2, media_asset_settings.storage_backend),
          drive_shared_drive_id = COALESCE($3, media_asset_settings.drive_shared_drive_id),
          drive_root_folder_id = COALESCE($4, media_asset_settings.drive_root_folder_id),
          cache_ttl_seconds = COALESCE($5, media_asset_settings.cache_ttl_seconds),
          max_file_size_mb = COALESCE($6, media_asset_settings.max_file_size_mb),
          allowed_mime_types = COALESCE($7, media_asset_settings.allowed_mime_types),
          is_configured = COALESCE($8, media_asset_settings.is_configured),
          updated_at = NOW()`,
        [
          organizationId,
          settings.storageBackend || 'google_drive',
          settings.driveSharedDriveId || null,
          settings.driveRootFolderId || null,
          settings.cacheTtlSeconds || 3600,
          settings.maxFileSizeMb || 10,
          settings.allowedMimeTypes || null,
          settings.isConfigured ?? false,
        ]
      );

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to update storage settings', { organizationId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Upload a file to storage
   */
  async uploadFile(
    organizationId: string,
    file: Buffer,
    filename: string,
    mimeType: string,
    folderId?: string
  ): Promise<{ success: boolean; result?: StorageUploadResult; error?: string }> {
    const settings = await this.getSettings(organizationId);
    const backend = settings?.storageBackend || 'google_drive';

    if (backend === 'google_drive') {
      return this.uploadToGoogleDrive(organizationId, file, filename, mimeType, folderId, settings);
    } else if (backend === 'minio') {
      return this.uploadToMinIO(organizationId, file, filename, mimeType, folderId);
    } else {
      return { success: false, error: `Unsupported storage backend: ${backend}` };
    }
  }

  /**
   * Upload file to Google Drive
   */
  private async uploadToGoogleDrive(
    organizationId: string,
    file: Buffer,
    filename: string,
    mimeType: string,
    folderId?: string,
    settings?: MediaAssetSettings | null
  ): Promise<{ success: boolean; result?: StorageUploadResult; error?: string }> {
    // Determine the parent folder
    let parentFolderId = folderId;

    // If no folder specified but we have settings, try to get the Drive folder ID
    if (!parentFolderId && settings) {
      // Look up the folder in our database to get the Drive folder ID
      const folderResult = await db.query(
        `SELECT drive_folder_id FROM media_asset_folders
         WHERE organization_id = $1 AND id = $2`,
        [organizationId, folderId]
      );
      if (folderResult.rows.length > 0 && folderResult.rows[0].drive_folder_id) {
        parentFolderId = folderResult.rows[0].drive_folder_id;
      } else if (settings.driveRootFolderId) {
        parentFolderId = settings.driveRootFolderId;
      }
    }

    // Upload to Google Drive
    return googleDriveService.uploadFile(organizationId, file, filename, mimeType, parentFolderId);
  }

  /**
   * Upload file to MinIO
   */
  private async uploadToMinIO(
    organizationId: string,
    file: Buffer,
    filename: string,
    mimeType: string,
    folderId?: string
  ): Promise<{ success: boolean; result?: StorageUploadResult; error?: string }> {
    try {
      // Generate a unique storage path for assets
      const timestamp = Date.now();
      const hash = crypto.randomBytes(8).toString('hex');
      const extension = filename.split('.').pop() || 'bin';
      const folderPrefix = folderId ? `${folderId}/` : 'assets/';
      const key = `${organizationId}/${folderPrefix}${timestamp}_${hash}.${extension}`;

      // Upload to MinIO via S3 service (public bucket for assets)
      const uploadResult = await s3Service.uploadFile(
        file,
        {
          organizationId,
          category: 'public',
          originalName: filename,
          mimeType,
          size: file.length,
        },
        true // Assets are public
      );

      if (!uploadResult.success) {
        return { success: false, error: uploadResult.error };
      }

      logger.info('File uploaded to MinIO', { organizationId, filename, key: uploadResult.key });

      return {
        success: true,
        result: {
          storagePath: uploadResult.key!,
          webViewLink: uploadResult.url,
        },
      };
    } catch (error: any) {
      logger.error('Failed to upload file to MinIO', { organizationId, filename, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a file from storage
   */
  async getFile(
    organizationId: string,
    storagePath: string,
    storageType: StorageBackend = 'google_drive'
  ): Promise<{ success: boolean; data?: Buffer; mimeType?: string; error?: string }> {
    if (storageType === 'google_drive') {
      return googleDriveService.downloadFile(organizationId, storagePath);
    } else if (storageType === 'minio') {
      return this.getFileFromMinIO(organizationId, storagePath);
    } else {
      return { success: false, error: `Unsupported storage type: ${storageType}` };
    }
  }

  /**
   * Get file from MinIO
   */
  private async getFileFromMinIO(
    organizationId: string,
    storagePath: string
  ): Promise<{ success: boolean; data?: Buffer; mimeType?: string; error?: string }> {
    try {
      // Download from MinIO via S3 service (public bucket for assets)
      const data = await s3Service.downloadFile(storagePath, true);

      if (!data) {
        return { success: false, error: 'File not found in MinIO storage' };
      }

      // Determine mime type from extension
      const extension = storagePath.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'pdf': 'application/pdf',
      };
      const mimeType = mimeTypes[extension] || 'application/octet-stream';

      logger.debug('File downloaded from MinIO', { organizationId, storagePath, size: data.length });

      return {
        success: true,
        data,
        mimeType,
      };
    } catch (error: any) {
      logger.error('Failed to get file from MinIO', { organizationId, storagePath, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(
    organizationId: string,
    storagePath: string,
    storageType: StorageBackend = 'google_drive'
  ): Promise<{ success: boolean; error?: string }> {
    if (storageType === 'google_drive') {
      return googleDriveService.deleteFile(organizationId, storagePath);
    } else if (storageType === 'minio') {
      try {
        const deleted = await s3Service.deleteFile(storagePath, true);
        if (!deleted) {
          return { success: false, error: 'Failed to delete file from MinIO' };
        }
        logger.info('File deleted from MinIO', { organizationId, storagePath });
        return { success: true };
      } catch (error: any) {
        logger.error('Failed to delete file from MinIO', { organizationId, storagePath, error: error.message });
        return { success: false, error: error.message };
      }
    } else {
      return { success: false, error: `Unsupported storage type: ${storageType}` };
    }
  }

  /**
   * Create a folder in storage
   */
  async createFolder(
    organizationId: string,
    name: string,
    parentFolderId?: string
  ): Promise<{ success: boolean; folderId?: string; error?: string }> {
    const settings = await this.getSettings(organizationId);
    const backend = settings?.storageBackend || 'google_drive';

    if (backend === 'google_drive') {
      // Get Drive folder ID for parent if specified
      let driveParentId = parentFolderId;

      if (parentFolderId) {
        const folderResult = await db.query(
          `SELECT drive_folder_id FROM media_asset_folders
           WHERE organization_id = $1 AND id = $2`,
          [organizationId, parentFolderId]
        );
        if (folderResult.rows.length > 0 && folderResult.rows[0].drive_folder_id) {
          driveParentId = folderResult.rows[0].drive_folder_id;
        }
      } else if (settings?.driveSharedDriveId) {
        driveParentId = settings.driveSharedDriveId;
      }

      return googleDriveService.createFolder(organizationId, name, driveParentId);
    } else if (backend === 'minio') {
      // MinIO doesn't have real folders, just object prefixes
      // Return a fake folder ID
      return { success: true, folderId: `minio:${organizationId}/${name}` };
    } else {
      return { success: false, error: `Unsupported storage backend: ${backend}` };
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(
    organizationId: string,
    folderId?: string
  ): Promise<{ success: boolean; files?: StorageFile[]; error?: string }> {
    const settings = await this.getSettings(organizationId);
    const backend = settings?.storageBackend || 'google_drive';

    if (backend === 'google_drive') {
      // Get Drive folder ID
      let driveFolderId = folderId;

      if (folderId) {
        const folderResult = await db.query(
          `SELECT drive_folder_id FROM media_asset_folders
           WHERE organization_id = $1 AND id = $2`,
          [organizationId, folderId]
        );
        if (folderResult.rows.length > 0 && folderResult.rows[0].drive_folder_id) {
          driveFolderId = folderResult.rows[0].drive_folder_id;
        }
      }

      return googleDriveService.listFiles(organizationId, driveFolderId, settings?.driveSharedDriveId || undefined);
    } else if (backend === 'minio') {
      try {
        // MinIO uses object prefixes as "folders"
        const prefix = folderId ? `${organizationId}/${folderId}/` : `${organizationId}/assets/`;
        const keys = await s3Service.listFiles(prefix, true);

        // Convert keys to StorageFile format
        const now = new Date();
        const files: StorageFile[] = keys.map((key) => {
          const filename = key.split('/').pop() || key;
          const extension = filename.split('.').pop()?.toLowerCase() || '';
          const mimeTypes: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
          };

          return {
            id: key,
            name: filename,
            mimeType: mimeTypes[extension] || 'application/octet-stream',
            size: 0, // Size not available without head call
            createdTime: now, // MinIO list doesn't return timestamps
            modifiedTime: now,
          };
        });

        return { success: true, files };
      } catch (error: any) {
        logger.error('Failed to list files from MinIO', { organizationId, folderId, error: error.message });
        return { success: false, error: error.message };
      }
    } else {
      return { success: false, error: `Unsupported storage backend: ${backend}` };
    }
  }

  /**
   * Setup storage for an organization (create Shared Drive and folders)
   */
  async setupStorage(
    organizationId: string,
    backend: StorageBackend = 'google_drive'
  ): Promise<{ success: boolean; error?: string }> {
    if (backend === 'google_drive') {
      return this.setupGoogleDriveStorage(organizationId);
    } else if (backend === 'minio') {
      return this.setupMinIOStorage(organizationId);
    } else {
      return { success: false, error: `Unsupported storage backend: ${backend}` };
    }
  }

  /**
   * Setup Google Drive storage
   */
  private async setupGoogleDriveStorage(
    organizationId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Test connection first
      const connectionTest = await googleDriveService.testConnection(organizationId);
      if (!connectionTest.success) {
        return { success: false, error: connectionTest.error };
      }

      // Create the Shared Drive and folders
      const setupResult = await googleDriveService.setupAssetsDrive(organizationId);
      if (!setupResult.success) {
        return { success: false, error: setupResult.error };
      }

      // Update database with Drive IDs
      await db.query('BEGIN');

      try {
        // Save settings
        await this.updateSettings(organizationId, {
          storageBackend: 'google_drive',
          driveSharedDriveId: setupResult.sharedDriveId,
          isConfigured: true,
        });

        // Update folder records with Drive folder IDs
        if (setupResult.folders) {
          for (const folder of setupResult.folders) {
            await db.query(
              `UPDATE media_asset_folders
               SET drive_folder_id = $1, updated_at = NOW()
               WHERE organization_id = $2 AND path = $3`,
              [folder.driveFolderId, organizationId, folder.path]
            );
          }
        }

        await db.query('COMMIT');

        logger.info('Google Drive storage setup complete', {
          organizationId,
          sharedDriveId: setupResult.sharedDriveId,
          folderCount: setupResult.folders?.length || 0,
        });

        return { success: true };
      } catch (dbError) {
        await db.query('ROLLBACK');
        throw dbError;
      }
    } catch (error: any) {
      logger.error('Failed to setup Google Drive storage', { organizationId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup MinIO storage
   */
  private async setupMinIOStorage(
    organizationId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Initialize S3 service (creates buckets if they don't exist)
      await s3Service.initialize();

      // Save settings to database
      await this.updateSettings(organizationId, {
        storageBackend: 'minio',
        isConfigured: true,
      });

      logger.info('MinIO storage setup complete', { organizationId });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to setup MinIO storage', { organizationId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if storage is configured for an organization
   */
  async isConfigured(organizationId: string): Promise<boolean> {
    const settings = await this.getSettings(organizationId);
    return settings?.isConfigured ?? false;
  }

  /**
   * Get storage status
   * Auto-configures MinIO if it's available and no storage is configured
   */
  async getStatus(organizationId: string): Promise<{
    isConfigured: boolean;
    backend: StorageBackend;
    sharedDriveId?: string;
    canUpload: boolean;
    error?: string;
  }> {
    const settings = await this.getSettings(organizationId);

    // Auto-configure MinIO if no storage is set up
    if (!settings || !settings.isConfigured) {
      try {
        // Check if MinIO is available
        await s3Service.initialize();
        await s3Service.listFiles(`${organizationId}/`, true);

        // MinIO is available - auto-configure it
        logger.info('MinIO detected, auto-configuring as default storage', { organizationId });
        await this.updateSettings(organizationId, {
          storageBackend: 'minio',
          isConfigured: true,
        });

        return {
          isConfigured: true,
          backend: 'minio',
          canUpload: true,
        };
      } catch (error: any) {
        // MinIO not available, return unconfigured status
        logger.debug('MinIO not available for auto-config', { organizationId, error: error.message });
        return {
          isConfigured: false,
          backend: 'minio', // Default to MinIO (not Google Drive)
          canUpload: false,
          error: 'Storage not configured. MinIO service may not be running.',
        };
      }
    }

    // Test if we can actually access storage
    if (settings.storageBackend === 'google_drive') {
      const testResult = await googleDriveService.testConnection(organizationId);
      return {
        isConfigured: true,
        backend: 'google_drive',
        sharedDriveId: settings.driveSharedDriveId || undefined,
        canUpload: testResult.success,
        error: testResult.error,
      };
    }

    if (settings.storageBackend === 'minio') {
      try {
        // Test MinIO by checking if we can list files
        await s3Service.initialize();
        const testFiles = await s3Service.listFiles(`${organizationId}/`, true);
        return {
          isConfigured: true,
          backend: 'minio',
          canUpload: true,
        };
      } catch (error: any) {
        return {
          isConfigured: true,
          backend: 'minio',
          canUpload: false,
          error: error.message,
        };
      }
    }

    return {
      isConfigured: settings.isConfigured,
      backend: settings.storageBackend,
      canUpload: false,
      error: 'Storage backend not fully implemented',
    };
  }
}

// Singleton instance
export const mediaAssetStorageService = new MediaAssetStorageService();
