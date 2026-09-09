/**
 * Live proof of the no-orphans policy on a real tenant.
 *
 *   1. create a throwaway report whose manager is an existing Google user (the manager)
 *   2. the policy refuses to suspend the manager (names the report)
 *   3. reassign the report to another manager: Helios row AND Google relation move
 *   4. the policy now allows the suspend; suspend + restore the manager in Google
 *   5. clean up: delete the throwaway report
 *
 * Usage (inside the backend container): node dist/scripts/prove-no-orphans.js <managerEmail> <newManagerEmail>
 * With HELIOS_GOOGLE_RECORD=1 every Google call is recorded as a fixture. Exit 1 on any failed check.
 */
import crypto from 'node:crypto';
import { db } from '../database/connection.js';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
import { orgPolicyService } from '../services/org-policy.service.js';
import { applyStatusToPlatforms } from '../routes/organization.routes.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const [managerEmail, newManagerEmail] = process.argv.slice(2);
  if (!managerEmail || !newManagerEmail) throw new Error('usage: prove-no-orphans <managerEmail> <newManagerEmail>');
  const cred = (await db.query('SELECT organization_id, domain FROM gw_credentials ORDER BY created_at LIMIT 1')).rows[0];
  const organizationId: string = cred.organization_id;
  const domain: string = cred.domain;
  const failures: string[] = [];
  const check = (label: string, ok: boolean, detail?: unknown) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
    if (!ok) failures.push(label);
  };
  const local = async (email: string) => (await db.query('SELECT id, email, google_workspace_id, status, is_active FROM organization_users WHERE organization_id = $1 AND email = $2', [organizationId, email])).rows[0];

  const manager = await local(managerEmail);
  const newManager = await local(newManagerEmail);
  if (!manager?.google_workspace_id || !newManager?.google_workspace_id) throw new Error('both managers must exist locally with a Google id');

  const stamp = crypto.randomBytes(3).toString('hex');
  const reportEmail = `orphan-proof-${stamp}@${domain}`;
  let reportGoogleId: string | null = null;
  let reportLocalId: string | null = null;
  let suspended = false;

  try {
    // 1. throwaway report under the manager, in Google and locally
    const created = await googleWorkspaceService.createUser(organizationId, {
      email: reportEmail, firstName: 'Orphan', lastName: `Proof ${stamp}`,
      password: crypto.randomBytes(12).toString('base64url'), orgUnitPath: '/', managerEmail, changePasswordAtNextLogin: true,
    });
    check('create throwaway report in Google', created.success, created.error);
    if (!created.success || !created.userId) return finish(failures);
    reportGoogleId = created.userId;
    const ins = await db.query(
      `INSERT INTO organization_users (organization_id, email, first_name, last_name, role, status, is_active, user_type, google_workspace_id, reporting_manager_id)
       VALUES ($1, $2, 'Orphan', $3, 'user', 'active', true, 'staff', $4, $5) RETURNING id`,
      [organizationId, reportEmail, `Proof ${stamp}`, reportGoogleId, manager.id],
    );
    reportLocalId = ins.rows[0].id;
    // A brand-new account answers "User creation is not complete." to updates
    // for a short while; real reports are never this fresh.
    await sleep(40000);

    // 2. policy refuses
    const before = await orgPolicyService.checkNoOrphans(organizationId, manager.id);
    check('policy refuses to suspend a manager with a report', !before.ok && before.reports.some((r) => r.email === reportEmail), before.reports.map((r) => r.email));
    console.log('       ' + orgPolicyService.describeOrphans('suspend', before.reports));

    // 3. reassign in the same action shape the routes accept
    const re = await orgPolicyService.reassignDirectReports(organizationId, manager.id, { mode: 'all_to_one', targetManagerId: newManager.id });
    check('reassign moved every report', re.reassignedCount === re.totalReports && re.totalReports >= 1, re);
    await sleep(30000); // Google reads lag writes
    const g = await googleWorkspaceService.getUserRaw(organizationId, reportGoogleId);
    check('Google relation now points at the new manager', g.success && g.user?.relations?.some((r: any) => r.type === 'manager' && r.value === newManagerEmail), g.user?.relations);
    const row = await local(reportEmail);
    check('Helios row points at the new manager', row?.id && (await db.query('SELECT reporting_manager_id FROM organization_users WHERE id = $1', [row.id])).rows[0].reporting_manager_id === newManager.id);

    // 4. policy allows; suspend + restore the manager through the same code the status route uses
    const after = await orgPolicyService.checkNoOrphans(organizationId, manager.id);
    check('policy allows the suspend once nobody reports to the manager', after.ok, after.reports.map((r) => r.email));
    const sus = await applyStatusToPlatforms(organizationId, manager, 'suspended');
    check('manager suspended in Google', sus.ok, sus);
    suspended = sus.ok;
    await sleep(5000);
    const act = await applyStatusToPlatforms(organizationId, manager, 'active');
    check('manager restored in Google', act.ok, act);
    suspended = !act.ok;
  } finally {
    if (suspended) {
      const act = await applyStatusToPlatforms(organizationId, manager, 'active');
      console.log(`cleanup restore manager: ${act.ok ? 'ok' : act.error}`);
    }
    if (reportGoogleId) {
      // The admin self-lockout guard reads the user first; a just-created
      // account can be unreadable for a while, so retry with a pause.
      let d: { success: boolean; error?: string } = { success: false };
      for (let i = 0; i < 6 && !d.success; i++) {
        if (i) await sleep(10000);
        d = await googleWorkspaceService.deleteUser(organizationId, reportGoogleId);
      }
      console.log(`cleanup delete report ${reportGoogleId}: ${d.success ? 'ok' : d.error}`);
    }
    if (reportLocalId) await db.query('DELETE FROM organization_users WHERE id = $1', [reportLocalId]);
  }
  return finish(failures);
}

async function finish(failures: string[]): Promise<void> {
  await db.close();
  console.log(failures.length ? `FAIL: ${failures.length} check(s): ${failures.join('; ')}` : 'PASS: no-orphans policy verified live.');
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try { await db.close(); } catch { /* ignore */ }
  process.exit(1);
});
