/**
 * fetchLoginActivity follows nextPageToken across the window. It used to read
 * only the first page (at most 1,000 events), so a busy workspace's first 7-day
 * pull was cut short without a word. It stops at a page limit and warns.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: jest.fn() } }));
jest.unstable_mockModule('../utils/logger.js', () => ({ logger: log }));

const { googleWorkspaceService, LOGIN_ACTIVITY_MAX_PAGES } = await import('../services/google-workspace.service.js');

const list = jest.fn<(...args: any[]) => Promise<any>>();
const svc = googleWorkspaceService as any;

const item = (n: number) => ({
  id: { time: `2026-11-20T10:00:${String(n % 60).padStart(2, '0')}Z`, uniqueQualifier: `q${n}` },
  actor: { email: `user${n}@example.com`, profileId: `p${n}` },
  ipAddress: '203.0.113.10',
  events: [{ type: 'login_success', parameters: [] as any[] }],
});

/** A page of `size` events; `next` is the token for the following page, if any. */
const page = (start: number, size: number, next?: string) => ({
  data: { items: Array.from({ length: size }, (_, i) => item(start + i)), ...(next ? { nextPageToken: next } : {}) },
});

beforeEach(() => {
  list.mockReset();
  Object.values(log).forEach((fn) => fn.mockReset());
  svc.getCredentials = jest.fn(async () => ({ client_email: 'sa@example.com', private_key: 'k' }));
  svc.getAdminEmail = jest.fn(async () => 'admin@example.com');
  svc.createReportsClient = jest.fn(() => ({ activities: { list } }));
});

describe('fetchLoginActivity paging', () => {
  it('follows nextPageToken until the window is exhausted', async () => {
    list
      .mockResolvedValueOnce(page(0, 3, 't1'))
      .mockResolvedValueOnce(page(3, 3, 't2'))
      .mockResolvedValueOnce(page(6, 2));

    const r = await googleWorkspaceService.fetchLoginActivity('org-1', {
      startTime: new Date('2026-11-13T00:00:00Z'),
      endTime: new Date('2026-11-20T00:00:00Z'),
    });

    expect(r.success).toBe(true);
    expect(r.events).toHaveLength(8);
    expect(list).toHaveBeenCalledTimes(3);
    expect(list.mock.calls[0][0]).not.toHaveProperty('pageToken');
    expect(list.mock.calls[1][0]).toMatchObject({ pageToken: 't1', startTime: '2026-11-13T00:00:00.000Z' });
    expect(list.mock.calls[2][0]).toMatchObject({ pageToken: 't2', endTime: '2026-11-20T00:00:00.000Z' });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('stops at the page limit and warns', async () => {
    list.mockImplementation(async (args: any) => page(0, 2, `after-${args.pageToken ?? 'first'}`));

    const r = await googleWorkspaceService.fetchLoginActivity('org-1', { maxPages: 4 });

    expect(list).toHaveBeenCalledTimes(4);
    expect(r.events).toHaveLength(8);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringMatching(/page limit/),
      expect.objectContaining({ organizationId: 'org-1', pages: 4 }),
    );
  });

  it('the default limit is 20 pages', async () => {
    expect(LOGIN_ACTIVITY_MAX_PAGES).toBe(20);
    list.mockImplementation(async () => page(0, 1, 'more'));
    await googleWorkspaceService.fetchLoginActivity('org-1');
    expect(list).toHaveBeenCalledTimes(20);
  });

  it('a single page with no token is one request', async () => {
    list.mockResolvedValueOnce(page(0, 5));
    const r = await googleWorkspaceService.fetchLoginActivity('org-1');
    expect(r.events).toHaveLength(5);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
