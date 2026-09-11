/**
 * Applies field ownership during a sync, and resolves the differences it leaves.
 * The rule itself lives in lib/field-ownership.ts; this is the part that touches the
 * database and Google.
 */
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { googleWorkspaceService } from './google-workspace.service.js';
import {
  HELIOS_COLUMN,
  decideAll,
  googleFieldValues,
  heliosFieldValues,
  type FieldOwner,
  type OwnedField,
} from '../lib/field-ownership.js';

export interface ReconcileSummary { pulled: number; drifted: number; converged: number }

class FieldDriftService {
  /**
   * Compare one person's owned fields with Google's record and act on each:
   * pull Google's value, record a difference, or close a difference that resolved itself.
   */
  async reconcileUser(
    organizationId: string,
    userId: string,
    googleUser: any,
    ownership: Record<OwnedField, FieldOwner>,
  ): Promise<ReconcileSummary> {
    const summary: ReconcileSummary = { pulled: 0, drifted: 0, converged: 0 };
    const row = (
      await db.query(
        `SELECT u.job_title, u.department, u.mobile_phone, u.work_phone, u.location, m.email AS manager_email
           FROM organization_users u
           LEFT JOIN organization_users m ON m.id = u.reporting_manager_id
          WHERE u.id = $1 AND u.organization_id = $2`,
        [userId, organizationId],
      )
    ).rows[0];
    if (!row) return summary;

    const decisions = decideAll(ownership, heliosFieldValues(row, row.manager_email), googleFieldValues(googleUser));

    for (const d of decisions) {
      if (d.action === 'none') {
        const closed = await db.query(
          `UPDATE user_field_drift SET resolved_at = now(), resolution = 'converged'
            WHERE user_id = $1 AND platform = 'google' AND field = $2 AND resolved_at IS NULL`,
          [userId, d.field],
        );
        summary.converged += closed.rowCount ?? 0;
        continue;
      }

      if (d.action === 'pull') {
        const pulled = await this.writeHeliosValue(organizationId, userId, d.field, d.googleValue).catch((e) => {
          logger.warn('Could not pull a Google-owned field into Helios; recording a difference', { userId, field: d.field, error: e?.message });
          return false;
        });
        if (pulled) {
          await db.query(
            `UPDATE user_field_drift SET resolved_at = now(), resolution = 'kept_platform'
              WHERE user_id = $1 AND platform = 'google' AND field = $2 AND resolved_at IS NULL`,
            [userId, d.field],
          );
          summary.pulled++;
          continue;
        }
      }

      await db.query(
        `INSERT INTO user_field_drift (organization_id, user_id, platform, field, helios_value, platform_value, owner)
         VALUES ($1, $2, 'google', $3, $4, $5, $6)
         ON CONFLICT (user_id, platform, field) WHERE resolved_at IS NULL
         DO UPDATE SET helios_value = EXCLUDED.helios_value, platform_value = EXCLUDED.platform_value,
                       owner = EXCLUDED.owner, last_seen_at = now()`,
        [organizationId, userId, d.field, d.heliosValue, d.googleValue, d.owner],
      );
      summary.drifted++;
    }
    return summary;
  }

  /**
   * Write one owned field into Helios. The manager is stored as a person id, so the
   * Google manager email must map to someone in Helios; if it does not, nothing is
   * written and the caller records a difference instead of guessing.
   */
  private async writeHeliosValue(organizationId: string, userId: string, field: OwnedField, value: string): Promise<boolean> {
    if (field === 'manager') {
      let managerId: string | null = null;
      if (value) {
        const m = await db.query(
          'SELECT id FROM organization_users WHERE organization_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL',
          [organizationId, value],
        );
        if (m.rows.length === 0) return false;
        managerId = m.rows[0].id;
      }
      await db.query('UPDATE organization_users SET reporting_manager_id = $1, updated_at = now() WHERE id = $2', [managerId, userId]);
      return true;
    }
    const column = HELIOS_COLUMN[field];
    await db.query(`UPDATE organization_users SET ${column} = $1, updated_at = now() WHERE id = $2`, [value || null, userId]);
    return true;
  }

  async listOpen(organizationId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT d.id, d.user_id AS "userId", u.email, u.first_name AS "firstName", u.last_name AS "lastName",
              d.platform, d.field, d.helios_value AS "heliosValue", d.platform_value AS "platformValue",
              d.owner, d.detected_at AS "detectedAt", d.last_seen_at AS "lastSeenAt"
         FROM user_field_drift d
         JOIN organization_users u ON u.id = d.user_id
        WHERE d.organization_id = $1 AND d.resolved_at IS NULL AND u.deleted_at IS NULL
        ORDER BY u.email, d.field`,
      [organizationId],
    );
    return res.rows;
  }

  /**
   * Resolve one difference. 'google' copies Google's value into Helios; 'helios' sends
   * Helios's value to Google (merged into Google's record, so nothing else is touched).
   */
  async resolve(organizationId: string, driftId: string, keep: 'helios' | 'google', adminUserId: string): Promise<void> {
    const d = (
      await db.query(
        `SELECT d.*, u.google_workspace_id FROM user_field_drift d JOIN organization_users u ON u.id = d.user_id
          WHERE d.id = $1 AND d.organization_id = $2 AND d.resolved_at IS NULL`,
        [driftId, organizationId],
      )
    ).rows[0];
    if (!d) throw new Error('No open difference with that id');
    const field = d.field as OwnedField;

    if (keep === 'google') {
      const ok = await this.writeHeliosValue(organizationId, d.user_id, field, d.platform_value || '');
      if (!ok) throw new Error(`Google's manager (${d.platform_value}) is not a person in Helios, so it cannot be kept`);
    } else {
      if (!d.google_workspace_id) throw new Error('This person has no Google account to update');
      const value: string = d.helios_value || '';
      const updates: any = {};
      if (field === 'jobTitle') updates.jobTitle = value;
      if (field === 'department') updates.department = value;
      if (field === 'location') updates.location = value;
      if (field === 'mobilePhone') updates.phones = [{ type: 'mobile', value }];
      if (field === 'workPhone') updates.phones = [{ type: 'work', value }];
      if (field === 'manager') updates.managerEmail = value || null;
      const r = await googleWorkspaceService.updateUser(organizationId, d.google_workspace_id, updates);
      if (!r.success) throw new Error(`Google refused the change: ${r.error}`);
    }

    await db.query(
      `UPDATE user_field_drift SET resolved_at = now(), resolution = $2, resolved_by = $3 WHERE id = $1`,
      [driftId, keep === 'google' ? 'kept_platform' : 'kept_helios', adminUserId],
    );
  }
}

export const fieldDriftService = new FieldDriftService();
