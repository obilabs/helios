import { apiPath, authFetch } from '../config/api';

export type ActorType = 'internal' | 'service' | 'vendor';
export type ActionResult = 'success' | 'failure' | 'denied';

export type AuditLog = {
  id: number;
  organization_id: number;
  user_id?: number;
  actor_id?: number;
  action: string;
  resource_type?: string;
  resource_id?: string;
  description: string;
  metadata?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  actor_email?: string;
  actor_first_name?: string;
  actor_last_name?: string;
  // Actor attribution fields
  actor_type?: ActorType;
  api_key_id?: string;
  api_key_name?: string;
  vendor_name?: string;
  vendor_technician_name?: string;
  vendor_technician_email?: string;
  ticket_reference?: string;
  service_name?: string;
  service_owner?: string;
  result?: ActionResult;
}

export type AuditLogsResponse = {
  success: boolean;
  data: AuditLog[];
}

export type AuditLogFilters = {
  action?: string;
  userId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  actorType?: ActorType;
  vendorName?: string;
  technician?: string;
  ticketReference?: string;
  result?: ActionResult;
  limit?: number;
  offset?: number;
}

export const auditLogsService = {
  async getAuditLogs(params?: AuditLogFilters): Promise<AuditLogsResponse> {
    const queryParams = new URLSearchParams();

    if (params?.action) queryParams.append('action', params.action);
    if (params?.userId) queryParams.append('userId', params.userId.toString());
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.actorType) queryParams.append('actorType', params.actorType);
    if (params?.vendorName) queryParams.append('vendorName', params.vendorName);
    if (params?.technician) queryParams.append('technician', params.technician);
    if (params?.ticketReference) queryParams.append('ticketReference', params.ticketReference);
    if (params?.result) queryParams.append('result', params.result);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const response = await authFetch(
      apiPath(`/organization/audit-logs?${queryParams.toString()}`)
    );

    if (!response.ok) {
      throw new Error('Failed to fetch audit logs');
    }

    return response.json();
  },

  async exportAuditLogs(params?: Omit<AuditLogFilters, 'limit' | 'offset'>): Promise<void> {
    const queryParams = new URLSearchParams();

    if (params?.action) queryParams.append('action', params.action);
    if (params?.userId) queryParams.append('userId', params.userId.toString());
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.actorType) queryParams.append('actorType', params.actorType);
    if (params?.vendorName) queryParams.append('vendorName', params.vendorName);
    if (params?.result) queryParams.append('result', params.result);

    const response = await authFetch(
      apiPath(`/organization/audit-logs/export?${queryParams.toString()}`)
    );

    if (!response.ok) {
      throw new Error('Failed to export audit logs');
    }

    // Download the CSV file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};
