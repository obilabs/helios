/**
 * Feature registry — the ONE place a Helios feature flag is defined.
 *
 * Every flag that gates a page, nav item, settings tab or panel lives here, with
 * its maturity. The database stores only per-organization OVERRIDES (rows with
 * `is_override = true` in `feature_flags`); defaults are never duplicated into
 * SQL. The frontend never hard-codes defaults either: it asks the API for the
 * resolved map.
 *
 * Maturity and the release profile (HELIOS_FEATURE_PROFILE):
 *
 *   | maturity     | development | release                                  |
 *   |--------------|-------------|------------------------------------------|
 *   | stable       | on          | on                                       |
 *   | preview      | on          | off by default; an admin may enable it   |
 *   | experimental | on          | unavailable — cannot be enabled          |
 *
 * `core.*` flags are `required`: they are always on and cannot be switched off
 * (turning off Settings would lock an admin out of turning it back on).
 *
 * `operational` flags are runtime switches rather than product surfaces (e.g.
 * the API relay enforcement toggle). The profile does not touch them: they keep
 * their `defaultEnabled` until an admin overrides it.
 *
 * Promoting a feature (preview -> stable) is a one-line change here, and is
 * governed by docs/RELEASING.md.
 *
 * This file must stay dependency-free: the frontend's navigation test imports it
 * directly to prove every nav item is tied to a registered flag.
 */

export type FeatureMaturity = 'stable' | 'preview' | 'experimental';
export type FeatureProfile = 'release' | 'development';

export interface FeatureDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  maturity: FeatureMaturity;
  /** Always on, cannot be disabled. Only `core.*` flags. */
  required?: boolean;
  /** Runtime switch, not a product surface: profile-independent. */
  operational?: boolean;
  /** Default for `operational` flags only. */
  defaultEnabled?: boolean;
}

export const FEATURE_REGISTRY: readonly FeatureDefinition[] = [
  // ── Core (required) ────────────────────────────────────────────────────────
  { key: 'core.dashboard', name: 'Home', description: 'Setup checklist, alerts and recent activity', category: 'core', maturity: 'stable', required: true },
  { key: 'core.users', name: 'Users', description: 'User directory and user creation', category: 'core', maturity: 'stable', required: true },
  { key: 'core.settings', name: 'Settings', description: 'Google Workspace connection, organization, roles, security and advanced settings', category: 'core', maturity: 'stable', required: true },
  { key: 'core.profile', name: 'My Profile', description: 'The signed-in user\'s own profile', category: 'core', maturity: 'stable', required: true },

  // ── Directory ──────────────────────────────────────────────────────────────
  { key: 'directory.groups', name: 'Groups', description: 'Google Groups management', category: 'directory', maturity: 'stable' },
  { key: 'directory.group_scenarios', name: 'Group scenarios', description: 'Create Google Groups from a use-case scenario that applies and verifies the group settings (needs the optional Groups Settings scope)', category: 'directory', maturity: 'preview' },
  { key: 'directory.org_units', name: 'Org Units', description: 'Organizational unit management', category: 'directory', maturity: 'stable' },
  { key: 'directory.org_chart', name: 'Org Chart', description: 'Manager hierarchy chart', category: 'directory', maturity: 'preview' },
  { key: 'directory.bulk_operations', name: 'Bulk Operations', description: 'Mass user and group changes from CSV', category: 'directory', maturity: 'preview' },
  { key: 'directory.migration', name: 'Migration', description: 'Microsoft 365 to Google Workspace migration', category: 'directory', maturity: 'preview' },
  { key: 'directory.delegations', name: 'Delegations', description: 'Gmail delegate access across the workspace', category: 'directory', maturity: 'preview' },
  { key: 'directory.workspaces', name: 'Spaces', description: 'Collaboration spaces (Google Chat spaces, Microsoft Teams)', category: 'directory', maturity: 'experimental' },

  // ── Signatures ─────────────────────────────────────────────────────────────
  { key: 'signatures', name: 'Signatures', description: 'Email signature templates and assignments', category: 'signatures', maturity: 'stable' },

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  { key: 'lifecycle.onboarding', name: 'Onboarding templates', description: 'Onboarding templates and new-user onboarding runs', category: 'lifecycle', maturity: 'stable' },
  { key: 'lifecycle.offboarding', name: 'Offboarding templates', description: 'Offboarding templates and user offboarding runs', category: 'lifecycle', maturity: 'stable' },
  { key: 'lifecycle.requests', name: 'Requests', description: 'Lifecycle request intake', category: 'lifecycle', maturity: 'experimental' },
  { key: 'lifecycle.tasks', name: 'My Tasks', description: 'Lifecycle task dashboard', category: 'lifecycle', maturity: 'experimental' },
  { key: 'lifecycle.training', name: 'Training', description: 'Training content', category: 'lifecycle', maturity: 'experimental' },
  { key: 'automation.scheduled_actions', name: 'Scheduled Actions', description: 'View and manage scheduled automation tasks', category: 'lifecycle', maturity: 'preview' },
  { key: 'automation.rules_engine', name: 'Rules Engine', description: 'Condition-based automation rules', category: 'lifecycle', maturity: 'experimental' },

  // ── Security ───────────────────────────────────────────────────────────────
  { key: 'security.events', name: 'Security events', description: 'Security event feed', category: 'security', maturity: 'stable' },
  { key: 'security.oauth_apps', name: 'OAuth apps', description: 'Third-party apps with access to the workspace', category: 'security', maturity: 'stable' },
  { key: 'security.external_sharing', name: 'External sharing', description: 'Files shared outside the organization', category: 'security', maturity: 'stable' },
  { key: 'security.audit_log', name: 'Audit log', description: 'Administrative audit trail', category: 'security', maturity: 'stable' },
  { key: 'security.mail_search', name: 'Mail Search', description: 'Search mail across the workspace', category: 'security', maturity: 'preview' },
  { key: 'security.licenses', name: 'Licenses', description: 'License inventory (Microsoft 365-heavy)', category: 'security', maturity: 'preview' },
  { key: 'api_relay', name: 'API Relay Authorization', description: 'Enforce deny-by-default authorization rules on the transparent Google API proxy. When disabled, the proxy passes requests through unchanged.', category: 'security', maturity: 'stable', operational: true, defaultEnabled: false },

  // ── Insights & assets ──────────────────────────────────────────────────────
  { key: 'insights.hr_dashboard', name: 'HR Dashboard', description: 'HR lifecycle dashboard', category: 'insights', maturity: 'experimental' },
  { key: 'insights.manager_dashboard', name: 'Manager Dashboard', description: 'Manager lifecycle dashboard', category: 'insights', maturity: 'experimental' },
  { key: 'insights.lifecycle_analytics', name: 'Lifecycle Analytics', description: 'Lifecycle analytics', category: 'insights', maturity: 'experimental' },
  { key: 'assets.it_assets', name: 'IT Assets', description: 'IT asset management', category: 'assets', maturity: 'experimental' },
  { key: 'assets.media_files', name: 'Media Files', description: 'Media file library', category: 'assets', maturity: 'experimental' },

  // ── Employee view ──────────────────────────────────────────────────────────
  { key: 'employee_view', name: 'Employee view', description: 'Employee-facing portal (people directory, my team, my groups) and the admin/employee view switcher', category: 'employee', maturity: 'preview' },
  { key: 'employee.settings', name: 'Employee settings', description: 'Personal settings page in the employee view', category: 'employee', maturity: 'experimental' },
  { key: 'employee.onboarding_portal', name: 'My Onboarding', description: 'Employee onboarding portal', category: 'employee', maturity: 'experimental' },

  // ── Settings & platform ────────────────────────────────────────────────────
  { key: 'developer.tools', name: 'Developer tools', description: 'API keys, API documentation and the Developer Console (Settings > Advanced)', category: 'platform', maturity: 'stable' },
  { key: 'integrations.microsoft_365', name: 'Microsoft 365', description: 'Microsoft 365 connection module in Settings', category: 'platform', maturity: 'preview' },
  { key: 'settings.ai_assistant', name: 'AI Assistant', description: 'Optional AI help and command assistant', category: 'platform', maturity: 'preview' },
  { key: 'settings.customization', name: 'Customization', description: 'Entity labels and branding links', category: 'platform', maturity: 'preview' },
  { key: 'settings.master_data', name: 'Master Data', description: 'Departments, locations, cost centers and job titles', category: 'platform', maturity: 'experimental' },
  { key: 'settings.email_tracking', name: 'Email tracking settings', description: 'Signature tracking-pixel settings panel (its settings API is not mounted yet)', category: 'platform', maturity: 'experimental' },
  { key: 'settings.security_policies', name: 'Password and session policies', description: 'Organization password, lockout and session policy editor', category: 'platform', maturity: 'experimental' },
  { key: 'ui.extra_themes', name: 'Extra themes', description: 'Additional colour themes beyond the default light and dark', category: 'platform', maturity: 'preview' },
];

const BY_KEY: ReadonlyMap<string, FeatureDefinition> = new Map(FEATURE_REGISTRY.map((f) => [f.key, f]));

export function getFeatureDefinition(key: string): FeatureDefinition | undefined {
  return BY_KEY.get(key);
}

/**
 * Reads HELIOS_FEATURE_PROFILE. Anything other than an explicit `development`
 * resolves to `release`: a typo must never ship experimental features.
 */
export function resolveFeatureProfile(value: string | undefined = process.env.HELIOS_FEATURE_PROFILE): FeatureProfile {
  return value?.trim().toLowerCase() === 'development' ? 'development' : 'release';
}

export interface ResolvedFeature {
  key: string;
  /** Effective state after profile + override. */
  enabled: boolean;
  /** Whether an admin may change it in this profile. */
  available: boolean;
  /** What it would be with no override. */
  defaultEnabled: boolean;
}

/**
 * Resolve one flag. `override` is the organization's stored choice, if any.
 * Pure — the service layers the database on top of this.
 */
export function resolveFeature(def: FeatureDefinition, profile: FeatureProfile, override?: boolean): ResolvedFeature {
  if (def.required) {
    return { key: def.key, enabled: true, available: false, defaultEnabled: true };
  }
  if (def.operational) {
    const defaultEnabled = def.defaultEnabled === true;
    return { key: def.key, enabled: override ?? defaultEnabled, available: true, defaultEnabled };
  }
  if (profile === 'development') {
    return { key: def.key, enabled: override ?? true, available: true, defaultEnabled: true };
  }
  switch (def.maturity) {
    case 'stable':
      return { key: def.key, enabled: override ?? true, available: true, defaultEnabled: true };
    case 'preview':
      return { key: def.key, enabled: override ?? false, available: true, defaultEnabled: false };
    case 'experimental':
    default:
      // Unavailable in a release: a stored override is ignored, never honoured.
      return { key: def.key, enabled: false, available: false, defaultEnabled: false };
  }
}
