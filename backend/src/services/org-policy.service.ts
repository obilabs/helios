/**
 * Organization policy: no orphans.
 *
 * Nobody may be suspended, offboarded or deleted while anyone still reports to
 * them, unless the reports are reassigned in the same action. Enforced here,
 * in code, and used by the status route, the delete route and the offboarding
 * orchestrator. The wizard's own direct-reports step is a convenience on top;
 * this is the guarantee.
 */
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { googleWorkspaceService } from './google-workspace.service.js';

export interface DirectReport {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export type ReassignInput =
  | { mode: 'all_to_one'; targetManagerId: string }
  | { mode: 'individual'; assignments: Array<{ reportId: string; newManagerId: string }> };

export interface ReassignResultRow {
  reportId: string;
  email: string;
  newManagerId: string;
  success: boolean;
  error?: string;
}

export interface OrphanCheck {
  ok: boolean;
  reports: DirectReport[];
}

export class OrgPolicyService {
  /** People who currently report to this user and are not themselves gone. */
  async listActiveDirectReports(organizationId: string, userId: string): Promise<DirectReport[]> {
    const r = await db.query(
      `SELECT id, email, first_name, last_name
         FROM organization_users
        WHERE organization_id = $1 AND reporting_manager_id = $2
          AND is_active = true AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY email`,
      [organizationId, userId],
    );
    return r.rows as DirectReport[];
  }

  /**
   * The no-orphans check. `ok: false` carries the reports so the caller can
   * name them in its refusal.
   */
  async checkNoOrphans(organizationId: string, userId: string): Promise<OrphanCheck> {
    const reports = await this.listActiveDirectReports(organizationId, userId);
    return { ok: reports.length === 0, reports };
  }

  /** Human-readable refusal for a 409. */
  describeOrphans(action: string, reports: DirectReport[]): string {
    const names = reports.slice(0, 5).map((r) => [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email);
    const more = reports.length > 5 ? ` and ${reports.length - 5} more` : '';
    return `Cannot ${action} this user: ${reports.length} ${reports.length === 1 ? 'person reports' : 'people report'} to them (${names.join(', ')}${more}). Reassign their manager first, or pass reassignReports with this request.`;
  }

  /**
   * Reassign a user's direct reports in Helios AND in Google (manager relation
   * on each report), so no platform is left pointing at the departing manager.
   * A report whose Google update is rejected is reported as failed, not hidden.
   */
  async reassignDirectReports(organizationId: string, userId: string, input: ReassignInput): Promise<{ totalReports: number; reassignedCount: number; results: ReassignResultRow[] }> {
    const directReports = await db.query(
      'SELECT id, email, first_name, last_name FROM organization_users WHERE reporting_manager_id = $1 AND organization_id = $2',
      [userId, organizationId],
    );
    const results: ReassignResultRow[] = [];
    let reassignedCount = 0;

    if (input.mode === 'all_to_one') {
      if (input.targetManagerId === userId) throw new Error('A user cannot be their own manager');
      // The new manager may themselves be one of the reports (a deputy taking
      // over). They cannot report to themselves, so they are left out here and
      // reported back; the caller assigns them individually (or to nobody).
      const upd = await db.query(
        'UPDATE organization_users SET reporting_manager_id = $1, updated_at = NOW() WHERE reporting_manager_id = $2 AND organization_id = $3 AND id <> $1 RETURNING id, email',
        [input.targetManagerId, userId, organizationId],
      );
      reassignedCount = upd.rowCount || 0;
      for (const row of upd.rows) results.push({ reportId: row.id, email: row.email, newManagerId: input.targetManagerId, success: true });
      const self = directReports.rows.find((r: any) => r.id === input.targetManagerId);
      if (self) {
        results.push({ reportId: self.id, email: self.email, newManagerId: input.targetManagerId, success: false, error: 'This is the new manager; they cannot report to themselves. Assign their manager individually.' });
      }
    } else {
      for (const a of input.assignments) {
        try {
          if (a.newManagerId === userId) throw new Error('cannot reassign to the departing manager');
          const upd = await db.query(
            'UPDATE organization_users SET reporting_manager_id = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3 AND reporting_manager_id = $4 RETURNING id, email',
            [a.newManagerId, a.reportId, organizationId, userId],
          );
          if (upd.rowCount && upd.rowCount > 0) {
            reassignedCount++;
            results.push({ reportId: a.reportId, email: upd.rows[0].email, newManagerId: a.newManagerId, success: true });
          } else {
            results.push({ reportId: a.reportId, email: 'unknown', newManagerId: a.newManagerId, success: false, error: 'Report not found under this manager' });
          }
        } catch (e: any) {
          results.push({ reportId: a.reportId, email: 'unknown', newManagerId: a.newManagerId, success: false, error: e?.message || String(e) });
        }
      }
    }

    for (const r of results) {
      if (!r.success) continue;
      try {
        const rep = await db.query('SELECT google_workspace_id FROM organization_users WHERE id = $1 AND organization_id = $2', [r.reportId, organizationId]);
        const gwId = rep.rows[0]?.google_workspace_id;
        if (!gwId) continue;
        const mgr = await db.query('SELECT email FROM organization_users WHERE id = $1 AND organization_id = $2', [r.newManagerId, organizationId]);
        const managerEmail = mgr.rows[0]?.email;
        if (!managerEmail) continue;
        const gw = await googleWorkspaceService.updateUser(organizationId, gwId, { managerEmail });
        if (!gw.success) {
          r.success = false;
          r.error = `Google Workspace rejected the manager change: ${gw.error}`;
          reassignedCount = Math.max(0, reassignedCount - 1);
        }
      } catch (e: any) {
        r.success = false;
        r.error = e?.message || 'Google Workspace update failed';
        reassignedCount = Math.max(0, reassignedCount - 1);
      }
    }

    logger.info('Direct reports reassigned', { organizationId, userId, totalReports: directReports.rows.length, reassignedCount });
    return { totalReports: directReports.rows.length, reassignedCount, results };
  }

  /**
   * Parse an optional `reassignReports` request-body value into a ReassignInput.
   * Returns null when absent; throws on a malformed value.
   */
  parseReassignInput(raw: unknown): ReassignInput | null {
    if (raw === undefined || raw === null) return null;
    const v = raw as any;
    if (v.mode === 'all_to_one' && typeof v.targetManagerId === 'string' && v.targetManagerId) {
      return { mode: 'all_to_one', targetManagerId: v.targetManagerId };
    }
    if (v.mode === 'individual' && Array.isArray(v.assignments) && v.assignments.length > 0) {
      return { mode: 'individual', assignments: v.assignments };
    }
    throw new Error('reassignReports must be { mode: "all_to_one", targetManagerId } or { mode: "individual", assignments: [{ reportId, newManagerId }] }');
  }
}

export const orgPolicyService = new OrgPolicyService();
