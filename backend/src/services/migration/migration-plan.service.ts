import { db } from '../../database/connection.js';

/**
 * Cross-cloud migration destination mapping (M365 -> Google Workspace).
 *
 * A migration PLAN pairs each M365 source user with a chosen Google destination
 * account. The destination may be a DIFFERENT user than the source (migrate a
 * departing user's mailbox into a manager's account, consolidate two M365 users
 * into one Google account, etc.). The default destination is the same email if a
 * Google account with that address already exists in the reconciled directory;
 * otherwise the target is left unmapped for an explicit choice.
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
   * Build a default plan from the reconciled directory (organization_users):
   * every M365 user is a source; the default destination is the same email when
   * a Google account with that address exists, else unmapped for explicit choice.
   */
  async generateDefaultPlan(organizationId: string): Promise<MigrationPlan> {
    const gw = await db.query(
      `SELECT LOWER(email) AS email FROM organization_users
        WHERE organization_id = $1 AND google_workspace_id IS NOT NULL`,
      [organizationId],
    );
    const googleEmails = new Set<string>(gw.rows.map((r: any) => r.email));

    const ms = await db.query(
      `SELECT microsoft_365_id,
              microsoft_365_upn,
              LOWER(email) AS email,
              COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) AS name
         FROM organization_users
        WHERE organization_id = $1 AND microsoft_365_id IS NOT NULL
        ORDER BY email`,
      [organizationId],
    );

    const targets: MigrationTarget[] = ms.rows.map((r: any) => {
      const sameEmailExists = googleEmails.has(r.email);
      const targetGoogleEmail = sameEmailExists ? r.email : null;
      return {
        sourceMs365Id: r.microsoft_365_id,
        sourceUpn: r.microsoft_365_upn ?? null,
        sourceEmail: r.email,
        sourceName: r.name,
        targetGoogleEmail,
        targetExists: sameEmailExists,
        transfer: { ...DEFAULT_TRANSFER },
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
      return JSON.parse(raw) as MigrationPlan;
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
}

export const migrationPlanService = new MigrationPlanService();
