/**
 * Provisioning write-through: when the migration plan provisions a Google
 * destination account, the new account must appear in the Helios directory
 * (organization_users) IMMEDIATELY — not only after the next sync. These tests
 * mock the DB + Google service and assert provisionMigrationDestinations both
 * creates the account AND writes it through to organization_users (INSERT when
 * no row exists, UPDATE when a same-identity source row already does), and that
 * a write-through failure never fails the provisioning itself.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: mockQuery } }));

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockCreateUser = jest.fn<(orgId: string, u: any) => Promise<any>>();
const mockListDomains = jest.fn<(orgId: string) => Promise<any>>();
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: {
    createUser: mockCreateUser,
    listGoogleWorkspaceDomains: mockListDomains,
    createGroup: jest.fn(),
    addGmailDelegate: jest.fn(),
    addGroupMember: jest.fn(),
  },
}));

const { MigrationPlanService } = await import('../services/migration/migration-plan.service.js');

const svc = new MigrationPlanService();

/** One M365 source on a verified workspace domain -> same-identity destination. */
const MS_ROW = {
  microsoft_365_id: 'm1',
  microsoft_365_upn: 'todd@tmscanada.ca',
  user_type: 'staff',
  email: 'todd@tmscanada.ca',
  name: 'Todd Example',
};

/**
 * Route db.query by SQL text. `existingWriteThroughRow` decides whether the
 * write-through existence check finds a row (UPDATE) or not (INSERT).
 */
function primeDb(opts: { existingWriteThroughRow: boolean; existenceThrows?: boolean }) {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('organization_settings')) return { rows: [] }; // no persisted plan
    if (text.includes('microsoft_365_id IS NOT NULL')) return { rows: [MS_ROW] };
    if (text.includes('google_workspace_id IS NOT NULL')) return { rows: [] }; // no existing Google users
    if (text.includes('SELECT id FROM organization_users')) {
      if (opts.existenceThrows) throw new Error('db down');
      return { rows: opts.existingWriteThroughRow ? [{ id: 'row-99' }] : [] };
    }
    return { rows: [] }; // UPDATE / INSERT write-through
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListDomains.mockResolvedValue({
    success: true,
    domains: [{ domainName: 'tmscanada.ca', verified: true }],
  });
  mockCreateUser.mockResolvedValue({ success: true, userId: 'gid-new' });
});

describe('provisioning write-through', () => {
  it('INSERTs a new organization_users row when none exists for the destination', async () => {
    primeDb({ existingWriteThroughRow: false });

    const res = await svc.provisionMigrationDestinations('org-1', true);

    expect(res.created).toBe(1);
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    const insert = mockQuery.mock.calls.find((c) => /INSERT INTO organization_users/i.test(c[0]));
    expect(insert).toBeTruthy();
    // The new Google id is written through onto the directory row.
    expect(insert![1]).toContain('gid-new');
    expect(insert![1]).toContain('todd@tmscanada.ca');
  });

  it('UPDATEs the existing same-identity row (links Google in place, keeps M365 side)', async () => {
    primeDb({ existingWriteThroughRow: true });

    const res = await svc.provisionMigrationDestinations('org-1', true);

    expect(res.created).toBe(1);
    const update = mockQuery.mock.calls.find(
      (c) => /UPDATE organization_users/i.test(c[0]) && /google_workspace_id/i.test(c[0]),
    );
    expect(update).toBeTruthy();
    expect(update![1]).toEqual(['gid-new', 'row-99']);
    // No INSERT when a row already exists.
    expect(mockQuery.mock.calls.some((c) => /INSERT INTO organization_users/i.test(c[0]))).toBe(false);
  });

  it('does NOT run write-through in dry-run mode (execute=false)', async () => {
    primeDb({ existingWriteThroughRow: false });

    const res = await svc.provisionMigrationDestinations('org-1', false);

    expect(res.created).toBe(0);
    expect(res.wouldCreate).toBe(1);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some((c) => /INSERT INTO organization_users/i.test(c[0]))).toBe(false);
  });

  it('a write-through DB failure does not fail provisioning (sync reconciles later)', async () => {
    primeDb({ existingWriteThroughRow: false, existenceThrows: true });

    const res = await svc.provisionMigrationDestinations('org-1', true);

    // The account was still created; the write-through error is swallowed.
    expect(res.created).toBe(1);
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
  });
});
