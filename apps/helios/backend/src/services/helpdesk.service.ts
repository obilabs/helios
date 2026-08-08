import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

interface TicketCreateData {
  organizationId: string;
  googleMessageId: string;
  googleThreadId: string;
  groupEmail: string;
  subject: string;
  senderEmail: string;
  senderName?: string;
  priority?: string;
  tags?: string[];
}

interface PresenceData {
  viewers: Array<{
    userId: string;
    name: string;
    avatar?: string;
    since: Date;
  }>;
  typers: Array<{
    userId: string;
    name: string;
    avatar?: string;
  }>;
}

class HelpdeskService {
  /**
   * Create a new ticket from Google Groups email
   */
  async createTicket(data: TicketCreateData) {
    const query = `
      INSERT INTO helpdesk_tickets (
        organization_id, google_message_id, google_thread_id,
        group_email, subject, sender_email, sender_name,
        priority, tags, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
      ON CONFLICT (google_message_id) DO UPDATE
      SET updated_at = NOW()
      RETURNING *
    `;

    const values = [
      data.organizationId,
      data.googleMessageId,
      data.googleThreadId,
      data.groupEmail,
      data.subject,
      data.senderEmail,
      data.senderName || null,
      data.priority || 'normal',
      JSON.stringify(data.tags || []),
    ];

    try {
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating ticket:', error);
      throw error;
    }
  }

  /**
   * Get tickets for organization with filters
   */
  async getTickets(
    organizationId: string,
    filters: {
      status?: string;
      assignedTo?: string;
      priority?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    let query = `
      SELECT
        t.*,
        u.first_name || ' ' || u.last_name as assigned_to_name,
        u.email as assigned_to_email,
        COUNT(n.id) as notes_count,
        (
          SELECT COUNT(*)
          FROM helpdesk_presence p
          WHERE p.ticket_id = t.id AND p.action = 'viewing'
        ) as viewers_count
      FROM helpdesk_tickets t
      LEFT JOIN organization_users u ON t.assigned_to = u.id
      LEFT JOIN helpdesk_notes n ON n.ticket_id = t.id
      WHERE t.organization_id = $1
    `;

    const values: any[] = [organizationId];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND t.status = $${++paramCount}`;
      values.push(filters.status);
    }

    if (filters.assignedTo) {
      query += ` AND t.assigned_to = $${++paramCount}`;
      values.push(filters.assignedTo);
    }

    if (filters.priority) {
      query += ` AND t.priority = $${++paramCount}`;
      values.push(filters.priority);
    }

    query += ` GROUP BY t.id, u.id, u.first_name, u.last_name, u.email`;
    query += ` ORDER BY t.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${++paramCount}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${++paramCount}`;
      values.push(filters.offset);
    }

    try {
      const result = await db.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching tickets:', error);
      throw error;
    }
  }

  /**
   * Get single ticket with full details
   */
  async getTicket(ticketId: string, organizationId: string) {
    const query = `
      SELECT
        t.*,
        u.first_name || ' ' || u.last_name as assigned_to_name,
        u.email as assigned_to_email,
        au.first_name || ' ' || au.last_name as assigned_by_name,
        ru.first_name || ' ' || ru.last_name as resolved_by_name
      FROM helpdesk_tickets t
      LEFT JOIN organization_users u ON t.assigned_to = u.id
      LEFT JOIN organization_users au ON t.assigned_by = au.id
      LEFT JOIN organization_users ru ON t.resolved_by = ru.id
      WHERE t.id = $1 AND t.organization_id = $2
    `;

    try {
      const result = await db.query(query, [ticketId, organizationId]);
      if (result.rows.length === 0) {
        throw new Error('Ticket not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching ticket:', error);
      throw error;
    }
  }

  /**
   * Assign ticket to an agent
   */
  async assignTicket(
    ticketId: string,
    assignToUserId: string,
    assignByUserId: string,
    organizationId: string
  ) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Get current assignment
      const currentQuery = `
        SELECT assigned_to FROM helpdesk_tickets
        WHERE id = $1 AND organization_id = $2
      `;
      const current = await client.query(currentQuery, [ticketId, organizationId]);

      if (current.rows.length === 0) {
        throw new Error('Ticket not found');
      }

      const previousAssignedTo = current.rows[0].assigned_to;

      // Update ticket assignment
      const updateQuery = `
        UPDATE helpdesk_tickets
        SET
          assigned_to = $1,
          assigned_by = $2,
          assigned_at = NOW(),
          status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END,
          updated_at = NOW()
        WHERE id = $3 AND organization_id = $4
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [
        assignToUserId,
        assignByUserId,
        ticketId,
        organizationId,
      ]);

      // Record assignment history
      const historyQuery = `
        INSERT INTO helpdesk_assignment_history (
          ticket_id, assigned_from, assigned_to, assigned_by
        ) VALUES ($1, $2, $3, $4)
      `;

      await client.query(historyQuery, [
        ticketId,
        previousAssignedTo,
        assignToUserId,
        assignByUserId,
      ]);

      await client.query('COMMIT');

      // Get user details for response
      const userQuery = `
        SELECT id, first_name, last_name, email
        FROM organization_users
        WHERE id = $1
      `;
      const userResult = await client.query(userQuery, [assignToUserId]);

      return {
        ticket: updateResult.rows[0],
        assignedTo: userResult.rows[0],
        assignedBy: assignByUserId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error assigning ticket:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(
    ticketId: string,
    status: string,
    userId: string,
    organizationId: string
  ) {
    let updateFields = 'status = $1, updated_at = NOW()';
    const values: any[] = [status, ticketId, organizationId];

    // Add status-specific fields
    if (status === 'resolved') {
      updateFields += ', resolved_at = NOW(), resolved_by = $4';
      values.splice(1, 0, userId);
    } else if (status === 'reopened') {
      updateFields += ', reopened_at = NOW(), resolved_at = NULL, resolved_by = NULL';
    } else if (status === 'in_progress' && !values.includes('first_response_at')) {
      updateFields += ', first_response_at = COALESCE(first_response_at, NOW())';
    }

    const query = `
      UPDATE helpdesk_tickets
      SET ${updateFields}
      WHERE id = $${values.length - 1} AND organization_id = $${values.length}
      RETURNING *
    `;

    try {
      const result = await db.query(query, values);
      if (result.rows.length === 0) {
        throw new Error('Ticket not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating ticket status:', error);
      throw error;
    }
  }

  /**
   * Add internal note to ticket
   */
  async addNote(
    ticketId: string,
    authorId: string,
    content: string,
    mentionedUsers: string[] = []
  ) {
    const query = `
      INSERT INTO helpdesk_notes (
        ticket_id, author_id, content, mentioned_users
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    try {
      const result = await db.query(query, [
        ticketId,
        authorId,
        content,
        mentionedUsers,
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error adding note:', error);
      throw error;
    }
  }

  /**
   * Get notes for a ticket
   */
  async getTicketNotes(ticketId: string) {
    const query = `
      SELECT
        n.*,
        u.first_name || ' ' || u.last_name as author_name,
        u.email as author_email
      FROM helpdesk_notes n
      LEFT JOIN organization_users u ON n.author_id = u.id
      WHERE n.ticket_id = $1
      ORDER BY n.created_at DESC
    `;

    try {
      const result = await db.query(query, [ticketId]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching notes:', error);
      throw error;
    }
  }

  /**
   * Update presence for a user on a ticket
   */
  async updatePresence(userId: string, ticketId: string, action: string) {
    const query = `
      INSERT INTO helpdesk_presence (
        user_id, ticket_id, action, last_ping
      ) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, ticket_id, action)
      DO UPDATE SET last_ping = NOW()
    `;

    try {
      await db.query(query, [userId, ticketId, action]);
    } catch (error) {
      logger.error('Error updating presence:', error);
      throw error;
    }
  }

  /**
   * Clear specific presence
   */
  async clearPresence(userId: string, ticketId: string, action: string) {
    const query = `
      DELETE FROM helpdesk_presence
      WHERE user_id = $1 AND ticket_id = $2 AND action = $3
    `;

    try {
      await db.query(query, [userId, ticketId, action]);
    } catch (error) {
      logger.error('Error clearing presence:', error);
      throw error;
    }
  }

  /**
   * Clear all presence for a user
   */
  async clearAllUserPresence(userId: string) {
    const query = `DELETE FROM helpdesk_presence WHERE user_id = $1`;

    try {
      await db.query(query, [userId]);
    } catch (error) {
      logger.error('Error clearing user presence:', error);
      throw error;
    }
  }

  /**
   * Update presence ping time
   */
  async updatePresencePing(userId: string, ticketId: string) {
    const query = `
      UPDATE helpdesk_presence
      SET last_ping = NOW()
      WHERE user_id = $1 AND ticket_id = $2
    `;

    try {
      await db.query(query, [userId, ticketId]);
    } catch (error) {
      logger.error('Error updating presence ping:', error);
      throw error;
    }
  }

  /**
   * Get presence data for a ticket
   */
  async getTicketPresence(ticketId: string): Promise<PresenceData> {
    const query = `
      SELECT
        p.*,
        u.first_name || ' ' || u.last_name as name,
        u.email
      FROM helpdesk_presence p
      LEFT JOIN organization_users u ON p.user_id = u.id
      WHERE p.ticket_id = $1
        AND p.last_ping > NOW() - INTERVAL '35 seconds'
    `;

    try {
      const result = await db.query(query, [ticketId]);

      const viewers = result.rows
        .filter((r: any) => r.action === 'viewing')
        .map((r: any) => ({
          userId: r.user_id,
          name: r.name,
          email: r.email,
          since: r.started_at,
        }));

      const typers = result.rows
        .filter((r: any) => r.action === 'typing')
        .map((r: any) => ({
          userId: r.user_id,
          name: r.name,
          email: r.email,
        }));

      return { viewers, typers };
    } catch (error) {
      logger.error('Error fetching ticket presence:', error);
      throw error;
    }
  }

  /**
   * Clean up stale presence records
   */
  async cleanupStalePresence() {
    const query = `
      DELETE FROM helpdesk_presence
      WHERE last_ping < NOW() - INTERVAL '1 minute'
    `;

    try {
      const result = await db.query(query);
      if (result.rowCount > 0) {
        logger.info(`Cleaned up ${result.rowCount} stale presence records`);
      }
    } catch (error) {
      logger.error('Error cleaning up stale presence:', error);
    }
  }

  /**
   * Get analytics for organization
   */
  async getAnalytics(organizationId: string, dateRange: { start: Date; end: Date }) {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE created_at BETWEEN $2 AND $3) as tickets_created,
        COUNT(*) FILTER (WHERE resolved_at BETWEEN $2 AND $3) as tickets_resolved,
        COUNT(*) FILTER (WHERE status = 'new') as new_tickets,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))) as avg_response_seconds,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_seconds
      FROM helpdesk_tickets
      WHERE organization_id = $1
    `;

    try {
      const result = await db.query(query, [
        organizationId,
        dateRange.start,
        dateRange.end,
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching analytics:', error);
      throw error;
    }
  }
}

export const helpdeskService = new HelpdeskService();