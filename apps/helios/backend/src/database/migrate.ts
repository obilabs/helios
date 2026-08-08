import { db } from './connection.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Simple database migration runner
 * Runs all .sql files in the migrations directory
 */
export class MigrationRunner {
  private migrationsPath: string;

  constructor() {
    // Navigate from backend/src/database to database/migrations
    this.migrationsPath = path.join(__dirname, '../../../database/migrations');
  }

  async runMigrations(): Promise<void> {
    try {
      logger.info('Starting database migrations...');

      // Check if migrations directory exists
      if (!fs.existsSync(this.migrationsPath)) {
        logger.warn('No migrations directory found, skipping migrations');
        return;
      }

      // Get all .sql files
      const files = fs.readdirSync(this.migrationsPath)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Sort to ensure migrations run in order

      if (files.length === 0) {
        logger.info('No migration files found');
        return;
      }

      logger.info(`Found ${files.length} migration file(s)`);

      // Run each migration
      for (const file of files) {
        await this.runMigration(file);
      }

      logger.info('All migrations completed successfully');

    } catch (error: any) {
      logger.error('Migration failed', { error: error.message });
      throw error;
    }
  }

  private async runMigration(filename: string): Promise<void> {
    try {
      logger.info(`Running migration: ${filename}`);

      const filePath = path.join(this.migrationsPath, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute the migration
      await db.query(sql);

      logger.info(`Migration completed: ${filename}`);

    } catch (error: any) {
      logger.error(`Migration failed: ${filename}`, { error: error.message });
      throw error;
    }
  }
}

// CLI runner - ESM uses import.meta.url for main module detection
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  (async () => {
    try {
      const runner = new MigrationRunner();
      await runner.runMigrations();
      await db.close();
      process.exit(0);
    } catch (error) {
      logger.error('Migration runner failed', error);
      await db.close();
      process.exit(1);
    }
  })();
}
