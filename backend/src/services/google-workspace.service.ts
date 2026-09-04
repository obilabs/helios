import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { skuHasVault } from '../config/google-license-skus.js';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import { encodeServiceAccountKey, decodeServiceAccountKey } from './gw-credentials.js';
import { assertNotProtectedAdmin } from './admin-protection.js';
import { REQUIRED_SCOPES, SCOPE_DETAILS, DELEGATION_SCOPES, DELEGATION_SCOPE_DETAILS } from '../config/google-scopes.js';

export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

export interface WorkspaceUser {
  id: string;
  primaryEmail: string;
  name: {
    givenName: string;
    familyName: string;
    fullName: string;
  };
  isAdmin: boolean;
  isDelegatedAdmin: boolean;
  suspended: boolean;
  orgUnitPath: string;
  creationTime: string;
  lastLoginTime?: string;
  // Extended properties
  organizations?: any[];
  phones?: any[];
  relations?: any[];
  department?: string;
  jobTitle?: string;
  managerEmail?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    projectId: string;
    clientEmail: string;
    domain?: string;
    userCount?: number;
    adminUsers?: number;
  };
  error?: string;
}

/**
 * One failed data-migration item (a CRAWL_FAILURE event), surfaced so an admin can
 * see WHAT failed — not just the failure count.
 */
export interface MigrationFailureDetail {
  timestamp?: string;
  executionId?: string;
  user?: string;
  source?: string;
  target?: string;
  reason?: string;
  params: Record<string, any>;
}

/**
 * Per-migrated-user progress rollup so the UI can show status per user rather than
 * only an aggregate. The DMS audit tags per-object events with the MAILBOX OWNER
 * (SOURCE_NAME, or the email embedded in the `users/<email>/…` resource paths) —
 * NOT a stable per-user id — so we derive the user email as the group key. (Grouping
 * by TARGET_IDENTIFIER would explode: it is `users/<email>/messages/<id>`, unique
 * per message.)
 */
export interface MigrationUserProgress {
  user: string;
  executionId: string | null;
  total: number;
  failures: number;
  byName: Record<string, number>;
  firstActivity?: string;
  lastActivity?: string;
}

export class GoogleWorkspaceService {
  /**
   * Test connection with domain-wide delegation
   */
  async testConnectionWithDelegation(
    serviceAccount: ServiceAccountCredentials,
    adminEmail: string,
    domain: string
  ): Promise<ConnectionTestResult> {
    try {
      // Create JWT client with domain-wide delegation
      const jwtClient = new JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
          'https://www.googleapis.com/auth/admin.directory.user',
          'https://www.googleapis.com/auth/admin.directory.group',
          'https://www.googleapis.com/auth/admin.directory.orgunit'
        ],
        subject: adminEmail // Impersonate admin for domain-wide delegation
      });

      // Create admin client
      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Test by fetching user count
      const usersResponse = await admin.users.list({
        domain: domain,
        maxResults: 1
      });

      // Test groups access
      const groupsResponse = await admin.groups.list({
        domain: domain,
        maxResults: 1
      });

      return {
        success: true,
        message: 'Successfully connected to Google Workspace',
        details: {
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          domain: domain,
          userCount: usersResponse.data.users?.length || 0,
          adminUsers: 0
        }
      };
    } catch (error: any) {
      logger.error('Connection test failed', { error: error.message });

      let errorMessage = 'Failed to connect to Google Workspace';
      if (error.message?.includes('invalid_grant')) {
        errorMessage = 'Domain-wide delegation not properly configured. Please ensure the service account has been granted domain-wide delegation in Google Workspace Admin.';
      } else if (error.message?.includes('unauthorized_client')) {
        errorMessage = 'Service account not authorized. Please add the required scopes in Google Workspace Admin > Security > API Controls.';
      } else if (error.message?.includes('Not Authorized')) {
        errorMessage = 'Admin email is not a super admin or domain is incorrect.';
      }

      return {
        success: false,
        message: errorMessage,
        error: error.message
      };
    }
  }

  /**
   * Test connection with inline credentials (wrapper for testConnectionWithDelegation)
   */
  async testConnectionWithCredentials(
    serviceAccount: ServiceAccountCredentials,
    domain: string,
    adminEmail: string
  ): Promise<ConnectionTestResult> {
    return this.testConnectionWithDelegation(serviceAccount, adminEmail, domain);
  }

  /**
   * Store service account credentials for an organization with Domain-Wide Delegation
   */
  async storeServiceAccountCredentials(
    organizationId: string,
    domain: string,
    credentials: ServiceAccountCredentials,
    adminEmail?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate credentials structure
      const requiredFields = [
        'type', 'project_id', 'private_key', 'client_email', 'client_id'
      ];

      for (const field of requiredFields) {
        if (!credentials[field as keyof ServiceAccountCredentials]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Store in gw_credentials table
      // Use the provided admin email for impersonation, not the service account email
      const adminEmailToUse = adminEmail || `admin@${domain}`;

      await db.query(`
        INSERT INTO gw_credentials (organization_id, service_account_key, admin_email, domain, is_valid, last_validated_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW(), NOW())
        ON CONFLICT (organization_id)
        DO UPDATE SET
          service_account_key = EXCLUDED.service_account_key,
          admin_email = EXCLUDED.admin_email,
          domain = EXCLUDED.domain,
          is_valid = true,
          last_validated_at = NOW(),
          updated_at = NOW()
      `, [
        organizationId,
        encodeServiceAccountKey(credentials),
        adminEmailToUse,
        domain
      ]);

      logger.info('Service account credentials stored with DWD', {
        organizationId,
        domain,
        projectId: credentials.project_id,
        clientEmail: credentials.client_email
      });

      // Mark the Google Workspace module enabled + configured for this org so
      // Settings > Modules reflects "Active". The initial sync is kicked off by
      // the caller immediately after this returns, hence sync_status 'syncing'.
      await this.markModuleEnabled(
        organizationId,
        { domain, adminEmail: adminEmailToUse },
        'syncing'
      );

      return {
        success: true,
        message: 'Service account credentials stored successfully with Domain-Wide Delegation'
      };

    } catch (error: any) {
      logger.error('Failed to store service account credentials', {
        organizationId,
        domain,
        error: error.message
      });

      return {
        success: false,
        message: `Failed to store credentials: ${error.message}`
      };
    }
  }

  /**
   * Mark the Google Workspace module enabled + configured for an organization.
   *
   * This is the single writer of the `organization_modules` enable-row for
   * Google Workspace. It is deliberately self-healing:
   *
   *  1. It UPSERTs the canonical module row (slug `google_workspace`) so it works
   *     even on a database where the `modules` table was never seeded (the
   *     setup-wizard onboarding path does not run `seedDefaultAdmin`, which is
   *     the only place that seeds modules).
   *  2. It then UPSERTs the `organization_modules` row.
   *
   * Historically the setup path looked up the module by the slug
   * `google-workspace` (hyphen) while it is seeded as `google_workspace`
   * (underscore). The lookup returned no rows, the enable-write was silently
   * skipped, and Settings > Modules stayed on "Disabled" even though credentials
   * were saved and the initial sync ran. Every read path
   * (google-workspace.routes.ts module-status/disable, modules.routes.ts,
   * assets.routes.ts) uses the underscore slug, so that is the canonical value.
   */
  async markModuleEnabled(
    organizationId: string,
    config: { domain: string; adminEmail: string },
    syncStatus: string = 'syncing'
  ): Promise<void> {
    // Ensure the canonical Google Workspace module row exists.
    const moduleResult = await db.query(
      `INSERT INTO modules (name, slug, description, version, config_schema)
       VALUES ('Google Workspace', 'google_workspace',
               'Sync users and groups from Google Workspace', '1.0.0', '{}'::jsonb)
       ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
       RETURNING id`
    );
    const moduleId = moduleResult.rows[0].id;

    await db.query(
      `INSERT INTO organization_modules
         (organization_id, module_id, is_enabled, is_configured, config, sync_status, updated_at)
       VALUES ($1, $2, true, true, $3, $4, NOW())
       ON CONFLICT (organization_id, module_id)
       DO UPDATE SET
         is_enabled = true,
         is_configured = true,
         config = $3,
         sync_status = $4,
         updated_at = NOW()`,
      [organizationId, moduleId, JSON.stringify(config), syncStatus]
    );

    logger.info('Google Workspace module marked enabled + configured', {
      organizationId,
      moduleId
    });
  }

  /**
   * Create authenticated Google Admin SDK client with Domain-Wide Delegation
   */
  private createAdminClient(credentials: ServiceAccountCredentials, adminEmail: string) {
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.user',
        'https://www.googleapis.com/auth/admin.directory.group',
        'https://www.googleapis.com/auth/admin.directory.orgunit',
        'https://www.googleapis.com/auth/admin.directory.domain',
        'https://www.googleapis.com/auth/admin.reports.audit.readonly'
      ],
      subject: adminEmail // This enables Domain-Wide Delegation - impersonate admin user
    });

    return google.admin({ version: 'directory_v1', auth: jwtClient });
  }

  /**
   * Create an authenticated Google Vault (eDiscovery) client via Domain-Wide
   * Delegation. Separate from the admin client because Vault needs the
   * `ediscovery` scope and a Vault-privileged admin subject.
   */
  private createVaultClient(credentials: ServiceAccountCredentials, adminEmail: string) {
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/ediscovery'],
      subject: adminEmail,
    });
    return google.vault({ version: 'v1', auth: jwtClient });
  }

  /**
   * Preserve a (departing) user's Mail + Drive with Google Vault BEFORE deletion.
   * Vault is a Business Plus+ entitlement, so this is GATED: if the org holds no
   * Vault-eligible SKU we return skipped=true with a reason rather than surface a
   * raw Google 403. Creates a matter, then a MAIL hold and a DRIVE hold (Vault
   * allows one corpus per hold) covering the account. A hold survives account
   * deletion — that is the point: the data is retained even after the user is
   * removed. Callers should record the returned matterId/holdIds.
   */
  async preserveUserWithVault(
    organizationId: string,
    userEmail: string,
    opts: { matterName?: string } = {}
  ): Promise<{
    success: boolean;
    skipped?: boolean;
    reason?: string;
    matterId?: string;
    holdIds?: string[];
    error?: string;
  }> {
    try {
      // Tier gate — the org must hold a Vault-eligible license.
      const inv = await this.getLicenseInventory(organizationId);
      if (inv.success && Array.isArray(inv.licenses)) {
        const vaultCapable = inv.licenses.some((l: any) => skuHasVault(l.skuId));
        if (!vaultCapable) {
          return {
            success: false,
            skipped: true,
            reason: 'Vault preservation requires Business Plus or a higher Vault-eligible edition.',
          };
        }
      }

      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace credentials not found.' };
      }
      const credRow = await db.query(
        'SELECT admin_email, domain FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );
      if (credRow.rows.length === 0) {
        return { success: false, error: 'No Google Workspace credentials for this organization.' };
      }
      const { admin_email, domain } = credRow.rows[0];
      const adminEmail = admin_email || `admin@${domain}`;
      const vault = this.createVaultClient(credentials, adminEmail);

      const matterName = opts.matterName || `Offboarding hold - ${userEmail}`;
      const matterRes = await vault.matters.create({
        requestBody: {
          name: matterName,
          description: `Retention hold created by Helios during offboarding of ${userEmail}.`,
        },
      });
      const matterId = matterRes.data.matterId;
      if (!matterId) {
        return { success: false, error: 'Vault did not return a matter id.' };
      }

      const holdIds: string[] = [];
      for (const corpus of ['MAIL', 'DRIVE'] as const) {
        const holdRes = await vault.matters.holds.create({
          matterId,
          requestBody: {
            name: `${corpus} hold - ${userEmail}`,
            corpus,
            accounts: [{ email: userEmail }],
          },
        });
        if (holdRes.data.holdId) holdIds.push(holdRes.data.holdId);
      }

      logger.info('Vault preservation holds created', {
        organizationId,
        userEmail,
        matterId,
        holdCount: holdIds.length,
      });
      return { success: true, matterId, holdIds };
    } catch (error: any) {
      logger.error('Vault preservation failed', {
        organizationId,
        userEmail,
        error: error?.message,
      });
      return { success: false, error: error?.message || 'Vault preservation failed' };
    }
  }

  /**
   * Get stored credentials for an organization
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
   * Test Google Workspace connection using Domain-Wide Delegation
   */
  async testConnection(
    organizationId: string,
    domain: string,
    adminEmail?: string
  ): Promise<ConnectionTestResult> {
    try {
      // Load credentials from database
      const credentials = await this.getCredentials(organizationId);

      if (!credentials) {
        return {
          success: false,
          message: 'Service account credentials not found',
          error: 'No credentials found for this organization. Please upload service account JSON file.'
        };
      }

      // Use provided admin email or construct from domain
      const testAdminEmail = adminEmail || `admin@${domain}`;

      // Create admin client with Domain-Wide Delegation
      const adminClient = this.createAdminClient(credentials, testAdminEmail);

      // Test basic domain access
      const domains = await adminClient.domains.list({ customer: 'my_customer' });

      // Test user access to verify DWD is working
      const users = await adminClient.users.list({
        customer: 'my_customer',
        maxResults: 5
      });

      const userCount = users.data.users?.length || 0;
      const adminUsers = users.data.users?.filter((user: any) => user.isAdmin).length || 0;

      logger.info('Google Workspace DWD connection test successful', {
        organizationId,
        domain,
        projectId: credentials.project_id,
        userCount,
        adminUsers
      });

      return {
        success: true,
        message: 'Domain-Wide Delegation connection successful',
        details: {
          projectId: credentials.project_id,
          clientEmail: credentials.client_email,
          domain,
          userCount,
          adminUsers
        }
      };

    } catch (error: any) {
      logger.error('Google Workspace DWD connection test failed', {
        organizationId,
        domain,
        error: error.message
      });

      let errorMessage = 'Connection test failed';

      if (error.message.includes('domain-wide delegation')) {
        errorMessage = 'Domain-wide delegation not properly configured. Please enable domain-wide delegation for this service account in Google Admin Console.';
      } else if (error.message.includes('insufficient permissions')) {
        errorMessage = 'Insufficient permissions. Please ensure the service account has the required scopes enabled in domain-wide delegation.';
      } else if (error.message.includes('invalid_grant')) {
        errorMessage = 'Invalid service account credentials or domain-wide delegation not properly configured.';
      } else if (error.message.includes('unauthorized_client')) {
        errorMessage = 'Service account not authorized for domain-wide delegation. Please check your Google Admin Console configuration.';
      }

      return {
        success: false,
        message: errorMessage,
        error: error.message
      };
    }
  }

  /**
   * List Google Workspace domains for an organization
   * Used for domain verification against Google Workspace
   */
  async listGoogleWorkspaceDomains(organizationId: string): Promise<{
    success: boolean;
    domains?: any[];
    error?: string;
  }> {
    try {
      const credentials = await this.getCredentials(organizationId);

      if (!credentials) {
        return {
          success: false,
          error: 'Service account credentials not found. Please configure Google Workspace integration.'
        };
      }

      // Get admin email from credentials table
      const credResult = await db.query(
        'SELECT admin_email, domain FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return {
          success: false,
          error: 'No Google Workspace credentials found for this organization.'
        };
      }

      const { admin_email, domain } = credResult.rows[0];
      const adminEmail = admin_email || `admin@${domain}`;

      const adminClient = this.createAdminClient(credentials, adminEmail);

      // List all domains in the Google Workspace account
      const response = await adminClient.domains.list({ customer: 'my_customer' });

      return {
        success: true,
        domains: response.data.domains || []
      };

    } catch (error: any) {
      logger.error('Failed to list Google Workspace domains', {
        organizationId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to retrieve Google Workspace domains'
      };
    }
  }

  /**
   * Get Google Workspace users using Domain-Wide Delegation
   */
  async getUsers(
    organizationId: string,
    domain: string,
    adminEmail?: string,
    maxResults: number = 100
  ): Promise<{ success: boolean; users?: WorkspaceUser[]; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);

      if (!credentials) {
        return {
          success: false,
          error: 'Service account credentials not found. Please configure Domain-Wide Delegation.'
        };
      }

      const testAdminEmail = adminEmail || `admin@${domain}`;
      const adminClient = this.createAdminClient(credentials, testAdminEmail);

      // Get users with Domain-Wide Delegation
      // IMPORTANT: Filter out deleted users from Google Workspace
      // Fetch ALL fields including organizations, phones, and relations
      const response = await adminClient.users.list({
        customer: 'my_customer',
        maxResults,
        orderBy: 'email',
        showDeleted: 'false',  // Exclude deleted users (use showDeleted, not query)
        projection: 'full'  // Get all user fields including custom schemas
      });

      const users: WorkspaceUser[] = (response.data.users || []).map((user: any) => ({
        id: user.id || '',
        primaryEmail: user.primaryEmail || '',
        name: {
          givenName: user.name?.givenName || '',
          familyName: user.name?.familyName || '',
          fullName: user.name?.fullName || ''
        },
        isAdmin: user.isAdmin || false,
        isDelegatedAdmin: user.isDelegatedAdmin || false,
        suspended: user.suspended || false,
        orgUnitPath: user.orgUnitPath || '/',
        creationTime: user.creationTime || '',
        lastLoginTime: user.lastLoginTime || undefined,
        // Extended properties
        organizations: user.organizations || [],
        phones: user.phones || [],
        relations: user.relations || [],
        department: user.organizations?.[0]?.department || '',
        jobTitle: user.organizations?.[0]?.title || '',
        managerEmail: user.relations?.find((r: any) => r.type === 'manager')?.value || ''
      }));

      logger.info('Retrieved Google Workspace users via DWD', {
        organizationId,
        domain,
        userCount: users.length
      });

      return {
        success: true,
        users
      };

    } catch (error: any) {
      logger.error('Failed to retrieve Google Workspace users via DWD', {
        organizationId,
        domain,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get Domain-Wide Delegation setup information
   */
  getDomainWideDelegationInfo(): {
    clientId: string | null;
    serviceAccountEmail: string | null;
    requiredScopes: string[];
    requiredScopesCsv: string;
    scopeDetails: { scope: string; reason: string }[];
    setupInstructions: string[];
  } {
    // Single source of truth: config/google-scopes.ts. Advertise the FULL
    // delegation set (base + optional, e.g. Vault's ediscovery) so a one-time
    // authorisation covers every current feature — required-now and
    // optional-but-may-be-used-later — and a later release that lights up an
    // optional feature needs no re-authorisation. (The proxy still only *mints*
    // the base REQUIRED_SCOPES, so an un-authorised optional scope never
    // blanket-401s the tenant — that one feature just fails until authorised.)
    const requiredScopes = DELEGATION_SCOPES;

    return {
      clientId: process.env.GOOGLE_CLIENT_ID || null,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
      requiredScopes,
      requiredScopesCsv: requiredScopes.join(','),
      scopeDetails: DELEGATION_SCOPE_DETAILS,
      setupInstructions: [
        'Create a service account in Google Cloud Console',
        'Download the service account JSON file',
        'Enable Domain-Wide Delegation for the service account',
        'In Google Admin Console, go to Security > API Controls > Domain-wide delegation',
        'Add the service account client ID with the required scopes',
        'Upload the service account JSON file to this platform'
      ]
    };
  }

  /**
   * Get organizational units from Google Workspace
   */
  async getOrgUnits(organizationId: string): Promise<any> {
    try {
      // Get organization info and credentials
      const orgResult = await db.query(
        'SELECT domain FROM organizations WHERE id = $1',
        [organizationId]
      );

      if (orgResult.rows.length === 0) {
        return { success: false, error: 'Organization not found' };
      }

      const domain = orgResult.rows[0].domain;

      // Get stored credentials
      const credResult = await db.query(
        'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return { success: false, error: 'No credentials found for this organization' };
      }

      const { service_account_key, admin_email } = credResult.rows[0];
      const credentials = decodeServiceAccountKey(service_account_key);

      // Create JWT client with domain-wide delegation
      const authClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.orgunit'],
        subject: admin_email // Impersonate the admin
      });

      // Create Admin SDK client
      const admin = google.admin({ version: 'directory_v1', auth: authClient });

      // Get org units
      const response = await admin.orgunits.list({
        customerId: 'my_customer', // Use 'my_customer' for the customer of the admin user
        type: 'all'
      });

      const orgUnits = response.data.organizationUnits || [];

      // Get user counts from database for each org unit
      const userCountsResult = await db.query(`
        SELECT org_unit_path, COUNT(*) as user_count
        FROM gw_synced_users
        WHERE organization_id = $1
        GROUP BY org_unit_path
      `, [organizationId]);

      const userCounts = new Map(
        userCountsResult.rows.map((row: any) => [row.org_unit_path, parseInt(row.user_count)])
      );

      logger.info('Retrieved organizational units', {
        organizationId,
        domain,
        count: orgUnits.length
      });

      return {
        success: true,
        data: {
          orgUnits: orgUnits.map((unit: any) => ({
            id: unit.orgUnitId,
            name: unit.name,
            path: unit.orgUnitPath,
            parentPath: unit.parentOrgUnitPath || null,
            description: unit.description || '',
            blockInheritance: unit.blockInheritance || false,
            userCount: userCounts.get(unit.orgUnitPath) || 0
          }))
        }
      };

    } catch (error: any) {
      logger.error('Failed to retrieve org units', {
        organizationId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sync organizational units from Google Workspace to database
   */
  async syncOrgUnits(organizationId: string): Promise<any> {
    try {
      // First get the org units from Google
      const fetchResult = await this.getOrgUnits(organizationId);

      if (!fetchResult.success) {
        return fetchResult;
      }

      const orgUnits = fetchResult.data.orgUnits;

      // Begin transaction
      await db.query('BEGIN');

      try {
        // Clear existing org units for this organization
        await db.query(
          'DELETE FROM gw_org_units WHERE organization_id = $1',
          [organizationId]
        );

        // Insert new org units
        for (const unit of orgUnits) {
          await db.query(`
            INSERT INTO gw_org_units
            (organization_id, google_id, name, path, parent_id, description, last_sync_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `, [
            organizationId,
            unit.id,
            unit.name,
            unit.path,
            unit.parentPath || null,
            unit.description || null
          ]);
        }

        // Get module ID for Google Workspace
        const moduleResult = await db.query(
          `SELECT id FROM modules WHERE slug = 'google-workspace' LIMIT 1`
        );

        if (moduleResult.rows.length > 0) {
          const moduleId = moduleResult.rows[0].id;

          // Update sync timestamp
          await db.query(`
            UPDATE organization_modules
            SET last_sync_at = NOW(),
                config = config || jsonb_build_object('org_units_count', $3::integer)
            WHERE organization_id = $1 AND module_id = $2
          `, [organizationId, moduleId, orgUnits.length]);
        }

        await db.query('COMMIT');

        return {
          success: true,
          message: `Successfully synced ${orgUnits.length} organizational units`,
          count: orgUnits.length,
          orgUnits
        };

      } catch (dbError) {
        await db.query('ROLLBACK');
        throw dbError;
      }

    } catch (error: any) {
      logger.error('Failed to sync org units', {
        organizationId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get setup status for Google Workspace integration
   */
  async getSetupStatus(organizationId: string): Promise<{
    isConfigured: boolean;
    config?: {
      domain?: string;
      adminEmail?: string;
    };
  }> {
    try {
      // Check if credentials exist
      const credResult = await db.query(
        `SELECT domain, admin_email FROM gw_credentials
         WHERE organization_id = $1`,
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return { isConfigured: false };
      }

      const row = credResult.rows[0];
      return {
        isConfigured: true,
        config: {
          domain: row.domain,
          adminEmail: row.admin_email
        }
      };
    } catch (error: any) {
      logger.error('Failed to get setup status', {
        organizationId,
        error: error.message
      });
      return { isConfigured: false };
    }
  }

  /**
   * Get Google Workspace groups
   */
  async getGroups(organizationId: string): Promise<any> {
    try {
      // Get organization and credentials
      const credResult = await db.query(
        'SELECT service_account_key, admin_email, domain FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return { success: false, error: 'No credentials found for this organization' };
      }

      const { service_account_key, admin_email, domain } = credResult.rows[0];
      const credentials = decodeServiceAccountKey(service_account_key);

      // Create admin client
      const adminClient = this.createAdminClient(credentials, admin_email);

      // Get groups
      const response = await adminClient.groups.list({
        customer: 'my_customer',
        maxResults: 200
      });

      const groups = (response.data.groups || []).map((group: any) => ({
        id: group.id,
        name: group.name,
        email: group.email,
        description: group.description || '',
        directMembersCount: group.directMembersCount || 0,
        adminCreated: group.adminCreated || false
      }));

      logger.info('Retrieved Google Workspace groups', {
        organizationId,
        groupCount: groups.length
      });

      return {
        success: true,
        data: {
          groups
        }
      };

    } catch (error: any) {
      logger.error('Failed to fetch groups', {
        organizationId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add a member to a group
   */
  async addGroupMember(organizationId: string, groupId: string, email: string, role: string = 'MEMBER'): Promise<any> {
    try {
      const credResult = await db.query(
        'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return { success: false, error: 'No credentials found for this organization' };
      }

      const { service_account_key, admin_email } = credResult.rows[0];
      const credentials = decodeServiceAccountKey(service_account_key);

      const adminClient = this.createAdminClient(credentials, admin_email);

      await adminClient.members.insert({
        groupKey: groupId,
        requestBody: {
          email,
          role
        }
      });

      logger.info('Added member to group', {
        organizationId,
        groupId,
        email,
        role
      });

      return {
        success: true,
        message: `Successfully added ${email} to the group`
      };

    } catch (error: any) {
      logger.error('Failed to add group member', {
        organizationId,
        groupId,
        email,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove a member from a group
   */
  async removeGroupMember(organizationId: string, groupId: string, memberEmail: string): Promise<any> {
    try {
      const credResult = await db.query(
        'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return { success: false, error: 'No credentials found for this organization' };
      }

      const { service_account_key, admin_email } = credResult.rows[0];
      const credentials = decodeServiceAccountKey(service_account_key);

      const adminClient = this.createAdminClient(credentials, admin_email);

      await adminClient.members.delete({
        groupKey: groupId,
        memberKey: memberEmail
      });

      logger.info('Removed member from group', {
        organizationId,
        groupId,
        memberEmail
      });

      return {
        success: true,
        message: `Successfully removed ${memberEmail} from the group`
      };

    } catch (error: any) {
      logger.error('Failed to remove group member', {
        organizationId,
        groupId,
        memberEmail,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new group
   */
  async createGroup(organizationId: string, email: string, name: string, description: string): Promise<any> {
    try {
      const credResult = await db.query(
        'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return { success: false, error: 'No credentials found for this organization' };
      }

      const { service_account_key, admin_email } = credResult.rows[0];
      const credentials = decodeServiceAccountKey(service_account_key);

      const adminClient = this.createAdminClient(credentials, admin_email);

      const response = await adminClient.groups.insert({
        requestBody: {
          email,
          name,
          description
        }
      });

      logger.info('Created new group', {
        organizationId,
        groupId: response.data.id,
        email,
        name
      });

      return {
        success: true,
        message: `Successfully created group ${name}`,
        data: {
          group: {
            id: response.data.id,
            email: response.data.email,
            name: response.data.name,
            description: response.data.description
          }
        }
      };

    } catch (error: any) {
      logger.error('Failed to create group', {
        organizationId,
        email,
        name,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update group settings
   */
  async updateGroup(organizationId: string, groupId: string, updates: { name?: string; description?: string }): Promise<any> {
    try {
      const credResult = await db.query(
        'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return { success: false, error: 'No credentials found for this organization' };
      }

      const { service_account_key, admin_email } = credResult.rows[0];
      const credentials = decodeServiceAccountKey(service_account_key);

      const adminClient = this.createAdminClient(credentials, admin_email);

      const response = await adminClient.groups.patch({
        groupKey: groupId,
        requestBody: updates
      });

      logger.info('Updated group', {
        organizationId,
        groupId,
        updates
      });

      return {
        success: true,
        message: 'Successfully updated group',
        data: {
          group: {
            id: response.data.id,
            email: response.data.email,
            name: response.data.name,
            description: response.data.description
          }
        }
      };

    } catch (error: any) {
      logger.error('Failed to update group', {
        organizationId,
        groupId,
        updates,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get members of a specific group
   */
  async getGroupMembers(organizationId: string, groupId: string): Promise<any> {
    try {
      // Get credentials
      const credResult = await db.query(
        'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length === 0) {
        return { success: false, error: 'No credentials found for this organization' };
      }

      const { service_account_key, admin_email } = credResult.rows[0];
      const credentials = decodeServiceAccountKey(service_account_key);

      // Create admin client
      const adminClient = this.createAdminClient(credentials, admin_email);

      // Get group members
      const response = await adminClient.members.list({
        groupKey: groupId
      });

      const members = (response.data.members || []).map((member: any) => ({
        id: member.id,
        email: member.email,
        role: member.role,
        type: member.type,
        status: member.status
      }));

      logger.info('Retrieved group members', {
        organizationId,
        groupId,
        memberCount: members.length
      });

      return {
        success: true,
        data: {
          members
        }
      };

    } catch (error: any) {
      logger.error('Failed to fetch group members', {
        organizationId,
        groupId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sync groups from Google Workspace to database
   */
  async syncGroups(organizationId: string): Promise<any> {
    try {
      // Fetch groups from Google
      const fetchResult = await this.getGroups(organizationId);

      if (!fetchResult.success) {
        return fetchResult;
      }

      const groups = fetchResult.data.groups;

      // Begin transaction
      await db.query('BEGIN');

      try {
        // Clear existing Google Workspace groups for this organization
        // Note: Only delete groups from google_workspace platform
        await db.query(
          'DELETE FROM access_groups WHERE organization_id = $1 AND platform = $2',
          [organizationId, 'google_workspace']
        );

        // Also maintain gw_groups for backward compatibility (will be deprecated)
        await db.query(
          'DELETE FROM gw_groups WHERE organization_id = $1',
          [organizationId]
        );

        // Insert new groups into access_groups table
        for (const group of groups) {
          // Insert into new canonical access_groups table
          const groupInsertResult = await db.query(`
            INSERT INTO access_groups
            (organization_id, name, email, description, platform, group_type, external_id, synced_at, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
            RETURNING id
          `, [
            organizationId,
            group.name,
            group.email,
            group.description || '',
            'google_workspace',
            'google_group',
            group.id,
            JSON.stringify({
              directMembersCount: group.directMembersCount || 0,
              adminCreated: group.adminCreated || false
            })
          ]);

          const accessGroupId = groupInsertResult.rows[0].id;

          // Also insert into gw_groups for backward compatibility
          await db.query(`
            INSERT INTO gw_groups
            (organization_id, google_id, name, email, description, member_count, last_sync_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `, [
            organizationId,
            group.id,
            group.name,
            group.email,
            group.description,
            group.directMembersCount || 0
          ]);

          // Sync group members
          try {
            const membersResult = await this.getGroupMembers(organizationId, group.id);
            if (membersResult.success && membersResult.data?.members) {
              // Clear existing members for this group
              await db.query(
                'DELETE FROM access_group_members WHERE access_group_id = $1',
                [accessGroupId]
              );

              // Insert group members
              for (const member of membersResult.data.members) {
                // Look up user by email in organization_users
                const userResult = await db.query(
                  'SELECT id FROM organization_users WHERE organization_id = $1 AND email = $2',
                  [organizationId, member.email.toLowerCase()]
                );

                if (userResult.rows.length > 0) {
                  const userId = userResult.rows[0].id;

                  // Insert into access_group_members
                  await db.query(`
                    INSERT INTO access_group_members
                    (access_group_id, user_id, member_type, joined_at, is_active)
                    VALUES ($1, $2, $3, NOW(), true)
                    ON CONFLICT (access_group_id, user_id) DO UPDATE
                    SET member_type = $3, is_active = true, updated_at = NOW()
                  `, [
                    accessGroupId,
                    userId,
                    member.role === 'OWNER' ? 'owner' : member.role === 'MANAGER' ? 'manager' : 'member'
                  ]);
                }
              }
              logger.info('Synced group members', {
                organizationId,
                groupId: group.id,
                groupName: group.name,
                memberCount: membersResult.data.members.length
              });
            }
          } catch (memberError: any) {
            logger.warn('Failed to sync members for group', {
              organizationId,
              groupId: group.id,
              groupName: group.name,
              error: memberError.message
            });
            // Don't fail the entire sync if member sync fails for one group
          }
        }

        // Update module sync timestamp
        const moduleResult = await db.query(
          `SELECT id FROM modules WHERE slug = 'google-workspace' LIMIT 1`
        );

        if (moduleResult.rows.length > 0) {
          const moduleId = moduleResult.rows[0].id;

          await db.query(`
            UPDATE organization_modules
            SET last_sync_at = NOW(),
                config = config || jsonb_build_object('groups_count', $3::integer)
            WHERE organization_id = $1 AND module_id = $2
          `, [organizationId, moduleId, groups.length]);
        }

        await db.query('COMMIT');

        return {
          success: true,
          message: `Successfully synced ${groups.length} groups`,
          count: groups.length,
          groups
        };

      } catch (dbError) {
        await db.query('ROLLBACK');
        throw dbError;
      }

    } catch (error: any) {
      logger.error('Failed to sync groups', {
        organizationId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Suspend a user in Google Workspace
   */
  async suspendUser(organizationId: string, googleWorkspaceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Self-lockout guard: never suspend the admin Helios impersonates.
      await assertNotProtectedAdmin(admin, googleWorkspaceId, adminEmail, 'suspend');

      // Suspend the user
      await admin.users.update({
        userKey: googleWorkspaceId,
        requestBody: {
          suspended: true
        }
      });

      logger.info('User suspended in Google Workspace', { googleWorkspaceId });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to suspend user in Google Workspace', {
        googleWorkspaceId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Permanently delete a user from Google Workspace
   *
   * WARNING: This permanently deletes the user and frees the license.
   * All user data (Gmail, Drive, Calendar) is scheduled for deletion.
   */
  async deleteUser(organizationId: string, googleWorkspaceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Self-lockout guard: never delete the admin Helios impersonates.
      await assertNotProtectedAdmin(admin, googleWorkspaceId, adminEmail, 'delete');

      // Permanently delete the user
      await admin.users.delete({
        userKey: googleWorkspaceId
      });

      logger.info('User permanently deleted from Google Workspace', { googleWorkspaceId });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to delete user from Google Workspace', {
        googleWorkspaceId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get groups that a user belongs to
   */
  async getUserGroups(organizationId: string, googleWorkspaceId: string): Promise<any> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        throw new Error('Google Workspace not configured');
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        throw new Error('Admin email not configured');
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.group'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Get all groups for the user
      const response = await admin.groups.list({
        userKey: googleWorkspaceId
      });

      return {
        success: true,
        data: response.data.groups || []
      };
    } catch (error: any) {
      logger.error('Failed to get user groups', {
        googleWorkspaceId,
        error: error.message
      });
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  /**
   * Update user in Google Workspace
   * Pushes local changes to Google
   */
  async updateUser(
    organizationId: string,
    googleWorkspaceId: string,
    updates: {
      firstName?: string;
      lastName?: string;
      jobTitle?: string;
      department?: string;
      managerId?: string;
      managerEmail?: string;
      organizationalUnit?: string;
      phones?: { type: string; value: string }[];
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Build the update request body
      const requestBody: any = {};

      // Update name if provided
      if (updates.firstName || updates.lastName) {
        requestBody.name = {
          givenName: updates.firstName,
          familyName: updates.lastName
        };
      }

      // Update organization info (job title, department)
      if (updates.jobTitle || updates.department) {
        requestBody.organizations = [{
          title: updates.jobTitle,
          department: updates.department,
          primary: true
        }];
      }

      // Update manager relationship
      if (updates.managerEmail !== undefined) {
        requestBody.relations = updates.managerEmail ? [{
          value: updates.managerEmail,
          type: 'manager'
        }] : [];
      }

      // Update organizational unit
      if (updates.organizationalUnit) {
        requestBody.orgUnitPath = updates.organizationalUnit;
      }

      // Update phone numbers
      if (updates.phones && updates.phones.length > 0) {
        requestBody.phones = updates.phones.map(phone => ({
          value: phone.value,
          type: phone.type === 'mobile' ? 'mobile' : 'work',
          primary: phone.type === 'work'
        }));
      }

      // Update the user in Google Workspace
      await admin.users.update({
        userKey: googleWorkspaceId,
        requestBody
      });

      logger.info('User updated in Google Workspace', { googleWorkspaceId, updates });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to update user in Google Workspace', {
        googleWorkspaceId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Add user to group in Google Workspace
   */
  async addUserToGroup(
    organizationId: string,
    userEmail: string,
    groupId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.group.member'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Add member to group
      await admin.members.insert({
        groupKey: groupId,
        requestBody: {
          email: userEmail,
          role: 'MEMBER'
        }
      });

      logger.info('User added to group in Google Workspace', { userEmail, groupId });
      return { success: true };
    } catch (error: any) {
      // Check if user is already a member
      if (error.message?.includes('Member already exists')) {
        return { success: true }; // Not an error if already a member
      }
      logger.error('Failed to add user to group in Google Workspace', {
        userEmail,
        groupId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove user from group in Google Workspace
   */
  async removeUserFromGroup(
    organizationId: string,
    userEmail: string,
    groupId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.group.member'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Remove member from group
      await admin.members.delete({
        groupKey: groupId,
        memberKey: userEmail
      });

      logger.info('User removed from group in Google Workspace', { userEmail, groupId });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to remove user from group in Google Workspace', {
        userEmail,
        groupId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get admin email from credentials
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
   * Get members of a Google Workspace group (emails only for sync)
   */
  async getGroupMemberEmails(
    organizationId: string,
    groupId: string
  ): Promise<{ success: boolean; members?: string[]; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.group.member'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Get all members from Google Workspace group
      const members: string[] = [];
      let pageToken: string | undefined;

      do {
        const response = await admin.members.list({
          groupKey: groupId,
          maxResults: 200,
          pageToken
        });

        if (response.data.members) {
          for (const member of response.data.members) {
            if (member.email) {
              members.push(member.email.toLowerCase());
            }
          }
        }

        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);

      return { success: true, members };
    } catch (error: any) {
      logger.error('Failed to get group members from Google Workspace', {
        groupId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // USER LIFECYCLE METHODS
  // ==========================================

  /**
   * Create a new user in Google Workspace
   * Used during onboarding to provision new accounts
   */
  async createUser(
    organizationId: string,
    userData: {
      email: string;
      firstName: string;
      lastName: string;
      password: string;
      orgUnitPath?: string;
      jobTitle?: string;
      department?: string;
      managerEmail?: string;
      phones?: { type: string; value: string }[];
      changePasswordAtNextLogin?: boolean;
    }
  ): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Build request body
      const requestBody: any = {
        primaryEmail: userData.email,
        name: {
          givenName: userData.firstName,
          familyName: userData.lastName
        },
        password: userData.password,
        changePasswordAtNextLogin: userData.changePasswordAtNextLogin !== false // Default to true
      };

      // Set org unit path
      if (userData.orgUnitPath) {
        requestBody.orgUnitPath = userData.orgUnitPath;
      }

      // Set organization info
      if (userData.jobTitle || userData.department) {
        requestBody.organizations = [{
          title: userData.jobTitle || '',
          department: userData.department || '',
          primary: true
        }];
      }

      // Set manager relationship
      if (userData.managerEmail) {
        requestBody.relations = [{
          value: userData.managerEmail,
          type: 'manager'
        }];
      }

      // Set phone numbers
      if (userData.phones && userData.phones.length > 0) {
        requestBody.phones = userData.phones.map(phone => ({
          value: phone.value,
          type: phone.type === 'mobile' ? 'mobile' : 'work',
          primary: phone.type === 'work'
        }));
      }

      // Create the user
      const response = await admin.users.insert({
        requestBody
      });

      logger.info('User created in Google Workspace', {
        organizationId,
        email: userData.email,
        userId: response.data.id
      });

      return {
        success: true,
        userId: response.data.id || undefined
      };
    } catch (error: any) {
      logger.error('Failed to create user in Google Workspace', {
        organizationId,
        email: userData.email,
        error: error.message
      });

      // Provide helpful error messages
      let errorMessage = error.message;
      if (error.message?.includes('Entity already exists')) {
        errorMessage = 'A user with this email already exists in Google Workspace';
      } else if (error.message?.includes('Invalid Ou')) {
        errorMessage = 'Invalid organizational unit path';
      } else if (error.message?.includes('Invalid Input')) {
        errorMessage = 'Invalid user data provided';
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Set or change a user's organizational unit
   */
  async setOrgUnit(
    organizationId: string,
    googleWorkspaceId: string,
    orgUnitPath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      await admin.users.update({
        userKey: googleWorkspaceId,
        requestBody: {
          orgUnitPath
        }
      });

      logger.info('User org unit updated in Google Workspace', {
        googleWorkspaceId,
        orgUnitPath
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to set org unit in Google Workspace', {
        googleWorkspaceId,
        orgUnitPath,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Sign out user from all devices and revoke application tokens
   * Used during offboarding to ensure immediate access revocation
   */
  async signOutAllDevices(
    organizationId: string,
    googleWorkspaceId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user.security'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Sign out from all web and device sessions
      await admin.users.signOut({
        userKey: googleWorkspaceId
      });

      logger.info('User signed out from all devices', { googleWorkspaceId });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to sign out user from all devices', {
        googleWorkspaceId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke all OAuth tokens for a user
   * This revokes all third-party app access
   */
  async revokeOAuthTokens(
    organizationId: string,
    userEmail: string
  ): Promise<{ success: boolean; revokedCount?: number; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.directory.user.security'],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Get list of tokens
      const tokensResponse = await admin.tokens.list({
        userKey: userEmail
      });

      const tokens = tokensResponse.data.items || [];
      let revokedCount = 0;

      // Revoke each token
      for (const token of tokens) {
        if (token.clientId) {
          try {
            await admin.tokens.delete({
              userKey: userEmail,
              clientId: token.clientId
            });
            revokedCount++;
          } catch (tokenError: any) {
            logger.warn('Failed to revoke individual token', {
              userEmail,
              clientId: token.clientId,
              error: tokenError.message
            });
          }
        }
      }

      logger.info('OAuth tokens revoked', {
        userEmail,
        revokedCount,
        totalTokens: tokens.length
      });

      return { success: true, revokedCount };
    } catch (error: any) {
      logger.error('Failed to revoke OAuth tokens', {
        userEmail,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Set up email auto-forwarding for a user
   * Used during offboarding to forward emails to manager or replacement
   */
  async setupEmailForwarding(
    organizationId: string,
    userEmail: string,
    forwardToEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      // For email forwarding, we need to impersonate the user being forwarded
      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.sharing'],
        subject: userEmail // Impersonate the user whose email is being forwarded
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      // First, create the forwarding address
      try {
        await gmail.users.settings.forwardingAddresses.create({
          userId: 'me',
          requestBody: {
            forwardingEmail: forwardToEmail
          }
        });
      } catch (createError: any) {
        // Address might already exist, which is fine
        if (!createError.message?.includes('already exists')) {
          throw createError;
        }
      }

      // Enable forwarding with disposition to keep in inbox
      await gmail.users.settings.updateAutoForwarding({
        userId: 'me',
        requestBody: {
          enabled: true,
          emailAddress: forwardToEmail,
          disposition: 'leaveInInbox' // Keep original in inbox, forward copy
        }
      });

      logger.info('Email forwarding configured', {
        userEmail,
        forwardToEmail
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to set up email forwarding', {
        userEmail,
        forwardToEmail,
        error: error.message
      });

      // Provide helpful error message
      let errorMessage = error.message;
      if (error.message?.includes('Delegation denied')) {
        errorMessage = 'Cannot set up forwarding - user may be suspended or delegation is not enabled';
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Set vacation/out-of-office auto-reply message
   * Used during offboarding to notify senders the employee has left
   */
  async setVacationResponder(
    organizationId: string,
    userEmail: string,
    message: {
      subject: string;
      body: string;
      htmlBody?: string;
      restrictToContacts?: boolean;
      restrictToDomain?: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      // Impersonate the user to set their vacation responder
      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
        subject: userEmail
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      await gmail.users.settings.updateVacation({
        userId: 'me',
        requestBody: {
          enableAutoReply: true,
          responseSubject: message.subject,
          responseBodyPlainText: message.body,
          responseBodyHtml: message.htmlBody || message.body.replace(/\n/g, '<br>'),
          restrictToContacts: message.restrictToContacts || false,
          restrictToDomain: message.restrictToDomain || false
          // Note: Not setting startTime/endTime means it stays active indefinitely
        }
      });

      logger.info('Vacation responder configured', {
        userEmail,
        subject: message.subject
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to set vacation responder', {
        userEmail,
        error: error.message
      });

      let errorMessage = error.message;
      if (error.message?.includes('Delegation denied')) {
        errorMessage = 'Cannot set vacation responder - user may be suspended';
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Add a Gmail delegate for a user
   * Delegates can read, send, and delete messages on behalf of the user
   * Note: Google has a limit of 25 delegates per user
   */
  async addGmailDelegate(
    organizationId: string,
    userEmail: string,
    delegateEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      // Impersonate the user to add delegate
      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.sharing'],
        subject: userEmail
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      await gmail.users.settings.delegates.create({
        userId: 'me',
        requestBody: {
          delegateEmail: delegateEmail
        }
      });

      logger.info('Gmail delegate added', {
        userEmail,
        delegateEmail
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to add Gmail delegate', {
        userEmail,
        delegateEmail,
        error: error.message
      });

      let errorMessage = error.message;
      if (error.message?.includes('quota')) {
        errorMessage = 'Cannot add delegate - user has reached the maximum limit of 25 delegates';
      } else if (error.message?.includes('already exists')) {
        errorMessage = 'This user is already a delegate';
      } else if (error.message?.includes('Delegation denied')) {
        errorMessage = 'Cannot add delegate - user may be suspended or delegation is not enabled';
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Remove a Gmail delegate from a user
   */
  async removeGmailDelegate(
    organizationId: string,
    userEmail: string,
    delegateEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.sharing'],
        subject: userEmail
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      await gmail.users.settings.delegates.delete({
        userId: 'me',
        delegateEmail: delegateEmail
      });

      logger.info('Gmail delegate removed', {
        userEmail,
        delegateEmail
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to remove Gmail delegate', {
        userEmail,
        delegateEmail,
        error: error.message
      });

      let errorMessage = error.message;
      if (error.message?.includes('not found')) {
        errorMessage = 'Delegate not found';
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * List Gmail delegates for a user
   */
  async listGmailDelegates(
    organizationId: string,
    userEmail: string
  ): Promise<{ success: boolean; delegates?: Array<{ email: string; verificationStatus: string }>; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
        subject: userEmail
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      const response = await gmail.users.settings.delegates.list({
        userId: 'me'
      });

      const delegates = (response.data.delegates || []).map((d: any) => ({
        email: d.delegateEmail,
        verificationStatus: d.verificationStatus
      }));

      return { success: true, delegates };
    } catch (error: any) {
      logger.error('Failed to list Gmail delegates', {
        userEmail,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current email settings (forwarding, vacation, delegates) for a user
   */
  async getEmailSettings(
    organizationId: string,
    userEmail: string
  ): Promise<{
    success: boolean;
    settings?: {
      forwarding: { enabled: boolean; emailAddress?: string; disposition?: string };
      vacation: { enabled: boolean; subject?: string; message?: string };
      delegateCount: number;
    };
    error?: string;
  }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
        subject: userEmail
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      // Get forwarding settings
      const forwardingResponse = await gmail.users.settings.getAutoForwarding({
        userId: 'me'
      });

      // Get vacation settings
      const vacationResponse = await gmail.users.settings.getVacation({
        userId: 'me'
      });

      // Get delegates count
      const delegatesResponse = await gmail.users.settings.delegates.list({
        userId: 'me'
      });

      return {
        success: true,
        settings: {
          forwarding: {
            enabled: forwardingResponse.data.enabled || false,
            emailAddress: forwardingResponse.data.emailAddress || undefined,
            disposition: forwardingResponse.data.disposition || undefined
          },
          vacation: {
            enabled: vacationResponse.data.enableAutoReply || false,
            subject: vacationResponse.data.responseSubject || undefined,
            message: vacationResponse.data.responseBodyPlainText || undefined
          },
          delegateCount: (delegatesResponse.data.delegates || []).length
        }
      };
    } catch (error: any) {
      logger.error('Failed to get email settings', {
        userEmail,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Disable email forwarding for a user
   */
  async disableEmailForwarding(
    organizationId: string,
    userEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.sharing'],
        subject: userEmail
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      await gmail.users.settings.updateAutoForwarding({
        userId: 'me',
        requestBody: {
          enabled: false
        }
      });

      logger.info('Email forwarding disabled', { userEmail });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to disable email forwarding', {
        userEmail,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Disable vacation responder for a user
   */
  async disableVacationResponder(
    organizationId: string,
    userEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
        subject: userEmail
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      await gmail.users.settings.updateVacation({
        userId: 'me',
        requestBody: {
          enableAutoReply: false
        }
      });

      logger.info('Vacation responder disabled', { userEmail });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to disable vacation responder', {
        userEmail,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Transfer Drive file ownership to another user
   * Note: This requires the Data Transfer API which has limitations
   * For now, this will transfer specific files, not bulk transfer
   */
  async transferDriveOwnership(
    organizationId: string,
    fromUserEmail: string,
    toUserEmail: string,
    fileIds?: string[]
  ): Promise<{ success: boolean; transferredCount?: number; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      // If no specific files provided, use the Admin SDK Data Transfer API
      // for bulk transfer (requires admin.datatransfer scope)
      if (!fileIds || fileIds.length === 0) {
        const jwtClient = new JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: ['https://www.googleapis.com/auth/admin.datatransfer'],
          subject: adminEmail
        });

        const datatransfer = google.admin({ version: 'datatransfer_v1', auth: jwtClient });

        // Get user IDs
        const adminClient = this.createAdminClient(credentials, adminEmail);

        const fromUserResponse = await adminClient.users.get({ userKey: fromUserEmail });
        const toUserResponse = await adminClient.users.get({ userKey: toUserEmail });

        if (!fromUserResponse.data.id || !toUserResponse.data.id) {
          return { success: false, error: 'Could not find user IDs' };
        }

        // Create data transfer request for Drive
        const transferResponse = await datatransfer.transfers.insert({
          requestBody: {
            oldOwnerUserId: fromUserResponse.data.id,
            newOwnerUserId: toUserResponse.data.id,
            applicationDataTransfers: [{
              applicationId: '55656082996', // Google Drive application ID
              applicationTransferParams: [{
                key: 'PRIVACY_LEVEL',
                value: ['PRIVATE', 'SHARED'] // Transfer both private and shared files
              }]
            }]
          }
        });

        logger.info('Drive data transfer initiated', {
          fromUserEmail,
          toUserEmail,
          transferId: transferResponse.data.id
        });

        return {
          success: true,
          transferredCount: -1 // Unknown count for bulk transfer
        };
      }

      // For specific files, use Drive API with user impersonation
      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/drive'],
        subject: fromUserEmail
      });

      const drive = google.drive({ version: 'v3', auth: jwtClient });

      let transferredCount = 0;
      for (const fileId of fileIds) {
        try {
          // Create permission for new owner
          await drive.permissions.create({
            fileId,
            transferOwnership: true,
            requestBody: {
              type: 'user',
              role: 'owner',
              emailAddress: toUserEmail
            }
          });
          transferredCount++;
        } catch (fileError: any) {
          logger.warn('Failed to transfer file ownership', {
            fileId,
            fromUserEmail,
            toUserEmail,
            error: fileError.message
          });
        }
      }

      logger.info('Drive files transferred', {
        fromUserEmail,
        toUserEmail,
        transferredCount,
        totalFiles: fileIds.length
      });

      return {
        success: transferredCount > 0,
        transferredCount
      };
    } catch (error: any) {
      logger.error('Failed to transfer Drive ownership', {
        fromUserEmail,
        toUserEmail,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get data transfer status
   */
  async getDataTransferStatus(
    organizationId: string,
    transferId: string
  ): Promise<{ success: boolean; status?: string; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.datatransfer'],
        subject: adminEmail
      });

      const datatransfer = google.admin({ version: 'datatransfer_v1', auth: jwtClient });

      const response = await datatransfer.transfers.get({
        dataTransferId: transferId
      });

      return {
        success: true,
        status: response.data.overallTransferStatusCode || 'unknown'
      };
    } catch (error: any) {
      logger.error('Failed to get data transfer status', {
        transferId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a single user from Google Workspace by email or ID
   */
  async getUser(
    organizationId: string,
    userKey: string
  ): Promise<{ success: boolean; user?: WorkspaceUser; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'Admin email not configured' };
      }

      const adminClient = this.createAdminClient(credentials, adminEmail);

      const response = await adminClient.users.get({
        userKey,
        projection: 'full'
      });

      const user = response.data;

      return {
        success: true,
        user: {
          id: user.id || '',
          primaryEmail: user.primaryEmail || '',
          name: {
            givenName: user.name?.givenName || '',
            familyName: user.name?.familyName || '',
            fullName: user.name?.fullName || ''
          },
          isAdmin: user.isAdmin || false,
          isDelegatedAdmin: user.isDelegatedAdmin || false,
          suspended: user.suspended || false,
          orgUnitPath: user.orgUnitPath || '/',
          creationTime: user.creationTime || '',
          lastLoginTime: user.lastLoginTime || undefined,
          organizations: user.organizations || [],
          phones: user.phones || [],
          relations: user.relations || [],
          department: user.organizations?.[0]?.department || '',
          jobTitle: user.organizations?.[0]?.title || '',
          managerEmail: user.relations?.find((r: any) => r.type === 'manager')?.value || ''
        }
      };
    } catch (error: any) {
      logger.error('Failed to get user from Google Workspace', {
        userKey,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync group members from Helios to Google Workspace
   * @param direction 'push' = Helios -> Google, 'pull' = Google -> Helios, 'bidirectional' = merge both
   */
  async syncGroupMembers(
    organizationId: string,
    groupId: string,
    externalId: string,
    heliosMembers: string[],
    direction: 'push' | 'pull' | 'bidirectional' = 'push'
  ): Promise<{
    success: boolean;
    added: number;
    removed: number;
    errors: string[];
    details?: any;
  }> {
    const errors: string[] = [];
    let added = 0;
    let removed = 0;

    try {
      // Get current Google Workspace members
      const gwResult = await this.getGroupMemberEmails(organizationId, externalId);
      if (!gwResult.success || !gwResult.members) {
        return {
          success: false,
          added: 0,
          removed: 0,
          errors: [gwResult.error || 'Failed to fetch Google Workspace members']
        };
      }

      const gwMembers = new Set(gwResult.members.map((e: string) => e.toLowerCase()));
      const heliosMemberSet = new Set(heliosMembers.map((e: string) => e.toLowerCase()));

      if (direction === 'push' || direction === 'bidirectional') {
        // Add members that are in Helios but not in Google Workspace
        for (const email of heliosMembers) {
          if (!gwMembers.has(email.toLowerCase())) {
            const result = await this.addUserToGroup(organizationId, email, externalId);
            if (result.success) {
              added++;
              logger.info('Added member to Google Workspace group', { email, groupId: externalId });
            } else {
              errors.push(`Failed to add ${email}: ${result.error}`);
            }
          }
        }

        // Remove members that are in Google Workspace but not in Helios
        for (const email of gwResult.members) {
          if (!heliosMemberSet.has(email.toLowerCase())) {
            const result = await this.removeUserFromGroup(organizationId, email, externalId);
            if (result.success) {
              removed++;
              logger.info('Removed member from Google Workspace group', { email, groupId: externalId });
            } else {
              errors.push(`Failed to remove ${email}: ${result.error}`);
            }
          }
        }
      }

      logger.info('Group sync completed', {
        organizationId,
        groupId,
        externalId,
        direction,
        added,
        removed,
        errorCount: errors.length
      });

      return {
        success: errors.length === 0,
        added,
        removed,
        errors,
        details: {
          heliosMemberCount: heliosMembers.length,
          gwMemberCount: gwResult.members.length
        }
      };
    } catch (error: any) {
      logger.error('Group sync failed', {
        organizationId,
        groupId,
        externalId,
        error: error.message
      });
      return {
        success: false,
        added,
        removed,
        errors: [...errors, error.message]
      };
    }
  }

  // =====================================================
  // EMAIL SIGNATURE MANAGEMENT
  // =====================================================

  /**
   * Get a user's current email signature from Gmail
   */
  async getUserSignature(
    organizationId: string,
    userEmail: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace credentials not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
        subject: userEmail, // Impersonate the user
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      // Get the user's primary sendAs address
      const sendAsResponse = await gmail.users.settings.sendAs.list({
        userId: 'me',
      });

      const primarySendAs = sendAsResponse.data.sendAs?.find(
        (sa) => sa.isPrimary === true
      );

      if (!primarySendAs) {
        return { success: false, error: 'Primary email address not found' };
      }

      return {
        success: true,
        signature: primarySendAs.signature || '',
      };
    } catch (error: any) {
      logger.error('Failed to get user signature', {
        organizationId,
        userEmail,
        error: error.message,
      });
      return {
        success: false,
        error: error.message || 'Failed to get signature',
      };
    }
  }

  /**
   * Set a user's email signature in Gmail
   */
  async setUserSignature(
    organizationId: string,
    userEmail: string,
    signatureHtml: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace credentials not configured' };
      }

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
        subject: userEmail, // Impersonate the user
      });

      const gmail = google.gmail({ version: 'v1', auth: jwtClient });

      // Update the user's primary sendAs signature
      await gmail.users.settings.sendAs.update({
        userId: 'me',
        sendAsEmail: userEmail,
        requestBody: {
          signature: signatureHtml,
        },
      });

      logger.info('User signature updated in Gmail', {
        organizationId,
        userEmail,
        signatureLength: signatureHtml.length,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to set user signature', {
        organizationId,
        userEmail,
        error: error.message,
      });
      return {
        success: false,
        error: error.message || 'Failed to set signature',
      };
    }
  }

  /**
   * Set signatures for multiple users in batch
   * Uses Promise.allSettled to handle individual failures
   */
  async setUserSignaturesBatch(
    organizationId: string,
    signatures: { userEmail: string; signatureHtml: string }[],
    options: { concurrency?: number } = {}
  ): Promise<{
    success: boolean;
    results: { userEmail: string; success: boolean; error?: string }[];
    successCount: number;
    failureCount: number;
  }> {
    const { concurrency = 5 } = options;
    const results: { userEmail: string; success: boolean; error?: string }[] = [];

    // Process in batches for rate limiting
    for (let i = 0; i < signatures.length; i += concurrency) {
      const batch = signatures.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(async ({ userEmail, signatureHtml }) => {
          const result = await this.setUserSignature(organizationId, userEmail, signatureHtml);
          return { userEmail, ...result };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Extract userEmail from the batch
          const idx = batchResults.indexOf(result);
          results.push({
            userEmail: batch[idx].userEmail,
            success: false,
            error: result.reason?.message || 'Unknown error',
          });
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + concurrency < signatures.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    logger.info('Batch signature update completed', {
      organizationId,
      total: signatures.length,
      successCount,
      failureCount,
    });

    return {
      success: failureCount === 0,
      results,
      successCount,
      failureCount,
    };
  }

  /**
   * Get signatures for multiple users
   */
  async getUserSignaturesBatch(
    organizationId: string,
    userEmails: string[]
  ): Promise<{
    success: boolean;
    results: { userEmail: string; signature?: string; error?: string }[];
  }> {
    const results: { userEmail: string; signature?: string; error?: string }[] = [];

    // Process in batches of 5 for rate limiting
    const batchSize = 5;
    for (let i = 0; i < userEmails.length; i += batchSize) {
      const batch = userEmails.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (userEmail) => {
          const result = await this.getUserSignature(organizationId, userEmail);
          return { userEmail, ...result };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const idx = batchResults.indexOf(result);
          results.push({
            userEmail: batch[idx],
            error: result.reason?.message || 'Unknown error',
          });
        }
      }

      // Small delay between batches
      if (i + batchSize < userEmails.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return {
      success: results.every((r) => !r.error),
      results,
    };
  }

  /**
   * Create authenticated Google Reports API client with Domain-Wide Delegation
   */
  private createReportsClient(credentials: ServiceAccountCredentials, adminEmail: string) {
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.reports.audit.readonly'
      ],
      subject: adminEmail
    });

    return google.admin({ version: 'reports_v1', auth: jwtClient });
  }

  /**
   * Fetch login activity from Google Workspace Reports API
   * Returns login events from the last 24 hours by default
   */
  async fetchLoginActivity(
    organizationId: string,
    options: {
      startTime?: Date;
      endTime?: Date;
      maxResults?: number;
    } = {}
  ): Promise<{ success: boolean; events: any[]; error?: string }> {
    try {
      // Get credentials and admin email
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, events: [], error: 'No credentials found' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, events: [], error: 'No admin email configured' };
      }

      // Default to last 24 hours
      const endTime = options.endTime || new Date();
      const startTime = options.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
      const maxResults = options.maxResults || 1000;

      // Create Reports API client
      const reportsClient = this.createReportsClient(credentials, adminEmail);

      // Fetch login events
      const response = await reportsClient.activities.list({
        userKey: 'all',
        applicationName: 'login',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        maxResults
      });

      const events = (response.data.items || []).map((item: any) => ({
        eventId: item.id?.uniqueQualifier,
        userEmail: item.actor?.email,
        userId: item.actor?.profileId,
        timestamp: item.id?.time,
        ipAddress: item.ipAddress,
        loginType: this.extractLoginType(item.events),
        isSuccessful: this.isLoginSuccessful(item.events),
        isSuspicious: this.isLoginSuspicious(item.events),
        failureReason: this.extractFailureReason(item.events),
        rawEvent: item
      }));

      logger.info('Fetched login activity from Google Workspace', {
        organizationId,
        eventCount: events.length,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });

      return { success: true, events };
    } catch (error: any) {
      logger.error('Failed to fetch login activity', {
        organizationId,
        error: error.message
      });
      return { success: false, events: [], error: error.message };
    }
  }

  /**
   * Fetch DATA MIGRATION activity from the Google Reports API (applicationName
   * 'data_migration'). This is how migration progress is TRACKED read-only:
   * Google's cross-cloud Data Migration is console-triggered (no start API), but
   * it emits setup events (CREATE_CONNECTION, START_MIGRATION) and per-object
   * MIGRATION events (CREATE_GMAIL_MESSAGE, CREATE_CALENDAR_EVENT, CREATE_CONTACT,
   * CREATE_FILE, plus CRAWL_FAILURE) with EXECUTION_ID/SOURCE/TARGET/status.
   * Uses the admin.reports.audit.readonly scope Helios already holds.
   *
   * ACCURATE TOTALS: the Reports API caps a single page at `maxResults` (≤1000),
   * so a large migration (e.g. 6,198 mail objects) would only surface the most
   * recent page. We PAGE THROUGH `nextPageToken` and aggregate counts across every
   * page so the summary reflects the true totals, bounded by `maxPages` to keep
   * quota/latency in check. If the cap is hit, `summary.truncated` is set and the
   * counts become a lower bound (logged, never silently dropped).
   *
   * Returns, alongside the light summary (counts by event name + failure count):
   *   - `events`   — a bounded, most-recent SAMPLE (raw event dropped to slim the
   *                  payload); the full stream is aggregated, not returned.
   *   - `failures` — per-item detail for every CRAWL_FAILURE (user/source/target/
   *                  reason) so an admin can see WHAT failed, not just how many.
   *   - `byUser`   — a per-migrated-user breakdown (grouped by the derived mailbox
   *                  owner email) with counts and failure totals, so the UI can
   *                  show status per user.
   */
  async fetchDataMigrationActivity(
    organizationId: string,
    options: { startTime?: Date; endTime?: Date; maxResults?: number; maxPages?: number } = {}
  ): Promise<{
    success: boolean;
    events: any[];
    failures: MigrationFailureDetail[];
    byUser: MigrationUserProgress[];
    summary?: {
      total: number;
      failures: number;
      byName: Record<string, number>;
      windowStart: string;
      windowEnd: string;
      pagesFetched: number;
      truncated: boolean;
    };
    error?: string;
  }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, events: [], failures: [], byUser: [], error: 'No credentials found' };
      }
      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, events: [], failures: [], byUser: [], error: 'No admin email configured' };
      }

      // Default to the last 7 days (migrations run over hours/days).
      const endTime = options.endTime || new Date();
      const startTime = options.startTime || new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
      // Reports API hard-caps a page at 1000; page count is what bounds cost.
      const perPage = Math.min(options.maxResults || 1000, 1000);
      const maxPages = Math.min(Math.max(options.maxPages || 30, 1), 100);

      // Retention bounds — aggregate across every page, but never hold the full
      // stream in memory or ship it to the client.
      const SAMPLE_LIMIT = 100; // most-recent events kept for the activity feed
      const FAILURE_LIMIT = 500; // failed-item detail kept for display
      const GROUP_LIMIT = 2000; // distinct target/execution groups kept

      const reportsClient = this.createReportsClient(credentials, adminEmail);

      const byName: Record<string, number> = {};
      const byUserMap = new Map<string, MigrationUserProgress>();
      const sample: any[] = [];
      const failures: MigrationFailureDetail[] = [];
      let total = 0;
      let failureCount = 0;
      let pagesFetched = 0;
      let truncated = false;
      let groupsTruncated = false;
      let pageToken: string | undefined = undefined;

      do {
        const response = await reportsClient.activities.list({
          userKey: 'all',
          applicationName: 'data_migration',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          maxResults: perPage,
          pageToken,
        });

        const items = response.data.items || [];
        for (const item of items) {
          const ev = (item.events && item.events[0]) || {};
          const params: Record<string, any> = {};
          for (const p of ev.parameters || []) {
            params[p.name] = p.value ?? p.boolValue ?? p.intValue ?? (p.multiValue ? p.multiValue.join(',') : undefined);
          }
          const timestamp: string | undefined = item.id?.time;
          const name: string | undefined = ev.name;
          const source = params.SOURCE_IDENTIFIER || params.SOURCE_URI;
          const target = params.TARGET_IDENTIFIER || params.TARGET_URI;
          const status = params.EVENT_STATUS || params.STATUS;
          const executionId = params.EXECUTION_ID;
          const isFailure = name === 'CRAWL_FAILURE';
          // The mailbox owner email — the natural per-user grouping key.
          const user = this.deriveMigrationUser(params);

          // ---- accurate totals: count every event across every page ----
          total++;
          if (name) byName[name] = (byName[name] || 0) + 1;
          if (isFailure) failureCount++;

          // ---- bounded, most-recent activity sample (rawEvent dropped) ----
          if (sample.length < SAMPLE_LIMIT) {
            sample.push({ timestamp, actor: item.actor?.email, name, type: ev.type, executionId, source, target, status, params });
          }

          // ---- per-item failure detail ----
          if (isFailure && failures.length < FAILURE_LIMIT) {
            failures.push({
              timestamp,
              executionId,
              user,
              source,
              target,
              // DMS failures carry the reason in MIGRATION_ERROR_TITLE/_CODE; other
              // event families use different names. Fall through the likely ones and
              // keep the raw params so nothing is lost.
              reason:
                params.MIGRATION_ERROR_TITLE ||
                params.MIGRATION_ERROR_CODE ||
                params.FAILURE_REASON ||
                params.ERROR_MESSAGE ||
                params.MESSAGE ||
                params.STATUS_DETAIL ||
                params.REASON ||
                status ||
                undefined,
              params,
            });
          }

          // ---- per-migrated-user breakdown (keyed by mailbox owner email) ----
          if (user) {
            let group = byUserMap.get(user);
            if (!group) {
              if (byUserMap.size >= GROUP_LIMIT) {
                groupsTruncated = true;
              } else {
                group = { user, executionId: executionId || null, total: 0, failures: 0, byName: {}, firstActivity: timestamp, lastActivity: timestamp };
                byUserMap.set(user, group);
              }
            }
            if (group) {
              group.total++;
              if (isFailure) group.failures++;
              if (name) group.byName[name] = (group.byName[name] || 0) + 1;
              if (executionId && !group.executionId) group.executionId = executionId;
              // Reports API returns newest-first, so first-seen is the latest.
              if (timestamp) {
                if (!group.lastActivity || timestamp > group.lastActivity) group.lastActivity = timestamp;
                if (!group.firstActivity || timestamp < group.firstActivity) group.firstActivity = timestamp;
              }
            }
          }
        }

        pagesFetched++;
        pageToken = response.data.nextPageToken || undefined;
        if (pageToken && pagesFetched >= maxPages) {
          truncated = true;
          break;
        }
      } while (pageToken);

      if (truncated) {
        logger.warn('Data migration activity capped at maxPages — counts are a lower bound', {
          organizationId,
          pagesFetched,
          maxPages,
          countedEvents: total,
        });
      }
      if (groupsTruncated) {
        logger.warn('Data migration per-user breakdown capped at GROUP_LIMIT groups', {
          organizationId,
          groupLimit: GROUP_LIMIT,
        });
      }

      const byUser = Array.from(byUserMap.values()).sort((a, b) => b.total - a.total);

      logger.info('Fetched data migration activity from Google Workspace', {
        organizationId,
        eventCount: total,
        pagesFetched,
        failures: failureCount,
        users: byUser.length,
        truncated,
      });

      return {
        success: true,
        events: sample,
        failures,
        byUser,
        summary: {
          total,
          failures: failureCount,
          byName,
          windowStart: startTime.toISOString(),
          windowEnd: endTime.toISOString(),
          pagesFetched,
          truncated,
        },
      };
    } catch (error: any) {
      logger.error('Failed to fetch data migration activity', {
        organizationId,
        error: error.message,
      });
      return { success: false, events: [], failures: [], byUser: [], error: error.message };
    }
  }

  /**
   * Derive the migrated user's email (the mailbox owner) from a `data_migration`
   * event's parameters, for per-user grouping. DMS tags per-object events with
   * SOURCE_NAME (already the email) and embeds the email in the resource-path
   * identifiers (`users/<email>/messages/<id>`, `mailboxes/<email>/…`,
   * `drives/<email>`). Message-ID URIs (SOURCE_URI/TARGET_URI) also contain an `@`
   * but are NOT user emails, so they are deliberately excluded. Setup events
   * (CREATE_CONNECTION, etc.) resolve to no user and are left out of the per-user
   * rollup (they are still counted in the global summary).
   */
  private deriveMigrationUser(params: Record<string, any>): string | undefined {
    const name = params.SOURCE_NAME;
    if (typeof name === 'string' && /^[^@\s]+@[^@\s]+$/.test(name)) {
      return name.toLowerCase();
    }
    const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    for (const path of [params.TARGET_IDENTIFIER, params.SOURCE_IDENTIFIER]) {
      if (typeof path === 'string') {
        const m = path.match(emailRe);
        if (m) return m[0].toLowerCase();
      }
    }
    return undefined;
  }

  /**
   * Extract login type from event parameters
   */
  private extractLoginType(events: any[]): string {
    if (!events || events.length === 0) return 'unknown';
    const event = events[0];
    const params = event.parameters || [];
    const loginType = params.find((p: any) => p.name === 'login_type');
    return loginType?.value || 'web';
  }

  /**
   * Check if login was successful
   */
  private isLoginSuccessful(events: any[]): boolean {
    if (!events || events.length === 0) return true;
    const event = events[0];
    // 'login_failure' type means failed, 'login_success' means succeeded
    return event.type !== 'login_failure';
  }

  /**
   * Check if login was marked as suspicious by Google
   */
  private isLoginSuspicious(events: any[]): boolean {
    if (!events || events.length === 0) return false;
    const event = events[0];
    const params = event.parameters || [];
    const suspicious = params.find((p: any) => p.name === 'is_suspicious');
    return suspicious?.boolValue === true;
  }

  /**
   * Extract failure reason if login failed
   */
  private extractFailureReason(events: any[]): string | null {
    if (!events || events.length === 0) return null;
    const event = events[0];
    if (event.type !== 'login_failure') return null;
    const params = event.parameters || [];
    const reason = params.find((p: any) => p.name === 'login_failure_type');
    return reason?.value || 'unknown';
  }

  /**
   * Store login events in the database
   */
  async storeLoginEvents(
    organizationId: string,
    events: any[]
  ): Promise<{ stored: number; errors: number }> {
    let stored = 0;
    let errors = 0;

    for (const event of events) {
      try {
        // Skip if no IP address (can't geolocate)
        if (!event.ipAddress) {
          continue;
        }

        // Check for duplicate (same user, timestamp, IP)
        const existing = await db.query(
          `SELECT id FROM login_activity
           WHERE organization_id = $1
           AND user_email = $2
           AND login_timestamp = $3
           AND ip_address = $4`,
          [organizationId, event.userEmail, event.timestamp, event.ipAddress]
        );

        if (existing.rows.length > 0) {
          continue; // Skip duplicate
        }

        await db.query(
          `INSERT INTO login_activity (
            organization_id, user_email, user_id, login_timestamp,
            login_type, ip_address, is_suspicious, is_successful,
            failure_reason, source, raw_event
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            organizationId,
            event.userEmail,
            event.userId,
            event.timestamp,
            event.loginType,
            event.ipAddress,
            event.isSuspicious,
            event.isSuccessful,
            event.failureReason,
            'google',
            JSON.stringify(event.rawEvent)
          ]
        );
        stored++;
      } catch (error: any) {
        logger.error('Failed to store login event', {
          organizationId,
          event,
          error: error.message
        });
        errors++;
      }
    }

    return { stored, errors };
  }

  /**
   * Sync login activity - fetch from Google and store in database
   */
  async syncLoginActivity(
    organizationId: string,
    options: { startTime?: Date; endTime?: Date } = {}
  ): Promise<{ success: boolean; fetched: number; stored: number; errors: number }> {
    // Fetch login events
    const fetchResult = await this.fetchLoginActivity(organizationId, options);
    if (!fetchResult.success) {
      return { success: false, fetched: 0, stored: 0, errors: 1 };
    }

    // Store events
    const storeResult = await this.storeLoginEvents(organizationId, fetchResult.events);

    logger.info('Synced login activity', {
      organizationId,
      fetched: fetchResult.events.length,
      stored: storeResult.stored,
      errors: storeResult.errors
    });

    return {
      success: true,
      fetched: fetchResult.events.length,
      stored: storeResult.stored,
      errors: storeResult.errors
    };
  }

  // ============================================================
  // BUILDINGS AND CALENDAR RESOURCES
  // ============================================================

  /**
   * List all buildings in Google Workspace
   */
  async listBuildings(organizationId: string): Promise<{
    success: boolean;
    buildings?: any[];
    error?: string;
  }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'No credentials found' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'No admin email configured' };
      }

      const admin = this.createAdminClient(credentials, adminEmail);

      const response = await admin.resources.buildings.list({
        customer: 'my_customer'
      });

      const buildings = (response.data.buildings || []).map((building: any) => ({
        buildingId: building.buildingId,
        buildingName: building.buildingName,
        description: building.description,
        floorNames: building.floorNames,
        address: building.address,
        coordinates: building.coordinates
      }));

      logger.info('Listed buildings', { organizationId, count: buildings.length });
      return { success: true, buildings };
    } catch (error: any) {
      logger.error('Failed to list buildings', { organizationId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * List calendar resources (rooms, equipment)
   */
  async listCalendarResources(
    organizationId: string,
    options: { buildingId?: string; resourceType?: string } = {}
  ): Promise<{
    success: boolean;
    resources?: any[];
    error?: string;
  }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'No credentials found' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'No admin email configured' };
      }

      const admin = this.createAdminClient(credentials, adminEmail);

      // Build query filter
      let query = '';
      if (options.buildingId) {
        query = `buildingId=${options.buildingId}`;
      }

      const response = await admin.resources.calendars.list({
        customer: 'my_customer',
        query: query || undefined,
        maxResults: 500
      });

      let resources = (response.data.items || []).map((resource: any) => ({
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        generatedResourceName: resource.generatedResourceName,
        resourceEmail: resource.resourceEmail,
        resourceType: resource.resourceType,
        resourceCategory: resource.resourceCategory,
        capacity: resource.capacity,
        buildingId: resource.buildingId,
        floorName: resource.floorName,
        floorSection: resource.floorSection,
        userVisibleDescription: resource.userVisibleDescription,
        featureInstances: resource.featureInstances
      }));

      // Filter by resource type if specified
      if (options.resourceType) {
        const typeFilter = options.resourceType.toLowerCase();
        resources = resources.filter((r: any) =>
          (r.resourceType || '').toLowerCase().includes(typeFilter) ||
          (r.resourceCategory || '').toLowerCase().includes(typeFilter)
        );
      }

      logger.info('Listed calendar resources', { organizationId, count: resources.length });
      return { success: true, resources };
    } catch (error: any) {
      logger.error('Failed to list calendar resources', { organizationId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // LICENSING API
  // ============================================================

  /**
   * Create a Licensing API client
   */
  private async createLicensingClient(organizationId: string) {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) return null;

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) return null;

    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/apps.licensing'],
      subject: adminEmail
    });

    return google.licensing({ version: 'v1', auth: jwtClient });
  }

  /**
   * List all license assignments for a product
   * Returns actual usage counts
   */
  async listLicenseAssignments(
    organizationId: string,
    productId: string,
    skuId?: string
  ): Promise<{
    success: boolean;
    assignments?: any[];
    totalCount?: number;
    error?: string;
  }> {
    try {
      const licensing = await this.createLicensingClient(organizationId);
      if (!licensing) {
        return { success: false, error: 'Failed to create Licensing client' };
      }

      // Get domain from credentials
      const domainResult = await db.query(
        'SELECT domain FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );
      const domain = domainResult.rows[0]?.domain;
      if (!domain) {
        return { success: false, error: 'No domain configured' };
      }

      let allAssignments: any[] = [];
      let pageToken: string | undefined;

      // Paginate through all assignments
      do {
        const params: any = {
          productId,
          customerId: domain,
          maxResults: 1000,
          pageToken
        };
        if (skuId) params.skuId = skuId;

        const response = skuId
          ? await licensing.licenseAssignments.listForProductAndSku(params)
          : await licensing.licenseAssignments.listForProduct(params);

        if (response.data.items) {
          allAssignments = allAssignments.concat(response.data.items);
        }
        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);

      return {
        success: true,
        assignments: allAssignments,
        totalCount: allAssignments.length
      };
    } catch (error: any) {
      // Handle common errors gracefully
      if (error.code === 403) {
        return { success: false, error: 'Licensing API access denied. Ensure apps.licensing scope is delegated.' };
      }
      if (error.code === 404) {
        return { success: true, assignments: [], totalCount: 0 };
      }
      logger.error('Failed to list license assignments', { organizationId, productId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get license inventory with real counts from Google Licensing API
   */
  async getLicenseInventory(organizationId: string): Promise<{
    success: boolean;
    licenses?: Array<{
      productId: string;
      skuId: string;
      skuName: string;
      productName: string;
      assignedCount: number;
    }>;
    error?: string;
  }> {
    try {
      const licensing = await this.createLicensingClient(organizationId);
      if (!licensing) {
        return { success: false, error: 'Failed to create Licensing client - check API delegation' };
      }

      // Google Workspace product IDs and their SKUs
      const products = [
        {
          productId: 'Google-Apps',
          productName: 'Google Workspace',
          // Canonical SKU ids/names — see config/google-license-skus.ts.
          // (The previous list mislabeled 1010020025=Business Plus as "Enterprise
          // Plus" and 1010020020=Enterprise Plus as "Enterprise Standard".)
          skus: [
            { id: '1010020027', name: 'Business Starter' },
            { id: '1010020028', name: 'Business Standard' },
            { id: '1010020025', name: 'Business Plus' },
            { id: '1010020029', name: 'Enterprise Starter' },
            { id: '1010020026', name: 'Enterprise Standard' },
            { id: '1010020020', name: 'Enterprise Plus' },
            { id: '1010060003', name: 'Enterprise Essentials' },
            { id: '1010060005', name: 'Enterprise Essentials Plus' },
            { id: '1010020030', name: 'Frontline Starter' },
            { id: '1010020031', name: 'Frontline Standard' },
            { id: '1010020034', name: 'Frontline Plus' },
            { id: 'Google-Apps-For-Business', name: 'G Suite Basic (legacy)' },
            { id: 'Google-Apps-Unlimited', name: 'G Suite Business (legacy)' },
          ]
        },
        {
          productId: '101031',
          productName: 'Google Vault',
          skus: [
            { id: 'Google-Vault', name: 'Vault' },
            { id: 'Google-Vault-Former-Employee', name: 'Vault Former Employee' }
          ]
        },
        {
          productId: '101034',
          productName: 'Google Meet',
          skus: [
            { id: 'Google-Meet-Global-Dialing', name: 'Global Dialing' }
          ]
        }
      ];

      const licenses: Array<{
        productId: string;
        skuId: string;
        skuName: string;
        productName: string;
        assignedCount: number;
      }> = [];

      // Query each product for assignments
      for (const product of products) {
        try {
          const result = await this.listLicenseAssignments(organizationId, product.productId);

          if (result.success && result.assignments) {
            // Group by SKU
            const skuCounts = new Map<string, number>();
            for (const assignment of result.assignments) {
              const skuId = assignment.skuId || 'unknown';
              skuCounts.set(skuId, (skuCounts.get(skuId) || 0) + 1);
            }

            // Add to licenses array
            for (const [skuId, count] of skuCounts) {
              const skuInfo = product.skus.find(s => s.id === skuId);
              licenses.push({
                productId: product.productId,
                skuId,
                skuName: skuInfo?.name || skuId,
                productName: product.productName,
                assignedCount: count
              });
            }
          }
        } catch (err: any) {
          // Continue with other products if one fails
          logger.debug(`Skipping product ${product.productId}: ${err.message}`);
        }
      }

      logger.info('Retrieved license inventory', { organizationId, licenseCount: licenses.length });
      return { success: true, licenses };
    } catch (error: any) {
      logger.error('Failed to get license inventory', { organizationId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get users assigned to a specific license
   */
  async getLicenseUsers(
    organizationId: string,
    productId: string,
    skuId: string
  ): Promise<{
    success: boolean;
    users?: Array<{ email: string; userId: string }>;
    error?: string;
  }> {
    try {
      const result = await this.listLicenseAssignments(organizationId, productId, skuId);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const users = (result.assignments || []).map((a: any) => ({
        email: a.userId, // userId is the email in Licensing API
        userId: a.userId
      }));

      return { success: true, users };
    } catch (error: any) {
      logger.error('Failed to get license users', { organizationId, productId, skuId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * List calendar ACLs for a user's calendar
   */
  async listCalendarAcl(
    organizationId: string,
    calendarId: string
  ): Promise<{
    success: boolean;
    acl?: any[];
    error?: string;
  }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'No credentials found' };
      }

      const adminEmail = await this.getAdminEmail(organizationId);
      if (!adminEmail) {
        return { success: false, error: 'No admin email configured' };
      }

      // Create calendar client impersonating the user
      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/calendar'],
        subject: calendarId === 'primary' ? adminEmail : calendarId
      });

      const calendar = google.calendar({ version: 'v3', auth: jwtClient });

      const response = await calendar.acl.list({
        calendarId: calendarId === 'primary' ? 'primary' : calendarId
      });

      const acl = (response.data.items || []).map((entry: any) => ({
        id: entry.id,
        scope: entry.scope,
        role: entry.role,
        etag: entry.etag
      }));

      logger.info('Listed calendar ACL', { organizationId, calendarId, count: acl.length });
      return { success: true, acl };
    } catch (error: any) {
      logger.error('Failed to list calendar ACL', { organizationId, calendarId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel/decline a user's FUTURE calendar events during offboarding.
   *
   * Impersonates the user (domain-wide delegation `subject = userEmail`) and pages
   * through their primary calendar's upcoming events (`timeMin = now`,
   * `singleEvents=true` so recurring series expand into individual instances,
   * `maxResults=250`, following `nextPageToken`). For each event:
   *   - the user is the ORGANIZER   → DELETE the event (cancels it for everyone),
   *   - the user is only an ATTENDEE → PATCH their own attendee entry to
   *     `responseStatus='declined'` (frees their calendar without cancelling the
   *     event for the other attendees).
   *
   * Per-event failures are logged and skipped so one bad event never aborts the
   * whole sweep. Requires the `https://www.googleapis.com/auth/calendar` scope
   * (present in REQUIRED_SCOPES). This is the offboarding primitive the console
   * path had but the audited orchestrator was missing.
   */
  async cancelFutureEvents(
    organizationId: string,
    userEmail: string
  ): Promise<{ success: boolean; cancelledCount?: number; declinedCount?: number; error?: string }> {
    try {
      const credentials = await this.getCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: 'Google Workspace not configured' };
      }

      // Calendar events live in the departing user's own calendar, so impersonate
      // that user directly (not the admin).
      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/calendar'],
        subject: userEmail
      });

      const calendar = google.calendar({ version: 'v3', auth: jwtClient });

      const nowISO = new Date().toISOString();
      const targetEmail = userEmail.toLowerCase();
      let cancelledCount = 0;
      let declinedCount = 0;
      let pageToken: string | undefined = undefined;

      do {
        const listResp = await calendar.events.list({
          calendarId: userEmail,
          timeMin: nowISO,
          singleEvents: true,
          maxResults: 250,
          pageToken
        });

        const events = listResp.data.items || [];

        for (const event of events) {
          const eventId = event.id;
          if (!eventId) continue;
          // Already-cancelled instances need no action.
          if (event.status === 'cancelled') continue;

          const isOrganizer =
            event.organizer?.self === true ||
            (event.organizer?.email || '').toLowerCase() === targetEmail;

          try {
            if (isOrganizer) {
              // The user owns the event → delete it (cancels for all attendees).
              await calendar.events.delete({ calendarId: userEmail, eventId });
              cancelledCount++;
            } else {
              // The user is (at most) an attendee → decline their own invite.
              const attendees = event.attendees || [];
              const self = attendees.find(
                (a: any) => a.self === true || (a.email || '').toLowerCase() === targetEmail
              );
              if (!self) {
                // Not an attendee (e.g. a subscribed/public calendar entry) →
                // nothing to decline.
                continue;
              }
              const updatedAttendees = attendees.map((a: any) =>
                a === self ? { ...a, responseStatus: 'declined' } : a
              );
              await calendar.events.patch({
                calendarId: userEmail,
                eventId,
                requestBody: { attendees: updatedAttendees }
              });
              declinedCount++;
            }
          } catch (eventError: any) {
            logger.error('Failed to cancel/decline a calendar event during offboarding', {
              userEmail,
              eventId,
              error: eventError.message
            });
          }
        }

        pageToken = listResp.data.nextPageToken || undefined;
      } while (pageToken);

      logger.info('Cancelled/declined future calendar events during offboarding', {
        userEmail,
        cancelledCount,
        declinedCount
      });

      return { success: true, cancelledCount, declinedCount };
    } catch (error: any) {
      logger.error('Failed to cancel future calendar events', {
        userEmail,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
}

export const googleWorkspaceService = new GoogleWorkspaceService();