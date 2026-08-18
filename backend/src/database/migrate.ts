import { db } from './connection.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database migration runner.
 *
 * Applies the incremental `.sql` files in backend/database/migrations on top of
 * the base schema (database/schema_organization.sql, seeded by Postgres initdb
 * or by DatabaseInitializer). This is what keeps a freshly-seeded database in
 * step with the code — the seed dump lags the schema, so columns/tables added
 * after it was captured (e.g. the typed api_keys columns and security_audit_logs)
 * live here as migrations.
 *
 * Applied files are recorded in `schema_migrations` and never re-run. Migrations
 * are also written to be idempotent (IF NOT EXISTS / CREATE OR REPLACE) so the
 * first tracked run is safe against a hand-patched or partially-seeded database.
 *
 * Runs at boot (see src/index.ts) and via `npm run db:migrate`.
 */
export class MigrationRunner {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = MigrationRunner.resolveMigrationsPath();
  }

  /**
   * Resolve the migrations directory across every run mode:
   *   1. MIGRATIONS_DIR override (tests / ops), if it exists.
   *   2. /app/database/migrations — the Docker images (Dockerfile,
   *      Dockerfile.prod) COPY backend/database into /app/database.
   *   3. backend/database/migrations relative to this file — works from source
   *      (backend/src/database) and from compiled dist (backend/dist/database),
   *      both of which sit two levels under backend/.
   *
   * NOTE: intentionally does NOT fall back to the repo-root database/migrations
   * directory — that holds a stale, superseded 001–007 set (see its README).
   */
  private static resolveMigrationsPath(): string {
    const override = process.env['MIGRATIONS_DIR'];
    if (override && fs.existsSync(override)) {
      return override;
    }

    const dockerPath = '/app/database/migrations';
    if (fs.existsSync(dockerPath)) {
      return dockerPath;
    }

    return path.join(__dirname, '..', '..', 'database', 'migrations');
  }

  async runMigrations(): Promise<void> {
    logger.info('Starting database migrations...', { dir: this.migrationsPath });

    if (!fs.existsSync(this.migrationsPath)) {
      logger.warn('No migrations directory found, skipping migrations', {
        dir: this.migrationsPath,
      });
      return;
    }

    await this.ensureTrackingTable();
    const applied = await this.getAppliedMigrations();

    const files = fs
      .readdirSync(this.migrationsPath)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // lexical sort → numeric prefixes run in order

    if (files.length === 0) {
      logger.info('No migration files found');
      return;
    }

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        logger.debug(`Migration already applied, skipping: ${file}`);
        continue;
      }
      await this.runMigration(file);
      appliedCount++;
    }

    logger.info('Database migrations complete', {
      applied: appliedCount,
      alreadyUpToDate: files.length - appliedCount,
      total: files.length,
    });
  }

  private async ensureTrackingTable(): Promise<void> {
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async getAppliedMigrations(): Promise<Set<string>> {
    const result = await db.query('SELECT filename FROM schema_migrations');
    return new Set<string>(result.rows.map((r: any) => r.filename));
  }

  private async runMigration(filename: string): Promise<void> {
    const filePath = path.join(this.migrationsPath, filename);
    const sql = fs.readFileSync(filePath, 'utf8');

    logger.info(`Applying migration: ${filename}`);

    try {
      // Each migration + its bookkeeping row commit together, so a failure
      // never leaves a file recorded-but-unapplied (or vice versa).
      await db.transaction(async (client) => {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
          [filename]
        );
      });

      logger.info(`Migration applied: ${filename}`);
    } catch (error: any) {
      logger.error(`Migration failed: ${filename}`, { error: error.message });
      throw error;
    }
  }
}

export const migrationRunner = new MigrationRunner();

// CLI runner - ESM uses import.meta.url for main module detection
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  (async () => {
    try {
      await migrationRunner.runMigrations();
      await db.close();
      process.exit(0);
    } catch (error) {
      logger.error('Migration runner failed', error);
      await db.close();
      process.exit(1);
    }
  })();
}
