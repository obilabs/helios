import jwt from 'jsonwebtoken';
import { db } from '../database/connection.js';

export interface SocketUser {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}

export async function authenticateSocketToken(token: string): Promise<SocketUser | null> {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;

    // Get user from database to ensure they still exist and are active
    const query = `
      SELECT id, email, organization_id, role
      FROM organization_users
      WHERE id = $1 AND is_active = true
    `;

    const result = await db.query(query, [decoded.userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];

    return {
      id: user.id,
      email: user.email,
      organizationId: user.organization_id,
      role: user.role,
    };
  } catch (error) {
    return null;
  }
}