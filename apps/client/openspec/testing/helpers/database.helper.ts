import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

export class DatabaseHelper {
  private client: Client | null = null;
  private config: any;

  constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'helios_client_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    };
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    this.client = new Client(this.config);
    await this.client.connect();
    console.log('✅ Connected to test database');
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
      console.log('✅ Disconnected from test database');
    }
  }

  /**
   * Execute query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    await this.connect();
    return await this.client!.query(sql, params);
  }

  /**
   * Seed database with test data
   */
  async seed(scenario: string): Promise<void> {
    await this.connect();

    // Clear existing data
    await this.cleanup();

    // Load seed file
    const seedPath = path.join(__dirname, '../fixtures/seeds', `${scenario}.sql`);

    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, 'utf-8');
      await this.client!.query(seedSql);
      console.log(`✅ Database seeded for scenario: ${scenario}`);
    } else {
      // Default seed data
      await this.seedDefault();
    }
  }

  /**
   * Seed with default test data
   */
  private async seedDefault(): Promise<void> {
    // Create test organization
    await this.query(`
      INSERT INTO organizations (id, name, domain, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      '00000000-0000-0000-0000-000000000001',
      'Test Organization',
      'test.helios.local'
    ]);

    // Create test users
    await this.query(`
      INSERT INTO organization_users (id, organization_id, email, password_hash, first_name, last_name, role, is_active)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, true),
        ($8, $2, $9, $10, $11, $12, $13, true),
        ($14, $2, $15, $16, $17, $18, $19, true)
      ON CONFLICT (id) DO NOTHING
    `, [
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      'admin@test.helios.local',
      '$2b$12$YTw5wH.tVfQK.mCFLHYcH.9rg7hFhIhqg2RM4nYmJD3oNCjmVqFxm', // AdminTest123!
      'Admin',
      'User',
      'admin',
      '00000000-0000-0000-0000-000000000003',
      'user@test.helios.local',
      '$2b$12$YTw5wH.tVfQK.mCFLHYcH.9rg7hFhIhqg2RM4nYmJD3oNCjmVqFxm', // UserTest123!
      'Regular',
      'User',
      'user',
      '00000000-0000-0000-0000-000000000004',
      'manager@test.helios.local',
      '$2b$12$YTw5wH.tVfQK.mCFLHYcH.9rg7hFhIhqg2RM4nYmJD3oNCjmVqFxm', // ManagerTest123!
      'Manager',
      'User',
      'manager'
    ]);

    console.log('✅ Default test data seeded');
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<void> {
    await this.connect();

    // Tables to clean (in order to respect foreign key constraints)
    const tables = [
      'helpdesk_notes',
      'helpdesk_presence',
      'helpdesk_assignment_history',
      'helpdesk_tickets',
      'bulk_operation_results',
      'bulk_operations',
      'gw_synced_groups',
      'gw_synced_users',
      'organization_groups',
      'organization_users',
      'organizations'
    ];

    for (const table of tables) {
      try {
        await this.query(`DELETE FROM ${table}`);
      } catch (error) {
        // Table might not exist
      }
    }

    console.log('✅ Test data cleaned up');
  }

  /**
   * Create snapshot of database state
   */
  async createSnapshot(): Promise<any> {
    await this.connect();

    const snapshot: any = {};

    // List of tables to snapshot
    const tables = [
      'organizations',
      'organization_users',
      'organization_groups',
      'helpdesk_tickets',
      'bulk_operations'
    ];

    for (const table of tables) {
      try {
        const result = await this.query(`SELECT * FROM ${table}`);
        snapshot[table] = result.rows;
      } catch {
        // Table might not exist
      }
    }

    return snapshot;
  }

  /**
   * Restore database from snapshot
   */
  async restoreSnapshot(snapshot: any): Promise<void> {
    await this.cleanup();

    for (const [table, rows] of Object.entries(snapshot)) {
      if (Array.isArray(rows) && rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const values = rows.map(row => Object.values(row));

        for (const valueSet of values) {
          const placeholders = valueSet.map((_, i) => `$${i + 1}`).join(', ');
          await this.query(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
            valueSet
          );
        }
      }
    }

    console.log('✅ Database restored from snapshot');
  }

  /**
   * Verify record exists
   */
  async exists(table: string, conditions: Record<string, any>): Promise<boolean> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

    const result = await this.query(
      `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`,
      values
    );

    return result.rows[0].count > 0;
  }

  /**
   * Get record count
   */
  async count(table: string, conditions?: Record<string, any>): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    let values: any[] = [];

    if (conditions) {
      const keys = Object.keys(conditions);
      values = Object.values(conditions);
      const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }

    const result = await this.query(sql, values);
    return parseInt(result.rows[0].count);
  }

  /**
   * Get single record
   */
  async findOne(table: string, conditions: Record<string, any>): Promise<any> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

    const result = await this.query(
      `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Get multiple records
   */
  async findMany(table: string, conditions?: Record<string, any>): Promise<any[]> {
    let sql = `SELECT * FROM ${table}`;
    let values: any[] = [];

    if (conditions) {
      const keys = Object.keys(conditions);
      values = Object.values(conditions);
      const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }

    const result = await this.query(sql, values);
    return result.rows;
  }

  /**
   * Insert record
   */
  async insert(table: string, data: Record<string, any>): Promise<any> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const result = await this.query(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Update record
   */
  async update(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>
  ): Promise<any> {
    const dataKeys = Object.keys(data);
    const dataValues = Object.values(data);
    const condKeys = Object.keys(conditions);
    const condValues = Object.values(conditions);

    const setClause = dataKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const whereClause = condKeys.map((key, i) => `${key} = $${dataValues.length + i + 1}`).join(' AND ');

    const result = await this.query(
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`,
      [...dataValues, ...condValues]
    );

    return result.rows[0];
  }

  /**
   * Delete records
   */
  async delete(table: string, conditions: Record<string, any>): Promise<number> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

    const result = await this.query(
      `DELETE FROM ${table} WHERE ${whereClause}`,
      values
    );

    return result.rowCount;
  }
}

export default DatabaseHelper;