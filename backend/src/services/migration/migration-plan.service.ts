import crypto from 'crypto';
import { db } from '../../database/connection.js';
import { googleWorkspaceService } from '../google-workspace.service.js';

/**
 * Cross-cloud migration destination mapping (M365 -> Google Workspace).
 *
 * A migration PLAN pairs each M365 source user with a chosen Google destination
 * account. The destination may be a DIFFERENT user than the source (migrate a
 * departing user's mailbox into a manager's account, consolidate two M365 users
 * into one Google account, etc.). The default destination is a SAME-IDENTITY
 * proposal: the same email address, when either a Google account already exists
 * at it OR the source's domain is a verified domain of the bound Google
 * workspace (so the address can be provisioned there). Sources whose domain is
 * NOT in the workspace — external guests, *.onmicrosoft.com tenant admins — are
 * left unmapped for an explicit choice, since they cannot be recreated as-is.
 *
 * Persistence reuses the existing organization_settings key/value store — no new
 * table. The plan's target list maps 1:1 onto the migration script's source->
 * target mapping, so a reviewed/overridden plan drives the actual transfer.
 */

export interface MigrateWhat {
  mail: boolean;
  drive: boolean;
  calendar: boolean;
  contacts: boolean;
}

export interface MigrationTarget {
  sourceMs365Id: string;
  sourceUpn: string | null;
  sourceEmail: string;
  sourceName: string;
  /** Destination Google email — MAY be a different user than the source. null = unmapped. */
  targetGoogleEmail: string | null;
  /** Whether a Google account with targetGoogleEmail is known in the directory. */
  targetExists: boolean;
  transfer: MigrateWhat;
  /**
   * Destination strategy. Regular users -> 'mailbox' (a licensed Google account).
   * A SHARED mailbox has a choice: 'group' = a Google Group for NEW mail only,
   * free, but the old mail is NOT migrated ("miss old emails"); or 'delegated' =
   * a licensed Google mailbox with delegation to the team, which DOES migrate the
   * full history but costs a Google seat (no free shared-mailbox equivalent).
   */
  destinationType: 'mailbox' | 'group' | 'delegated';
  /** For 'delegated' = who gets mailbox access; for 'group' = members. */
  delegates?: string[];
  status: 'unmapped' | 'ready';
}

export interface MigrationPlan {
  organizationId: string;
  generatedAt: string;
  targets: MigrationTarget[];
}

const SETTINGS_KEY = 'migration.plan';
const DEFAULT_TRANSFER: MigrateWhat = {
  mail: true,
  drive: true,
  calendar: true,
  contacts: true,
};

function targetStatus(email: string | null): MigrationTarget['status'] {
  return email ? 'ready' : 'unmapped';
}

export class MigrationPlanService {
  /**
   * The set of VERIFIED domains of the bound Google workspace (primary +
   * secondary/alias), lowercased. Used to decide which M365 sources can default
   * to a same-identity destination. Best-effort: on any lookup failure returns an
   * empty set, degrading to "only already-existing Google accounts map" (safe).
   */
  private async getVerifiedWorkspaceDomains(organizationId: string): Promise<Set<string>> {
    try {
      const res = await googleWorkspaceService.listGoogleWorkspaceDomains(organizationId);
      if (res?.success && Array.isArray(res.domains)) {
        return new Set<string>(
          res.domains
            .filter((d: any) => d?.verified !== false)
            .map((d: any) => String(d?.domainName || '').toLowerCase())
            .filter(Boolean),
        );
      }
    } catch {
      /* fall through to empty set */
    }
    return new Set<string>();
  }

  /**
   * Build a default plan from the reconciled directory (organization_users):
   * every M365 user is a source; the default destination is a SAME-IDENTITY
   * proposal (same email) when a Google account already exists at it OR the
   * source's domain is a verified workspace domain (provisionable). Sources whose
   * domain is not in the workspace (external / *.onmicrosoft.com) are unmapped.
   */
  async generateDefaultPlan(organizationId: string): Promise<MigrationPlan> {
    const gw = await db.query(
      `SELECT LOWER(email) AS email FROM organization_users
        WHERE organization_id = $1 AND google_workspace_id IS NOT NULL`,
      [organizationId],
    );
    const googleEmails = new Set<string>(gw.rows.map((r: any) => r.email));
    const workspaceDomains = await this.getVerifiedWorkspaceDomains(organizationId);

    const ms = await db.query(
      `SELECT microsoft_365_id,
              microsoft_365_upn,
              user_type,
              LOWER(email) AS email,
              COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name
         FROM organization_users
        WHERE organization_id = $1 AND microsoft_365_id IS NOT NULL
        ORDER BY email`,
      [organizationId],
    );

    const targets: MigrationTarget[] = ms.rows.map((r: any) => {
      const sameEmailExists = googleEmails.has(r.email);
      const srcDomain = r.email.includes('@') ? r.email.split('@').pop()! : '';
      // Same-identity: use the same address if a Google account already exists at
      // it, or if its domain is a verified workspace domain (then it can be
      // provisioned there). Otherwise leave unmapped for an explicit choice.
      const sameIdentityEligible = sameEmailExists || workspaceDomains.has(srcDomain);
      const targetGoogleEmail = sameIdentityEligible ? r.email : null;
      // A 'contact' is our unlicensed / shared-mailbox candidate. Default it to a
      // delegated licensed mailbox (keeps history, safe) — the admin can switch it
      // to 'group' to save the seat at the cost of not migrating old mail.
      const isShared = r.user_type === 'contact';
      return {
        sourceMs365Id: r.microsoft_365_id,
        sourceUpn: r.microsoft_365_upn ?? null,
        sourceEmail: r.email,
        sourceName: r.name,
        targetGoogleEmail,
        targetExists: sameEmailExists,
        transfer: { ...DEFAULT_TRANSFER },
        destinationType: isShared ? 'delegated' : 'mailbox',
        status: targetStatus(targetGoogleEmail),
      };
    });

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      targets,
    };
  }

  /**
   * Override a target's destination — supports migrating source X into a
   * DIFFERENT Google account Y. Re-checks whether Y exists in the directory so
   * the plan can warn that Y must be created + licensed before it can receive.
   */
  async setDestination(
    plan: MigrationPlan,
    sourceMs365Id: string,
    targetGoogleEmail: string | null,
    transfer?: Partial<MigrateWhat>,
  ): Promise<MigrationPlan> {
    const email = targetGoogleEmail ? targetGoogleEmail.toLowerCase() : null;

    let exists = false;
    if (email) {
      const r = await db.query(
        `SELECT 1 FROM organization_users
          WHERE organization_id = $1 AND LOWER(email) = $2 AND google_workspace_id IS NOT NULL
          LIMIT 1`,
        [plan.organizationId, email],
      );
      exists = r.rows.length > 0;
    }

    const targets = plan.targets.map((t) =>
      t.sourceMs365Id === sourceMs365Id
        ? {
            ...t,
            targetGoogleEmail: email,
            targetExists: exists,
            transfer: transfer ? { ...t.transfer, ...transfer } : t.transfer,
            status: targetStatus(email),
          }
        : t,
    );

    return { ...plan, targets };
  }

  /**
   * Re-derive targetExists + status for every target against the CURRENT set of
   * Google accounts. Used when persisting a client-edited plan so existence is
   * server-authoritative (client flags are not trusted).
   */
  async reconcileExistence(plan: MigrationPlan): Promise<MigrationPlan> {
    const gw = await db.query(
      `SELECT LOWER(email) AS email FROM organization_users
        WHERE organization_id = $1 AND google_workspace_id IS NOT NULL`,
      [plan.organizationId],
    );
    const googleEmails = new Set<string>(gw.rows.map((r: any) => r.email));

    const targets = plan.targets.map((t) => {
      const email = t.targetGoogleEmail ? t.targetGoogleEmail.toLowerCase() : null;
      return {
        ...t,
        targetGoogleEmail: email,
        targetExists: email ? googleEmails.has(email) : false,
        status: targetStatus(email),
      };
    });
    return { ...plan, targets };
  }

  /**
   * Validate before an executable run. A destination that does not yet exist in
   * the directory is flagged: you must create + license the Google account
   * (it needs a mailbox/Drive) before it can receive a transfer.
   */
  validatePlan(plan: MigrationPlan): {
    ok: boolean;
    unmapped: string[];
    missingDestination: string[];
    readyCount: number;
  } {
    const unmapped = plan.targets
      .filter((t) => !t.targetGoogleEmail)
      .map((t) => t.sourceEmail);
    const missingDestination = plan.targets
      .filter((t) => t.targetGoogleEmail && !t.targetExists)
      .map((t) => `${t.sourceEmail} -> ${t.targetGoogleEmail}`);
    const readyCount = plan.targets.filter(
      (t) => t.targetGoogleEmail && t.targetExists,
    ).length;
    return {
      ok: unmapped.length === 0 && missingDestination.length === 0,
      unmapped,
      missingDestination,
      readyCount,
    };
  }

  /** Persist the plan into the organization_settings key/value store (no new table). */
  async savePlan(plan: MigrationPlan): Promise<void> {
    const value = JSON.stringify(plan);
    const existing = await db.query(
      'SELECT id FROM organization_settings WHERE organization_id = $1 AND key = $2',
      [plan.organizationId, SETTINGS_KEY],
    );
    if (existing.rows.length > 0) {
      await db.query(
        'UPDATE organization_settings SET value = $1, updated_at = NOW() WHERE id = $2',
        [value, existing.rows[0].id],
      );
    } else {
      await db.query(
        `INSERT INTO organization_settings (organization_id, key, value, is_sensitive, created_at, updated_at)
         VALUES ($1, $2, $3, false, NOW(), NOW())`,
        [plan.organizationId, SETTINGS_KEY, value],
      );
    }
  }

  async loadPlan(organizationId: string): Promise<MigrationPlan | null> {
    const r = await db.query(
      'SELECT value FROM organization_settings WHERE organization_id = $1 AND key = $2',
      [organizationId, SETTINGS_KEY],
    );
    const raw = r.rows?.[0]?.value;
    if (!raw) return null;
    try {
      const plan = JSON.parse(raw) as MigrationPlan;
      // Forward-compat: backfill fields added after a plan was persisted so older
      // stored plans keep working (e.g. destinationType, added for shared-mailbox
      // group-vs-delegated choice).
      plan.targets = (plan.targets || []).map((t) => ({
        destinationType: 'mailbox' as const,
        ...t,
      }));
      return plan;
    } catch {
      return null;
    }
  }

  /**
   * The source->target email map the migration script consumes (--map), built
   * from the READY targets of a plan. Unmapped/missing-destination targets are
   * excluded so a run never imports into a non-existent mailbox.
   */
  toScriptMap(plan: MigrationPlan): Record<string, string> {
    const map: Record<string, string> = {};
    for (const t of plan.targets) {
      if (t.targetGoogleEmail && t.targetExists) {
        map[t.sourceUpn || t.sourceEmail] = t.targetGoogleEmail;
      }
    }
    return map;
  }

  /**
   * Emit the source->destination mapping as CSV for GOOGLE'S NATIVE Data
   * Migration / Data Import (Exchange Online -> Gmail, OneDrive -> Drive), which
   * ingests a source-email -> destination-Google-email mapping and REQUIRES both
   * accounts to already exist. Only READY targets (destination chosen AND known
   * to exist) are included, so the import never targets a missing mailbox. This
   * is the primary output now that Google's native tool does the transfer; the
   * legacy `toScriptMap` feeds the throwaway custom script fallback. Adjust the
   * header row to match the exact columns your Google import tool expects.
   */
  toGoogleMigrationCsv(plan: MigrationPlan): string {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows: string[] = ['Source Email,Destination Email'];
    for (const t of plan.targets) {
      // 'group' destinations are excluded — a Google Group cannot receive
      // imported mail history (that source's old mail is intentionally not migrated).
      if (t.targetGoogleEmail && t.targetExists && t.destinationType !== 'group') {
        rows.push(`${esc(t.sourceEmail)},${esc(t.targetGoogleEmail)}`);
      }
    }
    return rows.join('\n') + '\n';
  }

  /**
   * Provision the Google DESTINATIONS the plan needs. Google's native importer
   * NEVER creates accounts, so for each target whose chosen Google address does
   * not exist yet, create the account (name carried from the M365 source; the
   * new account auto-consumes a license so it can receive mail/Drive — note that
   * shared mailboxes therefore cost a Google seat, there is no free equivalent).
   * DRY-RUN by default: execute=false only lists what WOULD be created.
   * Requires the destination domain to already be added to the Google workspace.
   */
  async provisionMigrationDestinations(
    organizationId: string,
    execute = false,
  ): Promise<{
    execute: boolean;
    created: number;
    wouldCreate: number;
    results: Array<{ source: string; target?: string; action: string; error?: string }>;
  }> {
    const base =
      (await this.loadPlan(organizationId)) ??
      (await this.generateDefaultPlan(organizationId));
    const plan = await this.reconcileExistence(base);
    const results: Array<{ source: string; target?: string; action: string; error?: string }> = [];

    for (const t of plan.targets) {
      if (!t.targetGoogleEmail) {
        results.push({ source: t.sourceEmail, action: 'skipped-unmapped' });
        continue;
      }
      if (t.targetExists) {
        results.push({ source: t.sourceEmail, target: t.targetGoogleEmail, action: 'exists' });
        continue;
      }
      if (!execute) {
        results.push({
          source: t.sourceEmail,
          target: t.targetGoogleEmail,
          action: `would-create-${t.destinationType}`,
        });
        continue;
      }

      if (t.destinationType === 'group') {
        // A Google Group — free, receives NEW mail only (no history import).
        const gres = await googleWorkspaceService.createGroup(
          organizationId,
          t.targetGoogleEmail,
          t.sourceName || t.targetGoogleEmail,
          `Migrated shared mailbox (${t.sourceEmail})`,
        );
        const ok = gres && gres.success !== false;
        if (ok) {
          for (const m of t.delegates || []) {
            try {
              await googleWorkspaceService.addGroupMember(organizationId, t.targetGoogleEmail, m);
            } catch { /* best-effort membership */ }
          }
        }
        results.push({
          source: t.sourceEmail,
          target: t.targetGoogleEmail,
          action: ok ? 'created-group' : 'error',
          ...(ok ? {} : { error: gres?.error || 'group create failed' }),
        });
        continue;
      }

      // 'mailbox' or 'delegated' — a licensed Google account.
      const parts = (t.sourceName || '').trim().split(/\s+/).filter(Boolean);
      const firstName = parts[0] || t.sourceEmail.split('@')[0];
      const lastName = parts.slice(1).join(' ') || firstName;
      const res = await googleWorkspaceService.createUser(organizationId, {
        email: t.targetGoogleEmail,
        firstName,
        lastName,
        // Strong random temp password (meets Google complexity); force reset.
        password: crypto.randomBytes(18).toString('base64') + 'Aa1!',
        changePasswordAtNextLogin: true,
      });
      if (res.success && t.destinationType === 'delegated') {
        for (const d of t.delegates || []) {
          try {
            await googleWorkspaceService.addGmailDelegate(organizationId, t.targetGoogleEmail, d);
          } catch { /* best-effort delegation */ }
        }
      }
      results.push({
        source: t.sourceEmail,
        target: t.targetGoogleEmail,
        action: res.success
          ? t.destinationType === 'delegated'
            ? 'created-delegated'
            : 'created'
          : 'error',
        ...(res.error ? { error: res.error } : {}),
      });
    }

    return {
      execute,
      created: results.filter((r) => r.action.startsWith('created')).length,
      wouldCreate: results.filter((r) => r.action.startsWith('would-create')).length,
      results,
    };
  }
}

export const migrationPlanService = new MigrationPlanService();
