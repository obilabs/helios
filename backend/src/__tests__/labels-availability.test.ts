/**
 * The sidebar reads entity availability through getLabelsWithAvailability().
 * It must use the same rule as the rest of the product (enabled modules and
 * MODULE_ENTITY_MAP), not the database function that reads an unpopulated table.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: mockQuery } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { getLabelsWithAvailability } = await import('../services/label.service.js');

const ORG_ID = '00000000-0000-0000-0000-000000000001';

describe('labels with availability', () => {
  beforeEach(() => mockQuery.mockReset());

  it('reports Groups as available when Google Workspace is enabled', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('organization_modules') ? { rows: [{ slug: 'google_workspace' }] } : { rows: [] }
    );

    const { availability } = await getLabelsWithAvailability(ORG_ID);

    expect(availability['entity.access_group']).toEqual({ available: true, providedBy: ['google_workspace'] });
    expect(availability['entity.device'].available).toBe(false);
  });

  it('reports Groups as unavailable when no module is enabled', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { availability } = await getLabelsWithAvailability(ORG_ID);
    expect(availability['entity.access_group'].available).toBe(false);
    expect(availability['entity.user'].available).toBe(true);
  });

  it('no service or route queries get_available_entities()', () => {
    const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
          if (/FROM\s+get_available_entities\s*\(/i.test(fs.readFileSync(full, 'utf8'))) {
            offenders.push(path.relative(srcDir, full));
          }
        }
      }
    };
    walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
