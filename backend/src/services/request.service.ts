import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

export interface OnboardingRequest {
    id: string;
    organizationId: string;
    type: 'onboarding' | 'offboarding';
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    data: any;
    requesterId?: string;
    approverId?: string;
    comments?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateRequestDto {
    type: 'onboarding' | 'offboarding';
    data: any;
    requesterId: string;
}

export class RequestService {
    /**
     * Create a new request
     */
    async createRequest(organizationId: string, dto: CreateRequestDto): Promise<OnboardingRequest> {
        const result = await db.query(`
      INSERT INTO onboarding_requests (
        organization_id,
        type,
        data,
        requester_id,
        status
      ) VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
    `, [
            organizationId,
            dto.type,
            JSON.stringify(dto.data),
            dto.requesterId
        ]);

        return this.mapToRequest(result.rows[0]);
    }

    /**
     * Get requests for organization
     */
    async getRequests(organizationId: string, status?: string): Promise<OnboardingRequest[]> {
        let query = `
      SELECT r.*, 
             u1.first_name as requester_first, u1.last_name as requester_last, u1.email as requester_email
      FROM onboarding_requests r
      LEFT JOIN organization_users u1 ON r.requester_id = u1.id
      WHERE r.organization_id = $1
    `;
        const params: any[] = [organizationId];

        if (status) {
            query += ` AND r.status = $2`;
            params.push(status);
        }

        query += ` ORDER BY r.created_at DESC`;

        const result = await db.query(query, params);
        return result.rows.map((row: any) => this.mapToRequest(row));
    }

    /**
     * Get single request
     */
    async getRequest(id: string): Promise<OnboardingRequest | null> {
        const result = await db.query(`
      SELECT * FROM onboarding_requests WHERE id = $1
    `, [id]);

        if (result.rows.length === 0) return null;
        return this.mapToRequest(result.rows[0]);
    }

    /**
     * Update request status (Approve/Reject)
     */
    async updateStatus(
        id: string,
        status: 'approved' | 'rejected' | 'completed',
        approverId: string,
        comments?: string
    ): Promise<OnboardingRequest> {
        const result = await db.query(`
      UPDATE onboarding_requests
      SET status = $2, 
          approver_id = $3, 
          comments = COALESCE($4, comments),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, status, approverId, comments]);

        return this.mapToRequest(result.rows[0]);
    }

    private mapToRequest(row: any): OnboardingRequest {
        return {
            id: row.id,
            organizationId: row.organization_id,
            type: row.type,
            status: row.status,
            data: row.data,
            requesterId: row.requester_id,
            approverId: row.approver_id,
            comments: row.comments,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const requestService = new RequestService();
