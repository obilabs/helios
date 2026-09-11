/**
 * Directory sync settings: the single definition of what they are, their defaults,
 * how they are validated, and where they are stored.
 *
 * Until 2026-09-11 the Advanced settings card was decorative on three levels: there
 * was no route to load the values (the page always showed its built-in defaults),
 * saving wrote to a column that does not exist on organization_settings (a key/value
 * table), and no code read any of the values. The scheduler hard-coded 15 minutes for
 * Google and Microsoft 365 never synced on its own. This module is what the page, the
 * routes and the scheduler all read now.
 *
 * Storage: organization_settings is key/value (organization_id, key, value text), so
 * the settings live as one JSON document under the key `sync_settings`.
 */
import { db } from '../database/connection.js';
import {
  DEFAULT_FIELD_OWNERSHIP,
  FieldOwnershipError,
  validateFieldOwnership,
  type FieldOwner,
  type OwnedField,
} from './field-ownership.js';

export const SYNC_SETTINGS_KEY = 'sync_settings';

/** What happens in the platform when a user is deleted in Helios, preselected in the dialog. */
export const DELETION_DEFAULTS = ['delete', 'suspend', 'keep'] as const;
export type DeletionDefault = (typeof DELETION_DEFAULTS)[number];

/** The intervals the Advanced page offers, in seconds. Anything else is refused. */
export const SYNC_INTERVALS = [300, 900, 1800, 3600, 14400, 86400] as const;

export interface SyncSettings {
  /** Seconds between automatic syncs, for every connected platform. */
  intervalSeconds: number;
  /** When false, nothing syncs on its own; admins sync from the header. */
  autoSyncEnabled: boolean;
  deletionDefault: DeletionDefault;
  /** Which system wins, per profile field, when the sync finds a difference. */
  fieldOwnership: Record<OwnedField, FieldOwner>;
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  intervalSeconds: 900,
  autoSyncEnabled: true,
  deletionDefault: 'delete',
  fieldOwnership: { ...DEFAULT_FIELD_OWNERSHIP },
};

export class SyncSettingsError extends Error {}

/**
 * Validate a partial update. Refuses rather than coerces: a setting that silently
 * becomes something else is the failure this module exists to end.
 */
export function validateSyncSettingsPatch(input: unknown): Partial<SyncSettings> {
  if (!input || typeof input !== 'object') throw new SyncSettingsError('Settings must be an object');
  const body = input as Record<string, unknown>;
  const out: Partial<SyncSettings> = {};

  if (body.intervalSeconds !== undefined) {
    const n = Number(body.intervalSeconds);
    if (!SYNC_INTERVALS.includes(n as (typeof SYNC_INTERVALS)[number])) {
      throw new SyncSettingsError(`intervalSeconds must be one of ${SYNC_INTERVALS.join(', ')}`);
    }
    out.intervalSeconds = n;
  }
  if (body.autoSyncEnabled !== undefined) {
    if (typeof body.autoSyncEnabled !== 'boolean') throw new SyncSettingsError('autoSyncEnabled must be true or false');
    out.autoSyncEnabled = body.autoSyncEnabled;
  }
  if (body.deletionDefault !== undefined) {
    if (!DELETION_DEFAULTS.includes(body.deletionDefault as DeletionDefault)) {
      throw new SyncSettingsError(`deletionDefault must be one of ${DELETION_DEFAULTS.join(', ')}`);
    }
    out.deletionDefault = body.deletionDefault as DeletionDefault;
  }
  if (body.fieldOwnership !== undefined) {
    try {
      out.fieldOwnership = validateFieldOwnership(body.fieldOwnership);
    } catch (e) {
      throw new SyncSettingsError(e instanceof FieldOwnershipError ? e.message : 'Invalid fieldOwnership');
    }
  }
  return out;
}

/** Stored values merged over the defaults. A corrupt stored value falls back to defaults. */
export async function loadSyncSettings(organizationId: string): Promise<SyncSettings> {
  const res = await db.query(
    'SELECT value FROM organization_settings WHERE organization_id = $1 AND key = $2',
    [organizationId, SYNC_SETTINGS_KEY],
  );
  if (res.rows.length === 0 || !res.rows[0].value) return { ...DEFAULT_SYNC_SETTINGS };
  try {
    const stored = validateSyncSettingsPatch(JSON.parse(res.rows[0].value));
    return { ...DEFAULT_SYNC_SETTINGS, ...stored, fieldOwnership: { ...DEFAULT_FIELD_OWNERSHIP, ...(stored.fieldOwnership ?? {}) } };
  } catch {
    return { ...DEFAULT_SYNC_SETTINGS };
  }
}

export async function saveSyncSettings(organizationId: string, patch: Partial<SyncSettings>): Promise<SyncSettings> {
  const next = { ...(await loadSyncSettings(organizationId)), ...patch };
  await db.query(
    `INSERT INTO organization_settings (organization_id, key, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [organizationId, SYNC_SETTINGS_KEY, JSON.stringify(next)],
  );
  return next;
}
