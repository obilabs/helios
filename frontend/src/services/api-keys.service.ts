/**
 * API Keys Service
 * Handles all API key-related operations
 */

import { apiPath, authFetch } from '../config/api';

export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  type: 'service' | 'vendor';
  keyPrefix: string;
  permissions: string[];
  status: 'active' | 'expired' | 'revoked' | 'expiring_soon';
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  vendorConfig?: {
    companyName: string;
    contactEmail?: string;
    requireActorAttribution: boolean;
  };
  serviceConfig?: {
    appName: string;
    environment?: string;
    owner?: string;
  };
}

export interface CreateApiKeyRequest {
  name: string;
  description?: string;
  type: 'service' | 'vendor';
  permissions: string[];
  expiresInDays?: number;
  serviceConfig?: {
    appName: string;
    environment?: string;
    owner?: string;
  };
  vendorConfig?: {
    companyName: string;
    contactEmail?: string;
    requireActorAttribution: boolean;
  };
  ipWhitelist?: string[];
  rateLimitConfig?: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

export interface CreateApiKeyResponse {
  key: string; // Full key - only shown once!
  id: string;
  name: string;
  type: 'service' | 'vendor';
  keyPrefix: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ApiKeyUsageLog {
  id: string;
  timestamp: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  result: 'success' | 'failure';
  actorType?: 'human' | 'service';
  actorName?: string;
  actorEmail?: string;
  clientReference?: string;
  ipAddress?: string;
  userAgent?: string;
  requestDuration?: number;
  httpMethod?: string;
  httpPath?: string;
  httpStatus?: number;
  errorMessage?: string;
}

class ApiKeysService {
  private getJsonHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create a new API key
   */
  async createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    const response = await authFetch(apiPath('/organization/api-keys'), {
      method: 'POST',
      headers: this.getJsonHeaders(),
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to create API key');
    }

    return result.data;
  }

  /**
   * List all API keys
   */
  async listApiKeys(filters?: { status?: string; type?: string }): Promise<ApiKey[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.type) params.append('type', filters.type);

    const url = apiPath(`/organization/api-keys${params.toString() ? '?' + params.toString() : ''}`);

    const response = await authFetch(url);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to fetch API keys');
    }

    return result.data;
  }

  /**
   * Get details of a specific API key
   */
  async getApiKey(id: string): Promise<ApiKey> {
    const response = await authFetch(apiPath(`/organization/api-keys/${id}`));

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to fetch API key');
    }

    return result.data;
  }

  /**
   * Update API key settings
   */
  async updateApiKey(id: string, updates: Partial<Pick<ApiKey, 'permissions'>>): Promise<void> {
    const response = await authFetch(apiPath(`/organization/api-keys/${id}`), {
      method: 'PATCH',
      headers: this.getJsonHeaders(),
      body: JSON.stringify(updates)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to update API key');
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(id: string): Promise<void> {
    const response = await authFetch(apiPath(`/organization/api-keys/${id}`), {
      method: 'DELETE'
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to revoke API key');
    }
  }

  /**
   * Renew an expired API key (generates new key)
   */
  async renewApiKey(id: string, expiresInDays?: number): Promise<CreateApiKeyResponse> {
    const response = await authFetch(apiPath(`/organization/api-keys/${id}/renew`), {
      method: 'POST',
      headers: this.getJsonHeaders(),
      body: JSON.stringify({ expiresInDays })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to renew API key');
    }

    return result.data;
  }

  /**
   * Get usage history for an API key
   */
  async getApiKeyUsage(id: string, limit: number = 100, offset: number = 0): Promise<ApiKeyUsageLog[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    });

    const response = await authFetch(
      apiPath(`/organization/api-keys/${id}/usage?${params.toString()}`)
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to fetch usage logs');
    }

    return result.data;
  }

  /**
   * Get available permissions for API keys
   */
  getAvailablePermissions(): { value: string; label: string; description: string }[] {
    return [
      {
        value: 'users:read',
        label: 'Read Users',
        description: 'View user information and lists'
      },
      {
        value: 'users:write',
        label: 'Manage Users',
        description: 'Create, update, and delete users'
      },
      {
        value: 'groups:read',
        label: 'Read Groups',
        description: 'View group information and membership'
      },
      {
        value: 'groups:write',
        label: 'Manage Groups',
        description: 'Create, update, and delete groups'
      },
      {
        value: 'modules:read',
        label: 'Read Modules',
        description: 'View enabled modules and configuration'
      },
      {
        value: 'sync:trigger',
        label: 'Trigger Sync',
        description: 'Trigger manual synchronization with external providers'
      },
      {
        value: 'organization:read',
        label: 'Read Organization',
        description: 'View organization settings and information'
      }
    ];
  }
}

export const apiKeysService = new ApiKeysService();
