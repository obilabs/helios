/**
 * Prove a tenant's domain-wide delegation grant against the scope contract,
 * one call at a time, the way the transparent proxy mints tokens.
 *
 * For each probe path it mints a JWT carrying ONLY the scopes
 * googleScopesForPath() selects, exchanges it, and performs a harmless GET.
 * The result shows three things per tenant:
 *
 *   - every contract scope is authorised (all contract probes 200)
 *   - per-call minting works against real Google (no probe asks for the full list)
 *   - an optional scope the tenant has NOT authorised fails only its own probe
 *     (token exchange refused for that one path, everything else unaffected)
 *
 * Usage (inside the backend container, DB reachable):
 *   node dist/scripts/verify-google-scopes.js [organizationId]
 * Exit code 1 if any contract probe fails.
 */
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { db } from '../database/connection.js';
import { decodeServiceAccountKey } from '../services/gw-credentials.js';
import { googleScopesForPath, REQUIRED_SCOPES, SCOPE_CONTRACT_VERSION } from '../config/google-scopes.js';

interface Probe {
  label: string;
  method: 'GET';
  host: string;
  path: string;
  query: Record<string, string>;
  /** false = optional scope; a refusal here is informative, not a failure. */
  contract: boolean;
}

const PROBES: Probe[] = [
  { label: 'directory users.list', method: 'GET', host: 'https://admin.googleapis.com', path: 'admin/directory/v1/users', query: { customer: 'my_customer', maxResults: '1' }, contract: true },
  { label: 'directory groups.list', method: 'GET', host: 'https://admin.googleapis.com', path: 'admin/directory/v1/groups', query: { customer: 'my_customer', maxResults: '1' }, contract: true },
  { label: 'directory orgunits.list', method: 'GET', host: 'https://admin.googleapis.com', path: 'admin/directory/v1/customer/my_customer/orgunits', query: {}, contract: true },
  { label: 'directory domains.list', method: 'GET', host: 'https://admin.googleapis.com', path: 'admin/directory/v1/customer/my_customer/domains', query: {}, contract: true },
  { label: 'reports activity (admin)', method: 'GET', host: 'https://admin.googleapis.com', path: 'admin/reports/v1/activity/users/all/applications/admin', query: { maxResults: '1' }, contract: true },
  { label: 'datatransfer applications.list', method: 'GET', host: 'https://admin.googleapis.com', path: 'admin/datatransfer/v1/applications', query: { customerId: 'my_customer', maxResults: '1' }, contract: true },
  { label: 'licensing users.list', method: 'GET', host: 'https://licensing.googleapis.com', path: 'apps/licensing/v1/product/Google-Apps/users', query: { customerId: 'my_customer', maxResults: '1' }, contract: true },
  { label: 'gmail vacation (admin)', method: 'GET', host: 'https://gmail.googleapis.com', path: 'gmail/v1/users/me/settings/vacation', query: {}, contract: true },
  { label: 'gmail sendAs (admin)', method: 'GET', host: 'https://gmail.googleapis.com', path: 'gmail/v1/users/me/settings/sendAs', query: {}, contract: true },
  { label: 'calendar list (admin)', method: 'GET', host: 'https://www.googleapis.com', path: 'calendar/v3/users/me/calendarList', query: { maxResults: '1' }, contract: true },
  { label: 'drive files.list (admin)', method: 'GET', host: 'https://www.googleapis.com', path: 'drive/v3/files', query: { pageSize: '1' }, contract: true },
  { label: 'directory schemas.list (optional: userschema)', method: 'GET', host: 'https://admin.googleapis.com', path: 'admin/directory/v1/customer/my_customer/schemas', query: {}, contract: false },
];

/**
 * Informative only: does this tenant accept a readonly variant it was never
 * asked to authorise? AGENT-RULES.md says no (exact string match). The relay
 * scope map (services/relay/scopes.ts) still mints readonly variants under
 * enforcement, so the answer decides whether that map needs the same fix.
 */
const READONLY_PROBE = 'https://www.googleapis.com/auth/admin.directory.user.readonly';

interface Creds { client_email: string; private_key: string; admin_email: string; domain: string }

async function loadCredentials(organizationId?: string): Promise<Creds> {
  const r = organizationId
    ? await db.query('SELECT service_account_key, admin_email, domain FROM gw_credentials WHERE organization_id = $1', [organizationId])
    : await db.query('SELECT service_account_key, admin_email, domain FROM gw_credentials ORDER BY created_at LIMIT 1');
  if (r.rows.length === 0) throw new Error('No gw_credentials row found');
  const key = decodeServiceAccountKey<{ client_email: string; private_key: string }>(r.rows[0].service_account_key);
  return { client_email: key.client_email, private_key: key.private_key, admin_email: r.rows[0].admin_email, domain: r.rows[0].domain };
}

async function mint(creds: Creds, scopes: string[]): Promise<{ token?: string; error?: string }> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: creds.client_email, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', exp: now + 300, iat: now, sub: creds.admin_email },
    creds.private_key,
    { algorithm: 'RS256' },
  );
  try {
    const res = await axios.post('https://oauth2.googleapis.com/token', { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
    return { token: res.data.access_token };
  } catch (e: any) {
    const d = e?.response?.data;
    return { error: d ? `${d.error}: ${d.error_description || ''}`.trim() : String(e?.message || e) };
  }
}

async function main(): Promise<void> {
  const organizationId = process.argv[2];
  const creds = await loadCredentials(organizationId);
  console.log(`Scope contract v${SCOPE_CONTRACT_VERSION} (${REQUIRED_SCOPES.length} scopes); tenant ${creds.domain}; subject ${creds.admin_email}`);
  console.log('');

  let contractFailures = 0;
  const rows: string[] = [];
  for (const p of PROBES) {
    const { scopes, fellBack } = googleScopesForPath(p.method, p.path);
    const short = scopes.map((s) => s.replace('https://www.googleapis.com/auth/', '')).join(' + ');
    const minted = await mint(creds, scopes);
    let outcome: string;
    if (!minted.token) {
      outcome = `token refused (${minted.error})`;
      if (p.contract) contractFailures++;
    } else {
      try {
        const res = await axios.get(`${p.host}/${p.path}`, { params: p.query, headers: { Authorization: `Bearer ${minted.token}` }, validateStatus: () => true });
        outcome = `HTTP ${res.status}`;
        if (p.contract && res.status >= 400) contractFailures++;
      } catch (e: any) {
        outcome = `request failed (${e?.message || e})`;
        if (p.contract) contractFailures++;
      }
    }
    rows.push(`${p.contract ? 'contract' : 'optional'}  ${p.label.padEnd(46)} minted [${short}]${fellBack ? ' (FALLBACK)' : ''}  -> ${outcome}`);
  }
  for (const r of rows) console.log(r);

  // The old behaviour, for contrast: one token carrying the whole contract.
  const full = await mint(creds, REQUIRED_SCOPES);
  console.log('');
  console.log(`full-contract token (${REQUIRED_SCOPES.length} scopes): ${full.token ? 'granted' : `refused (${full.error})`}`);
  const ro = await mint(creds, [READONLY_PROBE]);
  console.log(`readonly variant not in the grant (admin.directory.user.readonly): ${ro.token ? 'granted' : `refused (${ro.error})`}`);
  console.log('');
  console.log(contractFailures === 0 ? 'PASS: every contract probe succeeded with per-call scopes.' : `FAIL: ${contractFailures} contract probe(s) failed.`);
  await db.close();
  process.exit(contractFailures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
