/**
 * TanStack Query hooks for Scheduled Actions data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../config/api';

export interface ScheduledAction {
  id: string;
  userId?: string;
  targetEmail?: string;
  targetFirstName?: string;
  targetLastName?: string;
  actionType: 'onboard' | 'offboard' | 'suspend' | 'unsuspend' | 'delete' | 'restore' | 'manual';
  onboardingTemplateId?: string;
  offboardingTemplateId?: string;
  templateName?: string;
  scheduledFor: string;
  isRecurring: boolean;
  recurrenceInterval?: 'daily' | 'weekly' | 'monthly';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  totalSteps: number;
  completedSteps: number;
  currentStep?: string;
  errorMessage?: string;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActionLog {
  id: string;
  actionStep: string;
  stepDescription?: string;
  stepOrder: number;
  status: 'success' | 'failed' | 'pending' | 'skipped' | 'warning';
  durationMs?: number;
  errorMessage?: string;
  executedAt?: string;
  details?: Record<string, unknown>;
}

export interface ScheduledActionsFilters {
  status?: string;
  actionType?: string;
  search?: string;
}

const SCHEDULED_ACTIONS_KEY = 'scheduledActions';

async function fetchScheduledActions(filters: ScheduledActionsFilters): Promise<ScheduledAction[]> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  if (filters.actionType && filters.actionType !== 'all') params.append('actionType', filters.actionType);

  const response = await authFetch(`/api/v1/lifecycle/scheduled-actions?${params}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch scheduled actions');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch scheduled actions');
  }

  return data.data || [];
}

async function fetchActionLogs(actionId: string): Promise<ActionLog[]> {
  const response = await authFetch(`/api/v1/lifecycle/logs?actionId=${actionId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch action logs');
  }

  const data = await response.json();
  return data.success ? data.data || [] : [];
}

async function cancelAction(actionId: string, reason?: string): Promise<void> {
  const response = await authFetch(`/api/v1/lifecycle/scheduled-actions/${actionId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error('Failed to cancel action');
  }
}

async function approveAction(actionId: string, notes?: string): Promise<void> {
  const response = await authFetch(`/api/v1/lifecycle/scheduled-actions/${actionId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes }),
  });

  if (!response.ok) {
    throw new Error('Failed to approve action');
  }
}

async function rejectAction(actionId: string, reason: string): Promise<void> {
  const response = await authFetch(`/api/v1/lifecycle/scheduled-actions/${actionId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error('Failed to reject action');
  }
}

/**
 * Hook to fetch scheduled actions with TanStack Query
 */
export function useScheduledActions(filters: ScheduledActionsFilters = {}) {
  return useQuery({
    queryKey: [SCHEDULED_ACTIONS_KEY, filters],
    queryFn: () => fetchScheduledActions(filters),
    select: (data) => {
      // Apply client-side search filtering
      if (!filters.search) return data;
      const query = filters.search.toLowerCase();
      return data.filter((action) => {
        const targetName = `${action.targetFirstName || ''} ${action.targetLastName || ''}`.toLowerCase();
        return targetName.includes(query) || action.targetEmail?.toLowerCase().includes(query);
      });
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch action logs for a specific action
 */
export function useActionLogs(actionId: string | null) {
  return useQuery({
    queryKey: [SCHEDULED_ACTIONS_KEY, 'logs', actionId],
    queryFn: () => fetchActionLogs(actionId!),
    enabled: !!actionId,
    staleTime: 10 * 1000, // 10 seconds
  });
}

/**
 * Hook to cancel an action
 */
export function useCancelAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ actionId, reason }: { actionId: string; reason?: string }) =>
      cancelAction(actionId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SCHEDULED_ACTIONS_KEY] });
    },
  });
}

/**
 * Hook to approve an action
 */
export function useApproveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ actionId, notes }: { actionId: string; notes?: string }) =>
      approveAction(actionId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SCHEDULED_ACTIONS_KEY] });
    },
  });
}

/**
 * Hook to reject an action
 */
export function useRejectAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ actionId, reason }: { actionId: string; reason: string }) =>
      rejectAction(actionId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SCHEDULED_ACTIONS_KEY] });
    },
  });
}
