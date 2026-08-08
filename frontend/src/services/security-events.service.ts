import { apiPath, authFetch } from '../config/api';

export type SecurityEvent = {
  id: number;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  user_id?: number;
  user_email?: string;
  title: string;
  description: string;
  details?: any;
  source: string;
  acknowledged: boolean;
  acknowledged_by?: number;
  acknowledged_at?: string;
  created_at: string;
}

export type SecurityEventsResponse = {
  success: boolean;
  data: SecurityEvent[];
  unacknowledgedCount: number;
}

export const securityEventsService = {
  async getSecurityEvents(params?: {
    severity?: string;
    acknowledged?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<SecurityEventsResponse> {
    const queryParams = new URLSearchParams();

    if (params?.severity) queryParams.append('severity', params.severity);
    if (params?.acknowledged !== undefined) queryParams.append('acknowledged', params.acknowledged.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const response = await authFetch(
      apiPath(`/organization/security-events?${queryParams.toString()}`)
    );

    if (!response.ok) {
      throw new Error('Failed to fetch security events');
    }

    return response.json();
  },

  async acknowledgeEvent(eventId: number, note?: string): Promise<{ success: boolean; message: string }> {
    const response = await authFetch(
      apiPath(`/organization/security-events/${eventId}/acknowledge`),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to acknowledge security event');
    }

    return response.json();
  },
};
