import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../config/api';

// Types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  platforms: string[];
  lastLogin?: string;
  jobTitle?: string;
  department?: string;
  organizationalUnit?: string;
  location?: string;
  reportingManagerId?: string;
  employeeId?: string;
  employeeType?: string;
  costCenter?: string;
  startDate?: string;
  endDate?: string;
  mobilePhone?: string;
  workPhone?: string;
  googleWorkspaceId?: string;
  microsoft365Id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  source?: string;
  userType?: 'staff' | 'guest' | 'contact';
  company?: string;
  guestExpiresAt?: string;
}

export interface UserFilters {
  userType: 'staff' | 'guest' | 'contact';
  status?: string;
  platform?: string;
  search?: string;
  department?: string;
}

export interface StatusCounts {
  all: number;
  active: number;
  pending: number;
  suspended: number;
  expired: number;
  deleted: number;
}

// Helper to get common headers
function getCommonHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

// Query keys factory for consistent cache management
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  counts: () => [...userKeys.all, 'counts'] as const,
  count: (userType: string) => [...userKeys.counts(), userType] as const,
  statusCounts: (userType: string) => [...userKeys.all, 'statusCounts', userType] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  departments: () => [...userKeys.all, 'departments'] as const,
};

// Helper to safely parse JSON response
async function safeParseJson(response: Response, errorMessage: string) {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error(`${errorMessage} (invalid response format)`);
  }
  return response.json();
}

// Fetch users with filters
async function fetchUsers(filters: UserFilters): Promise<User[]> {
  const params = new URLSearchParams({ userType: filters.userType });

  if (filters.status && filters.status !== 'all') {
    params.append('status', filters.status);
  }
  if (filters.platform && filters.platform !== 'all') {
    params.append('platform', filters.platform);
  }

  const response = await authFetch(`/api/v1/organization/users?${params}`, {
    headers: getCommonHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired. Please log in again.');
    }
    const errorData = await safeParseJson(response, 'Failed to fetch users');
    throw new Error(errorData.error || 'Failed to fetch users');
  }

  const data = await safeParseJson(response, 'Failed to fetch users');
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch users');
  }

  // Transform API response to User type
  return data.data.map((user: any) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName || user.first_name || user.email.split('@')[0],
    lastName: user.lastName || user.last_name || '',
    role: user.role || 'tenant_user',
    isActive: user.isActive !== false,
    platforms: user.platforms || ['local'],
    lastLogin: user.lastLogin || user.last_login,
    jobTitle: user.jobTitle || user.job_title,
    department: user.department,
    organizationalUnit: user.organizationalUnit || user.organizational_unit,
    location: user.location,
    reportingManagerId: user.reportingManagerId || user.reporting_manager_id,
    employeeId: user.employeeId || user.employee_id,
    employeeType: user.employeeType || user.employee_type,
    costCenter: user.costCenter || user.cost_center,
    startDate: user.startDate || user.start_date,
    endDate: user.endDate || user.end_date,
    mobilePhone: user.mobilePhone || user.mobile_phone,
    workPhone: user.workPhone || user.work_phone,
    googleWorkspaceId: user.googleWorkspaceId || user.google_workspace_id,
    microsoft365Id: user.microsoft365Id || user.microsoft_365_id,
    createdAt: user.createdAt || user.created_at,
    updatedAt: user.updatedAt || user.updated_at,
    status: user.status || user.userStatus || (user.isActive ? 'active' : 'inactive'),
    source: user.source,
    userType: user.userType || user.user_type,
    company: user.company,
    guestExpiresAt: user.guestExpiresAt || user.guest_expires_at,
  }));
}

// Fetch all users for status counts (includes deleted)
async function fetchAllUsersForCounts(userType: string): Promise<{ users: User[]; statusCounts: StatusCounts; departments: string[] }> {
  const params = new URLSearchParams({
    userType,
    includeDeleted: 'true',
  });

  const response = await authFetch(`/api/v1/organization/users?${params}`, {
    headers: getCommonHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired. Please log in again.');
    }
    throw new Error('Failed to fetch users');
  }

  const data = await safeParseJson(response, 'Failed to fetch users');
  const users = data.success ? data.data : [];

  // Helper to normalize status (handle null/undefined and different naming conventions)
  const getStatus = (user: any): string => {
    const status = user.userStatus || user.status || 'active';
    // Normalize status values
    if (status === 'invited' || status === 'staged' || status === 'pending') return 'staged';
    return status;
  };

  // Calculate status counts
  const statusCounts: StatusCounts = {
    all: users.filter((u: any) => getStatus(u) !== 'deleted').length,
    active: users.filter((u: any) => getStatus(u) === 'active').length,
    pending: users.filter((u: any) => getStatus(u) === 'staged').length,
    suspended: users.filter((u: any) => getStatus(u) === 'suspended').length,
    expired: users.filter((u: any) => getStatus(u) === 'expired').length,
    deleted: users.filter((u: any) => getStatus(u) === 'deleted').length,
  };

  // Extract unique departments
  const departments = [...new Set(
    users
      .map((u: any) => u.department)
      .filter((d: any) => d && typeof d === 'string' && d.trim() !== '')
  )].sort() as string[];

  return { users, statusCounts, departments };
}

// Fetch user counts by type
async function fetchUserCount(userType: string): Promise<number> {
  const response = await authFetch(`/api/v1/organization/users/count?userType=${userType}`, {
    headers: getCommonHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired. Please log in again.');
    }
    return 0; // Return 0 on error for counts
  }

  const data = await safeParseJson(response, 'Failed to fetch user count');
  return data.success ? data.data.count : 0;
}

// Update user status
async function updateUserStatus(userId: string, status: string): Promise<void> {
  const response = await authFetch(`/api/v1/organization/users/${userId}/status`, {
    method: 'PATCH',
    headers: getCommonHeaders(),
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to update user status');
  }
}

// Delete user
async function deleteUser(userId: string, googleAction?: 'keep' | 'suspend' | 'delete'): Promise<void> {
  const response = await authFetch(`/api/v1/organization/users/${userId}`, {
    method: 'DELETE',
    headers: getCommonHeaders(),
    body: JSON.stringify({ googleAction }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to delete user');
  }
}

// ============ HOOKS ============

/**
 * Fetch users with filters
 */
export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => fetchUsers(filters),
    // Keep previous data while fetching new
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch status counts and departments for a user type
 */
export function useUserStatusCounts(userType: string) {
  return useQuery({
    queryKey: userKeys.statusCounts(userType),
    queryFn: () => fetchAllUsersForCounts(userType),
    // Refresh less frequently since this is aggregate data
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch user counts by type (for tab badges)
 */
export function useUserCounts() {
  const queryClient = useQueryClient();

  const staffCount = useQuery({
    queryKey: userKeys.count('staff'),
    queryFn: () => fetchUserCount('staff'),
  });

  const guestCount = useQuery({
    queryKey: userKeys.count('guest'),
    queryFn: () => fetchUserCount('guest'),
  });

  const contactCount = useQuery({
    queryKey: userKeys.count('contact'),
    queryFn: () => fetchUserCount('contact'),
  });

  return {
    staff: staffCount.data ?? 0,
    guests: guestCount.data ?? 0,
    contacts: contactCount.data ?? 0,
    isLoading: staffCount.isLoading || guestCount.isLoading || contactCount.isLoading,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.counts() });
    },
  };
}

/**
 * Update user status mutation
 */
export function useUpdateUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) =>
      updateUserStatus(userId, status),
    onSuccess: () => {
      // Invalidate all user queries to refresh data
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/**
 * Delete user mutation
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, googleAction }: { userId: string; googleAction?: 'keep' | 'suspend' | 'delete' }) =>
      deleteUser(userId, googleAction),
    onSuccess: () => {
      // Invalidate all user queries to refresh data
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/**
 * Bulk status update mutation
 */
export function useBulkUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userIds, status }: { userIds: string[]; status: string }) => {
      await Promise.all(userIds.map(userId => updateUserStatus(userId, status)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/**
 * Bulk delete mutation
 */
export function useBulkDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userIds }: { userIds: string[] }) => {
      await Promise.all(userIds.map(userId => deleteUser(userId)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
