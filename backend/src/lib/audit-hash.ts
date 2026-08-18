/**
 * Audit hash chain helpers.
 *
 * Extracted from audit.middleware.ts so the middleware AND
 * services/security-audit.service.ts share one implementation. They previously
 * did not: the middleware computed a chained record_hash, while the service's
 * INSERT omitted the column entirely — even though its own docstring promised
 * "tamper-evident logs with hash chains". Every service-path write therefore
 * failed with 23502 not_null_violation on record_hash.
 *
 * A service importing from a middleware module would be the wrong layering,
 * hence this shared module rather than an export on the middleware.
 */

import crypto from 'crypto';
import { db } from '../database/connection.js';

/** Hash a log record for tamper detection. */
export function generateRecordHash(data: object): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/**
 * The previous record's hash, for chain integrity.
 *
 * Returns null on error by design — a broken chain read must not stop the event
 * being recorded. A null previous_hash marks a chain discontinuity, which is
 * information; a dropped audit row is not.
 */
export async function getLastHash(): Promise<string | null> {
  try {
    const result = await db.query(
      'SELECT record_hash FROM security_audit_logs ORDER BY timestamp DESC LIMIT 1'
    );
    return result.rows[0]?.record_hash || null;
  } catch {
    return null;
  }
}
