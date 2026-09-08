/**
 * Snapshot before change, re-create after Google's undelete window.
 *
 * Offline: the Google service is mocked. What must hold:
 *   - a snapshot is refused when the profile cannot be read (nothing to re-create from)
 *   - a section that fails is listed in `partial`, the snapshot still lands
 *   - re-create sends the profile minus Google's read-only fields, then groups and licences
 *   - a "not found" on group add is retried (Google reads lag writes), other errors are not
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

type QueryResult = { rows: any[] };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: mockQuery } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const gws = {
  getUserRaw: jest.fn<any>(),
  getUserGroups: jest.fn<any>(),
  getUserGoogleLicenses: jest.fn<any>(),
  getEmailSettings: jest.fn<any>(),
  listGmailDelegates: jest.fn<any>(),
  getUserSignature: jest.fn<any>(),
  createUserFromRecord: jest.fn<any>(),
  addUserToGroup: jest.fn<any>(),
  assignGoogleLicense: jest.fn<any>(),
};
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({ googleWorkspaceService: gws }));

const { userSnapshotService } = await import('../services/user-snapshot.service.js');

const ORG = 'org-1';
const PROFILE = {
  kind: 'admin#directory#user',
  id: '1001',
  etag: '"x"',
  primaryEmail: 'user1@example.com',
  name: { givenName: 'U', familyName: 'One', fullName: 'U One' },
  isAdmin: false,
  creationTime: '2026-01-01T00:00:00.000Z',
  suspended: true,
  orgUnitPath: '/Engineering',
  relations: [{ type: 'manager', value: 'boss@example.com' }],
  emails: [{ address: 'user1@example.com', primary: true }, { address: 'u1-alt@example.com', type: 'work' }],
  phones: [{ type: 'mobile', value: '+1 555 0100' }],
  aliases: ['u1@example.com'],
  customerId: 'C0123',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation(async (text: string) => {
    if (text.startsWith('INSERT INTO user_google_snapshots')) {
      return { rows: [{ id: 'snap-1', snapshot: JSON.parse(String((mockQuery.mock.calls.at(-1) as any)[1][5])) }] };
    }
    return { rows: [] };
  });
  gws.getUserRaw.mockResolvedValue({ success: true, user: PROFILE });
  gws.getUserGroups.mockResolvedValue({ success: true, data: [{ id: 'g1', email: 'team@example.com', name: 'Team' }] });
  gws.getUserGoogleLicenses.mockResolvedValue({ success: true, licenses: [{ productId: 'Google-Apps', skuId: '1010020025', skuName: 'Business Plus' }] });
  gws.getEmailSettings.mockResolvedValue({ success: true, settings: { forwarding: { enabled: false }, vacation: { enabled: false }, delegateCount: 0 } });
  gws.listGmailDelegates.mockResolvedValue({ success: true, delegates: [] });
  gws.getUserSignature.mockResolvedValue({ success: true, signature: '<p>sig</p>' });
});

describe('capture', () => {
  it('refuses when the profile cannot be read', async () => {
    gws.getUserRaw.mockResolvedValue({ success: false, error: 'Not Found' });
    const r = await userSnapshotService.capture(ORG, { googleWorkspaceId: '1001', primaryEmail: 'user1@example.com', reason: 'delete' });
    expect(r.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('stores profile, groups, licences, mail and signature; a failed section is listed as partial', async () => {
    gws.getEmailSettings.mockRejectedValue(new Error('gmail 403'));
    const r = await userSnapshotService.capture(ORG, { userId: 'u-1', googleWorkspaceId: '1001', primaryEmail: 'user1@example.com', reason: 'offboard', takenBy: 'admin-1' });
    expect(r.success).toBe(true);
    const insert = mockQuery.mock.calls.find((c) => String(c[0]).startsWith('INSERT INTO user_google_snapshots'))!;
    const params = insert[1] as any[];
    expect(params.slice(0, 5)).toEqual([ORG, 'u-1', '1001', 'user1@example.com', 'offboard']);
    const body = JSON.parse(params[5]);
    expect(body.profile.primaryEmail).toBe('user1@example.com');
    expect(body.groups).toEqual([{ id: 'g1', email: 'team@example.com', name: 'Team' }]);
    expect(body.licenses[0].skuId).toBe('1010020025');
    expect(body.signature).toBe('<p>sig</p>');
    expect(body.partial).toEqual(['mail']);
  });
});

describe('recreate', () => {
  const row = {
    id: 'snap-1',
    organization_id: ORG,
    snapshot: {
      profile: PROFILE,
      groups: [{ email: 'team@example.com' }, { email: 'all@example.com' }],
      licenses: [{ productId: 'Google-Apps', skuId: '1010020025' }],
      mail: {},
      signature: null as string | null,
      partial: [] as string[],
    },
  };

  beforeEach(() => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.startsWith('SELECT * FROM user_google_snapshots WHERE id')) return { rows: [row] };
      return { rows: [] };
    });
    gws.createUserFromRecord.mockResolvedValue({ success: true, userId: '2002' });
    gws.addUserToGroup.mockResolvedValue({ success: true });
    gws.assignGoogleLicense.mockResolvedValue({ success: true });
  });

  it('re-creates from the stored profile with a one-time password, then groups and licence', async () => {
    const r = await userSnapshotService.recreate(ORG, 'snap-1', { actorId: 'admin-1' });
    expect(r.success).toBe(true);
    expect(r.googleWorkspaceId).toBe('2002');
    expect(r.restored).toEqual({ groups: 2, licenses: 1 });
    expect(r.failures).toEqual([]);

    const [, record, opts] = gws.createUserFromRecord.mock.calls[0] as any[];
    expect(record).toBe(PROFILE);
    expect(typeof opts.password).toBe('string');
    expect(opts.password.length).toBeGreaterThanOrEqual(16);
    expect(opts.changePasswordAtNextLogin).toBe(true);

    expect(gws.addUserToGroup).toHaveBeenCalledWith(ORG, 'user1@example.com', 'team@example.com');
    expect(gws.assignGoogleLicense).toHaveBeenCalledWith(ORG, 'user1@example.com', '1010020025', 'Google-Apps');
    const mark = mockQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE user_google_snapshots SET restored_at'))!;
    expect((mark[1] as any[])[2]).toBe('2002');
  });

  it('fails cleanly when Google refuses the insert; nothing else is attempted', async () => {
    gws.createUserFromRecord.mockResolvedValue({ success: false, error: 'Entity already exists.' });
    const r = await userSnapshotService.recreate(ORG, 'snap-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/already exists/);
    expect(gws.addUserToGroup).not.toHaveBeenCalled();
    expect(gws.assignGoogleLicense).not.toHaveBeenCalled();
  });

  it('retries a group add that says the new user is not found yet; reports other failures', async () => {
    gws.addUserToGroup
      .mockResolvedValueOnce({ success: false, error: 'Resource Not Found: memberKey' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Forbidden' });
    gws.assignGoogleLicense.mockResolvedValue({ success: false, error: 'auto-assigned feature enabled' });
    const r = await userSnapshotService.recreate(ORG, 'snap-1');
    expect(r.success).toBe(true);
    expect(r.restored).toEqual({ groups: 1, licenses: 0 });
    expect(r.failures).toEqual(['group all@example.com', 'licence 1010020025: auto-assigned feature enabled']);
  }, 15000);
});
