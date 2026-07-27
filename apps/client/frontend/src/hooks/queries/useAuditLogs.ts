/**
 * TanStack Query hooks for Audit Logs data
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { auditLogsService } from '../../services';
import type { AuditLog, AuditLogFilters } from '../../services';

export type { AuditLog, AuditLogFilters };

const AUDIT_LOGS_KEY = 'auditLogs';

interface UseAuditLogsParams extends AuditLogFilters {
  page?: number;
  pageSize?: number;
}

interface AuditLogsResponse {
  data: AuditLog[];
  hasMore: boolean;
}

/**
 * Hook to fetch audit logs with TanStack Query
 * Supports server-side pagination
 */
export function useAuditLogs(params: UseAuditLogsParams = {}) {
  const { page = 1, pageSize = 50, ...filters } = params;

  return useQuery({
    queryKey: [AUDIT_LOGS_KEY, { page, pageSize, ...filters }],
    queryFn: async (): Promise<AuditLogsResponse> => {
      const apiFilters: AuditLogFilters = {
        ...filters,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };

      const response = await auditLogsService.getAuditLogs(apiFilters);

      return {
        data: response.data,
        hasMore: response.data.length === pageSize,
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds - audit logs should be fresher
  });
}

/**
 * Hook to get unique action types for filtering
 */
export function useAuditLogActions() {
  return useQuery({
    queryKey: [AUDIT_LOGS_KEY, 'actions'],
    queryFn: async () => {
      // Fetch a sample of logs to get unique actions
      const response = await auditLogsService.getAuditLogs({ limit: 1000 });
      const actions = Array.from(new Set(response.data.map(log => log.action))).sort();
      return actions;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
