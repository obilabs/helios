import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { cacheService } from './cache.service.js';

export type ActivityType =
  | 'user.login'
  | 'user.logout'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.suspended'
  | 'user.activated'
  | 'user.view_switched'
  | 'user.access_denied'
  | 'group.created'
  | 'group.updated'
  | 'group.deleted'
  | 'group.member_added'
  | 'group.member_removed'
  | 'sync.started'
  | 'sync.completed'
  | 'sync.failed'
  | 'sync.conflict'
  | 'settings.updated'
  | 'module.enabled'
  | 'module.disabled'
  | 'security.password_reset'
  | 'security.mfa_enabled'
  | 'security.suspicious_login'
  | 'admin.permission_changed';

export type ActorType = 'internal' | 'service' | 'vendor';

export interface ActivityEvent {
  id?: string;
  organizationId: string;
  userId?: string;
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
  type: ActivityType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
  // Actor attribution fields
  actorType?: ActorType;
  apiKeyId?: string;
  apiKeyName?: string;
  vendorName?: string;
  vendorTechnicianName?: string;
  vendorTechnicianEmail?: string;
  ticketReference?: string;
  serviceName?: string;
  serviceOwner?: string;
  result?: 'success' | 'failure' | 'denied';
}

class ActivityTrackerService {
  /**
   * Track an activity event
   */
  async track(event: ActivityEvent): Promise<void> {
    try {
      // Insert into database
      await db.query(`
        INSERT INTO security_events (
          organization_id,
          user_id,
          actor_id,
          actor_email,
          actor_name,
          event_type,
          severity,
          title,
          description,
          metadata,
          ip_address,
          user_agent,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      `, [
        event.organizationId,
        event.userId || null,
        event.actorId || null,
        event.actorEmail || null,
        event.actorName || null,
        event.type,
        event.severity,
        event.title,
        event.description || null,
        JSON.stringify(event.metadata || {}),
        event.ipAddress || null,
        event.userAgent || null
      ]);

      // Invalidate cache
      await cacheService.clearPattern(`org:${event.organizationId}:activity:*`);
      await cacheService.clearPattern(`org:${event.organizationId}:security:*`);

      logger.info('Activity tracked', {
        type: event.type,
        organizationId: event.organizationId,
        actorId: event.actorId
      });
    } catch (error: any) {
      logger.error('Failed to track activity', {
        event,
        error: error.message
      });
    }
  }

  /**
   * Track user login
   */
  async trackLogin(
    organizationId: string,
    userId: string,
    email: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.track({
      organizationId,
      userId,
      actorId: userId,
      actorEmail: email,
      type: 'user.login',
      severity: 'info',
      title: 'User logged in',
      description: `${email} logged in to the system`,
      ipAddress,
      userAgent
    });
  }

  /**
   * Track user logout
   */
  async trackLogout(
    organizationId: string,
    userId: string,
    email: string
  ): Promise<void> {
    await this.track({
      organizationId,
      userId,
      actorId: userId,
      actorEmail: email,
      type: 'user.logout',
      severity: 'info',
      title: 'User logged out',
      description: `${email} logged out of the system`
    });
  }

  /**
   * Track user changes
   */
  async trackUserChange(
    organizationId: string,
    targetUserId: string,
    actorId: string,
    actorEmail: string,
    action: 'created' | 'updated' | 'deleted' | 'suspended' | 'activated',
    changes?: Record<string, any>
  ): Promise<void> {
    const actionText = {
      created: 'created',
      updated: 'updated',
      deleted: 'deleted',
      suspended: 'suspended',
      activated: 'activated'
    };

    await this.track({
      organizationId,
      userId: targetUserId,
      actorId,
      actorEmail,
      type: `user.${action}` as ActivityType,
      severity: action === 'deleted' || action === 'suspended' ? 'warning' : 'info',
      title: `User ${actionText[action]}`,
      description: `User was ${actionText[action]} by ${actorEmail}`,
      metadata: changes
    });
  }

  /**
   * Track group changes
   */
  async trackGroupChange(
    organizationId: string,
    groupId: string,
    actorId: string,
    actorEmail: string,
    action: 'created' | 'updated' | 'deleted' | 'member_added' | 'member_removed' | 'rule_added' | 'rule_deleted' | 'rules_applied' | 'membership_type_changed' | 'synced_to_google',
    metadata?: Record<string, any>
  ): Promise<void> {
    // Map synced_to_google to sync.completed for activity type
    const activityType = action === 'synced_to_google' ? 'sync.completed' : `group.${action}`;
    await this.track({
      organizationId,
      actorId,
      actorEmail,
      type: activityType as ActivityType,
      severity: action === 'deleted' ? 'warning' : 'info',
      title: action === 'synced_to_google' ? 'Group synced to Google Workspace' : `Group ${action.replace('_', ' ')}`,
      metadata: { groupId, ...metadata }
    });
  }

  /**
   * Track sync events
   */
  async trackSync(
    organizationId: string,
    platform: string,
    status: 'started' | 'completed' | 'failed' | 'conflict',
    details?: Record<string, any>
  ): Promise<void> {
    await this.track({
      organizationId,
      type: `sync.${status}` as ActivityType,
      severity: status === 'failed' ? 'error' : status === 'conflict' ? 'warning' : 'info',
      title: `${platform} sync ${status}`,
      description: `Data synchronization with ${platform} ${status}`,
      metadata: details
    });
  }

  /**
   * Track security events
   */
  async trackSecurityEvent(
    organizationId: string,
    userId: string,
    type: 'password_reset' | 'mfa_enabled' | 'suspicious_login',
    details?: Record<string, any>
  ): Promise<void> {
    await this.track({
      organizationId,
      userId,
      type: `security.${type}` as ActivityType,
      severity: type === 'suspicious_login' ? 'warning' : 'info',
      title: type.replace('_', ' ').charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
      metadata: details
    });
  }

  /**
   * Track view switch events (admin/user view switching)
   */
  async trackViewSwitch(
    organizationId: string,
    userId: string,
    userEmail: string,
    fromView: 'admin' | 'user',
    toView: 'admin' | 'user',
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const viewLabels = {
      admin: 'Admin Console',
      user: 'Employee View'
    };

    await this.track({
      organizationId,
      userId,
      actorId: userId,
      actorEmail: userEmail,
      type: 'user.view_switched',
      severity: 'info',
      title: 'View switched',
      description: `${userEmail} switched from ${viewLabels[fromView]} to ${viewLabels[toView]}`,
      metadata: {
        fromView,
        toView
      },
      ipAddress,
      userAgent
    });
  }

  /**
   * Track access denied events
   */
  async trackAccessDenied(
    organizationId: string,
    userId: string,
    userEmail: string,
    route: string,
    reason: 'insufficient_permissions' | 'not_admin' | 'not_employee',
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.track({
      organizationId,
      userId,
      actorId: userId,
      actorEmail: userEmail,
      type: 'user.access_denied',
      severity: 'warning',
      title: 'Access denied',
      description: `${userEmail} attempted to access ${route} but was denied`,
      metadata: {
        route,
        reason
      },
      ipAddress,
      userAgent
    });
  }

  /**
   * Get recent activity for organization
   */
  async getRecentActivity(
    organizationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ActivityEvent[]> {
    const cacheKey = cacheService.keys.recentActivity(organizationId);

    return cacheService.remember(cacheKey, async () => {
      const result = await db.query(`
        SELECT
          id,
          organization_id as "organizationId",
          user_id as "userId",
          actor_id as "actorId",
          actor_email as "actorEmail",
          actor_name as "actorName",
          event_type as "type",
          severity,
          title,
          description,
          metadata,
          ip_address as "ipAddress",
          user_agent as "userAgent",
          created_at as "timestamp"
        FROM security_events
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [organizationId, limit, offset]);

      return result.rows;
    }, 60); // Cache for 1 minute
  }

  /**
   * Get security events with filters
   */
  async getSecurityEvents(
    organizationId: string,
    filters?: {
      severity?: string;
      type?: string;
      startDate?: Date;
      endDate?: Date;
      userId?: string;
    }
  ): Promise<ActivityEvent[]> {
    let query = `
      SELECT
        id,
        organization_id as "organizationId",
        user_id as "userId",
        actor_id as "actorId",
        actor_email as "actorEmail",
        actor_name as "actorName",
        event_type as "type",
        severity,
        title,
        description,
        metadata,
        ip_address as "ipAddress",
        user_agent as "userAgent",
        created_at as "timestamp"
      FROM security_events
      WHERE organization_id = $1
    `;

    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (filters?.severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(filters.severity);
      paramIndex++;
    }

    if (filters?.type) {
      query += ` AND event_type LIKE $${paramIndex}`;
      params.push(`${filters.type}%`);
      paramIndex++;
    }

    if (filters?.userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC LIMIT 1000';

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get activity stats for dashboard
   */
  async getActivityStats(organizationId: string): Promise<any> {
    const cacheKey = `org:${organizationId}:activity:stats`;

    return cacheService.remember(cacheKey, async () => {
      const [todayCount, weekCount, criticalCount] = await Promise.all([
        db.query(`
          SELECT COUNT(*) as count
          FROM security_events
          WHERE organization_id = $1
          AND created_at >= CURRENT_DATE
        `, [organizationId]),

        db.query(`
          SELECT COUNT(*) as count
          FROM security_events
          WHERE organization_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '7 days'
        `, [organizationId]),

        db.query(`
          SELECT COUNT(*) as count
          FROM security_events
          WHERE organization_id = $1
          AND severity IN ('error', 'critical')
          AND created_at >= CURRENT_DATE - INTERVAL '24 hours'
        `, [organizationId])
      ]);

      return {
        todayCount: parseInt(todayCount.rows[0].count),
        weekCount: parseInt(weekCount.rows[0].count),
        criticalCount: parseInt(criticalCount.rows[0].count)
      };
    }, 300); // Cache for 5 minutes
  }
}

export const activityTracker = new ActivityTrackerService();