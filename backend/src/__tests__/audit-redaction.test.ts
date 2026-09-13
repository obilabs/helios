/**
 * Audit request-body redaction (middleware/audit.middleware.ts).
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: jest.fn() } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { redactSensitiveData } = await import('../middleware/audit.middleware.js');

describe('redactSensitiveData', () => {
  it('redacts sensitive keys at any depth and keeps the rest', () => {
    const out = redactSensitiveData({
      email: 'a@corp.test',
      password: 'x',
      nested: { apiKey: 'k', name: 'n' },
      list: [{ token: 't', id: 1 }],
    });
    expect(out).toEqual({
      email: 'a@corp.test',
      password: '[REDACTED]',
      nested: { apiKey: '[REDACTED]', name: 'n' },
      list: [{ token: '[REDACTED]', id: 1 }],
    });
  });

  it('keeps a "__proto__" body key as data and never changes the prototype', () => {
    const body = JSON.parse('{"__proto__": {"polluted": true}, "name": "n"}');
    const out = redactSensitiveData(body);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as any).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
    expect(out.name).toBe('n');
  });

  it('passes primitives and null through', () => {
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData('s')).toBe('s');
  });
});
