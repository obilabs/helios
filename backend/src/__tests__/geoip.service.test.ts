/**
 * Login locations are looked up locally, in an MMDB database file on this
 * server. A lookup never makes a network request; the only request is the
 * monthly database download, which can be turned off. A download that fails
 * verification never replaces the file in use.
 */
import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { buildMmdb, cityRecord } from './fixtures/build-mmdb.js';

const query = jest.fn<(...args: any[]) => Promise<any>>();
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query } }));
jest.unstable_mockModule('../utils/logger.js', () => ({ logger: log }));

const {
  geoipService,
  isPublicAddress,
  geoipDownloadUrl,
  geoipSettings,
  GEOIP_ATTRIBUTION,
  DEFAULT_GEOIP_DATABASE_PATH,
} = await import('../services/geoip.service.js');

/** 8.0.0.0/8 and 1.0.0.0/8 are the verification probes' ranges. */
const VALID_DB = buildMmdb({
  '8.0.0.0/8': cityRecord('US', 'United States', 'California', 37.75, -122.25),
  '1.0.0.0/8': cityRecord('AU', 'Australia'),
  '81.2.0.0/16': cityRecord('GB', 'United Kingdom', 'England', 51.5, -0.125),
});
/** A newer database that would be acceptable. */
const NEWER_DB = buildMmdb({
  '8.0.0.0/8': cityRecord('US', 'United States', 'Texas', 30.25, -97.75),
});
/** Parses as MMDB but places none of the probe addresses: must be rejected. */
const UNVERIFIABLE_DB = buildMmdb({ '50.0.0.0/8': cityRecord('DE', 'Germany') });

const fetchMock = jest.fn<typeof fetch>();
const realFetch = globalThis.fetch;
globalThis.fetch = fetchMock as any;
afterAll(() => {
  globalThis.fetch = realFetch;
});

let dir: string;
let dbPath: string;

function placeDatabase(buffer: Buffer, month?: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, buffer);
  if (month) fs.writeFileSync(`${dbPath}.json`, JSON.stringify({ month }));
}

const gz = (b: Buffer) => new Response(zlib.gzipSync(b), { status: 200 });
const notFound = () => new Response('not found', { status: 404 });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helios-geoip-'));
  dbPath = path.join(dir, 'geoip', 'test.mmdb');
  process.env.GEOIP_DATABASE_PATH = dbPath;
  process.env.GEOIP_DATABASE_AUTO_DOWNLOAD = 'true';
  geoipService.reset();
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error('no network in tests'));
  query.mockReset();
  Object.values(log).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  geoipService.reset();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.GEOIP_DATABASE_PATH;
  delete process.env.GEOIP_DATABASE_AUTO_DOWNLOAD;
});

describe('settings', () => {
  it('default to a file in the backend data volume, with downloads on', () => {
    delete process.env.GEOIP_DATABASE_PATH;
    delete process.env.GEOIP_DATABASE_AUTO_DOWNLOAD;
    expect(geoipSettings()).toEqual({ databasePath: DEFAULT_GEOIP_DATABASE_PATH, autoDownload: true });
    expect(DEFAULT_GEOIP_DATABASE_PATH.startsWith('/app/data/')).toBe(true);
  });

  it('downloads can be turned off', () => {
    process.env.GEOIP_DATABASE_AUTO_DOWNLOAD = 'false';
    expect(geoipSettings().autoDownload).toBe(false);
  });

  it('the download URL is the provider\'s monthly file', () => {
    expect(geoipDownloadUrl('2026-11')).toBe('https://download.db-ip.com/free/dbip-city-lite-2026-11.mmdb.gz');
  });
});

describe('lookup', () => {
  it('returns country and state/province from the local file', () => {
    placeDatabase(VALID_DB);
    expect(geoipService.lookup('8.8.8.8')).toEqual({
      countryCode: 'US',
      countryName: 'United States',
      region: 'California',
      latitude: 37.75,
      longitude: -122.25,
    });
  });

  it('leaves the region empty when the database has none', () => {
    placeDatabase(VALID_DB);
    expect(geoipService.lookup('1.1.1.1')).toMatchObject({ countryCode: 'AU', region: null });
  });

  it('returns nothing, without throwing, when no database is present', () => {
    expect(geoipService.lookup('8.8.8.8')).toBeNull();
    expect(geoipService.status()).toEqual({ available: false, reason: 'not_downloaded', attribution: GEOIP_ATTRIBUTION });
  });

  it('says downloads are off when that is why there is no database', () => {
    process.env.GEOIP_DATABASE_AUTO_DOWNLOAD = 'false';
    expect(geoipService.status().reason).toBe('downloads_disabled');
  });

  it('returns nothing for a file that is not a valid database', () => {
    placeDatabase(Buffer.from('not a database'));
    expect(geoipService.lookup('8.8.8.8')).toBeNull();
    expect(geoipService.status()).toMatchObject({ available: false, reason: 'invalid' });
  });

  it.each(['10.0.0.1', '192.168.1.20', '172.16.4.4', '127.0.0.1', '100.64.0.1', '169.254.1.1', '::1', 'fe80::1', 'fd00::1', 'not-an-ip', '', '999.1.1.1'])(
    'returns nothing for the private or malformed address %p',
    (ip) => {
      placeDatabase(VALID_DB);
      expect(isPublicAddress(ip)).toBe(false);
      expect(geoipService.lookup(ip)).toBeNull();
    },
  );

  it('an address the database cannot answer (IPv6 against an IPv4 file) returns nothing', () => {
    placeDatabase(VALID_DB);
    expect(geoipService.lookup('2001:4860:4860::8888')).toBeNull();
  });

  it('makes no network request', () => {
    placeDatabase(VALID_DB);
    geoipService.lookup('8.8.8.8');
    geoipService.lookup('81.2.69.160');
    geoipService.status();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the status carries the attribution the licence requires', () => {
    placeDatabase(VALID_DB);
    expect(geoipService.status()).toEqual({
      available: true,
      attribution: { text: 'IP Geolocation by DB-IP', url: 'https://db-ip.com' },
    });
  });
});

describe('enrichLoginActivity', () => {
  it('stores country and region for logins without a location, with no network request', async () => {
    placeDatabase(VALID_DB);
    query.mockResolvedValueOnce({
      rows: [
        { id: 'a', ip_address: '8.8.8.8' },
        { id: 'b', ip_address: '8.8.4.4' },
        { id: 'c', ip_address: '8.8.8.8' },
        { id: 'd', ip_address: '10.0.0.5' },
      ],
    });
    query.mockResolvedValue({ rows: [], rowCount: 1 });

    const r = await geoipService.enrichLoginActivity('org-1', 50);

    expect(r).toEqual({ updated: 3, errors: 0 });
    const updates = query.mock.calls.filter((c) => /UPDATE login_activity/.test(String(c[0])));
    expect(updates).toHaveLength(2);
    expect(updates[0][1]).toEqual(['US', 'United States', 'California', 37.75, -122.25, ['a', 'c']]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing without a database, and does not fail', async () => {
    const r = await geoipService.enrichLoginActivity('org-1', 50);
    expect(r).toEqual({ updated: 0, errors: 0 });
    expect(query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('refreshDatabase', () => {
  const NOW = new Date('2026-11-15T03:00:00Z');

  it('does nothing when downloads are turned off', async () => {
    process.env.GEOIP_DATABASE_AUTO_DOWNLOAD = 'false';
    expect(await geoipService.refreshDatabase(NOW)).toBe('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when this month\'s file is already in place', async () => {
    placeDatabase(VALID_DB, '2026-11');
    expect(await geoipService.refreshDatabase(NOW)).toBe('current');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads a missing database, verifies it and starts using it', async () => {
    fetchMock.mockResolvedValueOnce(gz(VALID_DB));
    expect(await geoipService.refreshDatabase(NOW)).toBe('updated');
    expect(fetchMock.mock.calls[0][0]).toBe('https://download.db-ip.com/free/dbip-city-lite-2026-11.mmdb.gz');
    expect(fs.readFileSync(dbPath).equals(VALID_DB)).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${dbPath}.json`, 'utf8')).month).toBe('2026-11');
    expect(geoipService.lookup('8.8.8.8')?.region).toBe('California');
    expect(fs.existsSync(`${dbPath}.download`)).toBe(false);
  });

  it('the download carries no login data: one GET of the public file, nothing else', async () => {
    fetchMock.mockResolvedValueOnce(gz(VALID_DB));
    await geoipService.refreshDatabase(NOW);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('with no file and this month not published yet, takes last month\'s', async () => {
    fetchMock.mockResolvedValueOnce(notFound()).mockResolvedValueOnce(gz(VALID_DB));
    const early = new Date('2026-12-01T00:30:00Z');
    expect(await geoipService.refreshDatabase(early)).toBe('updated');
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://download.db-ip.com/free/dbip-city-lite-2026-12.mmdb.gz',
      'https://download.db-ip.com/free/dbip-city-lite-2026-11.mmdb.gz',
    ]);
  });

  it('with a file in place and this month not published yet, keeps the file quietly', async () => {
    placeDatabase(VALID_DB, '2026-10');
    fetchMock.mockResolvedValueOnce(notFound());
    expect(await geoipService.refreshDatabase(NOW)).toBe('not_published');
    expect(log.warn).not.toHaveBeenCalled();
    expect(fs.readFileSync(dbPath).equals(VALID_DB)).toBe(true);
  });

  it('replaces last month\'s file with this month\'s', async () => {
    placeDatabase(VALID_DB, '2026-10');
    expect(geoipService.lookup('8.8.8.8')?.region).toBe('California');
    fetchMock.mockResolvedValueOnce(gz(NEWER_DB));
    expect(await geoipService.refreshDatabase(NOW)).toBe('updated');
    expect(geoipService.lookup('8.8.8.8')?.region).toBe('Texas');
  });

  it('keeps the old file when the new one fails verification, and warns once', async () => {
    placeDatabase(VALID_DB, '2026-10');
    fetchMock.mockResolvedValue(gz(UNVERIFIABLE_DB));

    expect(await geoipService.refreshDatabase(NOW)).toBe('failed');
    expect(fs.readFileSync(dbPath).equals(VALID_DB)).toBe(true);
    expect(fs.existsSync(`${dbPath}.download`)).toBe(false);
    expect(geoipService.lookup('8.8.8.8')?.region).toBe('California');

    expect(await geoipService.refreshDatabase(NOW)).toBe('failed');
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0][1]).toMatchObject({ keptExistingFile: true });
  });

  it('keeps the old file when the download is not a database at all', async () => {
    placeDatabase(VALID_DB, '2026-10');
    fetchMock.mockResolvedValueOnce(gz(Buffer.from('<html>error page</html>')));
    expect(await geoipService.refreshDatabase(NOW)).toBe('failed');
    expect(fs.readFileSync(dbPath).equals(VALID_DB)).toBe(true);
  });

  it('keeps the old file when the provider answers with an error', async () => {
    placeDatabase(VALID_DB, '2026-10');
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503 }));
    expect(await geoipService.refreshDatabase(NOW)).toBe('failed');
    expect(geoipService.lookup('8.8.8.8')).not.toBeNull();
  });

  it('a network failure resolves, never throws', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await expect(geoipService.refreshDatabase(NOW)).resolves.toBe('failed');
    expect(geoipService.status().reason).toBe('not_downloaded');
  });
});
