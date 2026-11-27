/**
 * Verify the security audit chain from the command line.
 *
 * The same `verify_security_audit_chain()` the admin route calls (migration
 * 101), reachable on a deployed install without a session — which is what an
 * operator or an auditor actually has. Read-only; it cannot repair anything,
 * because a repairable audit trail is not evidence.
 *
 * Usage (inside the backend container):
 *   node dist/scripts/verify-audit-chain.js [--from-seq <n>] [--legacy-timezone <tz>]
 *
 * Exit 0 when the chain verified, 1 when it did not or the run failed. Rows
 * written before migration 101 are reported separately and do NOT affect the
 * exit code — see the migration header for why.
 */
import { db } from '../database/connection.js';
import { verifyAuditChain } from '../lib/audit-chain.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<number> {
  const fromSeqRaw = arg('from-seq');
  const legacyTimezone = arg('legacy-timezone');

  let fromSeq: number | undefined;
  if (fromSeqRaw !== undefined) {
    fromSeq = Number(fromSeqRaw);
    if (!Number.isInteger(fromSeq) || fromSeq < 1) {
      console.error('--from-seq must be a positive integer');
      return 1;
    }
  }

  const v = await verifyAuditChain({ fromSeq, legacyTimezone });

  console.log(`chain        ${v.ok ? 'OK' : 'BROKEN'}`);
  console.log(`rows checked ${v.checkedRows}` +
    (v.chainStartSeq !== null ? `  (chain_seq ${v.chainStartSeq}..${v.chainEndSeq})` : ''));

  if (v.firstBreak) {
    console.log('');
    console.log('first break');
    console.log(`  row       ${v.firstBreak.id}`);
    console.log(`  chain_seq ${v.firstBreak.chainSeq}`);
    console.log(`  at        ${v.firstBreak.at ?? '(none)'}`);
    console.log(`  reason    ${v.firstBreak.reason}`);
  }

  if (v.legacy.rows > 0) {
    console.log('');
    console.log(`pre-101 rows ${v.legacy.rows}  (${v.legacy.verified} recomputed as v1, ${v.legacy.unverified} not)`);
    console.log('  Not covered by the result above: migration 066 hashed seven fields with a');
    console.log('  timezone-dependent payload and chose a predecessor without a lock.');
    if (v.legacy.firstIssue) {
      console.log(`  first    ${v.legacy.firstIssue.id}`);
      console.log(`  reason   ${v.legacy.firstIssue.reason}`);
    }
  }

  return v.ok ? 0 : 1;
}

main()
  .then(async (code) => {
    await db.close();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error('verify-audit-chain failed:', error instanceof Error ? error.message : error);
    await db.close().catch((): undefined => undefined);
    process.exit(1);
  });
