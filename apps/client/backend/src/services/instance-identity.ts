/**
 * Shared install identity.
 *
 * ONE stable id per Helios install, stored in `system_settings` under
 * 'instance_id' and reported verbatim to the control plane by BOTH the telemetry
 * heartbeat and the licence heartbeat, so the control plane tracks this install
 * as a single instance (seam-review g7).
 *
 * Before this module the identity was SPLIT and broken:
 *   - license.service read a `system_settings` table that did not exist and
 *     defaulted to the literal 'unknown' (which broke control-plane identity);
 *   - telemetry.service wrote to `organization_settings` WITHOUT the NOT-NULL
 *     `organization_id` and with `ON CONFLICT (key)` (no such unique constraint),
 *     so its write always threw and was swallowed.
 *
 * Format: `helios_<28 chars>`. The control plane keys identity on the EXACT
 * string and accepts any non-empty id up to 50 chars — do not reshape it, and
 * do not add a format gate that would reject the other products' ids.
 */

import crypto from 'crypto';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

const KEY = 'instance_id';

// Cached for the process lifetime — the id never changes once written.
let cachedInstanceId: string | null = null;

/**
 * Return this install's stable instance id, generating + persisting one on first
 * call. First-writer-wins under concurrent boots (INSERT ... ON CONFLICT DO
 * NOTHING, then re-read), so two services racing at startup converge on the same
 * id rather than clobbering each other.
 */
export async function getOrCreateInstanceId(): Promise<string> {
  if (cachedInstanceId) return cachedInstanceId;

  const client = await db.getClient();
  try {
    const existing = await client.query(
      `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
      [KEY],
    );
    if (existing.rows[0]?.value) {
      cachedInstanceId = existing.rows[0].value;
      return cachedInstanceId;
    }

    // helios_ + 21 hex chars = 28 chars total (well under the 50-char cap).
    const candidate = `helios_${crypto.randomUUID().replace(/-/g, '').slice(0, 21)}`;
    await client.query(
      `INSERT INTO system_settings (key, value, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (key) DO NOTHING`,
      [KEY, candidate],
    );

    // Re-read: if a concurrent boot inserted first, DO NOTHING kept THEIR value.
    const row = await client.query(
      `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
      [KEY],
    );
    cachedInstanceId = row.rows[0]?.value ?? candidate;
    logger.info(`[identity] install instance id: ${cachedInstanceId}`);
    return cachedInstanceId;
  } finally {
    client.release();
  }
}
