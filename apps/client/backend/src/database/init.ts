import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { db } from './connection.js';
import { logger } from '../utils/logger.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DatabaseInitializer {
  private schemaPath: string;

  constructor() {
    // In Docker, schema is mounted at /app/database/
    // In development, it's at ../../.. relative to dist/database/
    const dockerPath = '/app/database/schema_organization.sql';
    const devPath = path.join(__dirname, '../../..', 'database', 'schema_organization.sql');
    
    // Check Docker path first (production), then dev path
    if (fs.existsSync(dockerPath)) {
      this.schemaPath = dockerPath;
    } else {
      this.schemaPath = devPath;
    }
  }

  public async initializeDatabase(): Promise<void> {
    try {
      logger.info('Starting database initialization...');

      // Check if schema file exists
      if (!fs.existsSync(this.schemaPath)) {
        throw new Error(`Schema file not found at: ${this.schemaPath}`);
      }

      // Read schema file
      const schema = fs.readFileSync(this.schemaPath, 'utf8');

      // Execute schema
      await db.query(schema);

      logger.info('Database schema initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize database schema', error);
      throw error;
    }
  }

  public async checkDatabaseHealth(): Promise<boolean> {
    try {
      // Check if database is accessible
      const healthCheck = await db.healthCheck();
      if (!healthCheck) {
        return false;
      }

      // Check if required tables exist
      const requiredTables = [
        'organizations',
        'organization_users',
        'organization_settings',
        'modules',
        'organization_modules',
        'user_sessions',
        'audit_logs'
      ];

      for (const table of requiredTables) {
        const result = await db.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
          )`,
          [table]
        );

        if (!result.rows[0].exists) {
          logger.warn(`Required table '${table}' does not exist`);
          return false;
        }
      }

      logger.info('Database health check passed');
      return true;

    } catch (error) {
      logger.error('Database health check failed', error);
      return false;
    }
  }

  public async isPlatformSetupComplete(): Promise<boolean> {
    try {
      const result = await db.query(
        "SELECT is_setup_complete FROM organizations LIMIT 1"
      );

      if (result.rows.length === 0) {
        return false;
      }

      return result.rows[0].is_setup_complete === true;
    } catch (error) {
      logger.error('Failed to check platform setup status', error);
      return false;
    }
  }

  public async markPlatformSetupComplete(): Promise<void> {
    try {
      await db.query(
        `UPDATE organizations
         SET is_setup_complete = true,
         updated_at = NOW()
         WHERE id = (SELECT id FROM organizations LIMIT 1)`
      );

      logger.info('Organization setup marked as complete');
    } catch (error) {
      logger.error('Failed to mark organization setup as complete', error);
      throw error;
    }
  }

  public async getAdminCount(): Promise<number> {
    try {
      const result = await db.query(
        "SELECT COUNT(*) as count FROM organization_users WHERE role = 'admin'"
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to get admin count', error);
      throw error;
    }
  }

  public async seedInitialData(): Promise<void> {
    try {
      logger.info('Checking initial data...');

      // Feature flags are seeded directly in schema_organization.sql
      // This ensures a single source of truth for database state

      logger.info('Initial data check complete');
    } catch (error) {
      logger.error('Failed to check initial data', error);
      throw error;
    }
  }

  /**
   * Seed default organization and admin from environment variables.
   * This runs ONCE on first startup if no organization exists.
   * Users should change the password after first login.
   */
  public async seedDefaultAdmin(): Promise<boolean> {
    try {
      // Check if organization already exists
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        logger.info('Organization already exists, skipping default admin seed');
        return false;
      }

      // Get default admin config from environment
      const defaultEmail = process.env['DEFAULT_ADMIN_EMAIL'];
      const defaultPassword = process.env['DEFAULT_ADMIN_PASSWORD'];
      const defaultOrgName = process.env['DEFAULT_ORG_NAME'] || 'My Organization';
      const defaultOrgDomain = process.env['DEFAULT_ORG_DOMAIN'] || 'example.com';

      // If no default admin configured, skip (user will use setup wizard)
      if (!defaultEmail || !defaultPassword) {
        logger.info('No DEFAULT_ADMIN_EMAIL/PASSWORD configured, setup wizard required');
        return false;
      }

      logger.info('Seeding default organization and admin...');

      // Start transaction
      await db.query('BEGIN');

      try {
        // Create organization
        const orgInsert = await db.query(
          `INSERT INTO organizations (name, domain, is_setup_complete)
           VALUES ($1, $2, true)
           RETURNING id`,
          [defaultOrgName, defaultOrgDomain]
        );
        const organizationId = orgInsert.rows[0].id;

        // Hash password
        const passwordHash = await bcrypt.hash(defaultPassword, 12);

        // Create admin user
        const userInsert = await db.query(
          `INSERT INTO organization_users (
            email, password_hash, first_name, last_name,
            role, organization_id, is_active, email_verified
          )
           VALUES ($1, $2, 'Admin', 'User', 'admin', $3, true, true)
           RETURNING id`,
          [defaultEmail, passwordHash, organizationId]
        );
        const adminId = userInsert.rows[0].id;

        // Create auth_accounts entry for better-auth login
        await db.query(
          `INSERT INTO auth_accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
           VALUES (gen_random_uuid()::text, $1, $2, 'credential', $3, NOW(), NOW())`,
          [adminId, defaultEmail, passwordHash]
        );

        // Create default organization settings
        await db.query(
          `INSERT INTO organization_settings (organization_id, key, value)
           VALUES ($1, 'google_workspace_enabled', 'false'),
                  ($1, 'microsoft_365_enabled', 'false')`,
          [organizationId]
        );

        // Insert default modules
        const modules = [
          { name: 'Google Workspace', slug: 'google_workspace', description: 'Sync users and groups from Google Workspace' },
          { name: 'Microsoft 365', slug: 'microsoft_365', description: 'Sync users and groups from Microsoft 365' },
          { name: 'User Management', slug: 'user_management', description: 'Manage organization users' },
          { name: 'Audit Logs', slug: 'audit_logs', description: 'Track all system activities' }
        ];

        for (const module of modules) {
          await db.query(
            `INSERT INTO modules (name, slug, description, version, config_schema)
             VALUES ($1, $2, $3, '1.0.0', '{}')
             ON CONFLICT (name) DO NOTHING`,
            [module.name, module.slug, module.description]
          );
        }

        await db.query('COMMIT');

        logger.info('✅ Default admin seeded successfully', {
          email: defaultEmail,
          organization: defaultOrgName
        });
        logger.info('⚠️  Please change the default password after first login!');

        return true;
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to seed default admin', error);
      throw error;
    }
  }
}

export const dbInitializer = new DatabaseInitializer();