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

  if (result.success && result.data) {
    return result.data.map((group: any) => ({
      id: group.id,
      name: group.name,
      description: group.description || '',
      email: group.email,
      memberCount: parseInt(group.member_count) || parseInt(group.metadata?.directMembersCount) || group.directMembersCount || 0,
      platform: group.platform || 'google_workspace',
      type: group.group_type || (group.metadata?.adminCreated ? 'Admin' : 'User'),
      createdAt: group.created_at || group.createdAt || new Date().toISOString()
    }));
  }

  return [];
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
