import { execFileSync } from 'node:child_process';

/**
 * Reset the Helios database to a *fresh-install* state (no organization, no
 * admin) so the first-run setup wizard is served.
 *
 * Why `docker exec` and not a `pg` client?
 *   Postgres is deliberately NOT published to the host in the Helios compose
 *   stack (see docker-compose.yml: "NO ports exposed - internal only"). The
 *   only reliable way to drive SQL from a host-side test process is to run
 *   psql *inside* the postgres container.
 *
 * Safety:
 *   The default container name is the ISOLATED e2e stack's postgres
 *   (`helios_e2e_postgres`, created by e2e/docker-compose.e2e.yml), never the
 *   dev stack's `helios_postgres`. This helper TRUNCATEs organization data, so
 *   defaulting to the throwaway container keeps a developer's real dev/live DB
 *   safe. Override with HELIOS_E2E_PG_CONTAINER only if you know what you are
 *   truncating.
 */

const CONTAINER = process.env.HELIOS_E2E_PG_CONTAINER || 'helios_e2e_postgres';
const DB_NAME = process.env.HELIOS_E2E_DB_NAME || 'helios';
const DB_USER = process.env.HELIOS_E2E_DB_USER || 'postgres';

// auth_accounts / auth_sessions both FK to organization_users(id) ON DELETE
// CASCADE, and every per-org table FKs to organizations/organization_users, so
// truncating these five with CASCADE clears the whole account graph and returns
// the schema to the state a fresh `docker compose up` would produce. The
// `modules` catalog is global (no FK into orgs) and is intentionally left intact
// — the setup route re-inserts it with ON CONFLICT DO NOTHING anyway.
const RESET_SQL = `TRUNCATE TABLE
  organizations,
  organization_users,
  auth_accounts,
  auth_sessions,
  auth_verifications
RESTART IDENTITY CASCADE;`;

function runPsql(sql: string, tuplesOnly = false): string {
  const args = ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1'];
  if (tuplesOnly) args.push('-tA');
  args.push('-c', sql);

  try {
    return execFileSync('docker', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string })?.stderr?.toString?.() ?? '';
    throw new Error(
      `Failed to reset the Helios DB via \`docker exec ${CONTAINER} psql\`.\n` +
        `Is the e2e stack up? Start it with:  npm run e2e:up\n` +
        `container=${CONTAINER} db=${DB_NAME} user=${DB_USER}\n` +
        (stderr ? `psql stderr:\n${stderr}` : String(err)),
    );
  }
}

/**
 * Truncate org/admin/auth data and assert it actually happened. Throws loudly
 * rather than letting the first-run tests flake against a populated DB.
 */
export function resetHeliosDatabase(): void {
  runPsql(RESET_SQL);

  const orgCount = runPsql('SELECT COUNT(*) FROM organizations;', true).trim();
  if (orgCount !== '0') {
    throw new Error(
      `DB reset ran but organizations count is "${orgCount}", expected "0". ` +
        `Refusing to run first-run/setup-wizard tests against a non-empty DB.`,
    );
  }
}
