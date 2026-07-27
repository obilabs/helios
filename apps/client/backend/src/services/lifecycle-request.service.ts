/**
 * Lifecycle Request Service
 *
 * Manages user lifecycle requests (onboard, offboard, transfer).
 * Includes request creation, approval workflow, and status management.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { lifecycleLogService } from './lifecycle-log.service.js';
import { LifecycleNotificationService } from './lifecycle-notification.service.js';

// Types
export type RequestType = 'onboard' | 'offboard' | 'transfer';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'cancelled';

export interface UserRequest {
  id: string;
  organization_id: string;
  request_type: RequestType;
  status: RequestStatus;
  email: string;
  first_name: string;
  last_name: string;
  personal_email?: string;
  user_id?: string;
  start_date?: string;
  end_date?: string;
  template_id?: string;
  job_title?: string;
  department_id?: string;
  manager_id?: string;
  location?: string;
  metadata?: Record<string, unknown>;
  requested_by?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  tasks_total: number;
  tasks_completed: number;
  created_at: string;
  updated_at: string;
}

export interface CreateRequestDTO {
  organization_id: string;
  request_type: RequestType;
  email: string;
  first_name: string;
  last_name: string;
  personal_email?: string;
  user_id?: string;
  start_date?: string;
  end_date?: string;
  template_id?: string;
  job_title?: string;
  department_id?: string;
  manager_id?: string;
  location?: string;
  metadata?: Record<string, unknown>;
  requested_by?: string;
}

export interface UpdateRequestDTO {
  email?: string;
  first_name?: string;
  last_name?: string;
  personal_email?: string;
  start_date?: string;
  end_date?: string;
  template_id?: string;
  job_title?: string;
  department_id?: string;
  manager_id?: string;
  location?: string;
  metadata?: Record<string, unknown>;
}

export interface ListRequestsOptions {
  status?: RequestStatus | RequestStatus[];
  request_type?: RequestType;
  requested_by?: string;
  manager_id?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

class LifecycleRequestService {
  /**
   * Create a new lifecycle request
   */
  async createRequest(dto: CreateRequestDTO): Promise<UserRequest> {
    const {
      organization_id,
      request_type,
      email,
      first_name,
      last_name,
      personal_email,
      user_id,
      start_date,
      end_date,
      template_id,
      job_title,
      department_id,
      manager_id,
      location,
      metadata,
      requested_by,
    } = dto;

    const result = await db.query(
      `INSERT INTO user_requests (
        organization_id, request_type, email, first_name, last_name,
        personal_email, user_id, start_date, end_date, template_id,
        job_title, department_id, manager_id, location, metadata, requested_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        organization_id,
        request_type,
        email,
        first_name,
        last_name,
        personal_email || null,
        user_id || null,
        start_date || null,
        end_date || null,
        template_id || null,
        job_title || null,
        department_id || null,
        manager_id || null,
        location || null,
        JSON.stringify(metadata || {}),
        requested_by || null,
      ]
    );

    const request = result.rows[0];

    // Log the creation
    await lifecycleLogService.log({
      organizationId: organization_id,
      userId: user_id || null,
      action: 'request_created',
      details: {
        request_id: request.id,
        request_type,
        email,
        name: `${first_name} ${last_name}`,
      },
      performedBy: requested_by || null,
    });

    logger.info(`Created ${request_type} request for ${email}`, { requestId: request.id });

    return request;
  }

  /**
   * Get a request by ID
   */
  async getRequest(requestId: string, organizationId: string): Promise<UserRequest | null> {
    const result = await db.query(
      `SELECT r.*,
        requester.first_name || ' ' || requester.last_name as requested_by_name,
        approver.first_name || ' ' || approver.last_name as approved_by_name,
        mgr.first_name || ' ' || mgr.last_name as manager_name,
        d.name as department_name,
        t.name as template_name
      FROM user_requests r
      LEFT JOIN organization_users requester ON r.requested_by = requester.id
      LEFT JOIN organization_users approver ON r.approved_by = approver.id
      LEFT JOIN organization_users mgr ON r.manager_id = mgr.id
      LEFT JOIN departments d ON r.department_id = d.id
      LEFT JOIN onboarding_templates t ON r.template_id = t.id
      WHERE r.id = $1 AND r.organization_id = $2`,
      [requestId, organizationId]
    );

    return result.rows[0] || null;
  }

  /**
   * List requests with filters
   */
  async listRequests(
    organizationId: string,
    options: ListRequestsOptions = {}
  ): Promise<{ requests: UserRequest[]; total: number }> {
    const {
      status,
      request_type,
      requested_by,
      manager_id,
      from_date,
      to_date,
      search,
      limit = 50,
      offset = 0,
    } = options;

    let whereClause = 'r.organization_id = $1';
    const values: (string | string[] | number)[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      if (Array.isArray(status)) {
        whereClause += ` AND r.status = ANY($${paramIndex})`;
        values.push(status);
      } else {
        whereClause += ` AND r.status = $${paramIndex}`;
        values.push(status);
      }
      paramIndex++;
    }

    if (request_type) {
      whereClause += ` AND r.request_type = $${paramIndex}`;
      values.push(request_type);
      paramIndex++;
    }

    if (requested_by) {
      whereClause += ` AND r.requested_by = $${paramIndex}`;
      values.push(requested_by);
      paramIndex++;
    }

    if (manager_id) {
      whereClause += ` AND r.manager_id = $${paramIndex}`;
      values.push(manager_id);
      paramIndex++;
    }

    if (from_date) {
      whereClause += ` AND r.start_date >= $${paramIndex}`;
      values.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      whereClause += ` AND r.start_date <= $${paramIndex}`;
      values.push(to_date);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (
        r.email ILIKE $${paramIndex} OR
        r.first_name ILIKE $${paramIndex} OR
        r.last_name ILIKE $${paramIndex} OR
        CONCAT(r.first_name, ' ', r.last_name) ILIKE $${paramIndex}
      )`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    // Get count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM user_requests r WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data with joins
    const dataQuery = `
      SELECT r.*,
        requester.first_name || ' ' || requester.last_name as requested_by_name,
        approver.first_name || ' ' || approver.last_name as approved_by_name,
        mgr.first_name || ' ' || mgr.last_name as manager_name,
        d.name as department_name,
        t.name as template_name
      FROM user_requests r
      LEFT JOIN organization_users requester ON r.requested_by = requester.id
      LEFT JOIN organization_users approver ON r.approved_by = approver.id
      LEFT JOIN organization_users mgr ON r.manager_id = mgr.id
      LEFT JOIN departments d ON r.department_id = d.id
      LEFT JOIN onboarding_templates t ON r.template_id = t.id
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    const result = await db.query(dataQuery, values);

    return { requests: result.rows, total };
  }

  /**
   * Update a request
   */
  async updateRequest(
    requestId: string,
    organizationId: string,
    dto: UpdateRequestDTO
  ): Promise<UserRequest | null> {
    const fields: string[] = [];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(key === 'metadata' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return this.getRequest(requestId, organizationId);
    }

    values.push(requestId, organizationId);

    const result = await db.query(
      `UPDATE user_requests
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Approve a request
   */
  async approveRequest(
    requestId: string,
    organizationId: string,
    approvedBy: string
  ): Promise<UserRequest | null> {
    // Verify request is pending
    const existing = await this.getRequest(requestId, organizationId);
    if (!existing) {
      throw new Error('Request not found');
    }
    if (existing.status !== 'pending') {
      throw new Error(`Cannot approve request with status: ${existing.status}`);
    }

    const result = await db.query(
      `UPDATE user_requests
       SET status = 'approved',
           approved_by = $3,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [requestId, organizationId, approvedBy]
    );

    const request = result.rows[0];

    if (request) {
      // Log the approval
      await lifecycleLogService.log({
        organizationId,
        userId: request.user_id || null,
        action: 'request_approved',
        details: {
          request_id: requestId,
          request_type: request.request_type,
          email: request.email,
        },
        performedBy: approvedBy,
      });

      logger.info(`Approved ${request.request_type} request`, { requestId });

      // Send notification to requester
      if (request.requested_by) {
        const notificationService = new LifecycleNotificationService(organizationId);
        const requesterResult = await db.query(
          `SELECT email, first_name, last_name FROM organization_users WHERE id = $1`,
          [request.requested_by]
        );
        const approverResult = await db.query(
          `SELECT first_name, last_name FROM organization_users WHERE id = $1`,
          [approvedBy]
        );

        if (requesterResult.rows.length > 0) {
          const requester = requesterResult.rows[0];
          const approver = approverResult.rows[0];
          notificationService.sendRequestApprovedNotification({
            requestId,
            requestType: request.request_type,
            userName: `${request.first_name} ${request.last_name}`,
            userEmail: request.email,
            startDate: request.start_date,
            requesterName: `${requester.first_name} ${requester.last_name}`,
            requesterEmail: requester.email,
            approverName: approver ? `${approver.first_name} ${approver.last_name}` : undefined,
          }).catch((err: Error) => logger.error('Failed to send approval notification', { error: err.message }));
        }
      }
    }

    return request;
  }

  /**
   * Reject a request
   */
  async rejectRequest(
    requestId: string,
    organizationId: string,
    rejectedBy: string,
    reason?: string
  ): Promise<UserRequest | null> {
    // Verify request is pending
    const existing = await this.getRequest(requestId, organizationId);
    if (!existing) {
      throw new Error('Request not found');
    }
    if (existing.status !== 'pending') {
      throw new Error(`Cannot reject request with status: ${existing.status}`);
    }

    const result = await db.query(
      `UPDATE user_requests
       SET status = 'rejected',
           approved_by = $3,
           approved_at = NOW(),
           rejection_reason = $4,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [requestId, organizationId, rejectedBy, reason || null]
    );

    const request = result.rows[0];

    if (request) {
      await lifecycleLogService.log({
        organizationId,
        userId: request.user_id || null,
        action: 'request_rejected',
        details: {
          request_id: requestId,
          request_type: request.request_type,
          email: request.email,
          reason,
        },
        performedBy: rejectedBy,
      });

      logger.info(`Rejected ${request.request_type} request`, { requestId, reason });

      // Send notification to requester
      if (request.requested_by) {
        const notificationService = new LifecycleNotificationService(organizationId);
        const requesterResult = await db.query(
          `SELECT email, first_name, last_name FROM organization_users WHERE id = $1`,
          [request.requested_by]
        );
        const rejectorResult = await db.query(
          `SELECT first_name, last_name FROM organization_users WHERE id = $1`,
          [rejectedBy]
        );

        if (requesterResult.rows.length > 0) {
          const requester = requesterResult.rows[0];
          const rejector = rejectorResult.rows[0];
          notificationService.sendRequestRejectedNotification({
            requestId,
            requestType: request.request_type,
            userName: `${request.first_name} ${request.last_name}`,
            userEmail: request.email,
            startDate: request.start_date,
            requesterName: `${requester.first_name} ${requester.last_name}`,
            requesterEmail: requester.email,
            approverName: rejector ? `${rejector.first_name} ${rejector.last_name}` : undefined,
            rejectionReason: reason,
          }).catch((err: Error) => logger.error('Failed to send rejection notification', { error: err.message }));
        }
      }
    }

    return request;
  }

  /**
   * Cancel a request
   */
  async cancelRequest(
    requestId: string,
    organizationId: string,
    cancelledBy: string
  ): Promise<UserRequest | null> {
    const existing = await this.getRequest(requestId, organizationId);
    if (!existing) {
      throw new Error('Request not found');
    }
    if (['completed', 'cancelled'].includes(existing.status)) {
      throw new Error(`Cannot cancel request with status: ${existing.status}`);
    }

    const result = await db.query(
      `UPDATE user_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [requestId, organizationId]
    );

    const request = result.rows[0];

    if (request) {
      await lifecycleLogService.log({
        organizationId,
        userId: request.user_id || null,
        action: 'request_cancelled',
        details: {
          request_id: requestId,
          request_type: request.request_type,
          email: request.email,
        },
        performedBy: cancelledBy,
      });

      logger.info(`Cancelled ${request.request_type} request`, { requestId });
    }

    return request;
  }

  /**
   * Get request counts by status
   */
  async getRequestCounts(organizationId: string): Promise<Record<RequestStatus, number>> {
    const result = await db.query(
      `SELECT status, COUNT(*) as count
       FROM user_requests
       WHERE organization_id = $1
       GROUP BY status`,
      [organizationId]
    );

    const counts: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const row of result.rows) {
      counts[row.status] = parseInt(row.count, 10);
    }

    return counts as Record<RequestStatus, number>;
  }

  /**
   * Get pending requests count for dashboard
   */
  async getPendingCount(organizationId: string): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*) FROM user_requests WHERE organization_id = $1 AND status = 'pending'`,
      [organizationId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get active (in_progress) onboardings for dashboard
   */
  async getActiveOnboardings(organizationId: string): Promise<UserRequest[]> {
    const result = await db.query(
      `SELECT r.*,
        mgr.first_name || ' ' || mgr.last_name as manager_name,
        d.name as department_name
      FROM user_requests r
      LEFT JOIN organization_users mgr ON r.manager_id = mgr.id
      LEFT JOIN departments d ON r.department_id = d.id
      WHERE r.organization_id = $1
        AND r.request_type = 'onboard'
        AND r.status IN ('approved', 'in_progress')
      ORDER BY r.start_date ASC`,
      [organizationId]
    );
    return result.rows;
  }
}

export const lifecycleRequestService = new LifecycleRequestService();
