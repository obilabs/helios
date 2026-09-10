/**
 * Offboarding "release the address": rename the account, drop the alias Google
 * keeps on the old address, create a group on the old address delivering to
 * the forwarding target, move the Helios row. Offline; Google mocked.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }>>();
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: mockQuery } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../services/lifecycle-log.service.js', () => ({
  lifecycleLogService: { logSuccess: jest.fn(async () => undefined), logFailure: jest.fn(async () => undefined), logSkipped: jest.fn(async () => undefined) },
}));
jest.unstable_mockModule('../services/org-policy.service.js', () => ({
  orgPolicyService: { resolveLocalUser: jest.fn(async () => null), checkNoOrphans: jest.fn(async () => ({ ok: true, reports: [] })), describeOrphans: jest.fn(() => '') },
}));
jest.unstable_mockModule('../services/user-snapshot.service.js', () => ({
  userSnapshotService: { capture: jest.fn(async () => ({ success: true, snapshot: { id: 's', snapshot: { partial: [] } } })) },
}));
const gws = {
  renameUserPrimaryEmail: jest.fn<any>(),
  deleteUserAlias: jest.fn<any>(),
  createGroup: jest.fn<any>(),
  addGroupMember: jest.fn<any>(),
  getUserRaw: jest.fn<any>(async () => ({ success: true, user: { aliases: [] } })),
};
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({ googleWorkspaceService: gws }));
jest.unstable_mockModule('googleapis', () => ({ google: {} }));
jest.unstable_mockModule('google-auth-library', () => ({ JWT: class {} }));

const { userOffboardingService } = await import('../services/user-offboarding.service.js');

const ORG = 'org-1';
const localUser = { id: 'u-1', email: 'todd@example.net', google_workspace_id: 'g-1' };
const baseConfig: any = {
  userId: 'u-1',
  userEmail: 'todd@example.net',
  emailAction: 'forward_user',
  emailForwardAddress: 'mike@example.com',
  emailReleaseAddress: true,
  emailReleasePrefix: 'deprovisioned',
  emailReleaseGroupEnabled: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  gws.renameUserPrimaryEmail.mockResolvedValue({ success: true });
  gws.deleteUserAlias.mockResolvedValue({ success: true });
  gws.createGroup.mockResolvedValue({ success: true });
  gws.addGroupMember.mockResolvedValue({ success: true });
  jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => { fn(); return 0 as any; }) as any);
});

describe('releaseAddress', () => {
  it('renames, drops the alias, creates the group with the forwarding target, moves the Helios row', async () => {
    const svc = userOffboardingService;
    const r = await svc.releaseAddress(ORG, baseConfig, localUser);
    expect(r).toEqual({ success: true, oldEmail: 'todd@example.net', newEmail: 'deprovisioned.todd@example.net', groupEmail: 'todd@example.net', groupMember: 'mike@example.com' });
    expect(gws.renameUserPrimaryEmail).toHaveBeenCalledWith(ORG, 'g-1', 'deprovisioned.todd@example.net');
    expect(gws.deleteUserAlias).toHaveBeenCalledWith(ORG, 'g-1', 'todd@example.net');
    expect(gws.createGroup).toHaveBeenCalledWith(ORG, 'todd@example.net', 'Former: todd', expect.stringContaining('todd@example.net'));
    expect(gws.addGroupMember).toHaveBeenCalledWith(ORG, 'todd@example.net', 'mike@example.com');
    const rowMove = mockQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE organization_users SET email = $3'));
    expect(rowMove?.[1]).toEqual(['u-1', ORG, 'deprovisioned.todd@example.net']);
  });

  it('is a no-op on an account already renamed', async () => {
    const svc = userOffboardingService;
    const r = await svc.releaseAddress(ORG, { ...baseConfig, userEmail: 'deprovisioned.todd@example.net' }, { ...localUser, email: 'deprovisioned.todd@example.net' });
    expect(r.success).toBe(true);
    expect(gws.renameUserPrimaryEmail).not.toHaveBeenCalled();
  });

  it('skips the group when disabled, still renames and frees the address', async () => {
    const svc = userOffboardingService;
    const r = await svc.releaseAddress(ORG, { ...baseConfig, emailReleaseGroupEnabled: false }, localUser);
    expect(r.success).toBe(true);
    expect(r.groupEmail).toBeNull();
    expect(gws.createGroup).not.toHaveBeenCalled();
  });

  it('fails cleanly when Google refuses the rename; nothing else is attempted', async () => {
    gws.renameUserPrimaryEmail.mockResolvedValue({ success: false, error: 'Invalid Input: primary_user_email' });
    const svc = userOffboardingService;
    const r = await svc.releaseAddress(ORG, baseConfig, localUser);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Rename refused/);
    expect(gws.deleteUserAlias).not.toHaveBeenCalled();
    expect(gws.createGroup).not.toHaveBeenCalled();
  });

  it('a group that already exists is reused', async () => {
    gws.createGroup.mockResolvedValue({ success: false, error: 'Entity already exists.' });
    const svc = userOffboardingService;
    const r = await svc.releaseAddress(ORG, baseConfig, localUser);
    expect(r.success).toBe(true);
    expect(gws.addGroupMember).toHaveBeenCalledTimes(1);
  });
});
