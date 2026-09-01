/**
 * Record Microsoft Graph WRITE fixtures against the LIVE tenant.
 * =====================================================================
 *
 * TIME-CRITICAL: run this BEFORE cancelling the paid M365 license. It captures
 * the real request/response shapes of every write operation so replay tests keep
 * working after the tenant is gone (only READ fixtures exist today).
 *
 * It MUTATES the live tenant, but reverts / cleans up everything it does:
 *   - user job title: set to a test value, then reverted to the original
 *   - user manager: set, then cleared
 *   - a throwaway security group: created, updated, member added + removed, deleted
 *
 * Requires Azure app consent for User.ReadWrite.All + Group.ReadWrite.All. A 403
 * on any write means the scope/consent is missing — grant it and re-run BEFORE
 * cancelling the license (after cancellation these fixtures are unrecoverable).
 *
 * Usage (inside the backend container, recording on + a writable fixtures dir):
 *   docker compose -f docker-compose.yml -f docker-compose.record.yml up -d backend
 *   docker compose exec -e HELIOS_GRAPH_RECORD=1 -e HELIOS_GRAPH_FIXTURES_DIR=/fixtures \
 *     backend node dist/scripts/record-m365-writes.js <organizationId>
 *
 * Fixtures land in ./.record-fixtures/graph on the host (via the bind mount).
 * Review + leak-grep (tenant GUID / onmicrosoft.com / real names), then copy the
 * clean files into backend/src/__tests__/fixtures/graph/.
 */
import { db } from '../database/connection.js';
import { microsoftGraphService } from '../services/microsoft-graph.service.js';

const orgId = process.argv[2] || process.env.HELIOS_ORG_ID;

interface OpResult { op: string; ok: boolean; note?: string }

async function main(): Promise<void> {
  if (!orgId) throw new Error('Usage: record-m365-writes.js <organizationId>');
  if (process.env.HELIOS_GRAPH_RECORD !== '1') {
    console.warn('⚠  HELIOS_GRAPH_RECORD is not "1" — writes will hit the tenant but NOTHING will be recorded. Set it and re-run.');
  }

  const ok = await microsoftGraphService.initialize(orgId);
  if (!ok) throw new Error(`Failed to initialize Microsoft Graph for org ${orgId} (no credentials?)`);

  const users = await db.query(
    `SELECT ms_id, display_name, job_title FROM ms_synced_users
     WHERE organization_id = $1 AND ms_id IS NOT NULL
     ORDER BY display_name LIMIT 2`,
    [orgId],
  );
  if (users.rows.length < 2) throw new Error('Need at least 2 M365 users (subject + manager) to record manager set/clear');
  const subject = users.rows[0];
  const manager = users.rows[1];
  const originalTitle: string | null = subject.job_title ?? null;
  console.log(`Subject: ${subject.display_name} (${subject.ms_id}), title="${originalTitle}"`);
  console.log(`Manager: ${manager.display_name} (${manager.ms_id})`);

  const results: OpResult[] = [];
  const run = async (op: string, fn: () => Promise<unknown>): Promise<void> => {
    try { await fn(); results.push({ op, ok: true }); console.log(`✔ ${op}`); }
    catch (e: any) { results.push({ op, ok: false, note: e?.message }); console.error(`✗ ${op}: ${e?.message}`); }
  };

  // --- USER writes (set-and-revert) ---
  await run('user.update PATCH jobTitle', () => microsoftGraphService.updateUser(subject.ms_id, { jobTitle: 'Helios Record Test' } as any));
  await run('user.update revert jobTitle', () => microsoftGraphService.updateUser(subject.ms_id, { jobTitle: originalTitle } as any));
  await run('user.setManager PUT manager/$ref', () => microsoftGraphService.setUserManager(subject.ms_id, manager.ms_id));
  await run('user.removeManager DELETE manager/$ref', () => microsoftGraphService.removeUserManager(subject.ms_id));

  // --- GROUP writes (throwaway, self-cleaning) ---
  let groupId: string | undefined;
  await run('group.create POST /groups', async () => {
    const g = await microsoftGraphService.createGroup({
      displayName: 'ZZ Helios Record Test',
      description: 'temporary — safe to delete',
      mailNickname: 'zz-helios-record-test',
      securityEnabled: true,
      mailEnabled: false,
    });
    groupId = (g as any)?.id;
    console.log(`  created group ${groupId}`);
  });
  if (groupId) {
    await run('group.update PATCH /groups', () => microsoftGraphService.updateGroup(groupId!, { description: 'recorded' }));
    await run('group.addMember POST members/$ref', () => microsoftGraphService.addGroupMember(groupId!, subject.ms_id));
    await run('group.removeMember DELETE members/$ref', () => microsoftGraphService.removeGroupMember(groupId!, subject.ms_id));
    await run('group.delete DELETE /groups', () => microsoftGraphService.deleteGroup(groupId!));
  } else {
    console.warn('⚠  group create failed — skipping group update/member/delete recordings');
  }

  console.log('\n=== Summary ===');
  for (const r of results) console.log(`${r.ok ? 'OK ' : 'ERR'} ${r.op}${r.note ? ' — ' + r.note : ''}`);
  const failed = results.filter(r => !r.ok);
  if (failed.some(r => /403|Forbidden|Authorization_RequestDenied|Insufficient/i.test(r.note || ''))) {
    console.error('\n⚠  A 403 was seen — the Azure app is missing a write scope (User.ReadWrite.All / Group.ReadWrite.All).');
    console.error('   Grant admin consent and re-run BEFORE cancelling the M365 license.');
  }
  try { await (db as any).end?.(); } catch { /* ignore */ }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
