/**
 * Guards the recorded Google Workspace WRITE fixtures.
 *
 * Captured 2026-09-07/08 against a disposable Workspace trial during the
 * UI-driven end-to-end run (create user, edit profile / OU move, suspend and
 * restore, group create / rename / members / delete, Gmail delegation and
 * forwarding, signature deploy, the full offboarding wizard incl. Drive +
 * Calendar data transfer with completion polling, sign-out, token list and
 * user delete). The trial is gone; these fixtures keep every write path
 * replayable. Each assertion: the fixture exists, recorded the expected method
 * and status, and carries no real identifier (the sanitizer maps every mailbox
 * to example.com / example.net).
 *
 * Two fixtures are also driven THROUGH the googleapis SDK seam in REPLAY mode,
 * proving the recorded shape satisfies the real client code path without a
 * network.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { google } from 'googleapis';
import {
  loadGoogleFixture,
  useGoogleReplay,
  resetGoogleReplay,
  installGoogleSdkSeam,
} from '../testing/google-replay.js';

type Fx = { family: string; name: string; method: string; okStatuses: number[] };

const WRITE_FIXTURES: Fx[] = [
  // Directory: user lifecycle
  { family: 'admin.directory', name: 'users.post', method: 'POST', okStatuses: [200] },
  { family: 'admin.directory', name: 'users.post.seat-limit-400', method: 'POST', okStatuses: [400] }, // trial seat cap: "Domain user limit reached"
  { family: 'admin.directory', name: 'users.put', method: 'PUT', okStatuses: [200] }, // suspend / restore / profile
  { family: 'admin.directory', name: 'users.signOut.post', method: 'POST', okStatuses: [204] },
  { family: 'admin.directory', name: 'users.delete', method: 'DELETE', okStatuses: [204] },
  { family: 'admin.directory', name: 'customer.my_customer.orgunits.post', method: 'POST', okStatuses: [200] },
  // Directory: groups
  { family: 'admin.directory', name: 'groups.post', method: 'POST', okStatuses: [200] },
  { family: 'admin.directory', name: 'groups.00gjdgxs0trarmx.patch', method: 'PATCH', okStatuses: [200] },
  { family: 'admin.directory', name: 'groups.00gjdgxs0trarmx.members.post', method: 'POST', okStatuses: [200] },
  { family: 'admin.directory', name: 'groups.00gjdgxs0trarmx.members.delete', method: 'DELETE', okStatuses: [204] },
  { family: 'admin.directory', name: 'groups.00gjdgxs0trarmx.delete', method: 'DELETE', okStatuses: [204] },
  { family: 'admin.directory', name: 'groups.03ygebqi2qpwo7u.members.delete', method: 'DELETE', okStatuses: [204] }, // offboarding remove_from_groups
  // Gmail settings (impersonating the mailbox owner)
  { family: 'gmail', name: 'users.me.settings.delegates.post', method: 'POST', okStatuses: [200] },
  { family: 'gmail', name: 'users.me.settings.delegates.delete', method: 'DELETE', okStatuses: [204] },
  { family: 'gmail', name: 'users.me.settings.forwardingAddresses.post', method: 'POST', okStatuses: [200] },
  { family: 'gmail', name: 'users.me.settings.autoForwarding.put', method: 'PUT', okStatuses: [200] },
  { family: 'gmail', name: 'users.me.settings.sendAs.put', method: 'PUT', okStatuses: [200] },
  // Offboarding data transfer (Drive + Calendar), with completion polling
  { family: 'admin.datatransfer', name: 'transfers.post', method: 'POST', okStatuses: [200] },
  { family: 'admin.datatransfer', name: 'transfers.get', method: 'GET', okStatuses: [200] },
  // 2026-09-08 retest: undelete, auto-reply, per-user licence (incl. Google's auto-licensing refusal)
  { family: 'admin.directory', name: 'users.undelete.post', method: 'POST', okStatuses: [204] },
  { family: 'gmail', name: 'users.me.settings.vacation.put', method: 'PUT', okStatuses: [200] },
  { family: 'apps', name: 'licensing.product.Google-Apps.sku.user.get', method: 'GET', okStatuses: [200] },
  { family: 'apps', name: 'licensing.product.Google-Apps.sku.user.delete', method: 'DELETE', okStatuses: [400] }, // auto-assigned SKU: Google refuses per-user removal
  // Seeds used by the run
  { family: 'drive', name: 'files.post', method: 'POST', okStatuses: [200] },
  { family: 'calendar', name: 'calendars.primary.events.post', method: 'POST', okStatuses: [200] },
];

// Anything that is not a sanitizer alias domain is a leak.
const EMAIL = /[A-Za-z0-9._%+-]+(?:@|%40)([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const ALLOWED_DOMAINS = new Set(['example.com', 'example.net', 'googleapis.com', 'google.com']);

describe('Google Workspace write fixtures (recorded live, leak-free)', () => {
  for (const f of WRITE_FIXTURES) {
    it(`${f.family}/${f.name} — recorded ${f.method}, expected status, no real mailbox`, () => {
      const fx = loadGoogleFixture(f.family, f.name);
      expect(fx.request.method).toBe(f.method);
      expect(f.okStatuses).toContain(fx.response.status);
      const text = JSON.stringify(fx);
      for (const m of text.matchAll(EMAIL)) {
        const domain = m[1].toLowerCase();
        expect(ALLOWED_DOMAINS.has(domain)).toBe(true);
      }
      expect(text).not.toMatch(/BEGIN (RSA )?PRIVATE KEY|ya29\./);
    });
  }

  it('the offboarding transfer fixture records a COMPLETED transfer for both Drive and Calendar', () => {
    const fx = loadGoogleFixture('admin.datatransfer', 'transfers.get');
    const data = fx.response.data as { overallTransferStatusCode?: string; applicationDataTransfers?: Array<{ applicationId: string; applicationTransferStatus: string }> };
    expect(data.overallTransferStatusCode).toBe('completed');
    const apps = (data.applicationDataTransfers || []).map(a => `${a.applicationId}:${a.applicationTransferStatus}`);
    expect(apps).toEqual(expect.arrayContaining(['55656082996:completed', '435070579839:completed']));
  });
});

describe('Google SDK replay of recorded writes (no network)', () => {
  afterEach(() => resetGoogleReplay());

  it('users.update (suspend) is served from the users.put fixture through the gaxios seam', async () => {
    const fx = loadGoogleFixture('admin.directory', 'users.put');
    useGoogleReplay(fx);
    installGoogleSdkSeam();
    const admin = google.admin({ version: 'directory_v1' });
    const res = await Promise.race([
      admin.users.update({ userKey: 'departing@example.com', requestBody: { suspended: true } }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('seam did not intercept')), 3000)),
    ]);
    expect(res.status).toBe(fx.response.status);
    expect((res.data as { primaryEmail?: string }).primaryEmail).toBe((fx.response.data as { primaryEmail?: string }).primaryEmail);
  });

  it('gmail delegates.create is served from the recorded fixture', async () => {
    const fx = loadGoogleFixture('gmail', 'users.me.settings.delegates.post');
    useGoogleReplay(fx);
    installGoogleSdkSeam();
    const gmail = google.gmail({ version: 'v1' });
    const res = await Promise.race([
      gmail.users.settings.delegates.create({ userId: 'me', requestBody: { delegateEmail: 'user2@example.com' } }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('seam did not intercept')), 3000)),
    ]);
    expect(res.status).toBe(200);
    expect((res.data as { verificationStatus?: string }).verificationStatus).toBe('accepted');
  });
});
