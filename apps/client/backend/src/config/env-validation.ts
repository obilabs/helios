import Joi from 'joi';
import { logger } from '../utils/logger.js';

/**
 * Environment variable validation schema
 *
 * This validates all environment variables at startup and provides
 * clear error messages when required values are missing or invalid.
 *
 * Environment modes:
 * - development: Lenient validation, sensible defaults
 * - production: Strict validation, requires secure configuration
 * - test: Minimal validation for testing
 */

// Helper to check if we're in production
const isProduction = process.env['NODE_ENV'] === 'production';
const isTest = process.env['NODE_ENV'] === 'test';

// Base schema for all environments
const baseSchema = Joi.object({
  // Node environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development')
    .description('Application environment'),

  // Server configuration
  PORT: Joi.number()
    .port()
    .default(3001)
    .description('Backend server port'),

  // Database configuration
  DB_HOST: Joi.string()
    .hostname()
    .default('localhost')
    .description('PostgreSQL host'),

  DB_PORT: Joi.number()
    .port()
    .default(5432)
    .description('PostgreSQL port'),

  DB_NAME: Joi.string()
    .required()
    .default('helios_client')
    .description('PostgreSQL database name'),

  DB_USER: Joi.string()
    .required()
    .default('postgres')
    .description('PostgreSQL user'),

  DB_PASSWORD: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(8).required(),
      otherwise: Joi.string().allow('').default('postgres')
    })
    .description('PostgreSQL password'),

  // Redis configuration
  REDIS_HOST: Joi.string()
    .hostname()
    .default('localhost')
    .description('Redis host'),

  REDIS_PORT: Joi.number()
    .port()
    .default(6379)
    .description('Redis port'),

  REDIS_PASSWORD: Joi.string()
    .allow('')
    .default('')
    .description('Redis password (optional)'),

  // JWT configuration
  JWT_SECRET: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(32).required(),
      otherwise: Joi.string().min(8).default('dev-jwt-secret-change-in-production')
    })
    .description('JWT signing secret'),

  JWT_EXPIRES_IN: Joi.string()
    .default('8h')
    .description('JWT expiration time'),

  REFRESH_TOKEN_EXPIRES_IN: Joi.string()
    .default('7d')
    .description('Refresh token expiration time'),

  // Encryption keys
  ENCRYPTION_KEY: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(32).required(),
      otherwise: Joi.string().min(8).default('dev-encryption-key-change-in-prod')
    })
    .description('Encryption key for service account credentials'),

  EMAIL_ENCRYPTION_KEY: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(32).required(),
      otherwise: Joi.string().min(8).default('dev-email-encryption-key-change')
    })
    .description('Encryption key for email credentials'),

  // Public URLs
  PUBLIC_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default('')
    .description('Public URL for asset links (empty for relative URLs)'),

  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:80')
    .description('Frontend URL for CORS'),

  APP_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:80')
    .description('Application URL for email links'),

  // S3/MinIO configuration
  S3_ENDPOINT: Joi.string()
    .uri()
    .default('http://localhost:9000')
    .description('S3-compatible storage endpoint'),

  S3_ACCESS_KEY: Joi.string()
    .default('minioadmin')
    .description('S3 access key'),

  S3_SECRET_KEY: Joi.string()
    .default('minioadmin123')
    .description('S3 secret key'),

  S3_BUCKET_PRIVATE: Joi.string()
    .default('helios-uploads')
    .description('Private S3 bucket name'),

  S3_BUCKET_PUBLIC: Joi.string()
    .default('helios-public')
    .description('Public S3 bucket name'),

  S3_REGION: Joi.string()
    .default('us-east-1')
    .description('S3 region'),

  S3_USE_SSL: Joi.string()
    .valid('true', 'false')
    .default('false')
    .description('Use SSL for S3'),

  S3_PUBLIC_URL: Joi.string()
    .uri()
    .default('http://localhost:9000')
    .description('Public URL for S3 assets'),

  // Rate limiting
  RATE_LIMIT_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description('Enable rate limiting'),

  RATE_LIMIT_WINDOW_MS: Joi.number()
    .default(900000)
    .description('Rate limit window in milliseconds'),

  RATE_LIMIT_MAX_REQUESTS: Joi.number()
    .default(100)
    .description('Maximum requests per window'),

  // SMTP configuration (optional)
  SMTP_HOST: Joi.string()
    .hostname()
    .allow('')
    .default('')
    .description('SMTP server host'),

  SMTP_PORT: Joi.number()
    .port()
    .default(587)
    .description('SMTP server port'),

  SMTP_SECURE: Joi.string()
    .valid('true', 'false')
    .default('false')
    .description('Use TLS for SMTP'),

  SMTP_USER: Joi.string()
    .allow('')
    .default('')
    .description('SMTP username'),

  SMTP_PASS: Joi.string()
    .allow('')
    .default('')
    .description('SMTP password'),

  SMTP_FROM: Joi.string()
    .email()
    .default('noreply@helios.com')
    .description('Default sender email'),

  SMTP_FROM_NAME: Joi.string()
    .default('Helios Admin Portal')
    .description('Default sender name'),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info')
    .description('Logging level'),

  LOG_FILE: Joi.string()
    .default('logs/helios.log')
    .description('Log file path'),

  // Background jobs
  SCHEDULED_ACTIONS_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description('Enable scheduled action processor'),

  SCHEDULED_ACTIONS_INTERVAL_MS: Joi.number()
    .default(60000)
    .description('Scheduled action check interval'),

  SCHEDULED_ACTIONS_BATCH_SIZE: Joi.number()
    .default(10)
    .description('Scheduled action batch size'),

  SCHEDULED_ACTIONS_MAX_RETRIES: Joi.number()
    .default(3)
    .description('Max retries for scheduled actions'),

  SIGNATURE_SYNC_JOB_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description('Enable signature sync job'),

  SIGNATURE_SYNC_INTERVAL_MS: Joi.number()
    .default(300000)
    .description('Signature sync interval (5 minutes)'),

  SIGNATURE_SYNC_BATCH_SIZE: Joi.number()
    .default(50)
    .description('Signature sync batch size'),

  SIGNATURE_DETECT_EXTERNAL_CHANGES: Joi.string()
    .valid('true', 'false')
    .default('false')
    .description('Detect external signature changes'),

  CAMPAIGN_SCHEDULER_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description('Enable campaign scheduler'),

  CAMPAIGN_SCHEDULER_INTERVAL_MS: Joi.number()
    .default(60000)
    .description('Campaign scheduler interval'),

  // Nginx proxy configuration
  NGINX_CONFIG: Joi.string()
    .default('nginx.conf')
    .description('Nginx config file to use'),

  HTTP_PORT: Joi.number()
    .port()
    .default(80)
    .description('HTTP port (nginx)'),

  HTTPS_PORT: Joi.number()
    .port()
    .default(443)
    .description('HTTPS port (nginx)'),

  // Theme configuration (frontend passes through)
  VITE_DEFAULT_THEME: Joi.string()
    .default('helios-purple')
    .description('Default UI theme'),

  // Legacy environment variables (deprecated but still used)
  APPURL: Joi.string()
    .allow('')
    .default('')
    .description('[DEPRECATED] Use PUBLIC_URL instead'),

  DOMAIN: Joi.string()
    .allow('')
    .default('')
    .description('[DEPRECATED] Use PUBLIC_URL instead'),

}).unknown(true); // Allow additional env vars we don't validate

/**
 * Validated environment configuration type
 */
export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  ENCRYPTION_KEY: string;
  EMAIL_ENCRYPTION_KEY: string;
  PUBLIC_URL: string;
  FRONTEND_URL: string;
  APP_URL: string;
  S3_ENDPOINT: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
  S3_BUCKET_PRIVATE: string;
  S3_BUCKET_PUBLIC: string;
  S3_REGION: string;
  S3_USE_SSL: string;
  S3_PUBLIC_URL: string;
  RATE_LIMIT_ENABLED: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  SMTP_FROM_NAME: string;
  LOG_LEVEL: string;
  LOG_FILE: string;
}

/**
 * Validate environment variables
 *
 * @throws Error if validation fails with detailed message
 * @returns Validated environment configuration
 */
export function validateEnv(): EnvConfig {
  const { error, value } = baseSchema.validate(process.env, {
    abortEarly: false, // Collect all errors
    stripUnknown: false, // Keep unknown keys
    convert: true, // Convert strings to appropriate types
  });

  if (error) {
    const errorMessages = error.details.map(detail => {
      const key = detail.path.join('.');
      return `  - ${key}: ${detail.message}`;
    });

    const errorOutput = [
      '',
      '╔════════════════════════════════════════════════════════════════╗',
      '║           ENVIRONMENT VALIDATION FAILED                        ║',
      '╠════════════════════════════════════════════════════════════════╣',
      '║ The following environment variables are missing or invalid:    ║',
      '╚════════════════════════════════════════════════════════════════╝',
      '',
      ...errorMessages,
      '',
      '╔════════════════════════════════════════════════════════════════╗',
      '║ To fix:                                                        ║',
      '║  1. Copy .env.example to .env                                  ║',
      '║  2. Update the values marked above                             ║',
      '║  3. Restart the application                                    ║',
      '╚════════════════════════════════════════════════════════════════╝',
      '',
    ].join('\n');

    // Log error to console (logger may not be initialized yet)
    console.error(errorOutput);

    throw new Error(`Environment validation failed:\n${errorMessages.join('\n')}`);
  }

  // Log successful validation
  const envMode = value.NODE_ENV;
  const warnings: string[] = [];

  // Check for development defaults in production
  if (envMode === 'production') {
    if (value.JWT_SECRET?.includes('change') || value.JWT_SECRET?.includes('dev')) {
      warnings.push('  - JWT_SECRET appears to use a default/development value');
    }
    if (value.ENCRYPTION_KEY?.includes('change') || value.ENCRYPTION_KEY?.includes('dev')) {
      warnings.push('  - ENCRYPTION_KEY appears to use a default/development value');
    }
    if (value.DB_PASSWORD === 'postgres') {
      warnings.push('  - DB_PASSWORD is using default value "postgres"');
    }
  }

  // Warn about deprecated environment variables
  if (value.APPURL) {
    warnings.push('  - APPURL is deprecated, use PUBLIC_URL instead');
  }
  if (value.DOMAIN) {
    warnings.push('  - DOMAIN is deprecated, use PUBLIC_URL instead');
  }

  if (warnings.length > 0) {
    console.warn([
      '',
      '⚠️  Environment Configuration Warnings:',
      ...warnings,
      '',
    ].join('\n'));
  }

  return value as EnvConfig;
}

/**
 * Get a validated environment variable with type safety
 */
export function getEnv<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
  return process.env[key] as EnvConfig[K];
}

/**
 * Check if running in production mode
 */
export function isProductionEnv(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

/**
 * Check if running in development mode
 */
export function isDevelopmentEnv(): boolean {
  return process.env['NODE_ENV'] !== 'production' && process.env['NODE_ENV'] !== 'test';
}

/**
 * Check if running in test mode
 */
export function isTestEnv(): boolean {
  return process.env['NODE_ENV'] === 'test';
}
