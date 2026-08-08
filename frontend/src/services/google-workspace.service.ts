import { apiPath, authFetch } from '../config/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface Group {
  id: string;
  name: string;
  email: string;
  description: string;
  directMembersCount: number;
  adminCreated: boolean;
}

interface OrgUnit {
  orgUnitId: string;
  name: string;
  description: string;
  orgUnitPath: string;
  parentOrgUnitPath: string;
}

class GoogleWorkspaceService {
  async getGroups(organizationId: string): Promise<ApiResponse<{ groups: Group[] }>> {
    try {
      const response = await authFetch(apiPath(`/google-workspace/groups/${organizationId}`));

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Failed to fetch groups:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch groups'
      };
    }
  }

  async syncGroups(organizationId: string): Promise<ApiResponse<{ count: number; groups: Group[] }>> {
    try {
      const response = await authFetch(apiPath('/google-workspace/sync-groups'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Failed to sync groups:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync groups'
      };
    }
  }

  async getOrgUnits(organizationId: string): Promise<ApiResponse<{ orgUnits: OrgUnit[] }>> {
    try {
      const response = await authFetch(apiPath(`/google-workspace/org-units/${organizationId}`));

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Failed to fetch org units:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch org units'
      };
    }
  }

  async syncOrgUnits(organizationId: string): Promise<ApiResponse<{ count: number; orgUnits: OrgUnit[] }>> {
    try {
      const response = await authFetch(apiPath('/google-workspace/sync-org-units'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Failed to sync org units:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync org units'
      };
    }
  }

  async getCachedGroups(organizationId: string): Promise<ApiResponse<any>> {
    try {
      const response = await authFetch(apiPath(`/google-workspace/cached-groups/${organizationId}`));

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Failed to fetch cached groups:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch cached groups'
      };
    }
  }
}

export const googleWorkspaceService = new GoogleWorkspaceService();
export type { Group, OrgUnit, ApiResponse };
