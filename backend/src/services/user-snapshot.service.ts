/**
 * Pre-change snapshot of a user's Google Workspace state, and re-creation from it.
 *
 * Google keeps a deleted user for 20 days; after that users.undelete fails and
 * the account is gone. Helios takes a snapshot BEFORE it suspends, offboards or
 * deletes a Google-bound user, so Restore can fall back to re-creating the
 * account (profile, groups, licence) when Google can no longer undelete it.
 *
 * Capture is best-effort per section: a section that fails is listed in
 * `partial` rather than blocking the change. Profile is the one section that
 * must succeed, since re-creation is impossible without it.
 */
import crypto from 'node:crypto';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { googleWorkspaceService } from './google-workspace.service.js';

export type SnapshotReason = 'offboard' | 'suspend' | 'delete' | 'manual';

export interface UserSnapshotBody {
  profile: Record<string, any>;
  groups: Array<{ id?: string; email: string; name?: string }>;
  licenses: Array<{ productId: string; skuId: string; skuName?: string }>;
  mail: {
    forwarding?: { enabled: boolean; emailAddress?: string; disposition?: string };
    vacation?: { enabled: boolean; subject?: string; message?: string };
    delegates?: Array<{ email: string; verificationStatus?: string }>;
  };
  signature: string | null;
  partial: string[];
}

export interface UserSnapshotRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  google_workspace_id: string | null;
  primary_email: string;
  reason: SnapshotReason;
  snapshot: UserSnapshotBody;
  taken_at: string;
  taken_by: string | null;
  restored_at: string | null;
  restored_google_workspace_id: string | null;
}

export interface CaptureInput {
  userId?: string | null;
  googleWorkspaceId: string;
  primaryEmail: string;
  reason: SnapshotReason;
  takenBy?: string | null;
}

export class UserSnapshotService {
  /** Take a snapshot. Returns the stored row, or an error when the profile could not be read. */
  async capture(organizationId: string, input: CaptureInput): Promise<{ success: boolean; snapshot?: UserSnapshotRow; error?: string }> {
    const partial: string[] = [];

    const raw = await googleWorkspaceService.getUserRaw(organizationId, input.googleWorkspaceId);
    if (!raw.success || !raw.user) {
      return { success: false, error: `Could not read the Google user record: ${raw.error || 'unknown error'}` };
    }
    const profile = raw.user;
    const email = profile.primaryEmail || input.primaryEmail;

    let groups: UserSnapshotBody['groups'] = [];
    try {
      const g = await googleWorkspaceService.getUserGroups(organizationId, input.googleWorkspaceId);
      if (g?.success && Array.isArray(g.data)) {
        groups = g.data.map((x: any) => ({ id: x.id, email: x.email, name: x.name }));
      } else {
        partial.push('groups');
      }
    } catch {
      partial.push('groups');
    }

    let licenses: UserSnapshotBody['licenses'] = [];
    try {
      const l = await googleWorkspaceService.getUserGoogleLicenses(organizationId, email);
      if (l.success && l.licenses) licenses = l.licenses;
      else partial.push('licenses');
    } catch {
      partial.push('licenses');
    }

    const mail: UserSnapshotBody['mail'] = {};
    try {
      const m = await googleWorkspaceService.getEmailSettings(organizationId, email);
      if (m.success && m.settings) {
        mail.forwarding = m.settings.forwarding;
        mail.vacation = m.settings.vacation;
      } else {
        partial.push('mail');
      }
    } catch {
      partial.push('mail');
    }
    try {
      const d = await googleWorkspaceService.listGmailDelegates(organizationId, email);
      if (d.success) mail.delegates = d.delegates || [];
      else partial.push('delegates');
    } catch {
      partial.push('delegates');
    }

    let signature: string | null = null;
    try {
      const sig = await googleWorkspaceService.getUserSignature(organizationId, email);
      if (sig.success) signature = sig.signature ?? null;
      else partial.push('signature');
    } catch {
      partial.push('signature');
    }

    const body: UserSnapshotBody = { profile, groups, licenses, mail, signature, partial };
    const r = await db.query(
      `INSERT INTO user_google_snapshots
         (organization_id, user_id, google_workspace_id, primary_email, reason, snapshot, taken_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING *`,
      [organizationId, input.userId || null, input.googleWorkspaceId, email, input.reason, JSON.stringify(body), input.takenBy || null],
    );
    logger.info('User snapshot taken', { organizationId, email, reason: input.reason, partial });
    return { success: true, snapshot: r.rows[0] as UserSnapshotRow };
  }

  /** Newest snapshot for a Helios user (by row id, then by email as a fallback). */
  async latest(organizationId: string, userId: string, primaryEmail?: string): Promise<UserSnapshotRow | null> {
    const r = await db.query(
      `SELECT * FROM user_google_snapshots
        WHERE organization_id = $1 AND (user_id = $2 OR ($3::text IS NOT NULL AND primary_email = $3))
        ORDER BY taken_at DESC LIMIT 1`,
      [organizationId, userId, primaryEmail || null],
    );
    return (r.rows[0] as UserSnapshotRow) || null;
  }

  async list(organizationId: string, userId: string): Promise<UserSnapshotRow[]> {
    const r = await db.query(
      `SELECT id, organization_id, user_id, google_workspace_id, primary_email, reason, taken_at, taken_by,
              restored_at, restored_google_workspace_id,
              jsonb_build_object(
                'groups', jsonb_array_length(COALESCE(snapshot->'groups', '[]'::jsonb)),
                'licenses', jsonb_array_length(COALESCE(snapshot->'licenses', '[]'::jsonb)),
                'partial', COALESCE(snapshot->'partial', '[]'::jsonb),
                'orgUnitPath', snapshot->'profile'->>'orgUnitPath'
              ) AS snapshot
         FROM user_google_snapshots
        WHERE organization_id = $1 AND user_id = $2
        ORDER BY taken_at DESC`,
      [organizationId, userId],
    );
    return r.rows as UserSnapshotRow[];
  }

  /**
   * Re-create the Google account from a snapshot: users.insert from the stored
   * profile, then groups and licence. Mail settings and signature are NOT
   * replayed (forwarding, delegation and auto-reply were offboarding artifacts).
   * Returns the new Google id and what could not be restored.
   */
  async recreate(
    organizationId: string,
    snapshotId: string,
    options: { actorId?: string | null; primaryEmailOverride?: string } = {},
  ): Promise<{ success: boolean; googleWorkspaceId?: string; primaryEmail?: string; restored?: { groups: number; licenses: number }; failures?: string[]; error?: string }> {
    const r = await db.query('SELECT * FROM user_google_snapshots WHERE id = $1 AND organization_id = $2', [snapshotId, organizationId]);
    const row = r.rows[0] as UserSnapshotRow | undefined;
    if (!row) return { success: false, error: 'Snapshot not found' };
    const body = row.snapshot;
    if (!body?.profile?.primaryEmail) return { success: false, error: 'Snapshot has no profile to re-create from' };

    const password = crypto.randomBytes(18).toString('base64url');
    const created = await googleWorkspaceService.createUserFromRecord(organizationId, body.profile, {
      password,
      changePasswordAtNextLogin: true,
      primaryEmail: options.primaryEmailOverride,
    });
    if (!created.success || !created.userId) {
      return { success: false, error: `Google refused the re-create: ${created.error || 'unknown error'}` };
    }
    const newId = created.userId;
    const email = (options.primaryEmailOverride || body.profile.primaryEmail) as string;
    const failures: string[] = [];

    let groupsRestored = 0;
    for (const g of body.groups || []) {
      // Google reads lag writes by a few seconds; a fresh account is "not found" briefly.
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        if (attempt > 0) await new Promise((res) => setTimeout(res, 3000 * attempt));
        try {
          const a = await googleWorkspaceService.addUserToGroup(organizationId, email, g.email);
          ok = !!a?.success;
          if (!ok && !/not found/i.test(String(a?.error || ''))) break;
        } catch (e: any) {
          if (!/not found/i.test(String(e?.message || ''))) break;
        }
      }
      if (ok) groupsRestored++;
      else failures.push(`group ${g.email}`);
    }

    let licensesRestored = 0;
    for (const l of body.licenses || []) {
      try {
        const a = await googleWorkspaceService.assignGoogleLicense(organizationId, email, l.skuId, l.productId);
        if (a.success) licensesRestored++;
        else failures.push(`licence ${l.skuId}: ${a.error || 'refused'}`);
      } catch (e: any) {
        failures.push(`licence ${l.skuId}: ${e?.message || e}`);
      }
    }

    await db.query(
      'UPDATE user_google_snapshots SET restored_at = NOW(), restored_google_workspace_id = $3 WHERE id = $1 AND organization_id = $2',
      [snapshotId, organizationId, newId],
    );
    logger.info('User re-created from snapshot', { organizationId, email, newId, groupsRestored, licensesRestored, failures, actor: options.actorId });
    return { success: true, googleWorkspaceId: newId, primaryEmail: email, restored: { groups: groupsRestored, licenses: licensesRestored }, failures };
  }
}

export const userSnapshotService = new UserSnapshotService();
