import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// The scan must list each account's own files. Listing as the admin alone
// misses every file another user owns and has not shared with the admin.

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN = 'admin@corp.test';

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

jest.unstable_mockModule('../services/gw-credentials.js', () => ({
  decodeServiceAccountKey: () => ({ client_email: 'sa@project.test', private_key: 'unused' }),
}));

// The JWT only carries the impersonated subject through to the fake Drive client.
jest.unstable_mockModule('google-auth-library', () => ({
  JWT: class {
    subject: string;
    constructor(opts: { subject: string }) {
      this.subject = opts.subject;
    }
  },
}));

type FakeFile = {
  id: string;
  name: string;
  owner: string;
  permissions: Array<{ id: string; type: string; role: string; emailAddress?: string; domain?: string }>;
};

let filesByOwner: Record<string, FakeFile[]> = {};
let failFor: Record<string, string> = {};
const listCalls: Array<{ subject: string; q: string; corpora?: string }> = [];
const deleteCalls: Array<{ subject: string; fileId: string; permissionId: string }> = [];

jest.unstable_mockModule('googleapis', () => ({
  google: {
    drive: ({ auth }: { auth: { subject: string } }) => ({
      files: {
        list: async (params: { q: string; corpora?: string }) => {
          listCalls.push({ subject: auth.subject, q: params.q, corpora: params.corpora });
          if (failFor[auth.subject]) throw new Error(failFor[auth.subject]);
          // An account sees the files it owns. The allDrives pass adds nothing here.
          const files = params.corpora === 'user' ? filesByOwner[auth.subject] || [] : [];
          return {
            data: {
              files: files.map(f => ({
                id: f.id,
                name: f.name,
                mimeType: 'application/vnd.google-apps.document',
                owners: [{ emailAddress: f.owner }],
                permissions: f.permissions,
              })),
            },
          };
        },
      },
      permissions: {
        delete: async (params: { fileId: string; permissionId: string }) => {
          deleteCalls.push({ subject: auth.subject, ...params });
          return {};
        },
      },
    }),
  },
}));

const { driveSharingAuditService } = await import('../services/drive-sharing-audit.service.js');

function mockDatabase(users: Array<{ email: string; is_suspended: boolean }>) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('service_account_key')) return { rows: [{ service_account_key: 'x' }] };
    if (sql.includes('admin_email')) return { rows: [{ admin_email: ADMIN }] };
    if (sql.includes('FROM organizations')) return { rows: [{ domain: 'corp.test' }] };
    if (sql.includes('gw_synced_users')) return { rows: users };
    return { rows: [] };
  });
}

describe('external sharing scan', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    filesByOwner = {};
    failFor = {};
    listCalls.length = 0;
    deleteCalls.length = 0;
  });

  it('finds external shares on files owned by a user other than the admin', async () => {
    mockDatabase([
      { email: ADMIN, is_suspended: false },
      { email: 'staff@corp.test', is_suspended: false },
    ]);
    filesByOwner['staff@corp.test'] = [
      {
        id: 'file-1',
        name: 'Shared outside',
        owner: 'staff@corp.test',
        permissions: [
          { id: 'p-owner', type: 'user', role: 'owner', emailAddress: 'staff@corp.test' },
          { id: 'p-ext', type: 'user', role: 'reader', emailAddress: 'someone@gmail.com' },
        ],
      },
      {
        id: 'file-2',
        name: 'Public link',
        owner: 'staff@corp.test',
        permissions: [{ id: 'p-any', type: 'anyone', role: 'reader' }],
      },
    ];

    const result = await driveSharingAuditService.scanForExternalSharing(ORG_ID);

    expect(result.success).toBe(true);
    expect(result.shares?.map(s => s.permissionId).sort()).toEqual(['p-any', 'p-ext']);
    expect(result.summary?.sharedWithAnyone).toBe(1);
    expect(result.summary?.sharedWithPersonalAccounts).toBe(1);
    expect(result.summary?.accountsScanned).toBe(2);
    expect(result.summary?.accountsNotScanned).toEqual([]);
    expect(result.summary?.truncated).toBe(false);
    expect(listCalls.filter(c => c.corpora === 'user').map(c => c.subject).sort()).toEqual([
      ADMIN,
      'staff@corp.test',
    ]);
  });

  it('reports suspended and failing accounts instead of returning a clean result', async () => {
    mockDatabase([
      { email: 'gone@corp.test', is_suspended: true },
      { email: 'broken@corp.test', is_suspended: false },
    ]);
    failFor['broken@corp.test'] = 'unauthorized_client';

    const result = await driveSharingAuditService.scanForExternalSharing(ORG_ID);

    expect(result.success).toBe(true);
    const notScanned = result.summary?.accountsNotScanned?.map(a => a.email).sort();
    expect(notScanned).toEqual(['broken@corp.test', 'gone@corp.test']);
    expect(listCalls.some(c => c.subject === 'gone@corp.test')).toBe(false);
  });

  it('never impersonates an address outside the organization domain', async () => {
    mockDatabase([{ email: 'outsider@other.test', is_suspended: false }]);

    await driveSharingAuditService.scanForExternalSharing(ORG_ID);

    expect(listCalls.some(c => c.subject === 'outsider@other.test')).toBe(false);
  });

  it('marks the scan truncated when the file limit is reached', async () => {
    mockDatabase([{ email: 'staff@corp.test', is_suspended: false }]);
    filesByOwner[ADMIN] = [
      { id: 'a-1', name: 'One', owner: ADMIN, permissions: [] },
      { id: 'a-2', name: 'Two', owner: ADMIN, permissions: [] },
    ];

    const result = await driveSharingAuditService.scanForExternalSharing(ORG_ID, { maxFiles: 1 });

    expect(result.summary?.truncated).toBe(true);
    expect(result.summary?.accountsNotScanned?.map(a => a.email)).toEqual(['staff@corp.test']);
  });

  it('revokes as the file owner, and refuses an owner outside the organization', async () => {
    mockDatabase([]);

    const ok = await driveSharingAuditService.revokeAccess(ORG_ID, 'file-1', 'p-ext', 'staff@corp.test');
    expect(ok.success).toBe(true);
    expect(deleteCalls).toEqual([{ subject: 'staff@corp.test', fileId: 'file-1', permissionId: 'p-ext', supportsAllDrives: true }]);

    const refused = await driveSharingAuditService.revokeAccess(ORG_ID, 'file-1', 'p-ext', 'x@other.test');
    expect(refused.success).toBe(false);
    expect(deleteCalls).toHaveLength(1);
  });
});
