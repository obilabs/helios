/**
 * GeoIP Service
 *
 * Finds the country and state/province of a login's IP address for the Login
 * Locations block. The lookup runs locally, against an MMDB database file on
 * this server (DB-IP "IP to City Lite", CC BY 4.0). A lookup never makes a
 * network request.
 *
 * The only outbound request is the database download itself: once when the
 * file is missing, then monthly. It is a plain GET of a public file and carries
 * no login data. GEOIP_DATABASE_AUTO_DOWNLOAD=false turns it off; the file can
 * then be placed at GEOIP_DATABASE_PATH by hand. See docs/guides/login-locations.md.
 *
 * Without a database, logins are still stored and counted; their location is
 * left empty.
 */

import fs from 'fs';
import path from 'path';
import net from 'net';
import zlib from 'zlib';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { Reader } from 'mmdb-lib';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';

/** Required by the database licence (CC BY 4.0) wherever locations are shown. */
export const GEOIP_ATTRIBUTION = { text: 'IP Geolocation by DB-IP', url: 'https://db-ip.com' };

export const DEFAULT_GEOIP_DATABASE_PATH = '/app/data/geoip/dbip-city-lite.mmdb';

/** The public monthly file. `month` is YYYY-MM (UTC). */
export function geoipDownloadUrl(month: string): string {
  return `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
}

/** Public addresses a valid database must place in a country. */
const VERIFY_PROBES = ['8.8.8.8', '1.1.1.1'];
/** The decompressed file is about 120 MB; refuse anything far larger. */
const MAX_DATABASE_BYTES = 512 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** How often to check whether this month's file is due. */
const REFRESH_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface GeoIPSettings {
  databasePath: string;
  autoDownload: boolean;
}

/** Read at call time so a changed environment (and tests) take effect. */
export function geoipSettings(): GeoIPSettings {
  const configured = (process.env.GEOIP_DATABASE_PATH || '').trim();
  const auto = (process.env.GEOIP_DATABASE_AUTO_DOWNLOAD || 'true').trim().toLowerCase();
  return {
    databasePath: configured || DEFAULT_GEOIP_DATABASE_PATH,
    autoDownload: !['false', '0', 'no', 'off'].includes(auto),
  };
}

export interface GeoLocation {
  countryCode: string;
  countryName: string;
  /** State or province, when the database has it. */
  region: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type GeoIPUnavailableReason = 'not_downloaded' | 'downloads_disabled' | 'invalid';

export interface GeoIPStatus {
  available: boolean;
  reason?: GeoIPUnavailableReason;
  attribution: typeof GEOIP_ATTRIBUTION;
}

export type RefreshOutcome = 'updated' | 'current' | 'not_published' | 'disabled' | 'failed' | 'busy';

function currentMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * True for an address that can have a public location. Private, loopback,
 * link-local, shared (CGNAT), multicast, reserved and malformed addresses are
 * not looked up.
 */
export function isPublicAddress(ip: string): boolean {
  if (typeof ip !== 'string') return false;
  const addr = ip.trim();
  const kind = net.isIP(addr);
  if (kind === 4) {
    const [a, b] = addr.split('.').map((p) => parseInt(p, 10));
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
    return true;
  }
  if (kind === 6) {
    const lower = addr.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (lower === '::' || lower === '::1') return false;
    const first = parseInt(lower.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return false; // ff00::/8 multicast
    return true;
  }
  return false;
}

/** The fields this product uses, from a GeoIP2-City-shaped record. */
export function locationFromRecord(record: any): GeoLocation | null {
  const code = record?.country?.iso_code;
  if (!code || typeof code !== 'string') return null;
  const region = record?.subdivisions?.[0]?.names?.en;
  const lat = record?.location?.latitude;
  const lon = record?.location?.longitude;
  return {
    countryCode: code.toUpperCase().slice(0, 2),
    countryName: record?.country?.names?.en || code,
    region: typeof region === 'string' && region ? region : null,
    latitude: typeof lat === 'number' ? lat : null,
    longitude: typeof lon === 'number' ? lon : null,
  };
}

function readerLookup(reader: Reader<any>, ip: string): GeoLocation | null {
  if (!isPublicAddress(ip)) return null;
  try {
    return locationFromRecord(reader.get(ip.trim()));
  } catch {
    // e.g. an IPv6 address against an IPv4-only database.
    return null;
  }
}

/**
 * Open a database from its bytes and check it is usable: it parses as MMDB and
 * at least one well-known public address resolves to a country. Throws otherwise.
 */
export function openVerifiedDatabase(buffer: Buffer): Reader<any> {
  const reader = new Reader<any>(buffer);
  if (!VERIFY_PROBES.some((ip) => readerLookup(reader, ip))) {
    throw new Error('the database does not place known public addresses in a country');
  }
  return reader;
}

class GeoIPService {
  private reader: Reader<any> | null = null;
  private readerPath: string | null = null;
  /** mtime of the file we last tried to open, so a bad file is not re-read on every lookup. */
  private triedMtimeMs: number | null = null;
  private invalidFile = false;
  private refreshing: Promise<RefreshOutcome> | null = null;
  private downloadWarned = false;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Open the database file if it is present and not open yet. Returns null when
   * there is no usable file. Never makes a network request.
   */
  private ensureReader(): Reader<any> | null {
    const { databasePath } = geoipSettings();
    if (this.reader && this.readerPath === databasePath) return this.reader;
    if (this.readerPath !== databasePath) {
      this.reader = null;
      this.triedMtimeMs = null;
      this.invalidFile = false;
    }
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(databasePath).mtimeMs;
    } catch {
      this.readerPath = databasePath;
      return null;
    }
    if (this.triedMtimeMs === mtimeMs) return null; // already tried this file and it failed
    this.triedMtimeMs = mtimeMs;
    this.readerPath = databasePath;
    try {
      this.reader = openVerifiedDatabase(fs.readFileSync(databasePath));
      this.invalidFile = false;
      logger.info('Location database opened', { databasePath });
      return this.reader;
    } catch (error: any) {
      this.invalidFile = true;
      logger.warn('Location database could not be opened; login locations stay empty', {
        databasePath,
        reason: error?.message,
      });
      return null;
    }
  }

  /** The location of one address, from the local database. Never throws, never calls out. */
  lookup(ip: string): GeoLocation | null {
    const reader = this.ensureReader();
    if (!reader) return null;
    return readerLookup(reader, ip);
  }

  status(): GeoIPStatus {
    if (this.ensureReader()) return { available: true, attribution: GEOIP_ATTRIBUTION };
    let reason: GeoIPUnavailableReason;
    if (this.invalidFile) reason = 'invalid';
    else if (!geoipSettings().autoDownload) reason = 'downloads_disabled';
    else reason = 'not_downloaded';
    return { available: false, reason, attribution: GEOIP_ATTRIBUTION };
  }

  /**
   * Fill in the location of stored logins that have none yet, newest first.
   * Without a database this does nothing.
   */
  async enrichLoginActivity(organizationId: string, limit: number = 100): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    if (!this.ensureReader()) {
      return { updated: 0, errors: 0 };
    }

    try {
      const result = await db.query(
        `SELECT id, ip_address
         FROM login_activity
         WHERE organization_id = $1
         AND country_code IS NULL
         AND ip_address IS NOT NULL
         ORDER BY login_timestamp DESC
         LIMIT $2`,
        [organizationId, limit]
      );

      if (result.rows.length === 0) {
        return { updated: 0, errors: 0 };
      }

      const ipMap = new Map<string, string[]>(); // ip -> [ids]
      for (const row of result.rows) {
        const ip = String(row.ip_address);
        if (!ipMap.has(ip)) ipMap.set(ip, []);
        ipMap.get(ip)!.push(row.id);
      }

      for (const [ip, ids] of ipMap) {
        const geo = this.lookup(ip);
        if (!geo) continue; // private, unknown or not in the database: stays empty
        try {
          await db.query(
            `UPDATE login_activity
             SET country_code = $1,
                 country_name = $2,
                 region = $3,
                 latitude = $4,
                 longitude = $5
             WHERE id = ANY($6)`,
            [geo.countryCode, geo.countryName, geo.region, geo.latitude, geo.longitude, ids]
          );
          updated += ids.length;
        } catch (error: any) {
          logger.error('Failed to store a login location', { ids, error: error.message });
          errors += ids.length;
        }
      }

      logger.info('Added locations to login activity', {
        organizationId,
        updated,
        errors,
        uniqueIPs: ipMap.size,
      });

      return { updated, errors };
    } catch (error: any) {
      logger.error('Failed to add locations to login activity', {
        organizationId,
        error: error.message,
      });
      return { updated, errors: errors + 1 };
    }
  }

  /**
   * Download this month's database if it is due. Safe to call often: it does
   * nothing when downloads are off, the file is current, or a refresh is running.
   * A failed download keeps the old file and warns once until one succeeds.
   */
  async refreshDatabase(now: Date = new Date()): Promise<RefreshOutcome> {
    if (this.refreshing) return 'busy';
    this.refreshing = this.runRefresh(now).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private sidecarPath(databasePath: string): string {
    return `${databasePath}.json`;
  }

  private storedMonth(databasePath: string): string | null {
    try {
      return JSON.parse(fs.readFileSync(this.sidecarPath(databasePath), 'utf8'))?.month ?? null;
    } catch {
      return null;
    }
  }

  private async runRefresh(now: Date): Promise<RefreshOutcome> {
    const { databasePath, autoDownload } = geoipSettings();
    if (!autoDownload) return 'disabled';

    const haveFile = fs.existsSync(databasePath);
    const month = currentMonth(now);
    if (haveFile && this.storedMonth(databasePath) === month) return 'current';

    // The new month's file appears on the 1st; until then keep what we have.
    // With no file at all, last month's is better than nothing.
    const candidates = haveFile ? [month] : [month, previousMonth(now)];
    const tmpPath = `${databasePath}.download`;

    try {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
      for (const candidate of candidates) {
        const buffer = await this.download(geoipDownloadUrl(candidate), tmpPath);
        if (!buffer) continue; // not published (404)

        let reader: Reader<any>;
        try {
          reader = openVerifiedDatabase(buffer);
        } catch (error: any) {
          throw new Error(`downloaded file failed verification: ${error?.message}`);
        }

        fs.renameSync(tmpPath, databasePath);
        fs.writeFileSync(this.sidecarPath(databasePath), JSON.stringify({ month: candidate, downloadedAt: now.toISOString() }));
        this.reader = reader;
        this.readerPath = databasePath;
        this.invalidFile = false;
        try {
          this.triedMtimeMs = fs.statSync(databasePath).mtimeMs;
        } catch {
          this.triedMtimeMs = null;
        }
        this.downloadWarned = false;
        logger.info('Location database updated', { month: candidate, databasePath });
        return 'updated';
      }
      if (haveFile) {
        logger.debug('This month\'s location database is not published yet; keeping the current file', { month });
        return 'not_published';
      }
      throw new Error('no location database is published for this or last month');
    } catch (error: any) {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // nothing to clean up
      }
      const fields = { reason: error?.message, databasePath, keptExistingFile: haveFile };
      if (!this.downloadWarned) {
        this.downloadWarned = true;
        logger.warn('Location database download failed; login locations use the existing file, or stay empty without one', fields);
      } else {
        logger.debug('Location database download failed again', fields);
      }
      return 'failed';
    }
  }

  /** GET a gzipped database to `tmpPath`; returns its bytes, or null for 404. */
  private async download(url: string, tmpPath: string): Promise<Buffer | null> {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (response.status === 404) return null;
    if (!response.ok || !response.body) throw new Error(`download answered HTTP ${response.status}`);

    let bytes = 0;
    const limit = new Transform({
      transform(chunk, _enc, done) {
        bytes += chunk.length;
        if (bytes > MAX_DATABASE_BYTES) return done(new Error('downloaded file is larger than expected'));
        done(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body as any), zlib.createGunzip(), limit, fs.createWriteStream(tmpPath));
    return fs.readFileSync(tmpPath);
  }

  /** At backend start: fetch the database if due, then check daily. */
  start(): void {
    if (this.timer) return;
    const tick = () => {
      this.refreshDatabase().catch((error: any) =>
        logger.warn('Location database refresh failed', { reason: error?.message }),
      );
    };
    tick();
    this.timer = setInterval(tick, REFRESH_CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** For tests: forget the open file and warning state. */
  reset(): void {
    this.stop();
    this.reader = null;
    this.readerPath = null;
    this.triedMtimeMs = null;
    this.invalidFile = false;
    this.downloadWarned = false;
    this.refreshing = null;
  }
}

export const geoipService = new GeoIPService();
export default geoipService;
