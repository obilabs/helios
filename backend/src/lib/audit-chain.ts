/**
 * Audit-log chain verification.
 *
 * The hash itself is computed ONLY in the database (migration 101:
 * `security_audit_canonical_payload_v2` plus the BEFORE INSERT trigger). There
 * is deliberately no TypeScript hash implementation here.
 *
 * This module replaces `lib/audit-hash.ts`, which computed a
 * `JSON.stringify`-based record hash that the insert trigger then overwrote
 * with a different one — two implementations of the same hash, one of them
 * dead. The database is the single source of truth and this module only asks
 * it the question.
 */

import { db } from '../database/connection.js';

export interface AuditChainBreak {
  id: string;
  chainSeq: number;
  at: string | null;
  reason: string;
}

export interface AuditChainVerification {
  /**
   * True when every row covered by the chain verified. Covers the v2 segment
   * (migration 101) and its link back into pre-101 history.
   */
  ok: boolean;
  /** Rows covered by the chain and checked by this run. */
  checkedRows: number;
  /** chain_seq of the first and last row inspected (null when none). */
  chainStartSeq: number | null;
  chainEndSeq: number | null;
  /** The first break, when there is one. */
  firstBreak: AuditChainBreak | null;
  /**
   * Rows written before migration 101, under the seven-field hash from
   * migration 066. Recomputed as v1 and reported here, never folded into
   * `ok`: v1 serialised timestamps in the session's timezone and chose a
   * predecessor without a lock, so a v1 mismatch is not proof of tampering.
   */
  legacy: {
    rows: number;
    verified: number;
    unverified: number;
    firstIssue: { id: string; reason: string } | null;
  };
}

export interface VerifyAuditChainOptions {
  /**
   * chain_seq to start from, for verifying a suffix from a known-good point
   * instead of the whole chain.
   */
  fromSeq?: number;
  /**
   * The `TimeZone` the pre-101 rows were written under, when it was not the
   * one this session uses. A default install writes under UTC.
   */
  legacyTimezone?: string;
}

const toNum = (value: unknown): number => Number(value ?? 0);

/** Walk the security_audit_logs hash chain and report the first break. */
export async function verifyAuditChain(
  options: VerifyAuditChainOptions = {}
): Promise<AuditChainVerification> {
  const result = await db.query(
    'SELECT * FROM verify_security_audit_chain($1, $2)',
    [options.fromSeq ?? null, options.legacyTimezone ?? null]
  );
  const row = result.rows[0];

  // The function always returns exactly one row; treat its absence as a
  // failure rather than reporting a clean chain nobody checked.
  if (!row) {
    throw new Error('verify_security_audit_chain() returned no row');
  }

  return {
    ok: row.ok === true,
    checkedRows: toNum(row.checked_v2_rows),
    chainStartSeq: row.v2_start_seq === null ? null : Number(row.v2_start_seq),
    chainEndSeq: row.v2_end_seq === null ? null : Number(row.v2_end_seq),
    firstBreak: row.first_break_id
      ? {
          id: row.first_break_id,
          chainSeq: Number(row.first_break_seq),
          at: row.first_break_at ? new Date(row.first_break_at).toISOString() : null,
          reason: row.first_break_reason,
        }
      : null,
    legacy: {
      rows: toNum(row.legacy_v1_rows),
      verified: toNum(row.legacy_v1_verified),
      unverified: toNum(row.legacy_v1_unverified),
      firstIssue: row.legacy_v1_first_issue_id
        ? {
            id: row.legacy_v1_first_issue_id,
            reason: row.legacy_v1_first_issue_reason,
          }
        : null,
    },
  };
}
