import { google, drive_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { logger } from '../utils/logger.js';
import { decodeServiceAccountKey } from './gw-credentials.js';
import { db } from '../database/connection.js';
import type { ServiceAccountCredentials } from './google-workspace.service.js';

/**
 * Risk levels for external sharing
 */
export type RiskLevel = 'high' | 'medium' | 'low';

/**
 * External share record
 */
export interface ExternalShare {
  fileId: string;
  fileName: string;
  fileType: string;
  sharedWith: string;
  shareType: 'user' | 'domain' | 'anyone';
  permissionId: string;
  role: string;
  isPersonalAccount: boolean;
  sharedByEmail?: string;
  sharedAt?: Date;
  riskLevel: RiskLevel;
  webViewLink?: string;
}

/**
 * Audit summary statistics
 */
export interface AuditSummary {
  totalFiles: number;
  totalSharedExternally: number;
  sharedWithExternalDomains: number;
  sharedWithPersonalAccounts: number;
  sharedWithAnyone: number;
  highRiskFiles: number;
  mediumRiskFiles: number;
  lowRiskFiles: number;
  lastScanAt?: Date;
  /** Accounts whose own files were listed. */
  accountsScanned?: number;
  /** Accounts that could not be listed, with the reason. Their files are NOT in the result. */
  accountsNotScanned?: Array<{ email: string; reason: string }>;
  /** True when the scan stopped at the file limit before covering everything. */
  truncated?: boolean;
}

/**
 * Scan options
 */
export interface ScanOptions {
  folderId?: string;
  sharedDriveId?: string;
  includeSubfolders?: boolean;
  maxFiles?: number;
}

/**
 * Drive Sharing Audit Service
 *
 * Scans Google Drive files for external sharing and provides
 * tools to audit, report, and revoke external access.
 */
export class DriveSharingAuditService {
  // Scopes needed for sharing audit (need full drive scope to see permissions)
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.readonly',
  ];

  // Personal email domains (common free email providers)
  private static readonly PERSONAL_DOMAINS = new Set([
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'msn.com',
    'aol.com',
    'icloud.com',
    'me.com',
    'mail.com',
    'protonmail.com',
    'zoho.com',
    'yandex.com',
    'gmx.com',
  ]);

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
   * Get organization domain
   */
  private async getOrganizationDomain(organizationId: string): Promise<string | null> {
    try {
      const result = await db.query(
        'SELECT domain FROM organizations WHERE id = $1',
        [organizationId]
      );
      return result.rows[0]?.domain || null;
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
      scopes: DriveSharingAuditService.SCOPES,
      subject: adminEmail,
    });

    return google.drive({ version: 'v3', auth: jwtClient });
  }

  /**
   * Get authenticated Drive client
   */
  private async getDriveClient(organizationId: string): Promise<drive_v3.Drive | null> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      return null;
    }

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) {
      return null;
    }

    return this.createDriveClient(credentials, adminEmail);
  }

  /**
   * The accounts whose own files a scan must list.
   *
   * Drive has no organization-wide file listing: files.list returns what the
   * impersonated account can see. Listing as the admin alone therefore misses
   * every file another user owns and has not shared with the admin. Suspended
   * accounts cannot be impersonated, so they are returned separately and
   * reported as not scanned.
   */
  private async getScanAccounts(
    organizationId: string,
    adminEmail: string,
    orgDomain: string
  ): Promise<{ active: string[]; suspended: string[] }> {
    const result = await db.query(
      `SELECT email, is_suspended FROM gw_synced_users WHERE organization_id = $1 ORDER BY email`,
      [organizationId]
    );

    const suffix = `@${orgDomain.toLowerCase()}`;
    const active = new Set<string>([adminEmail.toLowerCase()]);
    const suspended = new Set<string>();
    for (const row of result.rows) {
      const email = String(row.email || '').toLowerCase();
      // Only this organization's own accounts are ever impersonated.
      if (!email.endsWith(suffix)) continue;
      if (row.is_suspended) suspended.add(email);
      else active.add(email);
    }
    return { active: [...active], suspended: [...suspended].filter(e => !active.has(e)) };
  }

  /**
   * Check if an email is a personal account
   */
  private isPersonalEmail(email: string): boolean {
    if (!email) return false;
    const domain = email.split('@')[1]?.toLowerCase();
    return DriveSharingAuditService.PERSONAL_DOMAINS.has(domain);
  }

  /**
   * Determine risk level based on sharing characteristics
   */
  private determineRiskLevel(
    shareType: 'user' | 'domain' | 'anyone',
    isPersonalAccount: boolean,
    fileType: string
  ): RiskLevel {
    // Anyone with link = high risk
    if (shareType === 'anyone') {
      return 'high';
    }

    // Shared with personal accounts = medium-high risk
    if (isPersonalAccount) {
      // Sensitive file types elevate risk
      const sensitiveTypes = ['spreadsheet', 'document', 'pdf', 'presentation'];
      const isSensitiveType = sensitiveTypes.some(t => fileType.toLowerCase().includes(t));
      return isSensitiveType ? 'high' : 'medium';
    }

    // External domain sharing = low risk (business-to-business)
    return 'low';
  }

  /**
   * Scan files for external sharing
   */
  async scanForExternalSharing(
    organizationId: string,
    options: ScanOptions = {}
  ): Promise<{
    success: boolean;
    shares?: ExternalShare[];
    summary?: AuditSummary;
    error?: string;
  }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      const adminEmail = await this.getAdminEmail(organizationId);
      if (!credentials || !adminEmail) {
        return { success: false, error: 'No Google Workspace credentials configured' };
      }

      const orgDomain = await this.getOrganizationDomain(organizationId);
      if (!orgDomain) {
        return { success: false, error: 'Organization domain not found' };
      }

      const externalShares: ExternalShare[] = [];
      const seenShares = new Set<string>();
      const seenFiles = new Set<string>();
      const accountsNotScanned: Array<{ email: string; reason: string }> = [];
      let accountsScanned = 0;
      let truncated = false;
      const maxFiles = options.maxFiles || 1000;

      logger.info('Starting external sharing scan', {
        organizationId,
        orgDomain,
        options,
      });

      // One listing pass: page through files.list for one account and collect
      // every external permission. Returns false when the file limit was hit.
      const scanListing = async (
        drive: drive_v3.Drive,
        params: drive_v3.Params$Resource$Files$List
      ): Promise<boolean> => {
        let nextPageToken: string | undefined;
        do {
          const response = await drive.files.list({
            ...params,
            fields: 'nextPageToken, files(id, name, mimeType, webViewLink, owners, permissions(id, type, role, emailAddress, domain, expirationTime))',
            pageSize: 100,
            pageToken: nextPageToken,
          });

          for (const file of response.data.files || []) {
            if (!file.id || seenFiles.has(file.id)) continue;
            if (seenFiles.size >= maxFiles) return false;
            seenFiles.add(file.id);

            for (const perm of file.permissions || []) {
              // Skip owner permissions and internal domain permissions
              if (perm.role === 'owner') continue;
              if (!this.isExternalPermission(perm, orgDomain)) continue;

              const key = `${file.id}:${perm.id}`;
              if (seenShares.has(key)) continue;
              seenShares.add(key);

              const shareType = this.getShareType(perm);
              const isPersonal = perm.emailAddress
                ? this.isPersonalEmail(perm.emailAddress)
                : false;

              externalShares.push({
                fileId: file.id,
                fileName: file.name!,
                fileType: file.mimeType || 'unknown',
                sharedWith: perm.emailAddress || perm.domain || 'Anyone with link',
                shareType,
                permissionId: perm.id!,
                role: perm.role!,
                isPersonalAccount: isPersonal,
                sharedByEmail: file.owners?.[0]?.emailAddress,
                riskLevel: this.determineRiskLevel(shareType, isPersonal, file.mimeType || ''),
                webViewLink: file.webViewLink || undefined,
              });
            }
          }

          nextPageToken = response.data.nextPageToken || undefined;
        } while (nextPageToken);
        return true;
      };

      const adminDrive = this.createDriveClient(credentials, adminEmail);

      if (options.folderId || options.sharedDriveId) {
        // A scoped scan of one folder or one shared drive, as the admin.
        let query = 'trashed = false';
        if (options.folderId) {
          query += ` and '${options.folderId}' in parents`;
        }
        truncated = !(await scanListing(adminDrive, {
          q: query,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          corpora: options.sharedDriveId ? 'drive' : 'allDrives',
          driveId: options.sharedDriveId,
        }));
        accountsScanned = 1;
      } else {
        // Whole-organization scan: each account's own files, then the shared
        // drives the admin can see.
        const accounts = await this.getScanAccounts(organizationId, adminEmail, orgDomain);
        for (const email of accounts.suspended) {
          accountsNotScanned.push({ email, reason: 'Account is suspended' });
        }

        for (const email of accounts.active) {
          if (truncated) {
            accountsNotScanned.push({ email, reason: 'File limit reached before this account' });
            continue;
          }
          try {
            const drive = this.createDriveClient(credentials, email);
            const complete = await scanListing(drive, {
              q: "'me' in owners and trashed = false",
              corpora: 'user',
            });
            accountsScanned++;
            if (!complete) truncated = true;
          } catch (error: any) {
            if (email === adminEmail.toLowerCase()) throw error;
            accountsNotScanned.push({ email, reason: this.formatError(error) });
            logger.warn('External sharing scan could not list an account', {
              organizationId,
              email,
              error: error.message,
            });
          }
        }

        if (!truncated) {
          truncated = !(await scanListing(adminDrive, {
            q: 'trashed = false',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            corpora: 'allDrives',
          }));
        }
      }

      const totalFilesScanned = seenFiles.size;

      // Calculate summary
      const summary: AuditSummary = {
        totalFiles: totalFilesScanned,
        totalSharedExternally: externalShares.length,
        sharedWithExternalDomains: externalShares.filter(s => s.shareType === 'domain').length,
        sharedWithPersonalAccounts: externalShares.filter(s => s.isPersonalAccount).length,
        sharedWithAnyone: externalShares.filter(s => s.shareType === 'anyone').length,
        highRiskFiles: externalShares.filter(s => s.riskLevel === 'high').length,
        mediumRiskFiles: externalShares.filter(s => s.riskLevel === 'medium').length,
        lowRiskFiles: externalShares.filter(s => s.riskLevel === 'low').length,
        lastScanAt: new Date(),
        accountsScanned,
        accountsNotScanned,
        truncated,
      };

      logger.info('External sharing scan complete', {
        organizationId,
        totalFilesScanned,
        externalSharesFound: externalShares.length,
        summary,
      });

      return { success: true, shares: externalShares, summary };
    } catch (error: any) {
      logger.error('External sharing scan failed', {
        organizationId,
        error: error.message,
        code: error.code,
      });

      return { success: false, error: this.formatError(error) };
    }
  }

  /**
   * Check if a permission is external to the organization
   */
  private isExternalPermission(
    permission: drive_v3.Schema$Permission,
    orgDomain: string
  ): boolean {
    // "anyone" or "anyoneWithLink" is always external
    if (permission.type === 'anyone') {
      return true;
    }

    // Domain sharing - check if it's external
    if (permission.type === 'domain') {
      return permission.domain?.toLowerCase() !== orgDomain.toLowerCase();
    }

    // User sharing - check if email domain is external
    if (permission.type === 'user' && permission.emailAddress) {
      const emailDomain = permission.emailAddress.split('@')[1]?.toLowerCase();
      return emailDomain !== orgDomain.toLowerCase();
    }

    // Group sharing - check domain
    if (permission.type === 'group' && permission.emailAddress) {
      const emailDomain = permission.emailAddress.split('@')[1]?.toLowerCase();
      return emailDomain !== orgDomain.toLowerCase();
    }

    return false;
  }

  /**
   * Determine share type from permission
   */
  private getShareType(permission: drive_v3.Schema$Permission): 'user' | 'domain' | 'anyone' {
    if (permission.type === 'anyone') return 'anyone';
    if (permission.type === 'domain') return 'domain';
    return 'user';
  }

  /**
   * Revoke external access for a specific file
   */
  async revokeAccess(
    organizationId: string,
    fileId: string,
    permissionId: string,
    ownerEmail?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // A permission can only be removed by an account that can edit the file.
      // For a file another user owns, that is the owner, not the admin. The
      // owner must be one of this organization's accounts.
      let drive: drive_v3.Drive | null;
      const owner = ownerEmail?.trim().toLowerCase();
      if (owner) {
        const credentials = await this.getCredentials(organizationId);
        const orgDomain = await this.getOrganizationDomain(organizationId);
        if (!credentials || !orgDomain) {
          return { success: false, error: 'No Google Workspace credentials configured' };
        }
        if (!owner.endsWith(`@${orgDomain.toLowerCase()}`)) {
          return { success: false, error: 'The file owner is not an account in this organization' };
        }
        drive = this.createDriveClient(credentials, owner);
      } else {
        drive = await this.getDriveClient(organizationId);
      }
      if (!drive) {
        return { success: false, error: 'No Google Workspace credentials configured' };
      }

      await drive.permissions.delete({
        fileId,
        permissionId,
        supportsAllDrives: true,
      });

      logger.info('Revoked external access', {
        organizationId,
        fileId,
        permissionId,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to revoke access', {
        organizationId,
        fileId,
        permissionId,
        error: error.message,
      });

      return { success: false, error: this.formatError(error) };
    }
  }

  /**
   * Bulk revoke external access
   */
  async bulkRevokeAccess(
    organizationId: string,
    shares: Array<{ fileId: string; permissionId: string; ownerEmail?: string }>
  ): Promise<{
    success: boolean;
    results: Array<{ fileId: string; permissionId: string; success: boolean; error?: string }>;
    successCount: number;
    failureCount: number;
  }> {
    const results: Array<{ fileId: string; permissionId: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const share of shares) {
      const result = await this.revokeAccess(organizationId, share.fileId, share.permissionId, share.ownerEmail);

      results.push({
        fileId: share.fileId,
        permissionId: share.permissionId,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('Bulk revoke complete', {
      organizationId,
      total: shares.length,
      successCount,
      failureCount,
    });

    return { success: failureCount === 0, results, successCount, failureCount };
  }

  /**
   * Get sharing details for a specific file
   */
  async getFileSharing(
    organizationId: string,
    fileId: string
  ): Promise<{
    success: boolean;
    file?: {
      id: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
      owners: Array<{ email: string; displayName?: string }>;
      permissions: Array<{
        id: string;
        type: string;
        role: string;
        emailAddress?: string;
        domain?: string;
        displayName?: string;
        isExternal: boolean;
      }>;
    };
    error?: string;
  }> {
    try {
      const drive = await this.getDriveClient(organizationId);
      if (!drive) {
        return { success: false, error: 'No Google Workspace credentials configured' };
      }

      const orgDomain = await this.getOrganizationDomain(organizationId);
      if (!orgDomain) {
        return { success: false, error: 'Organization domain not found' };
      }

      const response = await drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: 'id, name, mimeType, webViewLink, owners, permissions(id, type, role, emailAddress, domain, displayName)',
      });

      const file = response.data;
      const permissions = (file.permissions || []).map(p => ({
        id: p.id!,
        type: p.type!,
        role: p.role!,
        emailAddress: p.emailAddress,
        domain: p.domain,
        displayName: p.displayName,
        isExternal: this.isExternalPermission(p, orgDomain),
      }));

      return {
        success: true,
        file: {
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          webViewLink: file.webViewLink || undefined,
          owners: (file.owners || []).map(o => ({
            email: o.emailAddress!,
            displayName: o.displayName,
          })),
          permissions,
        },
      };
    } catch (error: any) {
      logger.error('Failed to get file sharing', {
        organizationId,
        fileId,
        error: error.message,
      });

      return { success: false, error: this.formatError(error) };
    }
  }

  /**
   * Get external shares by risk level
   */
  async getSharesByRiskLevel(
    organizationId: string,
    riskLevel: RiskLevel,
    limit: number = 100
  ): Promise<{
    success: boolean;
    shares?: ExternalShare[];
    error?: string;
  }> {
    // Scan and filter by risk level
    const result = await this.scanForExternalSharing(organizationId, { maxFiles: 500 });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const filteredShares = (result.shares || [])
      .filter(s => s.riskLevel === riskLevel)
      .slice(0, limit);

    return { success: true, shares: filteredShares };
  }

  /**
   * Export sharing report as CSV
   */
  generateCsvReport(shares: ExternalShare[]): string {
    const headers = [
      'File Name',
      'File Type',
      'Shared With',
      'Share Type',
      'Role',
      'Personal Account',
      'Risk Level',
      'Owner',
      'File Link',
    ];

    const rows = shares.map(s => [
      `"${s.fileName.replace(/"/g, '""')}"`,
      s.fileType,
      s.sharedWith,
      s.shareType,
      s.role,
      s.isPersonalAccount ? 'Yes' : 'No',
      s.riskLevel,
      s.sharedByEmail || 'Unknown',
      s.webViewLink || '',
    ]);

    return [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');
  }

  /**
   * Format error message for user display
   */
  private formatError(error: any): string {
    if (error.code === 403) {
      return 'Permission denied. Ensure the service account has Drive API access.';
    }
    if (error.code === 404) {
      return 'File not found or you do not have access.';
    }
    if (error.code === 429) {
      return 'Rate limit exceeded. Please try again later.';
    }
    if (error.message?.includes('unauthorized_client')) {
      return 'Drive API not authorized. Add drive scope to domain-wide delegation.';
    }
    return error.message || 'An unexpected error occurred';
  }
}

// Singleton instance
export const driveSharingAuditService = new DriveSharingAuditService();
