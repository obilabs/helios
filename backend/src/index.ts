// Polyfill global crypto for better-auth in Node.js 18
// better-auth expects global crypto which is only auto-exposed in Node.js 19+
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

// Import type augmentation for Express Request (must be .ts for ts-node compatibility)
import './types/express.js';

// Load environment variables FIRST before any imports that use them
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env is in project root, two levels up from src/
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Validate environment variables immediately after loading
import { validateEnv } from './config/env-validation.js';
try {
  validateEnv();
  console.log(`✅ Environment validated (${process.env['NODE_ENV'] || 'development'} mode)`);
} catch (error) {
  console.error('❌ Environment validation failed. Exiting...');
  process.exit(1);
}

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { logger } from './utils/logger.js';
import { db } from './database/connection.js';
import { dbInitializer } from './database/init.js';
import { migrationRunner } from './database/migrate.js';
import { errorHandler } from './middleware/errorHandler.js';
// import { platformRoutes } from './routes/platform.routes.js';
import userRoutes from './routes/user.routes.js';
import authRoutes from './routes/auth.routes.js';
import GoogleWorkspaceRoutes from './routes/google-workspace.routes.js';
import microsoftRoutes from './routes/microsoft.routes.js';
import modulesRoutes from './routes/modules.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import apiKeysRoutes from './routes/api-keys.routes.js';
import labelsRoutes from './routes/labels.routes.js';
import workspacesRoutes from './routes/workspaces.routes.js';
import accessGroupsRoutes from './routes/access-groups.routes.js';
import securityEventsRoutes from './routes/security-events.routes.js';
import auditLogsRoutes from './routes/audit-logs.routes.js';
import userPreferencesRoutes from './routes/user-preferences.routes.js';
import emailSecurityRoutes from './routes/email-security.routes.js';
import orgChartRoutes from './routes/org-chart.routes.js';
import signaturesRoutes from './routes/signatures.routes.js';
import signatureAssignmentsRoutes from './routes/signature-assignments.routes.js';
import signatureSyncRoutes from './routes/signature-sync.routes.js';
import signatureCampaignsRoutes from './routes/signature-campaigns.routes.js';
import signaturePermissionsRoutes from './routes/signature-permissions.routes.js';
import customFieldsRoutes from './routes/custom-fields.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import departmentsRoutes from './routes/departments.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import costCentersRoutes from './routes/cost-centers.routes.js';
import jobTitlesRoutes from './routes/job-titles.routes.js';
import licensesRoutes from './routes/licenses.routes.js';
import dataQualityRoutes from './routes/data-quality.routes.js';
import meRoutes from './routes/me.routes.js';
import peopleRoutes from './routes/people.routes.js';
import bulkOperationsRoutes from './routes/bulk-operations.routes.js';
import { authenticateApiKey } from './middleware/api-key-auth.js';
import { SignatureSchedulerService } from './services/signature-scheduler.service.js';
import { cacheService } from './services/cache.service.js';
import { activityTracker } from './services/activity-tracker.service.js';
import { initializeBulkOperationsGateway } from './websocket/bulk-operations.gateway.js';
import { startScheduledActionProcessor, stopScheduledActionProcessor } from './jobs/scheduled-action-processor.js';
import { startSignatureSyncJob, stopSignatureSyncJob } from './jobs/signature-sync.job.js';
import { startCampaignSchedulerJob, stopCampaignSchedulerJob } from './jobs/campaign-scheduler.job.js';
import { startTrackingRetentionJob, stopTrackingRetentionJob } from './jobs/tracking-retention.job.js';
import { syncScheduler } from './services/sync-scheduler.service.js';
import { telemetryService } from './services/telemetry.service.js';
import { licenseService } from './services/license.service.js';

import transparentProxyRouter from './middleware/transparent-proxy.js';
import microsoftTransparentProxyRouter from './middleware/microsoft-transparent-proxy.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import assetProxyRoutes from './routes/asset-proxy.routes.js';
import assetsRoutes from './routes/assets.routes.js';
import lifecycleRoutes from './routes/lifecycle.routes.js';
import trainingRoutes from './routes/training.routes.js';
import automationRoutes from './routes/automation.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import trackingAnalyticsRoutes from './routes/tracking-analytics.routes.js';
import mcpRoutes from './routes/mcp.routes.js';
import featureFlagsRoutes from './routes/feature-flags.routes.js';
import aiRoutes from './routes/ai.routes.js';
import helpRoutes from './routes/help.routes.js';
import externalSharingRoutes from './routes/external-sharing.routes.js';
import loginActivityRoutes from './routes/login-activity.routes.js';
import initialPasswordsRoutes from './routes/initial-passwords.routes.js';
import securityRoutes from './routes/security.routes.js';
import mtpRoutes from './routes/mtp.routes.js';
import relayRoutes from './routes/relay.routes.js';
import { requestIdMiddleware, REQUEST_ID_HEADER } from './middleware/request-id.js';
import { authHandler, auth } from './lib/auth-handler.js';
import { auditMiddleware } from './middleware/audit.middleware.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env['PORT'] || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting (disabled in test environment)
const rateLimitEnabled = process.env['RATE_LIMIT_ENABLED'] !== 'false';

if (rateLimitEnabled) {
  const limiter = rateLimit({
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000'), // 15 minutes
    max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
    message: {
      error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);
  logger.info('Rate limiting enabled');
} else {
  logger.info('Rate limiting disabled (test environment)');
}

// CORS configuration helper
function getCorsOrigins(): (string | boolean | RegExp)[] {
  const frontendUrl = process.env['FRONTEND_URL'];
  const publicUrl = process.env['PUBLIC_URL'];

  if (process.env['NODE_ENV'] === 'production') {
    const origins: string[] = [];
    if (frontendUrl) origins.push(frontendUrl);
    if (publicUrl && publicUrl !== frontendUrl) origins.push(publicUrl);
    // Fallback to legacy env vars if new ones not set
    if (origins.length === 0) {
      if (process.env['APPURL']) origins.push(`https://${process.env['APPURL']}`);
      if (process.env['DOMAIN']) origins.push(`https://${process.env['DOMAIN']}`);
    }
    return origins.length > 0 ? origins : [false]; // Disable CORS if no origins configured
  }

  // Development - allow common local origins AND local network IPs
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:80',
    'http://localhost',
    // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/,
    ...(frontendUrl ? [frontendUrl] : []),
    ...(publicUrl && publicUrl !== frontendUrl ? [publicUrl] : [])
  ].filter(Boolean) as (string | RegExp)[];
}

const corsOptions = {
  origin: getCorsOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'X-Actor-Name',
    'X-Actor-Email',
    'X-Actor-ID',
    'X-Actor-Type',
    'X-Client-Reference',
    REQUEST_ID_HEADER  // X-Request-ID for request tracing
  ],
  exposedHeaders: [REQUEST_ID_HEADER],  // Allow client to read X-Request-ID
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request ID middleware - MUST be early in chain for tracing
app.use(requestIdMiddleware);

// Logging middleware - now includes requestId
app.use((req, res, next) => {
  // Log incoming request
  logger.info(`${req.method} ${req.url}`, {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger.log(level, `${req.method} ${req.url} ${res.statusCode} ${duration}ms`, {
      requestId: req.requestId,
      status: res.statusCode,
      duration,
    });
  });

  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    const platformSetupComplete = await dbInitializer.isPlatformSetupComplete();

    res.json({
      status: 'healthy',
      database: dbHealth ? 'connected' : 'disconnected',
      platformSetup: platformSetupComplete ? 'complete' : 'pending',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] || '1.0.0',
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Health check failed', { error, requestId: req.requestId });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }
});
// API Documentation - Swagger UI with custom styling
const swaggerCustomCss = `
  /* Helios Custom Swagger UI Styling */
  .swagger-ui .topbar { display: none; }

  /* Overall container */
  .swagger-ui {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }

  /* Info section */
  .swagger-ui .info {
    margin: 30px 0;
  }

  .swagger-ui .info .title {
    font-size: 32px;
    color: #1f2937;
    font-weight: 600;
  }

  .swagger-ui .info .description {
    color: #4b5563;
    font-size: 14px;
    line-height: 1.6;
  }

  /* Scheme container */
  .swagger-ui .scheme-container {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
  }

  /* Operations */
  .swagger-ui .opblock {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .swagger-ui .opblock.opblock-post {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.03);
  }

  .swagger-ui .opblock.opblock-get {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.03);
  }

  .swagger-ui .opblock.opblock-put {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.03);
  }

  .swagger-ui .opblock.opblock-patch {
    border-color: #8b5cf6;
    background: rgba(139, 92, 246, 0.03);
  }

  .swagger-ui .opblock.opblock-delete {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.03);
  }

  /* Operation tags */
  .swagger-ui .opblock-tag {
    border-bottom: 2px solid #e5e7eb;
    padding: 16px 0;
    margin: 24px 0;
  }

  .swagger-ui .opblock-tag-section {
    margin-bottom: 24px;
  }

  /* Method badges */
  .swagger-ui .opblock-summary-method {
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
    min-width: 70px;
    text-align: center;
    padding: 6px 12px;
  }

  /* Buttons */
  .swagger-ui .btn {
    border-radius: 6px;
    font-weight: 500;
    padding: 8px 16px;
    transition: all 0.15s ease;
  }

  .swagger-ui .btn.execute {
    background: #8b5cf6;
    border-color: #8b5cf6;
  }

  .swagger-ui .btn.execute:hover {
    background: #7c3aed;
    border-color: #7c3aed;
  }

  /* Parameters table */
  .swagger-ui table thead tr th {
    background: #f9fafb;
    color: #374151;
    font-weight: 600;
    font-size: 13px;
    padding: 12px;
    border-bottom: 2px solid #e5e7eb;
  }

  .swagger-ui table tbody tr td {
    padding: 12px;
    border-bottom: 1px solid #f3f4f6;
  }

  /* Response section */
  .swagger-ui .responses-wrapper {
    margin-top: 20px;
  }

  .swagger-ui .response {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    margin-bottom: 12px;
  }

  /* Code blocks */
  .swagger-ui .highlight-code {
    background: #1e1e1e;
    border-radius: 6px;
    padding: 16px;
  }

  .swagger-ui .highlight-code pre {
    color: #e5e7eb;
  }

  /* Models */
  .swagger-ui .model-box {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #f9fafb;
    padding: 16px;
  }

  .swagger-ui .model-title {
    color: #1f2937;
    font-weight: 600;
  }

  /* Authentication */
  .swagger-ui .auth-container {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
    margin: 16px 0;
  }

  .swagger-ui .auth-btn-wrapper .btn-done {
    background: #10b981;
    border-color: #10b981;
  }

  .swagger-ui .auth-btn-wrapper .btn-done:hover {
    background: #059669;
    border-color: #059669;
  }

  /* Scrollbar styling */
  .swagger-ui ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .swagger-ui ::-webkit-scrollbar-track {
    background: #f3f4f6;
    border-radius: 4px;
  }

  .swagger-ui ::-webkit-scrollbar-thumb {
    background: #9ca3af;
    border-radius: 4px;
  }

  .swagger-ui ::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
  }
`;

// API Documentation - available at both /api/docs and /api/v1/docs
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: swaggerCustomCss,
  customSiteTitle: 'Helios API Documentation',
  customfavIcon: '/favicon.ico'
}));
// Backwards compatibility alias
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: swaggerCustomCss,
  customSiteTitle: 'Helios API Documentation',
  customfavIcon: '/favicon.ico'
}));

// Serve OpenAPI spec as JSON
app.get('/api/v1/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
// Backwards compatibility alias
app.get('/api/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Public Asset Proxy - NO AUTHENTICATION REQUIRED
// This serves media assets for email signatures with direct URLs
// Must be registered BEFORE API auth middleware
app.use('/a', assetProxyRoutes);

// Tracking pixel endpoints - PUBLIC (no auth required)
// These are loaded by email clients when recipients view emails
// Keep at /api/t (not versioned - pixel URLs should be stable)
app.use('/api/t', trackingRoutes);

// API Key Authentication Middleware - Applied BEFORE JWT
// This allows API key authentication to take priority
// Apply to both versioned and unversioned routes for backwards compatibility
app.use('/api/v1', authenticateApiKey);
app.use('/api', authenticateApiKey);

// Platform setup check middleware - this is the core routing logic
// Helper function for setup check (reused for both /api and /api/v1)
const setupCheckMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // Normalize path for v1 routes (remove /v1 prefix if present)
    const normalizedPath = req.path.startsWith('/v1') ? req.path.slice(3) : req.path;

    // Skip setup check for health, organization setup, auth, and other setup endpoints
    if (normalizedPath.startsWith('/health') ||
      normalizedPath.startsWith('/organization/setup') ||
      normalizedPath.startsWith('/auth') ||
      normalizedPath.startsWith('/setup') ||
      normalizedPath.startsWith('/google-workspace') ||
      normalizedPath.startsWith('/modules') ||
      normalizedPath.startsWith('/docs') ||
      normalizedPath.startsWith('/openapi')) {
      return next();
    }

    const isPlatformSetup = await dbInitializer.isPlatformSetupComplete();

    if (!isPlatformSetup) {
      // If accessing /platform/* routes without setup, allow setup process
      if (normalizedPath.startsWith('/platform/') || normalizedPath === '/setup' || normalizedPath.startsWith('/setup/')) {
        return next();
      }

      // For any other route, return setup required
      return res.status(503).json({
        error: 'Platform setup required',
        setupUrl: '/platform/setup',
        message: 'Please complete platform setup before accessing this resource.',
        requestId: req.requestId,
      });
    }

    next();
  } catch (error) {
    logger.error('Platform setup check failed', { error, requestId: req.requestId });
    res.status(500).json({
      error: 'Platform setup check failed',
      message: 'Unable to determine platform setup status.',
      requestId: req.requestId,
    });
  }
};

// Apply to both versioned and unversioned routes
app.use('/api/v1', setupCheckMiddleware);
app.use('/api', setupCheckMiddleware);

// =============================================================================
// Custom 2FA Status Endpoint
// =============================================================================
// Check if the current user has 2FA enabled (queries two_factor table)
app.get('/api/v1/auth/two-factor/status', async (req, res) => {
  try {
    // Get session from better-auth
    const session = await auth.api.getSession({ headers: req.headers as any });

    if (!session?.user?.id) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Check if user has 2FA enabled
    const result = await db.query(
      'SELECT enabled FROM two_factor WHERE user_id = $1',
      [session.user.id]
    );

    const enabled = result.rows.length > 0 && result.rows[0].enabled === true;

    res.json({ success: true, enabled });
  } catch (error: any) {
    logger.error('Failed to check 2FA status', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to check 2FA status' });
  }
});

// =============================================================================
// API Routes - v1 (Primary) and unversioned (Backwards Compatibility)
// =============================================================================
// All routes are registered under both /api/v1/ (recommended) and /api/ (deprecated)
// Order matters! More specific routes first

// =============================================================================
// Better Auth Handler - ENABLED (2025-12-26)
// =============================================================================
// Better-auth provides session-based authentication with httpOnly cookies.
// Passwords were migrated to auth_accounts table (migration 062).
//
// Better-auth routes (new session-based auth):
// - POST /api/auth/sign-in/email - Session-based sign in
// - POST /api/auth/sign-out - Session-based sign out
// - GET /api/auth/get-session - Get current session
//
// Legacy JWT routes (auth.routes.ts) still available at:
// - POST /api/v1/auth/login - JWT-based login
// - POST /api/v1/auth/logout - JWT-based logout
// - GET /api/v1/auth/verify - Verify JWT token
//
// NOTE: Only handle better-auth specific paths, let JWT routes pass through
const betterAuthPaths = ['/sign-in', '/sign-out', '/sign-up', '/get-session', '/session', '/error', '/callback', '/two-factor', '/passkey'];
app.all('/api/v1/auth/*', (req, res, next) => {
  // Check if this is a better-auth path
  const path = req.path.replace('/api/v1/auth', '');
  const isBetterAuthPath = betterAuthPaths.some(p => path.startsWith(p));

  if (isBetterAuthPath) {
    // Rewrite URL from /api/v1/auth/* to /api/auth/* for better-auth
    req.url = req.url.replace('/api/v1/auth/', '/api/auth/');
    authHandler(req, res);
  } else {
    // Let it pass through to JWT routes
    next();
  }
});
app.all('/api/auth/*', (req, res) => authHandler(req, res));

// =============================================================================
// Audit Middleware - Automatic API Request Logging
// =============================================================================
// Logs all mutating API requests (POST, PUT, PATCH, DELETE) to security_audit_logs.
// This provides API-level audit coverage with actor context from JWT.
// Combined with database triggers, this gives comprehensive audit trail:
// - Middleware: WHO did WHAT via API (with full request context)
// - Triggers: WHAT data changed in the database (with before/after values)
const auditEnabled = process.env['AUDIT_LOGGING_ENABLED'] !== 'false';
if (auditEnabled) {
  app.use('/api/v1', auditMiddleware);
  app.use('/api', auditMiddleware);
  logger.info('🔍 Audit middleware enabled');
}

// Helper to register routes on both versioned and unversioned paths
const registerRoute = (path: string, router: express.Router) => {
  app.use(`/api/v1${path}`, router);  // Primary: /api/v1/*
  app.use(`/api${path}`, router);      // Deprecated: /api/*
};

// Dashboard
registerRoute('/dashboard', dashboardRoutes);

// Organization management routes (more specific first)
registerRoute('/organization/api-keys', apiKeysRoutes);
registerRoute('/organization/labels', labelsRoutes);
registerRoute('/organization/workspaces', workspacesRoutes);
registerRoute('/organization/access-groups', accessGroupsRoutes);
registerRoute('/organization/security-events', securityEventsRoutes);
registerRoute('/organization/security', securityRoutes);
registerRoute('/organization/audit-logs', auditLogsRoutes);
registerRoute('/organization/custom-fields', customFieldsRoutes);
registerRoute('/organization/departments', departmentsRoutes);
registerRoute('/organization/locations', locationsRoutes);
registerRoute('/organization/cost-centers', costCentersRoutes);
registerRoute('/organization/job-titles', jobTitlesRoutes);
registerRoute('/organization/licenses', licensesRoutes);
registerRoute('/organization/data-quality', dataQualityRoutes);
registerRoute('/organization', orgChartRoutes);
registerRoute('/organization', organizationRoutes);

// Email features
registerRoute('/email-security', emailSecurityRoutes);
registerRoute('/signatures/v2/assignments', signatureAssignmentsRoutes);
registerRoute('/signatures/sync', signatureSyncRoutes);
registerRoute('/signatures/campaigns', signatureCampaignsRoutes);
registerRoute('/signatures/permissions', signaturePermissionsRoutes);
registerRoute('/signatures', signaturesRoutes);

// Authentication & User
registerRoute('/auth', authRoutes);
registerRoute('/user', userRoutes);
registerRoute('/user-preferences', userPreferencesRoutes);
registerRoute('/me', meRoutes);

// People & Bulk operations
registerRoute('/people', peopleRoutes);
registerRoute('/bulk', bulkOperationsRoutes);

// Integrations
registerRoute('/google-workspace', GoogleWorkspaceRoutes);
registerRoute('/microsoft', microsoftRoutes);
registerRoute('/modules', modulesRoutes);

// Assets & Lifecycle
registerRoute('/assets', assetsRoutes);
registerRoute('/lifecycle', lifecycleRoutes);
registerRoute('/training', trainingRoutes);

// Automation & Rules Engine
registerRoute('/automation', automationRoutes);

// Tracking Analytics (user and admin engagement stats)
registerRoute('/tracking', trackingAnalyticsRoutes);
// Also register settings routes (tracking settings are at /settings/tracking)
registerRoute('/settings', trackingAnalyticsRoutes);
// Admin tracking routes are at /admin/tracking
registerRoute('/admin', trackingAnalyticsRoutes);

// MTP (MSP multi-tenant portal) surface — pairing-key bearer auth only
// (OpenSpec: mtp-integration). Handshake completes the single-use bind;
// poll returns the directory/security aggregate.
registerRoute('/mtp', mtpRoutes);

// MCP (Model Context Protocol) for AI integration
registerRoute('/mcp', mcpRoutes);

// AI Assistant
registerRoute('/ai', aiRoutes);

// Help System (context-based help, works without AI)
registerRoute('/help', helpRoutes);

// External Sharing Audit (Google Drive)
registerRoute('/external-sharing', externalSharingRoutes);

// Login Activity (security monitoring)
registerRoute('/login-activity', loginActivityRoutes);

// Initial Passwords (for newly created users)
registerRoute('/initial-passwords', initialPasswordsRoutes);

// Feature Flags
registerRoute('/organization/feature-flags', featureFlagsRoutes);

// API Relay Authorization — admin authoring surface for the least-privilege
// gate (config toggles + allow/deny rules). Enforcement itself lives in the
// transparent proxy behind the `api_relay` feature flag.
registerRoute('/organization/relay', relayRoutes);

// Transparent Proxy for Google Workspace APIs (must be before catch-all)
app.use(transparentProxyRouter);

// Transparent Proxy for Microsoft Graph APIs (must be before catch-all)
app.use(microsoftTransparentProxyRouter);

// Catch-all for undefined API routes (both versioned and unversioned)
const notFoundHandler = (req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });
};
app.use('/api/v1/*', notFoundHandler);
app.use('/api/*', notFoundHandler);

// Root route - redirect logic based on platform setup
app.get('/', async (_req, res) => {
  try {
    const isPlatformSetup = await dbInitializer.isPlatformSetupComplete();

    if (!isPlatformSetup) {
      // Redirect to company website if no setup
      const companyWebsite = `https://${process.env['DOMAIN']}`;
      return res.redirect(companyWebsite);
    }

    // If setup is complete, show login page (handled by frontend)
    res.redirect('/login');
  } catch (error) {
    logger.error('Root route error', error);
    // Fallback to company website
    const companyWebsite = `https://${process.env.DOMAIN}`;
    res.redirect(companyWebsite);
  }
});

// Platform setup route - only accessible via /platform/
app.get('/platform', async (_req, res) => {
  try {
    const isPlatformSetup = await dbInitializer.isPlatformSetupComplete();

    if (isPlatformSetup) {
      // If already setup, redirect to main application
      return res.redirect('/');
    }

    // Serve setup page (handled by frontend)
    res.redirect('/platform/setup');
  } catch (error) {
    logger.error('Platform route error', error);
    res.status(500).json({
      error: 'Unable to determine platform status'
    });
  }
});

// Error handling middleware
app.use(errorHandler);

// Database initialization and server startup
async function startServer(): Promise<void> {
  try {
    logger.info('Starting Helios Platform Backend...');

    // Initialize database
    const dbHealthy = await db.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }

    // Check and initialize database schema if needed
    const schemaHealthy = await dbInitializer.checkDatabaseHealth();
    if (!schemaHealthy) {
      logger.info('Database schema not found, initializing...');
      await dbInitializer.initializeDatabase();
    }

    // Apply incremental migrations on top of the base schema. The seed dump
    // (schema_organization.sql) lags the code, so this is what actually creates
    // post-dump objects — e.g. the typed api_keys columns (type/permissions/
    // pairing) that MTP pairing needs, and the security_audit_logs table.
    // Idempotent + tracked in schema_migrations; a failure aborts boot rather
    // than let the app serve traffic on a drifted schema.
    await migrationRunner.runMigrations();

    // Seed default admin if configured via environment variables
    // This only runs ONCE if no organization exists yet
    await dbInitializer.seedDefaultAdmin();

    // CRITICAL: Verify single-tenant integrity
    // This ensures only ONE organization exists in the system
    try {
      const integrityCheck = await db.query('SELECT verify_single_tenant_integrity()');
      if (!integrityCheck.rows[0]?.verify_single_tenant_integrity) {
        logger.warn('⚠️ No organization found. Setup required.');
      } else {
        logger.info('✅ Single-tenant integrity verified');
      }
    } catch (error: any) {
      if (error.message?.includes('Single-tenant violation')) {
        logger.error('🚨 CRITICAL: Multiple organizations detected in single-tenant system!');
        logger.error('This application supports EXACTLY ONE organization.');
        logger.error('For multi-tenant needs, use the MTP platform.');
        process.exit(1);
      }
      throw error;
    }

    // Initialize signature scheduler (daily cron sync)
    const signatureScheduler = new SignatureSchedulerService();
    await signatureScheduler.initializeScheduler();
    logger.info('📧 Signature scheduler ready');

    // Start signature sync job (periodic pending sync processing)
    const signatureSyncEnabled = process.env['SIGNATURE_SYNC_JOB_ENABLED'] !== 'false';
    if (signatureSyncEnabled) {
      startSignatureSyncJob({
        enabled: true,
        intervalMs: parseInt(process.env['SIGNATURE_SYNC_INTERVAL_MS'] || '300000'), // 5 minutes default
        batchSize: parseInt(process.env['SIGNATURE_SYNC_BATCH_SIZE'] || '50'),
        maxRetries: 3,
        detectExternalChanges: process.env['SIGNATURE_DETECT_EXTERNAL_CHANGES'] === 'true'
      });
      logger.info('📧 Signature sync job started');
    } else {
      logger.info('📧 Signature sync job disabled');
    }

    // Start campaign scheduler job (manages campaign lifecycle)
    const campaignSchedulerEnabled = process.env['CAMPAIGN_SCHEDULER_ENABLED'] !== 'false';
    if (campaignSchedulerEnabled) {
      startCampaignSchedulerJob({
        enabled: true,
        intervalMs: parseInt(process.env['CAMPAIGN_SCHEDULER_INTERVAL_MS'] || '60000'), // 1 minute default
      });
      logger.info('📧 Campaign scheduler job started');
    } else {
      logger.info('📧 Campaign scheduler job disabled');
    }

    // Initialize WebSocket gateway for bulk operations
    initializeBulkOperationsGateway(httpServer);
    logger.info('🔌 WebSocket gateway initialized for bulk operations');

    // Start scheduled action processor for user lifecycle
    const scheduledActionsEnabled = process.env['SCHEDULED_ACTIONS_ENABLED'] !== 'false';
    if (scheduledActionsEnabled) {
      startScheduledActionProcessor({
        enabled: true,
        intervalMs: parseInt(process.env['SCHEDULED_ACTIONS_INTERVAL_MS'] || '60000'), // 1 minute default
        batchSize: parseInt(process.env['SCHEDULED_ACTIONS_BATCH_SIZE'] || '10'),
        maxRetries: parseInt(process.env['SCHEDULED_ACTIONS_MAX_RETRIES'] || '3')
      });
      logger.info('📅 Scheduled action processor started');
    } else {
      logger.info('📅 Scheduled action processor disabled');
    }

    // Start tracking data retention job (runs daily at 3am)
    const trackingRetentionEnabled = process.env['TRACKING_RETENTION_ENABLED'] !== 'false';
    if (trackingRetentionEnabled) {
      startTrackingRetentionJob({
        enabled: true,
        batchSize: parseInt(process.env['TRACKING_RETENTION_BATCH_SIZE'] || '1000'),
        delayBetweenBatches: parseInt(process.env['TRACKING_RETENTION_DELAY_MS'] || '100')
      });
      logger.info('🗑️ Tracking retention job scheduled (runs daily at 3am)');
    } else {
      logger.info('🗑️ Tracking retention job disabled');
    }

    // Initialize telemetry service (opt-in anonymous usage tracking)
    try {
      await telemetryService.init();
      if (telemetryService.isEnabled()) {
        logger.info('📊 Telemetry service enabled');
      }
    } catch (err) {
      logger.warn('Telemetry initialization failed (non-critical)', err);
    }

    // Initialize licence heartbeat (fail-open — never blocks boot). Helios is
    // community-licensed: this reports liveness + donor status and NEVER gates.
    try {
      await licenseService.init();
    } catch (err) {
      logger.warn('License initialization failed (non-critical, fail-open)', err);
    }

    // Start Google Workspace sync scheduler for configured organizations
    try {
      const orgsWithGW = await db.query(`
        SELECT o.id, o.name
        FROM organizations o
        INNER JOIN gw_credentials gc ON o.id = gc.organization_id
        WHERE gc.service_account_key IS NOT NULL
      `);

      if (orgsWithGW.rows.length > 0) {
        for (const org of orgsWithGW.rows) {
          logger.info(`🔄 Starting auto-sync for organization: ${org.name}`);
          syncScheduler.startOrganizationSync(org.id).catch(err => {
            logger.error(`Failed to start sync for ${org.name}`, err);
          });
          // Also start OAuth token sync so the Connected Apps dashboard card is
          // populated (oauth_apps is only written by this path). Self-guarding.
          syncScheduler.startTokenSync(org.id).catch(err => {
            logger.error(`Failed to start OAuth token sync for ${org.name}`, err);
          });
        }
        logger.info(`🔄 Auto-sync enabled for ${orgsWithGW.rows.length} organization(s)`);
      } else {
        logger.info('🔄 No organizations with Google Workspace configured - auto-sync disabled');
      }
    } catch (err) {
      logger.error('Failed to initialize sync scheduler', err);
    }

    // Start server (use httpServer instead of app.listen for WebSocket support)
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Helios Platform Backend running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`⚙️ Platform setup: http://localhost:${PORT}/platform`);
      logger.info(`🔌 WebSocket: ws://localhost:${PORT}/socket.io/`);
      logger.info(`🌍 Environment: ${process.env['NODE_ENV'] || 'development'}`);
    });

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
// These are fatal errors that indicate the application is in an undefined state
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled Rejection', { reason, promise });
  // Exit the process to prevent running in a degraded/undefined state
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopScheduledActionProcessor();
  stopSignatureSyncJob();
  stopCampaignSchedulerJob();
  stopTrackingRetentionJob();
  syncScheduler.stopAll();
  telemetryService.shutdown();
  licenseService.shutdown();
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  stopScheduledActionProcessor();
  stopSignatureSyncJob();
  stopCampaignSchedulerJob();
  stopTrackingRetentionJob();
  syncScheduler.stopAll();
  telemetryService.shutdown();
  licenseService.shutdown();
  await db.close();
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  console.error('Fatal error starting server:', error);
  logger.error('Fatal error starting server', error);
  process.exit(1);
});

