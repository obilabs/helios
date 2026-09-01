/**
 * TanStack Query hooks for Groups data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../config/api';

export interface Group {
  id: string;
  name: string;
  description: string;
  email: string;
  memberCount: number;
  platform: string;
  type: string;
  createdAt: string;
}

export interface GroupFilters {
  platform?: string;
  search?: string;
}

interface CreateGroupData {
  email: string;
  name: string;
  description?: string;
}

const GROUPS_KEY = 'groups';

// Fetch all groups
async function fetchGroups(): Promise<Group[]> {
  const response = await authFetch('/api/v1/organization/access-groups');

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired. Please log in again.');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to load groups');
  }

  const result = await response.json();

  const groups: Group[] = (result.success && result.data)
    ? result.data.map((group: any) => ({
        id: group.id,
        name: group.name,
        description: group.description || '',
        email: group.email,
        memberCount: parseInt(group.member_count) || parseInt(group.metadata?.directMembersCount) || group.directMembersCount || 0,
        platform: group.platform || 'google_workspace',
        type: group.group_type || (group.metadata?.adminCreated ? 'Admin' : 'User'),
        createdAt: group.created_at || group.createdAt || new Date().toISOString()
      }))
    : [];

  // Also merge Microsoft 365 groups (a separate table/id-space). Best-effort:
  // /microsoft/groups returns [] when M365 isn't configured, so this is safe to
  // always call. These carry platform:'microsoft_365' so the row badge + the
  // GroupSlideOut route their operations to the /microsoft endpoints.
  try {
    const msResp = await authFetch('/api/v1/microsoft/groups');
    if (msResp.ok) {
      const msResult = await msResp.json();
      for (const g of (msResult?.data || [])) {
        const isUnified = Array.isArray(g.group_types) && g.group_types.includes('Unified');
        groups.push({
          id: g.id,
          name: g.display_name,
          description: g.description || '',
          email: g.mail || '',
          memberCount: parseInt(g.member_count) || 0,
          platform: 'microsoft_365',
          type: isUnified ? 'Microsoft 365' : 'Security',
          createdAt: g.last_sync_at || new Date().toISOString(),
        });
      }
    }
  } catch {
    // M365 is optional — ignore fetch failures.
  }

  return groups;
}

// Create a new group
async function createGroup(data: CreateGroupData): Promise<Group> {
  const response = await authFetch('/api/v1/google-workspace/groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to create group');
  }

  return result.data;
}

// Sync groups from Google Workspace
async function syncGroups(organizationId: string): Promise<void> {
  const response = await authFetch('/api/v1/google-workspace/groups/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ organizationId })
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to sync groups');
  }
}

// Delete a group
async function deleteGroup(groupId: string): Promise<void> {
  const response = await authFetch(`/api/v1/google-workspace/groups/${groupId}`, {
    method: 'DELETE',
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to delete group');
  }
}

/**
 * Hook to fetch groups with TanStack Query
 */
export function useGroups(filters?: GroupFilters) {
  return useQuery({
    queryKey: [GROUPS_KEY, filters],
    queryFn: fetchGroups,
    select: (data) => {
      if (!filters) return data;

      return data.filter(group => {
        const matchesPlatform = !filters.platform || filters.platform === 'all' || group.platform === filters.platform;
        const matchesSearch = !filters.search ||
          group.name.toLowerCase().includes(filters.search.toLowerCase()) ||
          group.description.toLowerCase().includes(filters.search.toLowerCase()) ||
          group.email.toLowerCase().includes(filters.search.toLowerCase());
        return matchesPlatform && matchesSearch;
      });
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to create a new group
 */
export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GROUPS_KEY] });
    },
  });
}

/**
 * Hook to sync groups from Google Workspace
 */
export function useSyncGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncGroups,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GROUPS_KEY] });
    },
  });
}

/**
 * Hook to delete a group
 */
export function useDeleteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GROUPS_KEY] });
    },
  });
}

// ---------------------------------------------------------------------------
// Microsoft 365 group create (the slideout uses authFetch directly for
// update/delete/member ops, matching its own pattern).
// ---------------------------------------------------------------------------

interface CreateMicrosoftGroupData {
  displayName: string;
  description?: string;
  mailNickname?: string;
  securityEnabled?: boolean;
  mailEnabled?: boolean;
}

async function createMicrosoftGroup(data: CreateMicrosoftGroupData): Promise<any> {
  const response = await authFetch('/api/v1/microsoft/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    // The /microsoft routes return error as { code, message } (errorResponse),
    // while google routes return a plain string — handle both. This surfaces the
    // capability-guard message (distribution/dynamic/role-assignable /"Microsoft
    // 365 not configured") instead of "[object Object]".
    throw new Error(result.error?.message || result.error || 'Failed to create Microsoft 365 group');
  }
  return result.data;
}

/**
 * Hook to create a Microsoft 365 group.
 */
export function useCreateMicrosoftGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMicrosoftGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GROUPS_KEY] });
    },
  });
}
