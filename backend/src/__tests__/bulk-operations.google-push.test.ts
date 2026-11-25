/**
 * Bulk user update and bulk suspend change Google Workspace as well as Helios
 * for a linked account, Google first, so the two cannot disagree silently.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const query = jest.fn<(...args: any[]) => Promise<any>>();
const updateUser = jest.fn<(...args: any[]) => Promise<any>>();
const suspendUser = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../database/connection.js', () => ({ db: { query } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule('../services/queue.service.js', () => ({ queueService: {} }));
jest.unstable_mockModule('../websocket/bulk-operations.gateway.js', () => ({ bulkOperationEvents: {} }));
jest.unstable_mockModule('../services/google-workspace-batch.service.js', () => ({ googleWorkspaceBatchService: {} }));
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: { updateUser, suspendUser },
}));

const { bulkOperationsService } = await import('../services/bulk-operations.service.js');
const run = (type: string, item: any) => (bulkOperationsService as any).processItem(type, item, 'org-1');
const wrote = (sql: string) => query.mock.calls.some(([text]) => String(text).includes(sql));

describe('bulk operations and Google Workspace', () => {
  beforeEach(() => {
    query.mockReset();
    updateUser.mockReset();
    suspendUser.mockReset();
  });

  const linked = (googleId: string | null, role = 'user') =>
    query.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('SELECT google_workspace_id')) return { rows: [{ google_workspace_id: googleId }] };
      if (sql.includes('SELECT id, role')) return { rows: [{ id: 'u1', role }] };
      if (sql.includes('UPDATE organization_users')) return { rows: [{ id: 'u1', email: 'a@corp.test' }] };
      return { rows: [] };
    });

  it('update: pushes the same fields to Google for a linked account, then updates Helios', async () => {
    linked('g-123');
    updateUser.mockResolvedValue({ success: true });
    const out = await run('user_update', { email: 'a@corp.test', jobTitle: 'Lead', department: 'Ops' });

    expect(updateUser).toHaveBeenCalledWith('org-1', 'g-123', expect.objectContaining({ jobTitle: 'Lead', department: 'Ops' }));
    expect(wrote('UPDATE organization_users')).toBe(true);
    expect(out.googleWorkspace).toBe('updated');
  });

  it('update: when Google refuses, the row fails and Helios is not changed', async () => {
    linked('g-123');
    updateUser.mockResolvedValue({ success: false, error: 'Invalid Input' });

    await expect(run('user_update', { email: 'a@corp.test', jobTitle: 'Lead' })).rejects.toThrow(/Google Workspace refused.*Invalid Input.*Nothing was changed/);
    expect(wrote('UPDATE organization_users')).toBe(false);
  });

  it('update: an account that is not linked is changed in Helios only, and says so', async () => {
    linked(null);
    const out = await run('user_update', { email: 'a@corp.test', jobTitle: 'Lead' });
    expect(updateUser).not.toHaveBeenCalled();
    expect(out.googleWorkspace).toBe('not linked');
  });

  it('update: an unknown address fails before anything is sent to Google', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(run('user_update', { email: 'nobody@corp.test', jobTitle: 'Lead' })).rejects.toThrow(/User not found/);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('suspend: suspends in Google first for a linked account', async () => {
    linked('g-123');
    suspendUser.mockResolvedValue({ success: true });
    const out = await run('user_suspend', { email: 'a@corp.test' });
    expect(suspendUser).toHaveBeenCalledWith('org-1', 'g-123');
    expect(out.googleWorkspace).toBe('suspended');
  });

  it('suspend: when Google refuses, the user is not marked suspended in Helios', async () => {
    linked('g-123');
    suspendUser.mockResolvedValue({ success: false, error: 'Not Authorized' });
    await expect(run('user_suspend', { email: 'a@corp.test' })).rejects.toThrow(/refused to suspend.*Nothing was changed/);
    expect(wrote("status = 'suspended'")).toBe(false);
  });
});
