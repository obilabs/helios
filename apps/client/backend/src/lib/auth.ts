/**
 * Better Auth Configuration - ACTIVE
 *
 * This file configures better-auth for the Helios platform.
 * Provides session-based authentication with httpOnly cookies.
 *
 * Features:
 * - Email/password authentication via credential provider
 * - Session management with httpOnly cookies (XSS resistant)
 * - Role-based access control
 * - Future: SSO/OIDC support
 *
 * Password Migration (2025-12-26):
 * Passwords were migrated from organization_users.password_hash to
 * auth_accounts.password with provider_id = 'credential'.
 * See: database/migrations/062_add_password_to_auth_accounts.sql
 */

import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  database: process.env['DB_NAME'] || 'helios_client',
  user: process.env['DB_USER'] || 'postgres',
  password: process.env['DB_PASSWORD'] || 'postgres',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const auth = betterAuth({
  // Database configuration
  database: pool,

  // Secret for signing tokens and cookies
  secret: process.env['BETTER_AUTH_SECRET'] || process.env['JWT_SECRET'] || 'dev-secret-change-in-production',

  // Base URL for callbacks (backend URL)
  baseURL: process.env['APP_URL'] || 'http://localhost:3001',

  // Email + Password authentication with custom bcrypt hashing
  emailAndPassword: {
    enabled: true,
    // Use bcrypt instead of scrypt (our existing passwords are bcrypt)
    password: {
      hash: async (password: string) => {
        return bcrypt.hash(password, 12);
      },
      verify: async (data: { password: string; hash: string }) => {
        return bcrypt.compare(data.password, data.hash);
      },
    },
  },

  // Session configuration
  session: {
    // 8 hours session expiry
    expiresIn: 60 * 60 * 8,
    // Update session activity every 15 minutes
    updateAge: 60 * 15,
    // Model name for sessions table
    modelName: 'auth_sessions',
    fields: {
      userId: 'user_id',
      token: 'token',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // Cookie cache settings
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  // Map to existing user table
  user: {
    modelName: 'organization_users',
    fields: {
      // Map snake_case columns to camelCase expected by better-auth
      email: 'email',
      name: 'first_name', // better-auth uses 'name', we use first_name
      image: 'photo_url',
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // Additional fields we need in user sessions
    additionalFields: {
      firstName: {
        type: 'string',
        fieldName: 'first_name',
      },
      lastName: {
        type: 'string',
        fieldName: 'last_name',
      },
      role: {
        type: 'string',
        fieldName: 'role',
      },
      organizationId: {
        type: 'string',
        fieldName: 'organization_id',
      },
      isExternalAdmin: {
        type: 'boolean',
        fieldName: 'is_external_admin',
      },
      defaultView: {
        type: 'string',
        fieldName: 'default_view',
      },
      isActive: {
        type: 'boolean',
        fieldName: 'is_active',
      },
      department: {
        type: 'string',
        fieldName: 'department',
      },
    },
  },

  // Account table configuration (for credential and SSO providers)
  account: {
    modelName: 'auth_accounts',
    fields: {
      // Map snake_case columns to camelCase expected by better-auth
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      idToken: 'id_token',
      password: 'password', // Added for credential auth
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // Verification table (email verification, password reset)
  verification: {
    modelName: 'auth_verifications',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // Advanced options
  advanced: {
    // Use secure cookies in production
    useSecureCookies: process.env['NODE_ENV'] === 'production',
    // Cookie prefix
    cookiePrefix: 'helios',
    // Allow cross-origin requests with credentials
    crossSubDomainCookies: {
      enabled: false,
    },
  },

  // Plugins
  plugins: [
    twoFactor({
      issuer: 'Helios',
      totpOptions: {
        period: 30,
        digits: 6,
      },
    }),
    passkey({
      rpName: 'Helios',
      rpID: process.env['PASSKEY_RP_ID'] || 'localhost',
      origin: process.env['PASSKEY_ORIGIN'] || process.env['FRONTEND_URL'] || 'http://localhost:3000',
    }),
  ],

  // Trusted origins for CORS
  // Build trusted origins list from environment and defaults
  trustedOrigins: (() => {
    const origins = new Set<string>([
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost',
      'http://localhost:80',
    ]);

    // Add FRONTEND_URL if set
    const frontendUrl = process.env['FRONTEND_URL'];
    if (frontendUrl) {
      origins.add(frontendUrl);
      // Also add without explicit port 80
      if (frontendUrl.endsWith(':80')) {
        origins.add(frontendUrl.replace(':80', ''));
      }
    }

    // Add APP_URL if set (backend URL)
    const appUrl = process.env['APP_URL'];
    if (appUrl) {
      origins.add(appUrl);
    }

    // Add additional trusted origins from TRUSTED_ORIGINS env var (comma-separated)
    const additionalOrigins = process.env['TRUSTED_ORIGINS'];
    if (additionalOrigins) {
      additionalOrigins.split(',').forEach(origin => {
        const trimmed = origin.trim();
        if (trimmed) origins.add(trimmed);
      });
    }

    // In development, dynamically allow local network IPs
    // This is safe because it's only for non-production environments
    if (process.env['NODE_ENV'] !== 'production') {
      // Get the host IP from common env vars or use a broad pattern
      const hostIp = process.env['HOST_IP'] || process.env['SERVER_IP'];
      if (hostIp) {
        origins.add(`http://${hostIp}`);
        origins.add(`http://${hostIp}:80`);
      }
    }

    return Array.from(origins);
  })(),

});

// Export auth type for use in other files
export type Auth = typeof auth;
