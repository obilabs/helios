/**
 * API Relay Authorization — rule/config storage (the DB-backed half).
 *
 * Loads a `RuleSet` + `RelayConfig` for an organization from the tables created
 * by migration 063 (relay_config, relay_rules). The policy engine itself stays
 * pure; this module is the only place the relay touches the database.
 *
 * Fail-closed properties:
 *   - No relay_config row  => { relayEnabled: false, writesEnabled: false }
 *     (a fresh org is CLOSED until an admin opts in).
 *   - No rules             => empty RuleSet => evaluate() default-denies.
 *   - A DB error propagates to the caller, which must NOT forward the request
 *     (the proxy's error handler returns 500 without proxying).
 *
 * Rule AUTHORING (admin UI / endpoint library) is a later phase — tests seed
 * rows directly via `seedRelayRule` / `setRelayConfig`.
 */
import { db } from '../../database/connection.js';
import type { RelayConfig, Rule, RuleSet } from './policy.js';

/** Load the per-organization dark-launch toggles. Missing row = closed. */
export async function loadRelayConfig(organizationId: string): Promise<RelayConfig> {
  const result = await db.query(
    'SELECT relay_enabled, writes_enabled FROM relay_config WHERE organization_id = $1',
    [organizationId],
  );
  if (result.rows.length === 0) {
    return { relayEnabled: false, writesEnabled: false };
  }
  const row = result.rows[0];
  return {
    relayEnabled: row.relay_enabled === true,
    writesEnabled: row.writes_enabled === true,
  };
}

interface RelayRuleRow {
  id: string;
  effect: 'allow' | 'deny';
  match_pattern: string;
  subject_allow_privileged: boolean;
  subject_org_units: string[] | null;
  expires_at: string | Date | null;
}

function rowToRule(row: RelayRuleRow): Rule {
  const rule: Rule = {
    effect: row.effect,
    match: row.match_pattern,
    id: row.id,
  };
  if (row.expires_at) {
    rule.expiresAt = new Date(row.expires_at).getTime();
  }
  const orgUnits = Array.isArray(row.subject_org_units) ? row.subject_org_units : undefined;
  if (row.subject_allow_privileged === true || orgUnits) {
    rule.subject = {};
    if (row.subject_allow_privileged === true) rule.subject.allowPrivileged = true;
    if (orgUnits) rule.subject.orgUnits = orgUnits;
  }
  return rule;
}

/**
 * Load the organization's rule set. Deny rules are org-wide and absolute;
 * allow rules are the additive union. Group-membership scoping
 * (access_group_id) arrives with the admin UI — until rules are authored
 * per-group, all of the org's allow rules apply (an empty table still means
 * default-deny, so nothing is reachable until an admin creates rules).
 */
export async function loadRelayRuleSet(organizationId: string): Promise<RuleSet> {
  const result = await db.query(
    `SELECT id, effect, match_pattern, subject_allow_privileged, subject_org_units, expires_at
     FROM relay_rules
     WHERE organization_id = $1`,
    [organizationId],
  );
  const rules: Rule[] = result.rows.map((row: RelayRuleRow) => rowToRule(row));
  const orgDenies = rules.filter((r) => r.effect === 'deny');
  const groupAllows = rules.filter((r) => r.effect === 'allow');
  return { orgDenies, groupAllows };
}

/** Convenience: load config + rules together (one org, two queries). */
export async function loadRelayAuthorization(
  organizationId: string,
): Promise<{ config: RelayConfig; ruleSet: RuleSet }> {
  const [config, ruleSet] = await Promise.all([
    loadRelayConfig(organizationId),
    loadRelayRuleSet(organizationId),
  ]);
  return { config, ruleSet };
}

/**
 * Upsert the org's relay toggles. Used by tests and (later) the admin surface.
 * Enabling the relay does NOT enable writes — they are independent columns.
 */
export async function setRelayConfig(
  organizationId: string,
  config: RelayConfig,
): Promise<void> {
  await db.query(
    `INSERT INTO relay_config (organization_id, relay_enabled, writes_enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id)
     DO UPDATE SET relay_enabled = EXCLUDED.relay_enabled,
                   writes_enabled = EXCLUDED.writes_enabled,
                   updated_at = NOW()`,
    [organizationId, config.relayEnabled, config.writesEnabled],
  );
}

/** Insert a rule row. Test/seed helper — the admin UI is a later phase. */
export async function seedRelayRule(
  organizationId: string,
  rule: Rule,
): Promise<string> {
  const result = await db.query(
    `INSERT INTO relay_rules
       (organization_id, effect, match_pattern, subject_allow_privileged, subject_org_units, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      organizationId,
      rule.effect,
      rule.match,
      rule.subject?.allowPrivileged === true,
      rule.subject?.orgUnits ? JSON.stringify(rule.subject.orgUnits) : null,
      rule.expiresAt !== undefined ? new Date(rule.expiresAt) : null,
    ],
  );
  return result.rows[0].id;
}

// ---------------------------------------------------------------------------
// Admin authoring surface (relay.routes.ts). These back the GET/PUT config and
// list/create/delete rules endpoints. They are the ONLY writers besides the
// test seed helpers above, and every one is org-scoped so an admin can never
// touch another organization's rules.
// ---------------------------------------------------------------------------

/** A relay rule as presented to the admin UI (camelCase, full row). */
export interface StoredRelayRule {
  id: string;
  effect: 'allow' | 'deny';
  matchPattern: string;
  subjectAllowPrivileged: boolean;
  subjectOrgUnits: string[] | null;
  expiresAt: string | null;
  accessGroupId: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

interface StoredRelayRuleRow extends RelayRuleRow {
  access_group_id: string | null;
  created_by: string | null;
  created_at: string | Date | null;
}

function rowToStoredRule(row: StoredRelayRuleRow): StoredRelayRule {
  return {
    id: row.id,
    effect: row.effect,
    matchPattern: row.match_pattern,
    subjectAllowPrivileged: row.subject_allow_privileged === true,
    subjectOrgUnits: Array.isArray(row.subject_org_units) ? row.subject_org_units : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    accessGroupId: row.access_group_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/** Input shape for authoring a rule from the admin surface. */
export interface CreateRelayRuleInput {
  effect: 'allow' | 'deny';
  matchPattern: string;
  subjectAllowPrivileged?: boolean;
  subjectOrgUnits?: string[] | null;
  /** ISO-8601 string or null (no expiry). */
  expiresAt?: string | null;
  accessGroupId?: string | null;
}

/** List an organization's relay rules (deny rules first, then newest allows). */
export async function listRelayRules(organizationId: string): Promise<StoredRelayRule[]> {
  const result = await db.query(
    `SELECT id, effect, match_pattern, subject_allow_privileged, subject_org_units,
            expires_at, access_group_id, created_by, created_at
       FROM relay_rules
      WHERE organization_id = $1
      ORDER BY effect DESC, created_at DESC`,
    [organizationId],
  );
  return result.rows.map((row: StoredRelayRuleRow) => rowToStoredRule(row));
}

/** Create a relay rule for an organization. Returns the stored row. */
export async function createRelayRule(
  organizationId: string,
  input: CreateRelayRuleInput,
  createdBy?: string | null,
): Promise<StoredRelayRule> {
  const result = await db.query(
    `INSERT INTO relay_rules
       (organization_id, effect, match_pattern, subject_allow_privileged,
        subject_org_units, expires_at, access_group_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, effect, match_pattern, subject_allow_privileged, subject_org_units,
               expires_at, access_group_id, created_by, created_at`,
    [
      organizationId,
      input.effect,
      input.matchPattern,
      input.subjectAllowPrivileged === true,
      input.subjectOrgUnits && input.subjectOrgUnits.length > 0
        ? JSON.stringify(input.subjectOrgUnits)
        : null,
      input.expiresAt ? new Date(input.expiresAt) : null,
      input.accessGroupId ?? null,
      createdBy ?? null,
    ],
  );
  return rowToStoredRule(result.rows[0]);
}

/**
 * Delete one relay rule, scoped to the organization. Returns true if a row was
 * removed (false = not found / belongs to another org — never a cross-org
 * delete).
 */
export async function deleteRelayRule(
  organizationId: string,
  ruleId: string,
): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM relay_rules WHERE id = $1 AND organization_id = $2',
    [ruleId, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}
