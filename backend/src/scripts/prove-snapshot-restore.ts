/**
 * Live proof of the snapshot -> delete -> re-create path on a real tenant.
 *
 *   1. create a throwaway user (with a group membership and a manager)
 *   2. snapshot it (reason 'delete')
 *   3. delete it in Google
 *   4. re-create it from the snapshot (what Restore does once undelete is past its window)
 *   5. read the new account back and compare the fields that matter
 *   6. clean up: delete the re-created user
 *
 * Usage (inside the backend container): node dist/scripts/prove-snapshot-restore.js [organizationId]
 * With HELIOS_GOOGLE_RECORD=1 every Google call is recorded as a fixture.
 * Exit 1 on any mismatch.
 */
import crypto from 'node:crypto';
import { db } from '../database/connection.js';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
import { userSnapshotService } from '../services/user-snapshot.service.js';

async function main(): Promise<void> {
  const orgRow = process.argv[2]
    ? { organization_id: process.argv[2] }
    : (await db.query('SELECT organization_id, domain FROM gw_credentials ORDER BY created_at LIMIT 1')).rows[0];
  if (!orgRow) throw new Error('No gw_credentials row');
  const organizationId: string = orgRow.organization_id;
  const domain: string = orgRow.domain || (await db.query('SELECT domain FROM gw_credentials WHERE organization_id = $1', [organizationId])).rows[0].domain;

  const stamp = crypto.randomBytes(3).toString('hex');
  const email = `snap-proof-${stamp}@${domain}`;
  const failures: string[] = [];
  const check = (label: string, ok: boolean, detail?: unknown) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
    if (!ok) failures.push(label);
  };

  // A manager and a group to attach, taken from the tenant as it is.
  const admin = (await db.query('SELECT admin_email FROM gw_credentials WHERE organization_id = $1', [organizationId])).rows[0].admin_email as string;
  const groups = await googleWorkspaceService.getGroups(organizationId);
  const groupEmail: string | undefined = groups?.data?.groups?.[0]?.email;

  console.log(`tenant ${domain}; throwaway ${email}; group ${groupEmail || '(none)'}; manager ${admin}`);

  // 1. create
  const created = await googleWorkspaceService.createUser(organizationId, {
    email,
    firstName: 'Snapshot',
    lastName: `Proof ${stamp}`,
    password: crypto.randomBytes(12).toString('base64url'),
    orgUnitPath: '/',
    jobTitle: 'Proof Engineer',
    department: 'QA',
    managerEmail: admin,
    phones: [{ type: 'mobile', value: '+1 555 0100' }, { type: 'work', value: '+1 555 0101' }],
    location: 'Desk 42',
    secondaryEmails: [`snap-proof-${stamp}-alt@${domain}`],
    externalIds: [{ customType: 'associate_id', value: `A-${stamp}` }],
    changePasswordAtNextLogin: true,
  });
  check('create throwaway user', created.success, created.error);
  if (!created.success || !created.userId) return finish(failures);
  const googleId = created.userId;
  let cleanupId: string | null = googleId;

  try {
    if (groupEmail) {
      let added = false;
      for (let i = 0; i < 4 && !added; i++) {
        if (i) await sleep(4000 * i);
        const a = await googleWorkspaceService.addUserToGroup(organizationId, email, groupEmail);
        added = !!a.success;
      }
      check('add to group', added);
    }
    // Google's reads lag its writes by up to ~30 s (group membership especially).
    await sleep(35000);

    // 2. snapshot
    const snap = await userSnapshotService.capture(organizationId, { userId: null, googleWorkspaceId: googleId, primaryEmail: email, reason: 'delete' });
    check('snapshot taken', snap.success, snap.error);
    if (!snap.success || !snap.snapshot) return finish(failures);
    const body = snap.snapshot.snapshot;
    check('snapshot has profile with manager relation', body.profile?.relations?.some((r: any) => r.type === 'manager' && r.value === admin));
    check('snapshot has phones, location, externalIds, alternate email', !!body.profile?.phones?.length && !!body.profile?.locations?.length && !!body.profile?.externalIds?.length && !!body.profile?.emails?.some((e: any) => e.address?.includes('-alt@')));
    if (groupEmail) check('snapshot lists the group', body.groups.some((g) => g.email === groupEmail), body.groups);
    console.log(`snapshot ${snap.snapshot.id}; partial: ${JSON.stringify(body.partial)}; licences: ${JSON.stringify(body.licenses)}`);

    // 3. delete in Google
    const del = await googleWorkspaceService.deleteUser(organizationId, googleId);
    check('delete in Google', del.success, del.error);
    if (!del.success) return finish(failures);
    cleanupId = null;
    // Wait until the deletion is visible to reads.
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const g = await googleWorkspaceService.getUserRaw(organizationId, googleId);
      if (!g.success) break;
    }

    // 4. re-create under the same address. Observed 2026-09-08: a same-address
    // insert ~8 s after the delete was refused with "Entity already exists"
    // (the deletion had not propagated to reads yet); after the poll above it
    // succeeded. The suffixed fallback only exists so the proof still exercises
    // the re-create path if a tenant ever does reserve the address.
    let rc = await userSnapshotService.recreate(organizationId, snap.snapshot.id, {});
    let recreatedEmail = email;
    if (!rc.success && /already exists/i.test(rc.error || '')) {
      console.log('NOTE  same-address re-create still refused after the deletion propagated; re-creating under a suffixed address to prove the path');
      recreatedEmail = `snap-proof-${stamp}-r@${domain}`;
      rc = await userSnapshotService.recreate(organizationId, snap.snapshot.id, { primaryEmailOverride: recreatedEmail });
    }
    check('re-create from snapshot', rc.success, rc.error || rc.restored);
    if (!rc.success || !rc.googleWorkspaceId) return finish(failures);
    cleanupId = rc.googleWorkspaceId;
    check('new Google id differs from the deleted one', rc.googleWorkspaceId !== googleId);
    if (groupEmail) check('group membership restored', (rc.restored?.groups || 0) === 1, rc);
    await sleep(8000);

    // 5. read back
    const back = await googleWorkspaceService.getUserRaw(organizationId, rc.googleWorkspaceId);
    check('re-created user readable', back.success, back.error);
    const u = back.user || {};
    check('name preserved', u.name?.givenName === 'Snapshot' && String(u.name?.familyName).startsWith('Proof'));
    check('manager preserved', u.relations?.some((r: any) => r.type === 'manager' && r.value === admin), u.relations);
    check('title and department preserved', u.organizations?.[0]?.title === 'Proof Engineer' && u.organizations?.[0]?.department === 'QA', u.organizations);
    check('phones preserved', (u.phones || []).length === 2, u.phones);
    check('location preserved', u.locations?.[0]?.area === 'Desk 42', u.locations);
    check('externalIds preserved', u.externalIds?.some((x: any) => x.value === `A-${stamp}`), u.externalIds);
    check('alternate email preserved', u.emails?.some((e: any) => e.address?.includes('-alt@')), u.emails);
    check('primary address as requested', u.primaryEmail === recreatedEmail, u.primaryEmail);
    check('account active, password change forced', u.suspended === false && u.changePasswordAtNextLogin === true);
    const lic = await googleWorkspaceService.getUserGoogleLicenses(organizationId, recreatedEmail);
    console.log(`licences after re-create: ${JSON.stringify(lic.licenses)} (restored count ${rc.restored?.licenses})`);
    const row = (await db.query('SELECT restored_at, restored_google_workspace_id FROM user_google_snapshots WHERE id = $1', [snap.snapshot.id])).rows[0];
    check('snapshot row marked restored', !!row?.restored_at && row.restored_google_workspace_id === rc.googleWorkspaceId);
  } finally {
    // 6. clean up
    if (cleanupId) {
      const d = await googleWorkspaceService.deleteUser(organizationId, cleanupId);
      console.log(`cleanup delete ${cleanupId}: ${d.success ? 'ok' : d.error}`);
    }
    await db.query('DELETE FROM user_google_snapshots WHERE organization_id = $1 AND primary_email = $2', [organizationId, email]);
  }
  return finish(failures);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function finish(failures: string[]): Promise<void> {
  await db.close();
  console.log(failures.length ? `FAIL: ${failures.length} check(s): ${failures.join('; ')}` : 'PASS: snapshot -> delete -> re-create round trip verified.');
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try { await db.close(); } catch { /* ignore */ }
  process.exit(1);
});
