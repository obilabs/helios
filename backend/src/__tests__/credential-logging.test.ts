/**
 * A failed API key authentication logs no part of the presented key.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const warn = jest.fn();
const error = jest.fn();
const query = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn, error },
}));
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query } }));

const { authenticateApiKey } = await import('../middleware/api-key-auth.js');
const { generateApiKey } = await import('../utils/apiKey.js');

function res() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as any;
}

beforeEach(() => {
  warn.mockReset();
  error.mockReset();
  query.mockReset();
});

describe('API key authentication failure log', () => {
  it('does not include any part of the presented key', async () => {
    const { key } = generateApiKey();
    query.mockResolvedValue({ rows: [] });

    await authenticateApiKey({ headers: { 'x-api-key': key } } as any, res(), jest.fn());

    const logged = JSON.stringify(warn.mock.calls);
    expect(warn).toHaveBeenCalled();
    const secretPart = key.split('_').slice(2).join('_');
    expect(logged).not.toContain(secretPart.slice(0, 8));
    expect(logged).not.toContain(key.slice(0, 20));
  });
});
