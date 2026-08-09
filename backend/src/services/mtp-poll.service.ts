import { db } from '../database/connection.js';
import type { MtpPollResponse } from '../types/mtp-contract.js';

/**
 * MTP poll aggregate (OpenSpec: mtp-integration, task 2.2 — design D3)
 *
 * Helios's poll payload is directory/security posture, NOT tickets: user and
 * group counts, suspended/at-risk accounts, security-event counts, and
 * Google-Workspace sync freshness. Everything is aggregated from tables the
 * sync jobs already maintain (gw_synced_users, organization_users,
 * access_groups, security_events, organization_modules) — the poll never
 * touches Google APIs, so its cost is a handful of COUNT queries.
 */

class MtpPollService {
  async getDirectorySecurityAggregate(
    organizationId: string
  ): Promise<Omit<MtpPollResponse, 'organization_id' | 'polled_at'>> {
    const [users, gwUsers, groups, securityEvents, atRisk, gwModule] =
      await Promise.all([
        // Portal directory users
        db.query(
          `SELECT
             COUNT(*)::int AS user_count,
             COUNT(*) FILTER (WHERE is_active)::int AS active_user_count
           FROM organization_users
           WHERE organization_id = $1`,
          [organizationId]
        ),
        // Google Workspace accounts (suspended = directly from GW sync)
        db.query(
          `SELECT COUNT(*) FILTER (WHERE is_suspended)::int AS suspended_user_count
           FROM gw_synced_users
           WHERE organization_id = $1`,
          [organizationId]
        ),
        // Synced groups
        db.query(
          `SELECT COUNT(*) FILTER (WHERE is_active)::int AS group_count
           FROM access_groups
           WHERE organization_id = $1`,
          [organizationId]
        ),
        // Security-event counts
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE NOT is_resolved)::int AS open_count,
             COUNT(*) FILTER (WHERE NOT is_resolved AND severity = 'critical')::int AS critical_count,
             COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS last_24h_count
           FROM security_events
           WHERE organization_id = $1`,
          [organizationId]
        ),
        // At-risk accounts: distinct users with unresolved high/critical events
        db.query(
          `SELECT COUNT(DISTINCT user_id)::int AS at_risk_count
           FROM security_events
           WHERE organization_id = $1
             AND user_id IS NOT NULL
             AND NOT is_resolved
             AND severity IN ('high', 'critical')`,
          [organizationId]
        ),
        // Google Workspace sync freshness
        db.query(
          `SELECT
             om.is_enabled,
             om.sync_status,
             om.last_sync_at,
             CASE
               WHEN om.last_sync_at IS NULL THEN NULL
               ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - om.last_sync_at)))::int
             END AS sync_age_seconds
           FROM organization_modules om
           JOIN modules m ON m.id = om.module_id
           WHERE om.organization_id = $1
             AND m.slug = 'google_workspace'`,
          [organizationId]
        ),
      ]);

    const gw = gwModule.rows[0];

    return {
      aggregates: {
        user_count: users.rows[0]?.user_count ?? 0,
        active_user_count: users.rows[0]?.active_user_count ?? 0,
        suspended_user_count: gwUsers.rows[0]?.suspended_user_count ?? 0,
        at_risk_account_count: atRisk.rows[0]?.at_risk_count ?? 0,
        group_count: groups.rows[0]?.group_count ?? 0,
        security_event_count_open: securityEvents.rows[0]?.open_count ?? 0,
        security_event_count_critical: securityEvents.rows[0]?.critical_count ?? 0,
        security_event_count_last_24h: securityEvents.rows[0]?.last_24h_count ?? 0,
      },
      google_workspace: {
        module_enabled: gw?.is_enabled === true,
        sync_status: gw?.sync_status ?? null,
        last_sync_at: gw?.last_sync_at
          ? new Date(gw.last_sync_at).toISOString()
          : null,
        sync_age_seconds: gw?.sync_age_seconds ?? null,
      },
    };
  }
}

export const mtpPollService = new MtpPollService();
