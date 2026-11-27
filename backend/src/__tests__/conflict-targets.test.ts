/**
 * An `ON CONFLICT (cols)` clause only works when a unique constraint exists on
 * exactly those columns; otherwise the statement is refused at run time, and
 * only on the path that reaches it. The three Google cache tables are unique on
 * (organization_id, google_id), so a write to them must name both columns.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
  });
}

describe('ON CONFLICT targets on the Google cache tables', () => {
  it('name (organization_id, google_id), never google_id alone', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const text = fs.readFileSync(file, 'utf8');
      const inserts = text.matchAll(/INSERT INTO (gw_synced_users|gw_groups|gw_org_units)\b[\s\S]{0,1500}?ON CONFLICT\s*\(([^)]*)\)/g);
      for (const match of inserts) {
        const columns = match[2].split(',').map((c) => c.trim());
        if (columns.includes('google_id') && !columns.includes('organization_id')) {
          offenders.push(`${path.relative(srcDir, file)}: ${match[1]} ON CONFLICT (${match[2]})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
