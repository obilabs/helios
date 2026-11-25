import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

const {
  getAvailableEntities,
  getAvailableEntitiesDetailed,
  isEntityAvailable,
} = await import('../services/entity-availability.service.js');

const ORG_ID = '00000000-0000-0000-0000-000000000001';

describe('entity availability', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('reports only core entities when no module is enabled', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const entities = await getAvailableEntities(ORG_ID);

    expect(entities.sort()).toEqual(['entity.policy_container', 'entity.user']);
    expect(await isEntityAvailable(ORG_ID, 'entity.access_group')).toBe(false);
  });

  it('makes groups available once Google Workspace is enabled', async () => {
    mockQuery.mockResolvedValue({ rows: [{ slug: 'google_workspace' }] });

    expect(await isEntityAvailable(ORG_ID, 'entity.access_group')).toBe(true);

    const detailed = await getAvailableEntitiesDetailed(ORG_ID);
    expect(detailed['entity.access_group']).toEqual({
      available: true,
      providedBy: ['google_workspace'],
    });
    expect(detailed['entity.policy_container'].providedBy).toEqual(['core', 'google_workspace']);
    expect(detailed['entity.workspace'].available).toBe(false);
  });

  it('does not depend on the module_entity_providers table', async () => {
    mockQuery.mockResolvedValue({ rows: [{ slug: 'google_workspace' }] });

    await getAvailableEntities(ORG_ID);

    for (const call of mockQuery.mock.calls) {
      expect(String(call[0])).not.toMatch(/get_available_entities|module_entity_providers/);
    }
  });

  it('ignores a module that provides no entity', async () => {
    mockQuery.mockResolvedValue({ rows: [{ slug: 'audit_logs' }] });

    const entities = await getAvailableEntities(ORG_ID);

    expect(entities.sort()).toEqual(['entity.policy_container', 'entity.user']);
  });
});
