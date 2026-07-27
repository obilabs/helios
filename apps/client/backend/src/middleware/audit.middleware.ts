/**
 * Audit Middleware - Automatic API Request Logging
 *
 * This middleware automatically logs all API requests to security_audit_logs.
 * It captures:
 * - WHO: Actor from JWT token (user ID, email)
 * - WHAT: Endpoint, method, action type
 * - WHEN: Request timestamp
 * - OUTCOME: Success/failure based on status code
 * - CONTEXT: Request body (sanitized), response summary
 *
 * Combined with database triggers, this provides comprehensive audit coverage:
 * - Middleware: Captures actor context and request details
 * - Triggers: Capture exact data changes (before/after values)
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../database/connection.js';
import crypto from 'crypto';

// Routes that should NOT be logged (health checks, static assets, etc.)
const EXCLUDED_ROUTES = [
  '/api/health',
  '/api/v1/health',
  '/favicon.ico',
  '/api/v1/ai/suggestions', // Don't log AI suggestions (too noisy)
];

// Routes that should have their request body excluded from logs (sensitive data)
const SENSITIVE_BODY_ROUTES = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/organization/setup',
  '/api/v1/users', // User creation includes passwords
  '/api/v1/modules/google-workspace/credentials',
  '/api/v1/api-keys',
];

// Fields to always redact from request bodies
const REDACTED_FIELDS = [
  'password',
  'passwordHash',
  'password_hash',
  'confirmPassword',
  'confirm_password',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'serviceAccountKey',
  'service_account_key',
  'apiKey',
  'api_key',
  'secret',
  'privateKey',
  'private_key',
];

// Map HTTP methods and routes to semantic action names
function getActionName(method: string, path: string): string {
  const normalizedPath = path.replace(/\/[0-9a-f-]{36}/gi, '/:id'); // Replace UUIDs with :id

  // Auth actions
  if (path.includes('/auth/login')) return 'auth.login';
  if (path.includes('/auth/logout')) return 'auth.logout';
  if (path.includes('/auth/refresh')) return 'auth.token.refresh';
  if (path.includes('/auth/password')) return 'auth.password.change';

  // User actions
  if (path.includes('/users')) {
    if (method === 'POST') return 'user.create';
    if (method === 'PUT' || method === 'PATCH') return 'user.update';
    if (method === 'DELETE') return 'user.delete';
    return 'user.read';
  }

  // Organization actions
  if (path.includes('/organization/setup')) return 'organization.setup';
  if (path.includes('/organization')) {
    if (method === 'PUT' || method === 'PATCH') return 'organization.update';
    return 'organization.read';
  }

  // Module actions
  if (path.includes('/modules')) {
    if (path.includes('/enable')) return 'module.enable';
    if (path.includes('/disable')) return 'module.disable';
    if (path.includes('/sync')) return 'module.sync';
    if (path.includes('/credentials')) {
      if (method === 'POST' || method === 'PUT') return 'module.credentials.update';
      if (method === 'DELETE') return 'module.credentials.delete';
    }
    return 'module.configure';
  }

  // API key actions
  if (path.includes('/api-keys')) {
    if (method === 'POST') return 'api.key.create';
    if (method === 'DELETE') return 'api.key.revoke';
    return 'api.key.read';
  }

  // Settings actions
  if (path.includes('/settings')) {
    if (method === 'PUT' || method === 'PATCH') return 'settings.update';
    return 'settings.read';
  }

  // Generic fallback based on method
  const resource = normalizedPath.split('/').filter(Boolean).pop() || 'resource';
  switch (method) {
    case 'POST': return `${resource}.create`;
    case 'PUT':
    case 'PATCH': return `${resource}.update`;
    case 'DELETE': return `${resource}.delete`;
    default: return `${resource}.read`;
  }
}

// Determine action category
function getActionCategory(action: string): string {
  if (action.startsWith('auth.')) return 'auth';
  if (action.startsWith('user.')) return 'admin';
  if (action.startsWith('organization.')) return 'admin';
  if (action.startsWith('module.')) return 'admin';
  if (action.startsWith('api.key.')) return 'api';
  if (action.startsWith('settings.')) return 'admin';
  return 'data';
}

// Recursively redact sensitive fields
function redactSensitiveData(obj: any, depth = 0): any {
  if (depth > 10) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item, depth + 1));
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redactSensitiveData(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

// Generate hash for tamper detection
function generateRecordHash(data: object): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// Get the last hash for chain integrity
async function getLastHash(): Promise<string | null> {
  try {
    const result = await db.query(
      'SELECT record_hash FROM security_audit_logs ORDER BY timestamp DESC LIMIT 1'
    );
    return result.rows[0]?.record_hash || null;
  } catch {
    return null;
  }
}

export async function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip excluded routes
  if (EXCLUDED_ROUTES.some(route => req.path.startsWith(route))) {
    return next();
  }

  // Skip GET requests to reduce noise (optional - can be enabled for compliance)
  // if (req.method === 'GET') {
  //   return next();
  // }

  // Only log mutating operations by default
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Capture request details
  const action = getActionName(req.method, req.path);
  const actionCategory = getActionCategory(action);

  // Get actor from authenticated user (set by auth middleware)
  const user = (req as any).user;
  const actorId = user?.id || user?.userId || null;
  const actorType = actorId ? 'user' : (req.path.includes('/setup') ? 'system' : 'anonymous');
  const actorIdentifier = user?.email || req.ip || 'unknown';

  // Prepare request metadata
  const isSensitiveRoute = SENSITIVE_BODY_ROUTES.some(route => req.path.includes(route));
  const requestBody = isSensitiveRoute ? '[SENSITIVE]' : redactSensitiveData(req.body);

  // Extract target from URL params or body
  const targetId = req.params.id || req.params.userId || req.body?.id || null;
  const targetType = req.path.split('/').filter(Boolean)[2] || null; // e.g., /api/v1/users -> users

  // Get organization ID from user context or request
  const organizationId = user?.organizationId || user?.organization_id || req.body?.organizationId || null;

  // Store original end function
  const originalEnd = res.end;
  let responseBody: any = null;

  // Override res.end to capture response
  res.end = function(chunk?: any, ...args: any[]): Response {
    if (chunk) {
      try {
        responseBody = JSON.parse(chunk.toString());
      } catch {
        responseBody = null;
      }
    }
    return originalEnd.apply(res, [chunk, ...args] as any);
  };

  // Continue with request
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    const outcome = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';
    const errorMessage = outcome === 'failure' && responseBody?.error?.message
      ? responseBody.error.message
      : null;

    try {
      const previousHash = await getLastHash();

      const logData = {
        timestamp: new Date().toISOString(),
        actor_id: actorId,
        actor_type: actorType,
        actor_identifier: actorIdentifier,
        action,
        action_category: actionCategory,
        target_type: targetType,
        target_id: targetId,
        organization_id: organizationId,
        outcome,
        error_message: errorMessage,
        ip_address: req.ip || req.socket.remoteAddress,
        user_agent: req.get('User-Agent'),
        request_id: requestId,
        http_method: req.method,
        endpoint: req.path,
        request_body: requestBody,
        response_status: res.statusCode,
        duration_ms: duration,
      };

      const recordHash = generateRecordHash({ ...logData, previous_hash: previousHash });

      await db.query(`
        INSERT INTO security_audit_logs (
          actor_id, actor_type, actor_email,
          action, action_category,
          target_type, target_id, target_identifier,
          organization_id,
          outcome, error_message,
          actor_ip, actor_user_agent, request_id,
          changes_after,
          previous_hash, record_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::inet, $13, $14, $15, $16, $17)
      `, [
        actorId,
        actorType,
        actorIdentifier, // actor_email
        action,
        actionCategory,
        targetType,
        targetId,
        null, // target_identifier - can be enriched by route handlers
        organizationId,
        outcome,
        errorMessage,
        req.ip || req.socket.remoteAddress || null, // actor_ip (cast to inet)
        req.get('User-Agent'),
        requestId,
        JSON.stringify({
          http_method: req.method,
          endpoint: req.path,
          request_body: requestBody,
          response_status: res.statusCode,
          duration_ms: duration,
        }),
        previousHash,
        recordHash,
      ]);
    } catch (err) {
      // Never let audit logging break the application
      console.error('[Audit] Failed to log request:', err);
    }
  });

  next();
}

/**
 * Enrichment helper - call from route handlers to add context to the current request's log
 * This is useful for adding semantic information that the middleware can't infer
 */
export function enrichAuditLog(req: Request, enrichment: {
  targetIdentifier?: string;
  targetType?: string;
  action?: string;
  metadata?: Record<string, any>;
}) {
  // Store enrichment data on request for the middleware to pick up
  (req as any)._auditEnrichment = {
    ...(req as any)._auditEnrichment,
    ...enrichment,
  };
}
