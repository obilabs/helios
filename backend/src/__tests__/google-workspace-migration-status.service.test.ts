import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Unit tests for GoogleWorkspaceService.fetchDataMigrationActivity — the read-only
 * migration-progress feed built from Google's `data_migration` audit stream. These
 * assert the two improvements added for live M365->Google migrations:
 *   1. ACCURATE TOTALS — page through `nextPageToken` and aggregate counts across
 *      every page (a single page caps at 1000), bounded by `maxPages`.
 *   2. FAILURE DETAIL + per-target breakdown — surface each CRAWL_FAILURE's
 *      source/target/reason and a per-migrated-user rollup.
 * The Reports API client is mocked.
 */

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Mock the Reports API surface fetchDataMigrationActivity uses:
// google.admin({version:'reports_v1'}).activities.list(...)
const mockActivitiesList = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('googleapis', () => ({
  google: {
    admin: jest.fn(() => ({
      activities: { list: mockActivitiesList },
    })),
  },
}));

jest.unstable_mockModule('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({ authorize: jest.fn(async () => ({})) })),
}));

const { googleWorkspaceService } = await import('../services/google-workspace.service.js');

const SA_KEY_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'sa@project.iam.gserviceaccount.com',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
});

// Build a Reports API `activities.list` item for one data_migration event.
function evt(name: string, params: Record<string, string>, time = '2026-08-31T12:00:00.000Z') {
  return {
    id: { time },
    actor: { email: 'admin@obilabs.dev' },
    events: [
      {
        name,
        type: 'migration',
        parameters: Object.entries(params).map(([n, v]) => ({ name: n, value: v })),
      },
    ],
  };
}

describe('GoogleWorkspaceService.fetchDataMigrationActivity', () => {
  const orgId = 'org-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockImplementation(async (text: string) => {
      if (typeof text === 'string' && text.includes('gw_credentials')) {
        return { rows: [{ service_account_key: SA_KEY_JSON, admin_email: 'admin@obilabs.dev' }] };
      }
      return { rows: [] };
    });
  });

  it('pages through nextPageToken and aggregates TRUE totals across pages', async () => {
    mockActivitiesList
      .mockResolvedValueOnce({
        data: {
          items: [
            evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'alice@dest.com', EXECUTION_ID: 'ex1' }),
            evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'alice@dest.com', EXECUTION_ID: 'ex1' }),
          ],
          nextPageToken: 'p2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            evt('CREATE_CALENDAR_EVENT', { TARGET_IDENTIFIER: 'alice@dest.com', EXECUTION_ID: 'ex1' }),
          ],
          // no nextPageToken -> last page
        },
      });

    const res = await googleWorkspaceService.fetchDataMigrationActivity(orgId);

    expect(res.success).toBe(true);
    // Totals reflect BOTH pages, not just the most-recent one.
    expect(res.summary?.total).toBe(3);
    expect(res.summary?.byName).toEqual({ CREATE_GMAIL_MESSAGE: 2, CREATE_CALENDAR_EVENT: 1 });
    expect(res.summary?.pagesFetched).toBe(2);
    expect(res.summary?.truncated).toBe(false);

    // Second call continues from the token; first has no token.
    expect(mockActivitiesList).toHaveBeenCalledTimes(2);
    expect(mockActivitiesList.mock.calls[0][0]).toEqual(
      expect.objectContaining({ applicationName: 'data_migration', userKey: 'all', maxResults: 1000 })
    );
    expect(mockActivitiesList.mock.calls[0][0].pageToken).toBeUndefined();
    expect(mockActivitiesList.mock.calls[1][0].pageToken).toBe('p2');
  });

  it('surfaces per-item failure detail (user/source/reason) for CRAWL_FAILURE', async () => {
    mockActivitiesList.mockResolvedValueOnce({
      data: {
        items: [
          evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'users/bob@dest.com/messages/abc', SOURCE_NAME: 'bob@dest.com' }),
          // A real OneDrive CRAWL_FAILURE: reason in MIGRATION_ERROR_TITLE, empty
          // TARGET_IDENTIFIER, user derivable from the drives/<email> source path.
          evt('CRAWL_FAILURE', {
            MIGRATION_TYPE: 'Microsoft OneDrive Migration',
            SOURCE_IDENTIFIER: 'drives/todd@dest.com',
            TARGET_IDENTIFIER: '',
            MIGRATION_ERROR_TITLE: 'Item exceeded size limit',
            MIGRATION_ERROR_CODE: 'SIZE_LIMIT',
            EXECUTION_ID: 'ex9',
          }),
        ],
      },
    });

    const res = await googleWorkspaceService.fetchDataMigrationActivity(orgId);

    expect(res.summary?.failures).toBe(1);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]).toEqual(
      expect.objectContaining({
        user: 'todd@dest.com',
        source: 'drives/todd@dest.com',
        reason: 'Item exceeded size limit', // MIGRATION_ERROR_TITLE wins the fallback chain
        executionId: 'ex9',
      })
    );
  });

  it('collapses per-message TARGET_IDENTIFIERs into ONE per-user group (the real DMS shape)', async () => {
    // Every Gmail message has a UNIQUE users/<email>/messages/<id> target, but they
    // all belong to one mailbox owner (SOURCE_NAME) — must be a single user group.
    mockActivitiesList.mockResolvedValueOnce({
      data: {
        items: [
          evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'users/tubears@dest.com/messages/aaa', SOURCE_NAME: 'tubears@dest.com' }),
          evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'users/tubears@dest.com/messages/bbb', SOURCE_NAME: 'tubears@dest.com' }),
          evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'users/tubears@dest.com/messages/ccc', SOURCE_NAME: 'tubears@dest.com' }),
        ],
      },
    });

    const res = await googleWorkspaceService.fetchDataMigrationActivity(orgId);

    expect(res.byUser).toHaveLength(1);
    expect(res.byUser[0].user).toBe('tubears@dest.com');
    expect(res.byUser[0].total).toBe(3);
  });

  it('groups a per-migrated-user breakdown by mailbox owner, sorted by volume, with failures', async () => {
    mockActivitiesList.mockResolvedValueOnce({
      data: {
        items: [
          evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'users/alice@dest.com/messages/1', SOURCE_NAME: 'alice@dest.com' }),
          evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'users/alice@dest.com/messages/2', SOURCE_NAME: 'alice@dest.com' }),
          evt('CRAWL_FAILURE', { SOURCE_IDENTIFIER: 'drives/alice@dest.com', MIGRATION_ERROR_TITLE: 'boom' }),
          evt('CREATE_CONTACT', { TARGET_IDENTIFIER: 'users/bob@dest.com/contacts/9', SOURCE_NAME: 'bob@dest.com' }),
          // Setup event with no user — must NOT create a group.
          evt('CREATE_CONNECTION', { EXECUTION_ID: 'setup1' }),
        ],
      },
    });

    const res = await googleWorkspaceService.fetchDataMigrationActivity(orgId);

    expect(res.byUser).toHaveLength(2); // alice + bob only; the setup event is excluded
    // Sorted by total desc — alice (3) before bob (1).
    expect(res.byUser[0].user).toBe('alice@dest.com');
    expect(res.byUser[0].total).toBe(3);
    expect(res.byUser[0].failures).toBe(1);
    expect(res.byUser[0].byName).toEqual({ CREATE_GMAIL_MESSAGE: 2, CRAWL_FAILURE: 1 });
    expect(res.byUser[1].user).toBe('bob@dest.com');
    expect(res.byUser[1].total).toBe(1);
    expect(res.byUser[1].failures).toBe(0);
  });

  it('stops at maxPages and flags the result as truncated (counts are a lower bound)', async () => {
    // Every page reports another page available.
    mockActivitiesList.mockResolvedValue({
      data: {
        items: [evt('CREATE_GMAIL_MESSAGE', { TARGET_IDENTIFIER: 'alice@dest.com' })],
        nextPageToken: 'more',
      },
    });

    const res = await googleWorkspaceService.fetchDataMigrationActivity(orgId, { maxPages: 2 });

    expect(res.success).toBe(true);
    expect(res.summary?.truncated).toBe(true);
    expect(res.summary?.pagesFetched).toBe(2);
    expect(mockActivitiesList).toHaveBeenCalledTimes(2);
  });

  it('returns an error result when credentials are missing', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [] }));

    const res = await googleWorkspaceService.fetchDataMigrationActivity(orgId);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/credentials/i);
    expect(res.failures).toEqual([]);
    expect(res.byUser).toEqual([]);
    expect(mockActivitiesList).not.toHaveBeenCalled();
  });
});
