/**
 * Live verification of one group scenario against a real workspace (D-048).
 *
 * Every built-in scenario must be proven live before it is called done. This
 * script does the automated half:
 *
 *   1. creates a uniquely named test group for the scenario
 *      (helios-scenario-test-<scenario>-<stamp>@<domain>);
 *   2. applies the scenario through the same service the API uses;
 *   3. reads the settings back and prints expected vs actual for every field;
 *   4. prints the scenario's manual steps and email test checklist;
 *   5. with --cleanup, deletes the test group again.
 *
 * It never creates, changes or deletes a group whose address does not start
 * with `helios-scenario-test-`.
 *
 * Usage (inside the backend container, database reachable):
 *   node dist/scripts/verify-group-scenario.js --list
 *   node dist/scripts/verify-group-scenario.js --scenario public-contact-inbox [--domain example.com]
 *       [--org <organizationId>] [--member someone@example.com:OWNER] [--alias helios-scenario-test-alias@example.com]
 *       [--cleanup]
 *   node dist/scripts/verify-group-scenario.js --cleanup --group helios-scenario-test-...@example.com [--org <id>]
 *
 * Leave out --cleanup to keep the group for the email checklist, then delete it
 * with the third form. To capture replay fixtures from the run, set
 * HELIOS_GOOGLE_RECORD=1 and HELIOS_GOOGLE_FIXTURES_DIR (see docker-compose.record.yml),
 * then review and leak-check the files before committing them.
 *
 * Exit codes: 0 verified (or cleanup done), 1 mismatch / partial / failure, 2 usage error.
 */
import { pathToFileURL } from 'node:url';
import { BUILTIN_GROUP_SCENARIOS, GROUP_SETTING_FIELDS, type GroupSettingField } from '../config/group-scenarios.js';

export const TEST_GROUP_PREFIX = 'helios-scenario-test-';

/** Throws unless the address is a test group this script is allowed to touch. */
export function assertTestGroupAddress(email: string): string {
  const e = String(email || '').trim().toLowerCase();
  const [local, domain] = e.split('@');
  if (!local || !domain || !local.startsWith(TEST_GROUP_PREFIX) || local.length === TEST_GROUP_PREFIX.length) {
    throw new Error(`Refusing to touch ${email}: test groups must start with ${TEST_GROUP_PREFIX}`);
  }
  return e;
}

/** A unique test address for a scenario; local part stays within Google's 63 characters. */
export function testGroupAddress(scenarioKey: string, domain: string, now = Date.now()): string {
  const stamp = now.toString(36);
  const local = `${TEST_GROUP_PREFIX}${scenarioKey}`.slice(0, 63 - stamp.length - 1);
  return assertTestGroupAddress(`${local}-${stamp}@${domain.toLowerCase()}`);
}

export interface CliArgs {
  list: boolean;
  scenario?: string;
  domain?: string;
  org?: string;
  group?: string;
  cleanup: boolean;
  members: Array<{ email: string; role: 'OWNER' | 'MANAGER' | 'MEMBER' }>;
  aliases: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { list: false, cleanup: false, members: [], aliases: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--list') args.list = true;
    else if (a === '--cleanup') args.cleanup = true;
    else if (a === '--scenario') args.scenario = next();
    else if (a === '--domain') args.domain = next();
    else if (a === '--org') args.org = next();
    else if (a === '--group') args.group = next();
    else if (a === '--alias') args.aliases.push(next());
    else if (a === '--member') {
      const [email, role = 'MEMBER'] = next().split(':');
      const r = role.toUpperCase();
      if (r !== 'OWNER' && r !== 'MANAGER' && r !== 'MEMBER') throw new Error(`--member role must be OWNER, MANAGER or MEMBER`);
      args.members.push({ email, role: r });
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }

  if (args.list) {
    for (const s of BUILTIN_GROUP_SCENARIOS) console.log(`${pad(s.key, 28)} ${s.name}`);
    return 0;
  }

  const { db } = await import('../database/connection.js');
  const { gatewayForOrganization } = await import('../services/group-scenarios/google-groups.gateway.js');
  const { GroupScenarioService } = await import('../services/group-scenarios/group-scenario.service.js');

  const cred = args.org
    ? await db.query('SELECT organization_id, domain FROM gw_credentials WHERE organization_id = $1', [args.org])
    : await db.query('SELECT organization_id, domain FROM gw_credentials ORDER BY created_at LIMIT 1');
  if (cred.rows.length === 0) {
    console.error('No Google Workspace credentials found (gw_credentials).');
    return 1;
  }
  const organizationId: string = cred.rows[0].organization_id;
  const gateway = await gatewayForOrganization(organizationId);
  if (!gateway) {
    console.error('Google Workspace is not configured for this organization.');
    return 1;
  }

  // Cleanup of an earlier run.
  if (args.cleanup && args.group && !args.scenario) {
    const email = assertTestGroupAddress(args.group);
    await gateway.deleteGroup(email);
    console.log(`Deleted test group ${email}`);
    return 0;
  }

  if (!args.scenario) {
    console.error('Pass --scenario <key> (see --list), or --cleanup --group <address>.');
    return 2;
  }
  const domain = args.domain || cred.rows[0].domain;
  if (!domain) {
    console.error('Pass --domain: the stored credentials carry no domain.');
    return 2;
  }
  for (const alias of args.aliases) assertTestGroupAddress(alias);

  const service = new GroupScenarioService({ db, gatewayFor: async () => gateway });
  const scenario = await service.get(organizationId, args.scenario);
  const email = testGroupAddress(scenario.key, domain);

  console.log(`Scenario: ${scenario.name} (${scenario.key})`);
  console.log(`Test group: ${email}\n`);

  const scope = await gateway.probeSettingsScope();
  console.log(`Groups Settings scope: ${scope.state}${scope.message ? ` (${scope.message})` : ''}\n`);

  let exitCode = 1;
  let created = false;
  try {
    const result = await service.createFromScenario(organizationId, scenario.key, {
      email,
      name: `Helios scenario test: ${scenario.name}`.slice(0, 73),
      description: `Temporary test group for the ${scenario.key} scenario. Safe to delete.`,
      aliases: args.aliases,
      members: args.members,
    });
    created = true;

    console.log('Steps:');
    for (const s of result.steps) console.log(`  ${pad(s.step, 16)} ${pad(s.status, 8)} ${s.detail || ''}`);

    console.log('\nSettings, expected vs actual (fresh read from Google):');
    let actual: Record<string, unknown> = {};
    try {
      actual = await gateway.getSettings(result.group.email);
    } catch (e) {
      console.log(`  could not read settings: ${(e as Error).message}`);
    }
    const fields = GROUP_SETTING_FIELDS as Record<string, GroupSettingField>;
    console.log(`  ${pad('field', 28)} ${pad('expected', 28)} ${pad('actual', 28)} ok`);
    for (const [field, want] of Object.entries(scenario.settings)) {
      const got = actual[field] === undefined ? '(missing)' : String(actual[field]);
      console.log(`  ${pad(field, 28)} ${pad(String(want), 28)} ${pad(got, 28)} ${got === want ? 'yes' : 'NO'}   ${fields[field]?.label ?? ''}`);
    }

    if (result.mismatches.length) {
      console.log('\nMismatches reported by the service:');
      for (const m of result.mismatches) console.log(`  [${m.area}] ${m.field}: expected ${m.expected}, got ${m.actual ?? '(missing)'}`);
    }
    for (const w of result.warnings) console.log(`\nWarning: ${w}`);

    console.log(`\nOutcome: ${result.outcome.toUpperCase()}`);
    exitCode = result.outcome === 'verified' ? 0 : 1;

    if (scenario.kbApiNotes.length) {
      console.log('\nKB vs API notes:');
      scenario.kbApiNotes.forEach((n) => console.log(`  - ${n}`));
    }
    console.log('\nManual steps in Google (not applied by Helios):');
    scenario.manualSteps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    console.log('\nAlso check: the Google Admin console and groups.google.com show these values.');
    console.log('\nEmail test checklist:');
    scenario.emailChecklist.forEach((s, i) => console.log(`  [ ] ${i + 1}. ${s}`));
  } catch (e: any) {
    console.error(`\nFAILED: ${e?.code ? `${e.code}: ` : ''}${e?.message || e}`);
    if (Array.isArray(e?.details)) e.details.forEach((d: any) => console.error(`  - ${d.field ?? ''} ${d.message}`));
  }

  if (args.cleanup && created) {
    try {
      await gateway.deleteGroup(assertTestGroupAddress(email));
      console.log(`\nDeleted test group ${email}`);
    } catch (e) {
      console.error(`\nCould not delete ${email}: ${(e as Error).message}`);
      exitCode = 1;
    }
  } else if (created) {
    console.log(`\nThe test group was kept. Delete it afterwards with:\n  node dist/scripts/verify-group-scenario.js --cleanup --group ${email}`);
  }
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
