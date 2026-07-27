/**
 * Security Audit Service
 *
 * Provides comprehensive logging for security-relevant events.
 * All events are stored in tamper-evident logs with hash chains.
 *
 * Usage:
 *   await securityAudit.log({
 *     action: 'auth.login.success',
 *     actorId: userId,
 *     actorEmail: email,
 *     organizationId: orgId,
 *     outcome: 'success'
 *   });
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

// Action categories for filtering
export type ActionCategory = 'auth' | 'admin' | 'data' | 'security' | 'api' | 'sync';

// Actor types
export type ActorType = 'user' | 'service' | 'mtp' | 'system' | 'anonymous';

// Outcome types
export type Outcome = 'success' | 'failure' | 'partial' | 'blocked';

// Standard actions (for type safety and consistency)
export const AuditActions = {
  // Authentication
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGE: 'auth.password.change',
  AUTH_PASSWORD_RESET: 'auth.password.reset',
  AUTH_SESSION_CREATE: 'auth.session.create',
  AUTH_SESSION_REVOKE: 'auth.session.revoke',
  AUTH_MFA_SETUP: 'auth.mfa.setup',
  AUTH_MFA_VERIFY: 'auth.mfa.verify',
  AUTH_TOKEN_REFRESH: 'auth.token.refresh',

  // User Management
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_SUSPEND: 'user.suspend',
  USER_ACTIVATE: 'user.activate',
  USER_ROLE_CHANGE: 'user.role.change',
  USER_PASSWORD_SET: 'user.password.set',

  // Groups
  GROUP_CREATE: 'group.create',
  GROUP_UPDATE: 'group.update',
  GROUP_DELETE: 'group.delete',
  GROUP_MEMBER_ADD: 'group.member.add',
  GROUP_MEMBER_REMOVE: 'group.member.remove',

  // API Keys
  API_KEY_CREATE: 'api.key.create',
  API_KEY_REVOKE: 'api.key.revoke',
  API_KEY_USE: 'api.key.use',

  // Service Accounts
  SERVICE_ACCOUNT_ACCESS: 'service.account.access',
  SERVICE_ACCOUNT_KEY_DECRYPT: 'service.account.key.decrypt',
  SERVICE_ACCOUNT_CONFIGURE: 'service.account.configure',

  // Data Operations
  DATA_EXPORT: 'data.export',
  DATA_IMPORT: 'data.import',
  DATA_BULK_OPERATION: 'data.bulk.operation',

  // Sync Operations
  SYNC_GOOGLE_START: 'sync.google.start',
  SYNC_GOOGLE_COMPLETE: 'sync.google.complete',
  SYNC_GOOGLE_ERROR: 'sync.google.error',
  SYNC_MICROSOFT_START: 'sync.microsoft.start',
  SYNC_MICROSOFT_COMPLETE: 'sync.microsoft.complete',

  // Security Events
  SECURITY_RATE_LIMIT: 'security.rate.limit',
  SECURITY_IP_BLOCK: 'security.ip.block',
  SECURITY_SUSPICIOUS: 'security.suspicious.activity',
  SECURITY_ANOMALY: 'security.anomaly.detected',
  SECURITY_TOKEN_REVOKE: 'security.token.revoke',
  SECURITY_BULK_REVOKE: 'security.bulk.revoke',

  // Settings
  SETTINGS_UPDATE: 'settings.update',
  MODULE_ENABLE: 'module.enable',
  MODULE_DISABLE: 'module.disable',
} as const;

export type AuditAction = typeof AuditActions[keyof typeof AuditActions] | string;

interface AuditLogEntry {
  // Actor
  actorId?: string;
  actorType?: ActorType;
  actorEmail?: string;
  actorIp?: string;
  actorUserAgent?: string;

  // Action
  action: AuditAction;
  actionCategory?: ActionCategory;

  // Target
  targetType?: string;
  targetId?: string;
  targetIdentifier?: string;

  // Context
  sessionId?: string;
  organizationId: string;
  requestId?: string;
  ticketReference?: string;

  // Outcome
  outcome: Outcome;
  errorCode?: string;
  errorMessage?: string;

  // Changes
  changesBefore?: Record<string, any>;
  changesAfter?: Record<string, any>;

  // Security
  riskScore?: number;
  flagged?: boolean;
}

class SecurityAuditService {
  /**
   * Log a security event
   */
  async log(entry: AuditLogEntry): Promise<string | null> {
    // Derive action category from action name if not provided
    const actionCategory = entry.actionCategory || this.deriveCategory(entry.action);
    const actorType = entry.actorType || 'user';

    try {
      const result = await db.query(`
        INSERT INTO security_audit_logs (
          actor_id, actor_type, actor_email, actor_ip, actor_user_agent,
          action, action_category,
          target_type, target_id, target_identifier,
          session_id, organization_id, request_id, ticket_reference,
          outcome, error_code, error_message,
          changes_before, changes_after,
          risk_score, flagged
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7,
          $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19,
          $20, $21
        )
        RETURNING id
      `, [
        entry.actorId || null,
        actorType,
        entry.actorEmail || null,
        entry.actorIp || null,
        entry.actorUserAgent || null,
        entry.action,
        actionCategory,
        entry.targetType || null,
        entry.targetId || null,
        entry.targetIdentifier || null,
        entry.sessionId || null,
        entry.organizationId,
        entry.requestId || null,
        entry.ticketReference || null,
        entry.outcome,
        entry.errorCode || null,
        entry.errorMessage || null,
        entry.changesBefore ? JSON.stringify(entry.changesBefore) : null,
        entry.changesAfter ? JSON.stringify(entry.changesAfter) : null,
        entry.riskScore || null,
        entry.flagged || false,
      ]);

      return result.rows[0]?.id || null;
    } catch (error: any) {
      // Don't let audit logging failures break the application
      logger.error('Security audit log failed', {
        action: entry.action,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Log authentication event
   */
  async logAuth(params: {
    action: AuditAction;
    outcome: Outcome;
    userId?: string;
    email?: string;
    organizationId: string;
    ip?: string;
    userAgent?: string;
    sessionId?: string;
    requestId?: string;
    errorMessage?: string;
  }): Promise<string | null> {
    return this.log({
      action: params.action,
      actionCategory: 'auth',
      actorId: params.userId,
      actorEmail: params.email,
      actorType: params.userId ? 'user' : 'anonymous',
      actorIp: params.ip,
      actorUserAgent: params.userAgent,
      sessionId: params.sessionId,
      organizationId: params.organizationId,
      requestId: params.requestId,
      outcome: params.outcome,
      errorMessage: params.errorMessage,
    });
  }

  /**
   * Log user management event
   */
  async logUserChange(params: {
    action: AuditAction;
    actorId: string;
    actorEmail: string;
    targetUserId: string;
    targetEmail: string;
    organizationId: string;
    changesBefore?: Record<string, any>;
    changesAfter?: Record<string, any>;
    requestId?: string;
  }): Promise<string | null> {
    return this.log({
      action: params.action,
      actionCategory: 'admin',
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actorType: 'user',
      targetType: 'user',
      targetId: params.targetUserId,
      targetIdentifier: params.targetEmail,
      organizationId: params.organizationId,
      requestId: params.requestId,
      outcome: 'success',
      changesBefore: params.changesBefore,
      changesAfter: params.changesAfter,
    });
  }

  /**
   * Log API key usage
   */
  async logApiKeyUse(params: {
    apiKeyId: string;
    apiKeyName: string;
    organizationId: string;
    action: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    outcome: Outcome;
  }): Promise<string | null> {
    return this.log({
      action: AuditActions.API_KEY_USE,
      actionCategory: 'api',
      actorType: 'service',
      actorId: params.apiKeyId,
      actorIp: params.ip,
      actorUserAgent: params.userAgent,
      targetType: 'api',
      targetIdentifier: params.action,
      organizationId: params.organizationId,
      requestId: params.requestId,
      outcome: params.outcome,
    });
  }

  /**
   * Log service account access (CRITICAL - track all decryption events)
   */
  async logServiceAccountAccess(params: {
    actorId: string;
    actorEmail: string;
    organizationId: string;
    purpose: string;
    serviceType: 'google' | 'microsoft';
    requestId?: string;
  }): Promise<string | null> {
    return this.log({
      action: AuditActions.SERVICE_ACCOUNT_KEY_DECRYPT,
      actionCategory: 'security',
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actorType: 'user',
      targetType: 'service_account',
      targetIdentifier: `${params.serviceType}_workspace`,
      organizationId: params.organizationId,
      requestId: params.requestId,
      outcome: 'success',
      changesAfter: { purpose: params.purpose },
      // Service account access is always notable
      riskScore: 30,
    });
  }

  /**
   * Log sync operations
   */
  async logSync(params: {
    action: AuditAction;
    organizationId: string;
    outcome: Outcome;
    details?: Record<string, any>;
    errorMessage?: string;
  }): Promise<string | null> {
    return this.log({
      action: params.action,
      actionCategory: 'sync',
      actorType: 'system',
      organizationId: params.organizationId,
      outcome: params.outcome,
      errorMessage: params.errorMessage,
      changesAfter: params.details,
    });
  }

  /**
   * Flag an entry for review
   */
  async flagEntry(entryId: string, reviewerId: string): Promise<void> {
    // Note: This uses a direct update which will be blocked by the rule
    // In practice, flagging should be done via a separate "flags" table
    // For now, we log a new entry noting the flag
    logger.warn('Security audit entry flagged', { entryId, reviewerId });
  }

  /**
   * Query audit logs
   */
  async query(params: {
    organizationId: string;
    startDate?: Date;
    endDate?: Date;
    action?: string;
    actionCategory?: ActionCategory;
    actorId?: string;
    targetId?: string;
    outcome?: Outcome;
    flagged?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: any[]; total: number }> {
    const conditions: string[] = ['organization_id = $1'];
    const values: any[] = [params.organizationId];
    let paramIndex = 2;

    if (params.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(params.endDate);
    }
    if (params.action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(params.action);
    }
    if (params.actionCategory) {
      conditions.push(`action_category = $${paramIndex++}`);
      values.push(params.actionCategory);
    }
    if (params.actorId) {
      conditions.push(`actor_id = $${paramIndex++}`);
      values.push(params.actorId);
    }
    if (params.targetId) {
      conditions.push(`target_id = $${paramIndex++}`);
      values.push(params.targetId);
    }
    if (params.outcome) {
      conditions.push(`outcome = $${paramIndex++}`);
      values.push(params.outcome);
    }
    if (params.flagged !== undefined) {
      conditions.push(`flagged = $${paramIndex++}`);
      values.push(params.flagged);
    }

    const whereClause = conditions.join(' AND ');
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const [logsResult, countResult] = await Promise.all([
      db.query(`
        SELECT * FROM security_audit_logs
        WHERE ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `, [...values, limit, offset]),
      db.query(`
        SELECT COUNT(*) as total FROM security_audit_logs
        WHERE ${whereClause}
      `, values),
    ]);

    return {
      logs: logsResult.rows,
      total: parseInt(countResult.rows[0]?.total || '0'),
    };
  }

  /**
   * Derive action category from action name
   */
  private deriveCategory(action: string): ActionCategory {
    if (action.startsWith('auth.')) return 'auth';
    if (action.startsWith('user.') || action.startsWith('group.') || action.startsWith('settings.') || action.startsWith('module.')) return 'admin';
    if (action.startsWith('data.')) return 'data';
    if (action.startsWith('security.')) return 'security';
    if (action.startsWith('api.') || action.startsWith('service.')) return 'api';
    if (action.startsWith('sync.')) return 'sync';
    return 'admin'; // Default
  }
}

// Singleton instance
export const securityAudit = new SecurityAuditService();
