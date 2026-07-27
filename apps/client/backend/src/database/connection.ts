import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

class DatabaseConnection {
  private pool: Pool;
  private static instance: DatabaseConnection;

  private constructor() {
    // DB_SSL controls SSL: 'true', 'false', or 'require' (default: false for docker, true for external)
    const sslMode = process.env['DB_SSL'];
    let ssl: boolean | { rejectUnauthorized: boolean } = false;
    if (sslMode === 'true' || sslMode === 'require') {
      ssl = { rejectUnauthorized: sslMode === 'require' };
    }

    this.pool = new Pool({
      host: process.env['DB_HOST'] || 'localhost',
      port: parseInt(process.env['DB_PORT'] || '5432'),
      database: process.env['DB_NAME'] || 'helios_client',
      user: process.env['DB_USER'] || 'postgres',
      password: process.env['DB_PASSWORD'] || 'postgres',
      max: 20, // maximum number of clients in the pool
      idleTimeoutMillis: 30000, // how long a client is allowed to remain idle
      connectionTimeoutMillis: 2000, // how long to wait when connecting a new client
      ssl,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    // Handle pool connection
    this.pool.on('connect', () => {
      logger.info('Database client connected');
    });

    // Handle pool removal
    this.pool.on('remove', () => {
      logger.info('Database client removed');
    });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      logger.error('Database query error', { text, params, error });
      throw error;
    }
  }

  public async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed', error);
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database pool closed');
  }

  // Helper methods for common queries
  public async findOne(table: string, conditions: Record<string, any>): Promise<any> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');

    const result = await this.query(
      `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`,
      values
    );

    return result.rows[0] || null;
  }

  public async findMany(table: string, conditions?: Record<string, any>, limit?: number): Promise<any[]> {
    let query = `SELECT * FROM ${table}`;
    let values: any[] = [];

    if (conditions && Object.keys(conditions).length > 0) {
      const keys = Object.keys(conditions);
      values = Object.values(conditions);
      const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
      query += ` WHERE ${whereClause}`;
    }

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const result = await this.query(query, values);
    return result.rows;
  }

  public async insert(table: string, data: Record<string, any>): Promise<any> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const columns = keys.join(', ');

    const result = await this.query(
      `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return result.rows[0];
  }

  public async update(table: string, data: Record<string, any>, conditions: Record<string, any>): Promise<any> {
    const dataKeys = Object.keys(data);
    const dataValues = Object.values(data);
    const conditionKeys = Object.keys(conditions);
    const conditionValues = Object.values(conditions);

    const setClause = dataKeys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const whereClause = conditionKeys.map((key, index) => `${key} = $${index + dataKeys.length + 1}`).join(' AND ');

    const result = await this.query(
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`,
      [...dataValues, ...conditionValues]
    );

    return result.rows[0];
  }

  public async delete(table: string, conditions: Record<string, any>): Promise<number> {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);
    const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');

    const result = await this.query(
      `DELETE FROM ${table} WHERE ${whereClause}`,
      values
    );

    return result.rowCount || 0;
  }
}

export const db = DatabaseConnection.getInstance();