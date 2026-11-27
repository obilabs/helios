/**
 * Login activity is pulled by the backend (scheduler, start-up, connect step and
 * the refresh icon), never by opening the dashboard. One service does the pull;
 * these tests pin its window, its hourly limit, and that a failed pull never
 * fails the directory sync.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const query = jest.fn<(...args: any[]) => Promise<any>>();
const syncLoginActivity = jest.fn<(...args: any[]) => Promise<any>>();
const enrichLoginActivity = jest.fn<(...args: any[]) => Promise<any>>();
const log = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.unstable_mockModule('../database/connection.js', () => ({ db: { query } }));
jest.unstable_mockModule('../utils/logger.js', () => ({ logger: log }));
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: { syncLoginActivity, getUsers: jest.fn() },
}));
jest.unstable_mockModule('../services/geoip.service.js', () => ({
  geoipService: { enrichLoginActivity },
}));
// The scheduler's other collaborators: not exercised here.
jest.unstable_mockModule('../services/cache.service.js', () => ({
  cacheService: { invalidateDirectory: jest.fn() },
}));
jest.unstable_mockModule('../services/gw-credentials.js', () => ({ decodeServiceAccountKey: jest.fn() }));
jest.unstable_mockModule('../services/oauth-token-sync.service.js', () => ({
  OAuthTokenSyncService: class { syncAllTokens = jest.fn(); },
}));
jest.unstable_mockModule('../lib/sync-settings.js', () => ({ loadSyncSettings: jest.fn() }));
jest.unstable_mockModule('../services/microsoft-sync.service.js', () => ({
  microsoftSyncService: { syncAll: jest.fn() },
}));
jest.unstable_mockModule('../services/field-drift.service.js', () => ({
  fieldDriftService: { reconcileUser: jest.fn() },
}));

const {
  computeLoginPullWindow,
  LoginActivitySyncService,
  loginActivitySync,
  LOGIN_PULL_OVERLAP_MS,
  LOGIN_PULL_MAX_WINDOW_MS,
} = await import('../services/login-activity-sync.service.js');
const { SyncSchedulerService } = await import('../services/sync-scheduler.service.js');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-06-15T12:00:00.000Z');

/** The newest stored login event, as the MAX(login_timestamp) query returns it. */
const newestStored = (value: string | null) => ({ rows: [{ newest: value }] });

beforeEach(() => {
  query.mockReset();
  syncLoginActivity.mockReset();
  enrichLoginActivity.mockReset();
  Object.values(log).forEach((fn) => fn.mockReset());
  syncLoginActivity.mockResolvedValue({ success: true, fetched: 0, stored: 0, errors: 0 });
  enrichLoginActivity.mockResolvedValue({ updated: 0, errors: 0 });
});

describe('the pull window', () => {
  it('the first pull, with nothing stored, asks for the last 7 days', () => {
    const w = computeLoginPullWindow(null, NOW);
    expect(w.endTime).toEqual(NOW);
    expect(NOW.getTime() - w.startTime.getTime()).toBe(7 * DAY);
  });

  it('a later pull starts at the newest stored event minus the 2-hour overlap', () => {
    const newest = new Date(NOW.getTime() - 5 * HOUR);
    const w = computeLoginPullWindow(newest, NOW);
    expect(LOGIN_PULL_OVERLAP_MS).toBe(2 * HOUR);
    expect(w.startTime).toEqual(new Date(newest.getTime() - 2 * HOUR));
    expect(w.endTime).toEqual(NOW);
  });

  it('never covers more than 7 days, however old the newest stored event is', () => {
    const newest = new Date(NOW.getTime() - 30 * DAY);
    const w = computeLoginPullWindow(newest, NOW);
    expect(w.endTime.getTime() - w.startTime.getTime()).toBe(LOGIN_PULL_MAX_WINDOW_MS);
    expect(LOGIN_PULL_MAX_WINDOW_MS).toBe(7 * DAY);
  });

  it('a stored event dated after now still gives a forward window', () => {
    const w = computeLoginPullWindow(new Date(NOW.getTime() + 3 * HOUR), NOW);
    expect(w.startTime.getTime()).toBeLessThan(w.endTime.getTime());
  });
});

describe('pull', () => {
  it('asks Google for 7 days when nothing is stored', async () => {
    query.mockResolvedValueOnce(newestStored(null));
    const svc = new LoginActivitySyncService();
    await svc.pull('org-1', NOW);
    const [orgId, window] = syncLoginActivity.mock.calls[0] as any[];
    expect(orgId).toBe('org-1');
    expect(NOW.getTime() - window.startTime.getTime()).toBe(7 * DAY);
    expect(window.endTime).toEqual(NOW);
  });

  it('asks Google from the newest stored event minus the overlap', async () => {
    query.mockResolvedValueOnce(newestStored('2026-06-15T09:30:00.000Z'));
    const svc = new LoginActivitySyncService();
    await svc.pull('org-1', NOW);
    const [, window] = syncLoginActivity.mock.calls[0] as any[];
    expect(window.startTime.toISOString()).toBe('2026-06-15T07:30:00.000Z');
  });

  it('reads only this organization\'s Google events for the newest timestamp', async () => {
    query.mockResolvedValueOnce(newestStored(null));
    await new LoginActivitySyncService().pull('org-1', NOW);
    expect(String(query.mock.calls[0][0])).toMatch(/MAX\(login_timestamp\)/);
    expect(String(query.mock.calls[0][0])).toMatch(/source = 'google'/);
    expect(query.mock.calls[0][1]).toEqual(['org-1']);
  });

  it('enriches with GeoIP only what was stored', async () => {
    query.mockResolvedValueOnce(newestStored(null));
    syncLoginActivity.mockResolvedValueOnce({ success: true, fetched: 9, stored: 4, errors: 0 });
    enrichLoginActivity.mockResolvedValueOnce({ updated: 3, errors: 1 });
    const r = await new LoginActivitySyncService().pull('org-1', NOW);
    expect(enrichLoginActivity).toHaveBeenCalledWith('org-1', 4);
    expect(r).toMatchObject({ success: true, fetched: 9, stored: 4, geoEnriched: 3, errors: 1 });
  });

  it('overlapping callers share one pull instead of racing on inserts', async () => {
    query.mockResolvedValue(newestStored(null));
    const svc = new LoginActivitySyncService();
    await Promise.all([svc.pull('org-1', NOW), svc.pull('org-1', NOW)]);
    expect(syncLoginActivity).toHaveBeenCalledTimes(1);
  });

  it('a failure resolves with the reason and a warning, never throws', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    const r = await new LoginActivitySyncService().pull('org-1', NOW);
    expect(r.success).toBe(false);
    expect(r.error).toBe('database unavailable');
    expect(log.warn).toHaveBeenCalledWith('Login activity pull failed', expect.objectContaining({ reason: 'database unavailable' }));
  });

  it('a missing Reports scope is warned about once per backend start, not every run', async () => {
    query.mockResolvedValue(newestStored(null));
    syncLoginActivity.mockResolvedValue({ success: false, fetched: 0, stored: 0, errors: 1, error: 'unauthorized_client: Client is unauthorized' });
    const svc = new LoginActivitySyncService();
    await svc.pull('org-1', NOW);
    await svc.pull('org-1', new Date(NOW.getTime() + 2 * HOUR));
    await svc.pull('org-1', new Date(NOW.getTime() + 4 * HOUR));
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(String(log.warn.mock.calls[0][0])).toMatch(/admin\.reports\.audit\.readonly/);
  });

  it('an organization without Google connected is skipped quietly', async () => {
    query.mockResolvedValue(newestStored(null));
    syncLoginActivity.mockResolvedValue({ success: false, fetched: 0, stored: 0, errors: 1, error: 'No credentials found' });
    await new LoginActivitySyncService().pull('org-1', NOW);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('at most once an hour', () => {
  it('skips a pull when one ran less than an hour ago', async () => {
    query.mockResolvedValue(newestStored(null));
    const svc = new LoginActivitySyncService();
    await svc.pullIfDue('org-1', NOW);
    const skipped = await svc.pullIfDue('org-1', new Date(NOW.getTime() + 59 * 60 * 1000));
    expect(skipped).toBeNull();
    expect(syncLoginActivity).toHaveBeenCalledTimes(1);
  });

  it('runs a pull when the last one was more than an hour ago', async () => {
    query.mockResolvedValue(newestStored(null));
    const svc = new LoginActivitySyncService();
    await svc.pullIfDue('org-1', NOW);
    const ran = await svc.pullIfDue('org-1', new Date(NOW.getTime() + 61 * 60 * 1000));
    expect(ran).not.toBeNull();
    expect(syncLoginActivity).toHaveBeenCalledTimes(2);
  });

  it('the hourly limit is per organization', async () => {
    query.mockResolvedValue(newestStored(null));
    const svc = new LoginActivitySyncService();
    await svc.pullIfDue('org-1', NOW);
    await svc.pullIfDue('org-2', NOW);
    expect(syncLoginActivity).toHaveBeenCalledTimes(2);
  });
});

describe('the scheduled sync', () => {
  const tick = (s: InstanceType<typeof SyncSchedulerService>, orgId: string) =>
    (s as any).runScheduledSync(orgId) as Promise<void>;

  it('starts a login pull on each tick', async () => {
    const scheduler = new SyncSchedulerService();
    const directory = jest.spyOn(scheduler, 'syncOrganizationData').mockResolvedValue(undefined);
    const pull = jest.spyOn(loginActivitySync, 'pullIfDue').mockResolvedValue(null);
    query.mockResolvedValue({ rows: [] });
    await tick(scheduler, 'org-1');
    expect(directory).toHaveBeenCalledWith('org-1');
    expect(pull).toHaveBeenCalledWith('org-1');
    pull.mockRestore();
  });

  it('a failed login pull does not fail the directory sync', async () => {
    const scheduler = new SyncSchedulerService();
    const directory = jest.spyOn(scheduler, 'syncOrganizationData').mockResolvedValue(undefined);
    const pull = jest.spyOn(loginActivitySync, 'pullIfDue').mockRejectedValue(new Error('Reports API unavailable'));
    query.mockResolvedValue({ rows: [] });
    await expect(tick(scheduler, 'org-1')).resolves.toBeUndefined();
    await expect(scheduler.pullLoginActivity('org-1')).resolves.toBeNull();
    expect(directory).toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('Login activity pull failed', expect.objectContaining({ reason: 'Reports API unavailable' }));
    pull.mockRestore();
  });

  it('a hanging login pull does not hold up the tick', async () => {
    const scheduler = new SyncSchedulerService();
    jest.spyOn(scheduler, 'syncOrganizationData').mockResolvedValue(undefined);
    const pull = jest.spyOn(loginActivitySync, 'pullIfDue').mockReturnValue(new Promise(() => {}));
    query.mockResolvedValue({ rows: [] });
    await expect(tick(scheduler, 'org-1')).resolves.toBeUndefined();
    pull.mockRestore();
  });
});
