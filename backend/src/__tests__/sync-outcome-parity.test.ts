/**
 * Both platforms must report a failed sync the same way.
 *
 * Found live on 2026-09-13, minutes after the trial workspace was deleted: every Google
 * sync failed with `invalid_grant`, the server logged it, and the admin screen kept
 * showing "synced 21m ago" with no sign of trouble. Two causes, both pinned here:
 *
 *   1. Google recorded no outcome anywhere. Microsoft has carried last_sync_at,
 *      sync_status and sync_error on its credentials row since it was built; Google's
 *      had none, so nothing could be shown after a page reload.
 *   2. `POST /sync-now` answered HTTP 200 with success:false in the body, so any caller
 *      checking the status code read a failure as a success.
 *
 * A permanently broken connection must never look like a healthy one.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

describe('sync failures are reported, not swallowed', () => {
  it('the Google credentials table records the outcome, like Microsoft does', () => {
    const migration = read('backend/database/migrations/099_google_sync_outcome.sql');
    for (const column of ['last_sync_at', 'sync_status', 'sync_error']) {
      expect(migration).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
    }
    expect(migration).toMatch(/ALTER TABLE gw_credentials/);
  });

  it('the scheduler writes both outcomes', () => {
    const scheduler = read('backend/src/services/sync-scheduler.service.ts');
    expect(scheduler).toMatch(/sync_status = 'completed', sync_error = NULL/);
    expect(scheduler).toMatch(/sync_status = 'failed', sync_error = \$2/);
  });

  it('a failed manual sync does not answer 200', () => {
    const route = read('backend/src/routes/google-workspace.routes.ts');
    expect(route).toMatch(/res\.status\(result\.success \? 200 : 502\)/);
    // The bug was `res.json(result)` with no status: success in the envelope, failure in the body.
    expect(route).not.toMatch(/const result = await syncScheduler\.manualSync\(organizationId\);\s*\n\s*res\.json\(result\);/);
  });

  it('sync-status reports Google state and error, not just a timestamp', () => {
    const routes = read('backend/src/routes/organization.routes.ts');
    expect(routes).toMatch(/c\.sync_status/);
    expect(routes).toMatch(/c\.sync_error/);
    expect(routes).toMatch(/LEFT JOIN gw_credentials c/);
  });
});
