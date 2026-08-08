/**
 * GeoIP Service
 *
 * Provides IP address geolocation for login activity monitoring.
 * Uses ip-api.com free tier (100 requests/minute) for development.
 * For production, consider MaxMind GeoLite2 database.
 */

import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';

interface GeoIPResult {
  success: boolean;
  countryCode?: string;
  countryName?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  error?: string;
}

interface BatchGeoIPResult {
  ip: string;
  result: GeoIPResult;
}

// Simple in-memory cache with TTL
const cache = new Map<string, { data: GeoIPResult; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 650; // ~100 requests per minute with margin

class GeoIPService {
  /**
   * Look up a single IP address
   */
  async lookup(ip: string): Promise<GeoIPResult> {
    // Check cache first
    const cached = cache.get(ip);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    // Skip private/local IPs
    if (this.isPrivateIP(ip)) {
      return {
        success: true,
        countryCode: 'XX',
        countryName: 'Private Network',
        city: 'Local',
        latitude: 0,
        longitude: 0
      };
    }

    try {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
      }
      lastRequestTime = Date.now();

      // Call ip-api.com (free, no key required)
      const response = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as any;

      if (data.status === 'fail') {
        const result: GeoIPResult = {
          success: false,
          error: data.message || 'Lookup failed'
        };
        cache.set(ip, { data: result, expires: Date.now() + CACHE_TTL });
        return result;
      }

      const result: GeoIPResult = {
        success: true,
        countryCode: data.countryCode,
        countryName: data.country,
        region: data.regionName,
        city: data.city,
        latitude: data.lat,
        longitude: data.lon,
        timezone: data.timezone,
        isp: data.isp
      };

      // Cache result
      cache.set(ip, { data: result, expires: Date.now() + CACHE_TTL });

      return result;
    } catch (error: any) {
      logger.error('GeoIP lookup failed', { ip, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Batch lookup multiple IPs
   */
  async batchLookup(ips: string[]): Promise<BatchGeoIPResult[]> {
    const results: BatchGeoIPResult[] = [];
    const uncached: string[] = [];

    // Check cache first
    for (const ip of ips) {
      const cached = cache.get(ip);
      if (cached && cached.expires > Date.now()) {
        results.push({ ip, result: cached.data });
      } else if (!this.isPrivateIP(ip)) {
        uncached.push(ip);
      } else {
        results.push({
          ip,
          result: {
            success: true,
            countryCode: 'XX',
            countryName: 'Private Network',
            city: 'Local',
            latitude: 0,
            longitude: 0
          }
        });
      }
    }

    // Batch API supports up to 100 IPs per request
    if (uncached.length > 0) {
      try {
        // ip-api.com batch endpoint
        const batchSize = 100;
        for (let i = 0; i < uncached.length; i += batchSize) {
          const batch = uncached.slice(i, i + batchSize);

          // Rate limiting
          const now = Date.now();
          const timeSinceLastRequest = now - lastRequestTime;
          if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
          }
          lastRequestTime = Date.now();

          const response = await fetch('http://ip-api.com/batch?fields=status,message,query,country,countryCode,region,regionName,city,lat,lon,timezone,isp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch)
          });

          if (response.ok) {
            const batchData = await response.json() as any[];
            for (const data of batchData) {
              const ip = data.query;
              const result: GeoIPResult = data.status === 'success'
                ? {
                    success: true,
                    countryCode: data.countryCode,
                    countryName: data.country,
                    region: data.regionName,
                    city: data.city,
                    latitude: data.lat,
                    longitude: data.lon,
                    timezone: data.timezone,
                    isp: data.isp
                  }
                : {
                    success: false,
                    error: data.message || 'Lookup failed'
                  };

              cache.set(ip, { data: result, expires: Date.now() + CACHE_TTL });
              results.push({ ip, result });
            }
          }
        }
      } catch (error: any) {
        logger.error('Batch GeoIP lookup failed', { error: error.message });
        // Add failed results for uncached IPs
        for (const ip of uncached) {
          if (!results.some(r => r.ip === ip)) {
            results.push({ ip, result: { success: false, error: error.message } });
          }
        }
      }
    }

    return results;
  }

  /**
   * Update login_activity records with GeoIP data
   */
  async enrichLoginActivity(organizationId: string, limit: number = 100): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    try {
      // Get login events without GeoIP data
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

      // Collect unique IPs
      const ipMap = new Map<string, string[]>(); // ip -> [ids]
      for (const row of result.rows) {
        const ip = row.ip_address;
        if (!ipMap.has(ip)) {
          ipMap.set(ip, []);
        }
        ipMap.get(ip)!.push(row.id);
      }

      // Batch lookup
      const uniqueIPs = Array.from(ipMap.keys());
      const lookupResults = await this.batchLookup(uniqueIPs);

      // Update database
      for (const { ip, result: geo } of lookupResults) {
        const ids = ipMap.get(ip) || [];
        if (ids.length === 0) continue;

        try {
          if (geo.success) {
            await db.query(
              `UPDATE login_activity
               SET country_code = $1,
                   country_name = $2,
                   city = $3,
                   region = $4,
                   latitude = $5,
                   longitude = $6,
                   timezone = $7,
                   isp = $8
               WHERE id = ANY($9)`,
              [
                geo.countryCode,
                geo.countryName,
                geo.city,
                geo.region,
                geo.latitude,
                geo.longitude,
                geo.timezone,
                geo.isp,
                ids
              ]
            );
            updated += ids.length;
          } else {
            errors += ids.length;
          }
        } catch (error: any) {
          logger.error('Failed to update login activity with GeoIP', {
            ip,
            ids,
            error: error.message
          });
          errors += ids.length;
        }
      }

      logger.info('Enriched login activity with GeoIP data', {
        organizationId,
        updated,
        errors,
        uniqueIPs: uniqueIPs.length
      });

      return { updated, errors };
    } catch (error: any) {
      logger.error('Failed to enrich login activity', {
        organizationId,
        error: error.message
      });
      return { updated, errors: errors + 1 };
    }
  }

  /**
   * Check if IP is private/local
   */
  private isPrivateIP(ip: string): boolean {
    // Handle IPv4
    const parts = ip.split('.');
    if (parts.length === 4) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);

      // 10.x.x.x
      if (first === 10) return true;
      // 172.16.x.x - 172.31.x.x
      if (first === 172 && second >= 16 && second <= 31) return true;
      // 192.168.x.x
      if (first === 192 && second === 168) return true;
      // 127.x.x.x (localhost)
      if (first === 127) return true;
    }

    // Handle IPv6 localhost
    if (ip === '::1' || ip === '::ffff:127.0.0.1') return true;

    return false;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; entries: number } {
    return {
      size: cache.size,
      entries: cache.size
    };
  }
}

export const geoipService = new GeoIPService();
export default geoipService;
