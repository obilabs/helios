import { google, drive_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { Readable } from 'stream';
import { decodeServiceAccountKey } from './gw-credentials.js';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import type { ServiceAccountCredentials } from './google-workspace.service.js';
import type { StorageUploadResult, StorageFile } from '../types/media-assets.js';

/**
 * Google Drive Service for Asset Management
 *
 * This service handles file operations for the media asset proxy feature:
 * - Upload files to Google Drive (Shared Drives)
 * - Download files from Drive
 * - Create folders
 * - List files
 * - Manage Shared Drives
 *
 * Uses domain-wide delegation via service account.
 */
export class GoogleDriveService {
  // Required scopes for Drive operations
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
  ];

  /**
   * Get service account credentials for an organization
   */
  private async getCredentials(organizationId: string): Promise<ServiceAccountCredentials | null> {
    try {
      const result = await db.query(
        'SELECT service_account_key FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return decodeServiceAccountKey(result.rows[0].service_account_key);
    } catch (error) {
      logger.error('Failed to get credentials', { organizationId, error });
      return null;
    }
  }

  /**
   * Get admin email for impersonation
   */
  private async getAdminEmail(organizationId: string): Promise<string | null> {
    try {
      const result = await db.query(
        'SELECT admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );
      return result.rows[0]?.admin_email || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create authenticated Drive client
   */
  private createDriveClient(credentials: ServiceAccountCredentials, adminEmail: string): drive_v3.Drive {
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: GoogleDriveService.SCOPES,
      subject: adminEmail, // Domain-wide delegation
    });

    return google.drive({ version: 'v3', auth: jwtClient });
  }

  /**
   * Get authenticated Drive client for an organization.
   *
   * `subject` is the domain-wide-delegation user the JWT impersonates. When
   * omitted the client acts AS the org admin — the original behavior every
   * existing caller relies on. Callers may pass a specific user (e.g. the TARGET
   * mailbox during an M365 -> Google migration) so uploaded files land in, and
   * are owned by, that user's own My Drive rather than the admin's. The proxy /
   * migration layer is responsible for validating the subject belongs to the
   * org's own domain before calling this.
   */
  async getDriveClient(organizationId: string, subject?: string): Promise<drive_v3.Drive | null> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      logger.error('No credentials found', { organizationId });
      return null;
    }

    // Explicit subject wins; otherwise fall back to the org admin (default).
    const impersonationSubject = subject || (await this.getAdminEmail(organizationId));
    if (!impersonationSubject) {
      logger.error('No impersonation subject found (no admin email)', { organizationId });
      return null;
    }

    return this.createDriveClient(credentials, impersonationSubject);
  }

  /**
   * Test Drive access
   */
  async testConnection(organizationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      // Try to list Shared Drives
      const response = await drive.drives.list({
        pageSize: 1,
      });

      logger.info('Drive connection test successful', {
        organizationId,
        sharedDriveCount: response.data.drives?.length || 0,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Drive connection test failed', {
        organizationId,
        error: error.message,
      });

      let errorMessage = 'Failed to connect to Google Drive';
      if (error.message?.includes('unauthorized_client')) {
        errorMessage = 'Drive API not enabled or service account not authorized. Add drive scope to domain-wide delegation.';
      } else if (error.message?.includes('invalid_grant')) {
        errorMessage = 'Invalid service account credentials or domain-wide delegation not configured.';
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * List Shared Drives
   */
  async listSharedDrives(organizationId: string): Promise<{
    success: boolean;
    drives?: Array<{ id: string; name: string }>;
    error?: string;
  }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      const response = await drive.drives.list({
        pageSize: 100,
      });

      const drives = (response.data.drives || []).map((d) => ({
        id: d.id!,
        name: d.name!,
      }));

      return { success: true, drives };
    } catch (error: any) {
      logger.error('Failed to list Shared Drives', { organizationId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new Shared Drive
   */
  async createSharedDrive(
    organizationId: string,
    name: string
  ): Promise<{ success: boolean; driveId?: string; error?: string }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      // Create the Shared Drive
      // requestId is required to prevent duplicate creation
      const requestId = `helios-${organizationId}-${Date.now()}`;

      const response = await drive.drives.create({
        requestId,
        requestBody: {
          name,
        },
      });

      logger.info('Created Shared Drive', {
        organizationId,
        driveId: response.data.id,
        name,
      });

      return { success: true, driveId: response.data.id! };
    } catch (error: any) {
      logger.error('Failed to create Shared Drive', { organizationId, name, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a folder in Google Drive
   */
  async createFolder(
    organizationId: string,
    name: string,
    parentFolderId?: string,
    sharedDriveId?: string
  ): Promise<{ success: boolean; folderId?: string; error?: string }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      const parents: string[] = [];
      if (parentFolderId) {
        parents.push(parentFolderId);
      } else if (sharedDriveId) {
        parents.push(sharedDriveId);
      }

      const requestBody: drive_v3.Schema$File = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parents.length > 0 ? parents : undefined,
      };

      const response = await drive.files.create({
        requestBody,
        supportsAllDrives: true,
        fields: 'id, name',
      });

      logger.info('Created folder in Drive', {
        organizationId,
        folderId: response.data.id,
        name,
        parent: parentFolderId || sharedDriveId,
      });

      return { success: true, folderId: response.data.id! };
    } catch (error: any) {
      logger.error('Failed to create folder', { organizationId, name, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Upload a file to Google Drive.
   *
   * `subject` (optional) is the domain-wide-delegation user the upload runs AS.
   * Omit it (the default) to preserve today's behavior — the file is created by
   * the org admin. Pass a specific user (e.g. the TARGET user of an M365 ->
   * Google migration) to have the file created in, and owned by, that user's own
   * My Drive. Existing callers pass nothing and are unaffected.
   */
  async uploadFile(
    organizationId: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    parentFolderId?: string,
    subject?: string
  ): Promise<{ success: boolean; result?: StorageUploadResult; error?: string }> {
    try {
      const drive = await this.getDriveClient(organizationId, subject);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      // Create readable stream from buffer
      const stream = Readable.from(fileBuffer);

      const requestBody: drive_v3.Schema$File = {
        name: filename,
        parents: parentFolderId ? [parentFolderId] : undefined,
      };

      const response = await drive.files.create({
        requestBody,
        media: {
          mimeType,
          body: stream,
        },
        supportsAllDrives: true,
        fields: 'id, name, webViewLink, size',
      });

      logger.info('Uploaded file to Drive', {
        organizationId,
        fileId: response.data.id,
        filename,
        mimeType,
        size: response.data.size,
      });

      return {
        success: true,
        result: {
          storagePath: response.data.id!,
          webViewLink: response.data.webViewLink || undefined,
        },
      };
    } catch (error: any) {
      logger.error('Failed to upload file', { organizationId, filename, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Download a file from Google Drive
   */
  async downloadFile(
    organizationId: string,
    fileId: string
  ): Promise<{ success: boolean; data?: Buffer; mimeType?: string; error?: string }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      // First get file metadata to check size and type
      const metadata = await drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: 'id, name, mimeType, size',
      });

      // Download the file content
      const response = await drive.files.get(
        {
          fileId,
          alt: 'media',
          supportsAllDrives: true,
        },
        { responseType: 'arraybuffer' }
      );

      const buffer = Buffer.from(response.data as ArrayBuffer);

      logger.debug('Downloaded file from Drive', {
        organizationId,
        fileId,
        size: buffer.length,
        mimeType: metadata.data.mimeType,
      });

      return {
        success: true,
        data: buffer,
        mimeType: metadata.data.mimeType || 'application/octet-stream',
      };
    } catch (error: any) {
      logger.error('Failed to download file', { organizationId, fileId, error: error.message });

      // Handle specific errors
      if (error.code === 404) {
        return { success: false, error: 'File not found in Drive' };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file from Google Drive
   */
  async deleteFile(
    organizationId: string,
    fileId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      await drive.files.delete({
        fileId,
        supportsAllDrives: true,
      });

      logger.info('Deleted file from Drive', { organizationId, fileId });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to delete file', { organizationId, fileId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(
    organizationId: string,
    folderId?: string,
    sharedDriveId?: string
  ): Promise<{ success: boolean; files?: StorageFile[]; error?: string }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      // Build query
      let query = 'trashed = false';
      if (folderId) {
        query += ` and '${folderId}' in parents`;
      }

      const response = await drive.files.list({
        q: query,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: sharedDriveId ? 'drive' : 'allDrives',
        driveId: sharedDriveId,
        fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
        pageSize: 100,
      });

      const files: StorageFile[] = (response.data.files || [])
        .filter((f) => f.mimeType !== 'application/vnd.google-apps.folder')
        .map((f) => ({
          id: f.id!,
          name: f.name!,
          mimeType: f.mimeType!,
          size: parseInt(f.size || '0', 10),
          createdTime: new Date(f.createdTime!),
          modifiedTime: new Date(f.modifiedTime!),
        }));

      return { success: true, files };
    } catch (error: any) {
      logger.error('Failed to list files', { organizationId, folderId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(
    organizationId: string,
    fileId: string
  ): Promise<{
    success: boolean;
    file?: { id: string; name: string; mimeType: string; size: number };
    error?: string;
  }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      const response = await drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: 'id, name, mimeType, size',
      });

      return {
        success: true,
        file: {
          id: response.data.id!,
          name: response.data.name!,
          mimeType: response.data.mimeType!,
          size: parseInt(response.data.size || '0', 10),
        },
      };
    } catch (error: any) {
      logger.error('Failed to get file metadata', { organizationId, fileId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Update file content (replace)
   */
  async updateFileContent(
    organizationId: string,
    fileId: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No credentials configured' };
      }

      const stream = Readable.from(fileBuffer);

      await drive.files.update({
        fileId,
        media: {
          mimeType,
          body: stream,
        },
        supportsAllDrives: true,
      });

      logger.info('Updated file content in Drive', { organizationId, fileId });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to update file content', { organizationId, fileId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup Helios Assets Shared Drive with default folder structure
   */
  async setupAssetsDrive(organizationId: string): Promise<{
    success: boolean;
    sharedDriveId?: string;
    folders?: Array<{ name: string; path: string; driveFolderId: string }>;
    error?: string;
  }> {
    try {
      // Create the Shared Drive
      const driveResult = await this.createSharedDrive(organizationId, 'Helios Assets');
      if (!driveResult.success || !driveResult.driveId) {
        return { success: false, error: driveResult.error || 'Failed to create Shared Drive' };
      }

      const sharedDriveId = driveResult.driveId;
      const folders: Array<{ name: string; path: string; driveFolderId: string }> = [];

      // Create default folders
      const defaultFolders = [
        { name: 'Brand', path: '/brand' },
        { name: 'Signatures', path: '/signatures' },
        { name: 'Profiles', path: '/profiles' },
        { name: 'Campaigns', path: '/campaigns' },
      ];

      for (const folder of defaultFolders) {
        const folderResult = await this.createFolder(
          organizationId,
          folder.name,
          undefined,
          sharedDriveId
        );
        if (folderResult.success && folderResult.folderId) {
          folders.push({
            name: folder.name,
            path: folder.path,
            driveFolderId: folderResult.folderId,
          });
        }
      }

      // Create subfolders under Signatures
      const signaturesFolder = folders.find((f) => f.path === '/signatures');
      if (signaturesFolder) {
        const subfolders = [
          { name: 'Banners', path: '/signatures/banners' },
          { name: 'Social Icons', path: '/signatures/social-icons' },
        ];

        for (const subfolder of subfolders) {
          const subfolderResult = await this.createFolder(
            organizationId,
            subfolder.name,
            signaturesFolder.driveFolderId
          );
          if (subfolderResult.success && subfolderResult.folderId) {
            folders.push({
              name: subfolder.name,
              path: subfolder.path,
              driveFolderId: subfolderResult.folderId,
            });
          }
        }
      }

      logger.info('Setup Helios Assets Drive complete', {
        organizationId,
        sharedDriveId,
        folderCount: folders.length,
      });

      return { success: true, sharedDriveId, folders };
    } catch (error: any) {
      logger.error('Failed to setup assets Drive', { organizationId, error: error.message });
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
export const googleDriveService = new GoogleDriveService();
