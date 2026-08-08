import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import { encryptionService } from './encryption.service.js';

/**
 * Microsoft 365 credentials structure
 */
export interface MicrosoftCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Microsoft Graph user object
 */
export interface MicrosoftUser {
  id: string;
  userPrincipalName: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  companyName?: string;
  mobilePhone?: string;
  businessPhones?: string[];
  accountEnabled: boolean;
  assignedLicenses?: Array<{ skuId: string }>;
}

/**
 * Microsoft Graph group object
 */
export interface MicrosoftGroup {
  id: string;
  displayName: string;
  description?: string;
  mail?: string;
  mailEnabled: boolean;
  securityEnabled: boolean;
  groupTypes?: string[];
}

/**
 * Microsoft license SKU
 */
export interface MicrosoftLicense {
  skuId: string;
  skuPartNumber: string;
  consumedUnits: number;
  prepaidUnits: {
    enabled: number;
    suspended: number;
    warning: number;
  };
  servicePlans?: any[];
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    tenantId: string;
    displayName?: string;
    userCount?: number;
    groupCount?: number;
  };
  error?: string;
}

/**
 * SKU friendly name mapping
 */
const SKU_FRIENDLY_NAMES: Record<string, string> = {
  'ENTERPRISEPREMIUM': 'Microsoft 365 E5',
  'ENTERPRISEPACK': 'Microsoft 365 E3',
  'SPE_E5': 'Microsoft 365 E5',
  'SPE_E3': 'Microsoft 365 E3',
  'BUSINESS_PREMIUM': 'Microsoft 365 Business Premium',
  'BUSINESS_BASIC': 'Microsoft 365 Business Basic',
  'EXCHANGESTANDARD': 'Exchange Online (Plan 1)',
  'EXCHANGEENTERPRISE': 'Exchange Online (Plan 2)',
  'POWER_BI_PRO': 'Power BI Pro',
  'POWER_BI_STANDARD': 'Power BI (free)',
  'TEAMS_EXPLORATORY': 'Microsoft Teams Exploratory',
  'FLOW_FREE': 'Power Automate Free',
  'POWERAPPS_VIRAL': 'PowerApps (free)',
  'AAD_PREMIUM': 'Azure AD Premium P1',
  'AAD_PREMIUM_P2': 'Azure AD Premium P2',
  'EMS': 'Enterprise Mobility + Security E3',
  'EMSPREMIUM': 'Enterprise Mobility + Security E5',
  'PROJECTPREMIUM': 'Project Plan 5',
  'VISIOCLIENT': 'Visio Plan 2',
  'WINDOWS_STORE': 'Windows Store for Business',
  'DEFENDER_ENDPOINT_P1': 'Microsoft Defender for Endpoint P1',
  'DEFENDER_ENDPOINT_P2': 'Microsoft Defender for Endpoint P2',
};

/**
 * Microsoft Graph API Service
 * Handles all interactions with Microsoft Graph API for Entra ID integration
 */
export class MicrosoftGraphService {
  private graphClient: Client | null = null;
  private credentials: MicrosoftCredentials | null = null;

  /**
   * Create a Graph client with the provided credentials
   */
  private createClient(credentials: MicrosoftCredentials): Client {
    const credential = new ClientSecretCredential(
      credentials.tenantId,
      credentials.clientId,
      credentials.clientSecret
    );

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    return Client.initWithMiddleware({
      authProvider: authProvider,
    });
  }

  /**
   * Initialize service with credentials from database
   */
  async initialize(organizationId: string): Promise<boolean> {
    try {
      const result = await db.query(
        `SELECT tenant_id, client_id, client_secret_encrypted
         FROM ms_credentials
         WHERE organization_id = $1 AND is_active = true`,
        [organizationId]
      );

      if (result.rows.length === 0) {
        logger.warn('No Microsoft credentials found for organization', { organizationId });
        return false;
      }

      const row = result.rows[0];
      const clientSecret = await encryptionService.decrypt(row.client_secret_encrypted);

      this.credentials = {
        tenantId: row.tenant_id,
        clientId: row.client_id,
        clientSecret,
      };

      this.graphClient = this.createClient(this.credentials);
      return true;
    } catch (error: any) {
      logger.error('Failed to initialize Microsoft Graph service', { error: error.message });
      return false;
    }
  }

  /**
   * Test connection with provided credentials
   */
  async testConnection(credentials: MicrosoftCredentials): Promise<ConnectionTestResult> {
    try {
      const client = this.createClient(credentials);

      // Test by fetching organization info
      const org = await client.api('/organization').select('id,displayName').get();

      // Try to fetch a single user to verify permissions
      const users = await client.api('/users').top(1).select('id').get();

      // Try to fetch a single group to verify permissions
      const groups = await client.api('/groups').top(1).select('id').get();

      return {
        success: true,
        message: 'Successfully connected to Microsoft 365',
        details: {
          tenantId: credentials.tenantId,
          displayName: org.value?.[0]?.displayName || 'Unknown',
          userCount: users.value?.length || 0,
          groupCount: groups.value?.length || 0,
        },
      };
    } catch (error: any) {
      logger.error('Microsoft connection test failed', { error: error.message });

      let errorMessage = 'Failed to connect to Microsoft 365';
      if (error.message?.includes('invalid_client')) {
        errorMessage = 'Invalid client credentials. Please verify your Client ID and Client Secret.';
      } else if (error.message?.includes('tenant')) {
        errorMessage = 'Invalid Tenant ID. Please verify your Azure AD tenant.';
      } else if (error.message?.includes('unauthorized') || error.message?.includes('403')) {
        errorMessage = 'Insufficient permissions. Please ensure the app has User.Read.All and Group.Read.All permissions with admin consent.';
      } else if (error.message?.includes('AADSTS')) {
        errorMessage = `Azure AD error: ${error.message}`;
      }

      return {
        success: false,
        message: errorMessage,
        error: error.message,
      };
    }
  }

  /**
   * Store Microsoft credentials for an organization
   */
  async storeCredentials(
    organizationId: string,
    credentials: MicrosoftCredentials,
    userId?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Encrypt the client secret
      const encryptedSecret = await encryptionService.encrypt(credentials.clientSecret);

      // Upsert credentials
      await db.query(
        `INSERT INTO ms_credentials (organization_id, tenant_id, client_id, client_secret_encrypted, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id)
         DO UPDATE SET
           tenant_id = $2,
           client_id = $3,
           client_secret_encrypted = $4,
           is_active = true,
           updated_at = NOW()`,
        [organizationId, credentials.tenantId, credentials.clientId, encryptedSecret, userId]
      );

      // Initialize the client
      this.credentials = credentials;
      this.graphClient = this.createClient(credentials);

      return { success: true, message: 'Microsoft 365 credentials saved successfully' };
    } catch (error: any) {
      logger.error('Failed to store Microsoft credentials', { error: error.message });
      return { success: false, message: 'Failed to save credentials: ' + error.message };
    }
  }

  /**
   * Remove Microsoft credentials
   */
  async removeCredentials(organizationId: string): Promise<{ success: boolean; message: string }> {
    try {
      await db.query(
        `UPDATE ms_credentials SET is_active = false, updated_at = NOW() WHERE organization_id = $1`,
        [organizationId]
      );

      this.graphClient = null;
      this.credentials = null;

      return { success: true, message: 'Microsoft 365 disconnected successfully' };
    } catch (error: any) {
      logger.error('Failed to remove Microsoft credentials', { error: error.message });
      return { success: false, message: 'Failed to disconnect: ' + error.message };
    }
  }

  /**
   * Get all users from Entra ID
   */
  async listUsers(): Promise<MicrosoftUser[]> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    const users: MicrosoftUser[] = [];
    let nextLink: string | undefined = undefined;

    do {
      const response = nextLink
        ? await this.graphClient.api(nextLink).get()
        : await this.graphClient
            .api('/users')
            .select('id,userPrincipalName,displayName,givenName,surname,mail,jobTitle,department,officeLocation,companyName,mobilePhone,businessPhones,accountEnabled,assignedLicenses')
            .top(100)
            .get();

      users.push(...(response.value || []));
      nextLink = response['@odata.nextLink'];
    } while (nextLink);

    return users;
  }

  /**
   * Get a single user by ID
   */
  async getUser(userId: string): Promise<MicrosoftUser | null> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      return await this.graphClient
        .api(`/users/${userId}`)
        .select('id,userPrincipalName,displayName,givenName,surname,mail,jobTitle,department,officeLocation,companyName,mobilePhone,businessPhones,accountEnabled,assignedLicenses')
        .get();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new user in Entra ID
   */
  async createUser(userData: {
    displayName: string;
    mailNickname: string;
    userPrincipalName: string;
    password: string;
    accountEnabled?: boolean;
    jobTitle?: string;
    department?: string;
  }): Promise<MicrosoftUser> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    const newUser = {
      displayName: userData.displayName,
      mailNickname: userData.mailNickname,
      userPrincipalName: userData.userPrincipalName,
      passwordProfile: {
        forceChangePasswordNextSignIn: true,
        password: userData.password,
      },
      accountEnabled: userData.accountEnabled ?? true,
      jobTitle: userData.jobTitle,
      department: userData.department,
    };

    return await this.graphClient.api('/users').post(newUser);
  }

  /**
   * Update a user in Entra ID
   */
  async updateUser(userId: string, updates: Partial<MicrosoftUser>): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/users/${userId}`).patch(updates);
  }

  /**
   * Disable a user account
   */
  async disableUser(userId: string): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/users/${userId}`).patch({
      accountEnabled: false,
    });
  }

  /**
   * Enable a user account
   */
  async enableUser(userId: string): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/users/${userId}`).patch({
      accountEnabled: true,
    });
  }

  /**
   * Delete a user from Entra ID
   */
  async deleteUser(userId: string): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/users/${userId}`).delete();
  }

  /**
   * Get all groups
   */
  async listGroups(): Promise<MicrosoftGroup[]> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    const groups: MicrosoftGroup[] = [];
    let nextLink: string | undefined = undefined;

    do {
      const response = nextLink
        ? await this.graphClient.api(nextLink).get()
        : await this.graphClient
            .api('/groups')
            .select('id,displayName,description,mail,mailEnabled,securityEnabled,groupTypes')
            .top(100)
            .get();

      groups.push(...(response.value || []));
      nextLink = response['@odata.nextLink'];
    } while (nextLink);

    return groups;
  }

  /**
   * Get a single group by ID
   */
  async getGroup(groupId: string): Promise<MicrosoftGroup | null> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      return await this.graphClient
        .api(`/groups/${groupId}`)
        .select('id,displayName,description,mail,mailEnabled,securityEnabled,groupTypes')
        .get();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get group members
   */
  async getGroupMembers(groupId: string): Promise<MicrosoftUser[]> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    const members: MicrosoftUser[] = [];
    let nextLink: string | undefined = undefined;

    do {
      const response = nextLink
        ? await this.graphClient.api(nextLink).get()
        : await this.graphClient
            .api(`/groups/${groupId}/members`)
            .select('id,userPrincipalName,displayName,mail')
            .top(100)
            .get();

      // Filter to only users (not nested groups)
      const userMembers = (response.value || []).filter(
        (m: any) => m['@odata.type'] === '#microsoft.graph.user'
      );
      members.push(...userMembers);
      nextLink = response['@odata.nextLink'];
    } while (nextLink);

    return members;
  }

  /**
   * Create a security group
   */
  async createGroup(groupData: {
    displayName: string;
    description?: string;
    mailEnabled?: boolean;
    mailNickname?: string;
    securityEnabled?: boolean;
  }): Promise<MicrosoftGroup> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    const newGroup = {
      displayName: groupData.displayName,
      description: groupData.description,
      mailEnabled: groupData.mailEnabled ?? false,
      mailNickname: groupData.mailNickname || groupData.displayName.toLowerCase().replace(/\s+/g, '-'),
      securityEnabled: groupData.securityEnabled ?? true,
    };

    return await this.graphClient.api('/groups').post(newGroup);
  }

  /**
   * Delete a group
   */
  async deleteGroup(groupId: string): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/groups/${groupId}`).delete();
  }

  /**
   * Add a member to a group
   */
  async addGroupMember(groupId: string, userId: string): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/groups/${groupId}/members/$ref`).post({
      '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    });
  }

  /**
   * Remove a member from a group
   */
  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/groups/${groupId}/members/${userId}/$ref`).delete();
  }

  /**
   * Get available licenses (subscribed SKUs)
   */
  async getSubscribedSkus(): Promise<MicrosoftLicense[]> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    const response = await this.graphClient.api('/subscribedSkus').get();
    return response.value || [];
  }

  /**
   * Get friendly name for a SKU
   */
  getSkuFriendlyName(skuPartNumber: string): string {
    return SKU_FRIENDLY_NAMES[skuPartNumber] || skuPartNumber;
  }

  /**
   * Get user's assigned licenses
   */
  async getUserLicenses(userId: string): Promise<any[]> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    const response = await this.graphClient.api(`/users/${userId}/licenseDetails`).get();
    return response.value || [];
  }

  /**
   * Assign licenses to a user
   */
  async assignLicense(userId: string, skuIds: string[]): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/users/${userId}/assignLicense`).post({
      addLicenses: skuIds.map((skuId) => ({ skuId })),
      removeLicenses: [],
    });
  }

  /**
   * Remove licenses from a user
   */
  async removeLicense(userId: string, skuIds: string[]): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/users/${userId}/assignLicense`).post({
      addLicenses: [],
      removeLicenses: skuIds,
    });
  }

  /**
   * Get user's manager
   */
  async getUserManager(userId: string): Promise<MicrosoftUser | null> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      return await this.graphClient.api(`/users/${userId}/manager`).get();
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Set user's manager
   */
  async setUserManager(userId: string, managerId: string): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    await this.graphClient.api(`/users/${userId}/manager/$ref`).put({
      '@odata.id': `https://graph.microsoft.com/v1.0/users/${managerId}`,
    });
  }

  /**
   * Get user's direct reports
   */
  async getUserDirectReports(userId: string): Promise<MicrosoftUser[]> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    const response = await this.graphClient
      .api(`/users/${userId}/directReports`)
      .select('id,displayName,userPrincipalName,mail,jobTitle')
      .get();

    return response.value || [];
  }
}

// Export singleton instance
export const microsoftGraphService = new MicrosoftGraphService();
