import axios from 'axios';
import { apiPath } from '../config/api';

// Configure axios defaults for session-based auth
const authAxios = axios.create({
  withCredentials: true, // Send cookies with requests
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Ticket {
  id: string;
  organization_id: string;
  google_message_id: string;
  google_thread_id: string;
  group_email: string;
  subject: string;
  sender_email: string;
  sender_name?: string;
  status: 'new' | 'in_progress' | 'pending' | 'resolved' | 'reopened';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_to_email?: string;
  assigned_at?: string;
  assigned_by?: string;
  first_response_at?: string;
  resolved_at?: string;
  resolved_by?: string;
  reopened_at?: string;
  tags: string[];
  notes_count?: number;
  viewers_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TicketNote {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string;
  author_email: string;
  content: string;
  mentioned_users: string[];
  is_edited: boolean;
  edited_at?: string;
  created_at: string;
}

export interface PresenceData {
  viewers: Array<{
    userId: string;
    name: string;
    email?: string;
    since: string;
  }>;
  typers: Array<{
    userId: string;
    name: string;
    email?: string;
  }>;
}

export interface TicketFilters {
  status?: string;
  assigned_to?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export interface TicketStats {
  total: number;
  myTickets: number;
  newTickets: number;
  inProgress: number;
  resolved: number;
}

class HelpdeskService {
  async getTickets(filters: TicketFilters = {}): Promise<Ticket[]> {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.assigned_to) params.append('assigned_to', filters.assigned_to);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.limit) params.append('limit', filters.limit.toString());
      if (filters.offset) params.append('offset', filters.offset.toString());

      const response = await authAxios.get(apiPath(`/helpdesk/tickets?${params.toString()}`));
      return response.data.data;
    } catch (error) {
      console.error('Error fetching tickets:', error);
      throw error;
    }
  }

  async getTicket(id: string): Promise<Ticket> {
    try {
      const response = await authAxios.get(apiPath(`/helpdesk/tickets/${id}`));
      return response.data.data;
    } catch (error) {
      console.error('Error fetching ticket:', error);
      throw error;
    }
  }

  async createTicket(data: {
    googleMessageId: string;
    googleThreadId: string;
    groupEmail: string;
    subject: string;
    senderEmail: string;
    senderName?: string;
    priority?: string;
    tags?: string[];
  }): Promise<Ticket> {
    try {
      const response = await authAxios.post(apiPath('/helpdesk/tickets'), data);
      return response.data.data;
    } catch (error) {
      console.error('Error creating ticket:', error);
      throw error;
    }
  }

  async assignTicket(ticketId: string, assignToUserId?: string): Promise<any> {
    try {
      const response = await authAxios.post(
        apiPath(`/helpdesk/tickets/${ticketId}/assign`),
        { assignToUserId }
      );
      return response.data.data;
    } catch (error) {
      console.error('Error assigning ticket:', error);
      throw error;
    }
  }

  async unassignTicket(ticketId: string): Promise<any> {
    try {
      const response = await authAxios.delete(apiPath(`/helpdesk/tickets/${ticketId}/assign`));
      return response.data.data;
    } catch (error) {
      console.error('Error unassigning ticket:', error);
      throw error;
    }
  }

  async updateTicketStatus(ticketId: string, status: string): Promise<Ticket> {
    try {
      const response = await authAxios.patch(
        apiPath(`/helpdesk/tickets/${ticketId}/status`),
        { status }
      );
      return response.data.data;
    } catch (error) {
      console.error('Error updating ticket status:', error);
      throw error;
    }
  }

  async getTicketNotes(ticketId: string): Promise<TicketNote[]> {
    try {
      const response = await authAxios.get(apiPath(`/helpdesk/tickets/${ticketId}/notes`));
      return response.data.data;
    } catch (error) {
      console.error('Error fetching notes:', error);
      throw error;
    }
  }

  async addNote(ticketId: string, content: string, mentionedUsers: string[] = []): Promise<TicketNote> {
    try {
      const response = await authAxios.post(
        apiPath(`/helpdesk/tickets/${ticketId}/notes`),
        { content, mentionedUsers }
      );
      return response.data.data;
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  }

  async getTicketPresence(ticketId: string): Promise<PresenceData> {
    try {
      const response = await authAxios.get(apiPath(`/helpdesk/tickets/${ticketId}/presence`));
      return response.data.data;
    } catch (error) {
      console.error('Error fetching presence:', error);
      throw error;
    }
  }

  async getStats(): Promise<TicketStats> {
    try {
      const response = await authAxios.get(apiPath('/helpdesk/stats'));
      return response.data.data;
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }

  async getAnalytics(startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate.toISOString());
      if (endDate) params.append('end_date', endDate.toISOString());

      const response = await authAxios.get(apiPath(`/helpdesk/analytics?${params.toString()}`));
      return response.data.data;
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }
  }
}

export const helpdeskService = new HelpdeskService();