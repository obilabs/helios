import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { queueService, BulkOperationJobData } from './queue.service.js';
import { csvParserService, ValidationRule } from './csv-parser.service.js';
import { bulkOperationEvents } from '../websocket/bulk-operations.gateway.js';
import { googleWorkspaceBatchService, BulkUserUpdate, BulkGroupMemberOperation } from './google-workspace-batch.service.js';

export interface BulkOperation {
  id: string;
  organizationId: string;
  operationType: string;
  operationName?: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  inputData?: any;
  results?: any;
  errorMessage?: string;
  createdBy?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface CreateBulkOperationParams {
  organizationId: string;
  operationType: string;
  operationName?: string;
  items: any[];
  createdBy: string;
  syncToGoogleWorkspace?: boolean;  // Enable Google Workspace sync for this operation
}

// Supported operation types that can sync to Google Workspace
export const GOOGLE_WORKSPACE_SYNC_OPERATIONS = [
  'user_update',
  'user_suspend',
  'user_activate',
  'user_move_ou',
  'group_membership_add',
  'group_membership_remove'
] as const;

export type GoogleWorkspaceSyncOperation = typeof GOOGLE_WORKSPACE_SYNC_OPERATIONS[number];

export class BulkOperationsService {
  /**
   * Create a new bulk operation
   */
  public async createBulkOperation(
    params: CreateBulkOperationParams
  ): Promise<BulkOperation> {
    const { organizationId, operationType, operationName, items, createdBy } = params;

    try {
      const result = await db.query(`
        INSERT INTO bulk_operations (
          organization_id,
          operation_type,
          operation_name,
          status,
          total_items,
          input_data,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        organizationId,
        operationType,
        operationName || null,
        'pending',
        items.length,
        JSON.stringify({ items }),
        createdBy,
      ]);

      const operation = this.mapDatabaseRow(result.rows[0]);

      // Add audit log entry
      await this.addAuditLog(operation.id, 'created', { itemCount: items.length }, createdBy);

      logger.info('Bulk operation created', {
        id: operation.id,
        operationType,
        itemCount: items.length,
      });

      return operation;
    } catch (error: any) {
      logger.error('Failed to create bulk operation', { error: error.message });
      throw error;
    }
  }

  /**
   * Queue a bulk operation for processing
   */
  public async queueBulkOperation(
    bulkOperationId: string,
    priority?: number
  ): Promise<void> {
    try {
      // Get operation details
      const operation = await this.getBulkOperation(bulkOperationId);
      if (!operation) {
        throw new Error('Bulk operation not found');
      }

      // Add to queue
      const jobData: BulkOperationJobData = {
        bulkOperationId: operation.id,
        organizationId: operation.organizationId,
        operationType: operation.operationType,
        items: operation.inputData?.items || [],
        options: {},
      };

      await queueService.addBulkOperationJob(jobData, priority);

      // Update status to queued
      await this.updateBulkOperationStatus(bulkOperationId, 'pending', {
        startedAt: null,
      });

      logger.info('Bulk operation queued', { bulkOperationId });
    } catch (error: any) {
      logger.error('Failed to queue bulk operation', {
        bulkOperationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process a bulk operation (called by worker)
   */
  public async processBulkOperation(
    bulkOperationId: string,
    progressCallback?: (progress: number) => void
  ): Promise<any> {
    try {
      const operation = await this.getBulkOperation(bulkOperationId);
      if (!operation) {
        throw new Error('Bulk operation not found');
      }

      // Update status to processing
      await this.updateBulkOperationStatus(bulkOperationId, 'processing', {
        startedAt: new Date(),
      });

      await this.addAuditLog(bulkOperationId, 'started', {}, operation.createdBy || null);

      const items = operation.inputData?.items || [];
      const results: any[] = [];
      let successCount = 0;
      let failureCount = 0;

      // Process items in batches
      const batchSize = 10;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, Math.min(i + batchSize, items.length));

        for (const item of batch) {
          try {
            const result = await this.processItem(
              operation.operationType,
              item,
              operation.organizationId
            );

            results.push({
              item,
              success: true,
              result,
            });
            successCount++;
          } catch (error: any) {
            results.push({
              item,
              success: false,
              error: error.message,
            });
            failureCount++;
          }

          // Update progress
          const processed = i + batch.indexOf(item) + 1;
          const progress = Math.floor((processed / items.length) * 100);

          await this.updateBulkOperationProgress(
            bulkOperationId,
            processed,
            successCount,
            failureCount
          );

          // Emit WebSocket progress event
          this.emitProgressEvent({
            bulkOperationId,
            organizationId: operation.organizationId,
            status: 'processing',
            totalItems: items.length,
            processedItems: processed,
            successCount,
            failureCount,
            progress,
          });

          if (progressCallback) {
            progressCallback(progress);
          }
        }
      }

      // Mark as completed
      await this.updateBulkOperationStatus(bulkOperationId, 'completed', {
        completedAt: new Date(),
        results,
      });

      await this.addAuditLog(
        bulkOperationId,
        'completed',
        { successCount, failureCount },
        operation.createdBy || null
      );

      // Emit WebSocket completion event
      this.emitCompletionEvent({
        bulkOperationId,
        organizationId: operation.organizationId,
        status: 'completed',
        totalItems: items.length,
        processedItems: items.length,
        successCount,
        failureCount,
        progress: 100,
      });

      logger.info('Bulk operation completed', {
        bulkOperationId,
        successCount,
        failureCount,
      });

      return { successCount, failureCount, results };
    } catch (error: any) {
      logger.error('Bulk operation failed', {
        bulkOperationId,
        error: error.message,
      });

      await this.updateBulkOperationStatus(bulkOperationId, 'failed', {
        completedAt: new Date(),
        errorMessage: error.message,
      });

      // Emit WebSocket failure event
      const operation = await this.getBulkOperation(bulkOperationId);
      if (operation) {
        this.emitFailureEvent({
          bulkOperationId,
          organizationId: operation.organizationId,
          status: 'failed',
          totalItems: operation.totalItems,
          processedItems: operation.processedItems,
          successCount: operation.successCount,
          failureCount: operation.failureCount,
          progress: Math.floor((operation.processedItems / operation.totalItems) * 100) || 0,
          error: error.message,
        });
      }

      throw error;
    }
  }

  /**
   * Emit WebSocket progress event
   */
  private emitProgressEvent(data: {
    bulkOperationId: string;
    organizationId: string;
    status: string;
    totalItems: number;
    processedItems: number;
    successCount: number;
    failureCount: number;
    progress: number;
  }): void {
    try {
      bulkOperationEvents.emit('progress', data);
    } catch (error) {
      // Don't fail the operation if WebSocket emission fails
      logger.warn('Failed to emit bulk operation progress event', { error });
    }
  }

  /**
   * Emit WebSocket completion event
   */
  private emitCompletionEvent(data: {
    bulkOperationId: string;
    organizationId: string;
    status: string;
    totalItems: number;
    processedItems: number;
    successCount: number;
    failureCount: number;
    progress: number;
  }): void {
    try {
      bulkOperationEvents.emit('completed', data);
    } catch (error) {
      logger.warn('Failed to emit bulk operation completion event', { error });
    }
  }

  /**
   * Emit WebSocket failure event
   */
  private emitFailureEvent(data: {
    bulkOperationId: string;
    organizationId: string;
    status: string;
    totalItems: number;
    processedItems: number;
    successCount: number;
    failureCount: number;
    progress: number;
    error: string;
  }): void {
    try {
      bulkOperationEvents.emit('failed', data);
    } catch (error) {
      logger.warn('Failed to emit bulk operation failure event', { error });
    }
  }

  /**
   * Process a single item based on operation type
   */
  private async processItem(
    operationType: string,
    item: any,
    organizationId: string
  ): Promise<any> {
    switch (operationType) {
      case 'user_update':
        return await this.updateUser(item, organizationId);
      case 'user_create':
        return await this.createUser(item, organizationId);
      case 'user_suspend':
        return await this.suspendUser(item, organizationId);
      case 'group_membership_add':
        return await this.addGroupMember(item, organizationId);
      case 'group_membership_remove':
        return await this.removeGroupMember(item, organizationId);
      default:
        throw new Error(`Unsupported operation type: ${operationType}`);
    }
  }

  /**
   * Update a user
   */
  private async updateUser(item: any, organizationId: string): Promise<any> {
    const updates: string[] = [];
    const values: any[] = [organizationId, item.email];
    let paramIndex = 3;

    if (item.firstName) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(item.firstName);
    }
    if (item.lastName) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(item.lastName);
    }
    if (item.department) {
      updates.push(`department = $${paramIndex++}`);
      values.push(item.department);
    }
    if (item.jobTitle) {
      updates.push(`job_title = $${paramIndex++}`);
      values.push(item.jobTitle);
    }
    if (item.organizationalUnit) {
      updates.push(`organizational_unit = $${paramIndex++}`);
      values.push(item.organizationalUnit);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push(`updated_at = NOW()`);

    const result = await db.query(`
      UPDATE organization_users
      SET ${updates.join(', ')}
      WHERE organization_id = $1 AND email = $2
      RETURNING id, email
    `, values);

    if (result.rows.length === 0) {
      throw new Error(`User not found: ${item.email}`);
    }

    return result.rows[0];
  }

  /**
   * Create a user
   */
  private async createUser(item: any, organizationId: string): Promise<any> {
    const result = await db.query(`
      INSERT INTO organization_users (
        organization_id,
        email,
        first_name,
        last_name,
        department,
        job_title,
        organizational_unit,
        role,
        is_active,
        user_status,
        user_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, email
    `, [
      organizationId,
      item.email,
      item.firstName,
      item.lastName,
      item.department || null,
      item.jobTitle || null,
      item.organizationalUnit || null,
      item.role || 'user',
      true,
      'active',
      item.userType || 'staff',
    ]);

    return result.rows[0];
  }

  /**
   * Suspend a user
   */
  private async suspendUser(item: any, organizationId: string): Promise<any> {
    const result = await db.query(`
      UPDATE organization_users
      SET is_active = false, user_status = 'suspended', updated_at = NOW()
      WHERE organization_id = $1 AND email = $2
      RETURNING id, email
    `, [organizationId, item.email]);

    if (result.rows.length === 0) {
      throw new Error(`User not found: ${item.email}`);
    }

    return result.rows[0];
  }

  /**
   * Add user to group
   * @param item - Object containing userEmail and groupId (or groupName)
   */
  private async addGroupMember(item: any, organizationId: string): Promise<any> {
    const { userEmail, userId, groupId, groupName, role = 'member' } = item;

    // Get user ID if only email provided
    let resolvedUserId = userId;
    if (!resolvedUserId && userEmail) {
      const userResult = await db.query(
        'SELECT id FROM organization_users WHERE email = $1 AND organization_id = $2',
        [userEmail.toLowerCase(), organizationId]
      );
      if (userResult.rows.length === 0) {
        throw new Error(`User not found: ${userEmail}`);
      }
      resolvedUserId = userResult.rows[0].id;
    }

    if (!resolvedUserId) {
      throw new Error('Either userId or userEmail is required');
    }

    // Get group ID if only name provided
    let resolvedGroupId = groupId;
    if (!resolvedGroupId && groupName) {
      const groupResult = await db.query(
        'SELECT id FROM user_groups WHERE name = $1 AND organization_id = $2',
        [groupName, organizationId]
      );
      if (groupResult.rows.length === 0) {
        throw new Error(`Group not found: ${groupName}`);
      }
      resolvedGroupId = groupResult.rows[0].id;
    }

    if (!resolvedGroupId) {
      throw new Error('Either groupId or groupName is required');
    }

    // Check if membership already exists
    const existingMembership = await db.query(
      'SELECT id FROM user_group_memberships WHERE user_id = $1 AND group_id = $2',
      [resolvedUserId, resolvedGroupId]
    );

    if (existingMembership.rows.length > 0) {
      // Update existing membership role if different
      await db.query(
        'UPDATE user_group_memberships SET role = $1 WHERE user_id = $2 AND group_id = $3',
        [role, resolvedUserId, resolvedGroupId]
      );
      logger.info('Group membership updated', { userId: resolvedUserId, groupId: resolvedGroupId, role });
      return { userId: resolvedUserId, groupId: resolvedGroupId, action: 'updated' };
    }

    // Create new membership
    const result = await db.query(`
      INSERT INTO user_group_memberships (user_id, group_id, role)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, group_id, role
    `, [resolvedUserId, resolvedGroupId, role]);

    logger.info('Group membership created', { userId: resolvedUserId, groupId: resolvedGroupId });
    return result.rows[0];
  }

  /**
   * Remove user from group
   * @param item - Object containing userEmail/userId and groupId/groupName
   */
  private async removeGroupMember(item: any, organizationId: string): Promise<any> {
    const { userEmail, userId, groupId, groupName } = item;

    // Get user ID if only email provided
    let resolvedUserId = userId;
    if (!resolvedUserId && userEmail) {
      const userResult = await db.query(
        'SELECT id FROM organization_users WHERE email = $1 AND organization_id = $2',
        [userEmail.toLowerCase(), organizationId]
      );
      if (userResult.rows.length === 0) {
        throw new Error(`User not found: ${userEmail}`);
      }
      resolvedUserId = userResult.rows[0].id;
    }

    if (!resolvedUserId) {
      throw new Error('Either userId or userEmail is required');
    }

    // Get group ID if only name provided
    let resolvedGroupId = groupId;
    if (!resolvedGroupId && groupName) {
      const groupResult = await db.query(
        'SELECT id FROM user_groups WHERE name = $1 AND organization_id = $2',
        [groupName, organizationId]
      );
      if (groupResult.rows.length === 0) {
        throw new Error(`Group not found: ${groupName}`);
      }
      resolvedGroupId = groupResult.rows[0].id;
    }

    if (!resolvedGroupId) {
      throw new Error('Either groupId or groupName is required');
    }

    // Delete membership
    const result = await db.query(
      'DELETE FROM user_group_memberships WHERE user_id = $1 AND group_id = $2 RETURNING id',
      [resolvedUserId, resolvedGroupId]
    );

    if (result.rowCount === 0) {
      throw new Error('Membership not found');
    }

    logger.info('Group membership removed', { userId: resolvedUserId, groupId: resolvedGroupId });
    return { userId: resolvedUserId, groupId: resolvedGroupId, action: 'removed' };
  }

  /**
   * Get a bulk operation by ID
   */
  public async getBulkOperation(id: string): Promise<BulkOperation | null> {
    const result = await db.query('SELECT * FROM bulk_operations WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapDatabaseRow(result.rows[0]) : null;
  }

  /**
   * Get bulk operations for an organization
   */
  public async getBulkOperations(
    organizationId: string,
    limit: number = 50
  ): Promise<BulkOperation[]> {
    const result = await db.query(`
      SELECT * FROM bulk_operations
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [organizationId, limit]);

    return result.rows.map((row: any) => this.mapDatabaseRow(row));
  }

  /**
   * Update bulk operation status
   */
  private async updateBulkOperationStatus(
    id: string,
    status: string,
    additionalFields: any = {}
  ): Promise<void> {
    const updates: string[] = ['status = $2'];
    const values: any[] = [id, status];
    let paramIndex = 3;

    if (additionalFields.startedAt) {
      updates.push(`started_at = $${paramIndex++}`);
      values.push(additionalFields.startedAt);
    }
    if (additionalFields.completedAt) {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(additionalFields.completedAt);
    }
    if (additionalFields.errorMessage) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(additionalFields.errorMessage);
    }
    if (additionalFields.results) {
      updates.push(`results = $${paramIndex++}`);
      values.push(JSON.stringify(additionalFields.results));
    }

    await db.query(`
      UPDATE bulk_operations
      SET ${updates.join(', ')}
      WHERE id = $1
    `, values);
  }

  /**
   * Update progress
   */
  private async updateBulkOperationProgress(
    id: string,
    processedItems: number,
    successCount: number,
    failureCount: number
  ): Promise<void> {
    await db.query(`
      UPDATE bulk_operations
      SET processed_items = $2, success_count = $3, failure_count = $4
      WHERE id = $1
    `, [id, processedItems, successCount, failureCount]);
  }

  /**
   * Add audit log entry
   */
  private async addAuditLog(
    bulkOperationId: string,
    action: string,
    details: any,
    performedBy: string | null
  ): Promise<void> {
    await db.query(`
      INSERT INTO bulk_operation_audit (bulk_operation_id, action, details, performed_by)
      VALUES ($1, $2, $3, $4)
    `, [bulkOperationId, action, JSON.stringify(details), performedBy]);
  }

  /**
   * Map database row to BulkOperation object
   */
  private mapDatabaseRow(row: any): BulkOperation {
    return {
      id: row.id,
      organizationId: row.organization_id,
      operationType: row.operation_type,
      operationName: row.operation_name,
      status: row.status,
      totalItems: row.total_items,
      processedItems: row.processed_items,
      successCount: row.success_count,
      failureCount: row.failure_count,
      inputData: row.input_data,
      results: row.results,
      errorMessage: row.error_message,
      createdBy: row.created_by,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  // ===== TEMPLATE MANAGEMENT =====

  /**
   * Create a new template
   */
  public async createTemplate(params: {
    organizationId: string;
    name: string;
    description?: string;
    operationType: string;
    templateData: any;
    createdBy: string;
  }): Promise<any> {
    const { organizationId, name, description, operationType, templateData, createdBy } = params;

    try {
      const result = await db.query(`
        INSERT INTO bulk_operation_templates (
          organization_id,
          name,
          description,
          operation_type,
          template_data,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        organizationId,
        name,
        description || null,
        operationType,
        JSON.stringify(templateData),
        createdBy,
      ]);

      logger.info('Template created', { templateId: result.rows[0].id, name });
      return this.mapTemplateRow(result.rows[0]);
    } catch (error: any) {
      logger.error('Failed to create template', { error: error.message });
      throw error;
    }
  }

  /**
   * Get templates for an organization
   */
  public async getTemplates(organizationId: string): Promise<any[]> {
    const result = await db.query(`
      SELECT * FROM bulk_operation_templates
      WHERE organization_id = $1
      ORDER BY created_at DESC
    `, [organizationId]);

    return result.rows.map((row: any) => this.mapTemplateRow(row));
  }

  /**
   * Get a single template
   */
  public async getTemplate(id: string): Promise<any | null> {
    const result = await db.query('SELECT * FROM bulk_operation_templates WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapTemplateRow(result.rows[0]) : null;
  }

  /**
   * Update a template
   */
  public async updateTemplate(id: string, updates: {
    name?: string;
    description?: string;
    templateData?: any;
  }): Promise<any> {
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (updates.name) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.templateData) {
      updateFields.push(`template_data = $${paramIndex++}`);
      values.push(JSON.stringify(updates.templateData));
    }

    updateFields.push('updated_at = NOW()');

    const result = await db.query(`
      UPDATE bulk_operation_templates
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Template not found');
    }

    logger.info('Template updated', { templateId: id });
    return this.mapTemplateRow(result.rows[0]);
  }

  /**
   * Delete a template
   */
  public async deleteTemplate(id: string): Promise<void> {
    const result = await db.query('DELETE FROM bulk_operation_templates WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new Error('Template not found');
    }

    logger.info('Template deleted', { templateId: id });
  }

  /**
   * Map template database row
   */
  private mapTemplateRow(row: any): any {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      operationType: row.operation_type,
      templateData: row.template_data,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ===== GOOGLE WORKSPACE BULK SYNC =====

  /**
   * Check if Google Workspace sync is enabled for the organization
   */
  private async isGoogleWorkspaceEnabled(organizationId: string): Promise<boolean> {
    try {
      const result = await db.query(`
        SELECT om.is_enabled
        FROM organization_modules om
        JOIN modules m ON m.id = om.module_id
        WHERE om.organization_id = $1 AND m.slug = 'google_workspace'
      `, [organizationId]);

      return result.rows.length > 0 && result.rows[0].is_enabled;
    } catch (error) {
      return false;
    }
  }

  /**
   * Process bulk user updates with Google Workspace sync
   * This updates users locally AND in Google Workspace
   */
  public async processBulkUserUpdatesWithSync(
    organizationId: string,
    items: any[],
    createdBy: string,
    progressCallback?: (processed: number, total: number, phase: string) => void
  ): Promise<{
    localResults: any[];
    gwResults: any[];
    successCount: number;
    failureCount: number;
  }> {
    const localResults: any[] = [];
    const gwResults: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Phase 1: Update local database
    if (progressCallback) progressCallback(0, items.length, 'local');

    for (let i = 0; i < items.length; i++) {
      try {
        const result = await this.updateUser(items[i], organizationId);
        localResults.push({ item: items[i], success: true, result });
        successCount++;
      } catch (error: any) {
        localResults.push({ item: items[i], success: false, error: error.message });
        failureCount++;
      }
      if (progressCallback) progressCallback(i + 1, items.length, 'local');
    }

    // Phase 2: Sync to Google Workspace (if enabled)
    const gwEnabled = await this.isGoogleWorkspaceEnabled(organizationId);
    if (gwEnabled) {
      if (progressCallback) progressCallback(0, items.length, 'google_workspace');

      // Build bulk update list for Google Workspace
      const gwUpdates: BulkUserUpdate[] = items.map(item => ({
        email: item.email,
        googleWorkspaceId: item.googleWorkspaceId,
        updates: {
          firstName: item.firstName,
          lastName: item.lastName,
          jobTitle: item.jobTitle,
          department: item.department,
          managerEmail: item.managerEmail,
          organizationalUnit: item.organizationalUnit,
        }
      }));

      const gwResult = await googleWorkspaceBatchService.bulkUpdateUsers(
        organizationId,
        gwUpdates,
        (processed, total) => {
          if (progressCallback) progressCallback(processed, total, 'google_workspace');
        }
      );

      gwResults.push(...gwResult.results);

      // Log the sync results
      logger.info('Google Workspace bulk sync completed', {
        organizationId,
        totalUsers: items.length,
        gwSuccess: gwResult.successCount,
        gwFailure: gwResult.failureCount,
      });
    }

    return {
      localResults,
      gwResults,
      successCount,
      failureCount,
    };
  }

  /**
   * Process bulk user suspensions with Google Workspace sync
   */
  public async processBulkSuspendWithSync(
    organizationId: string,
    userEmails: string[],
    createdBy: string,
    progressCallback?: (processed: number, total: number, phase: string) => void
  ): Promise<{
    localResults: any[];
    gwResults: any[];
    successCount: number;
    failureCount: number;
  }> {
    const localResults: any[] = [];
    const gwResults: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Phase 1: Update local database
    if (progressCallback) progressCallback(0, userEmails.length, 'local');

    for (let i = 0; i < userEmails.length; i++) {
      try {
        const result = await this.suspendUser({ email: userEmails[i] }, organizationId);
        localResults.push({ email: userEmails[i], success: true, result });
        successCount++;
      } catch (error: any) {
        localResults.push({ email: userEmails[i], success: false, error: error.message });
        failureCount++;
      }
      if (progressCallback) progressCallback(i + 1, userEmails.length, 'local');
    }

    // Phase 2: Sync to Google Workspace
    const gwEnabled = await this.isGoogleWorkspaceEnabled(organizationId);
    if (gwEnabled) {
      if (progressCallback) progressCallback(0, userEmails.length, 'google_workspace');

      const gwResult = await googleWorkspaceBatchService.bulkSuspendUsers(
        organizationId,
        userEmails,
        (processed, total) => {
          if (progressCallback) progressCallback(processed, total, 'google_workspace');
        }
      );

      gwResults.push(...gwResult.results);

      logger.info('Google Workspace bulk suspend completed', {
        organizationId,
        totalUsers: userEmails.length,
        gwSuccess: gwResult.successCount,
        gwFailure: gwResult.failureCount,
      });
    }

    return {
      localResults,
      gwResults,
      successCount,
      failureCount,
    };
  }

  /**
   * Process bulk OU moves with Google Workspace sync
   */
  public async processBulkMoveOUWithSync(
    organizationId: string,
    userEmails: string[],
    targetOU: string,
    createdBy: string,
    progressCallback?: (processed: number, total: number, phase: string) => void
  ): Promise<{
    localResults: any[];
    gwResults: any[];
    successCount: number;
    failureCount: number;
  }> {
    const localResults: any[] = [];
    const gwResults: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Phase 1: Update local database
    if (progressCallback) progressCallback(0, userEmails.length, 'local');

    for (let i = 0; i < userEmails.length; i++) {
      try {
        const result = await db.query(`
          UPDATE organization_users
          SET organizational_unit = $3, updated_at = NOW()
          WHERE organization_id = $1 AND email = $2
          RETURNING id, email
        `, [organizationId, userEmails[i], targetOU]);

        if (result.rows.length === 0) {
          throw new Error(`User not found: ${userEmails[i]}`);
        }

        localResults.push({ email: userEmails[i], success: true, result: result.rows[0] });
        successCount++;
      } catch (error: any) {
        localResults.push({ email: userEmails[i], success: false, error: error.message });
        failureCount++;
      }
      if (progressCallback) progressCallback(i + 1, userEmails.length, 'local');
    }

    // Phase 2: Sync to Google Workspace
    const gwEnabled = await this.isGoogleWorkspaceEnabled(organizationId);
    if (gwEnabled) {
      if (progressCallback) progressCallback(0, userEmails.length, 'google_workspace');

      const gwResult = await googleWorkspaceBatchService.bulkMoveToOU(
        organizationId,
        userEmails,
        targetOU,
        (processed, total) => {
          if (progressCallback) progressCallback(processed, total, 'google_workspace');
        }
      );

      gwResults.push(...gwResult.results);

      logger.info('Google Workspace bulk OU move completed', {
        organizationId,
        totalUsers: userEmails.length,
        targetOU,
        gwSuccess: gwResult.successCount,
        gwFailure: gwResult.failureCount,
      });
    }

    return {
      localResults,
      gwResults,
      successCount,
      failureCount,
    };
  }

  /**
   * Process bulk group membership operations with Google Workspace sync
   */
  public async processBulkGroupMembershipWithSync(
    organizationId: string,
    operations: Array<{
      userEmail: string;
      groupId: string;
      groupExternalId?: string;
      operation: 'add' | 'remove';
    }>,
    createdBy: string,
    progressCallback?: (processed: number, total: number, phase: string) => void
  ): Promise<{
    localResults: any[];
    gwResults: any[];
    successCount: number;
    failureCount: number;
  }> {
    const localResults: any[] = [];
    const gwResults: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Phase 1: Update local database
    if (progressCallback) progressCallback(0, operations.length, 'local');

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        if (op.operation === 'add') {
          const result = await this.addGroupMember(
            { userEmail: op.userEmail, groupId: op.groupId },
            organizationId
          );
          localResults.push({ ...op, success: true, result });
        } else {
          const result = await this.removeGroupMember(
            { userEmail: op.userEmail, groupId: op.groupId },
            organizationId
          );
          localResults.push({ ...op, success: true, result });
        }
        successCount++;
      } catch (error: any) {
        localResults.push({ ...op, success: false, error: error.message });
        failureCount++;
      }
      if (progressCallback) progressCallback(i + 1, operations.length, 'local');
    }

    // Phase 2: Sync to Google Workspace
    const gwEnabled = await this.isGoogleWorkspaceEnabled(organizationId);
    if (gwEnabled) {
      if (progressCallback) progressCallback(0, operations.length, 'google_workspace');

      // Filter operations that have Google Workspace external IDs
      const gwOperations: BulkGroupMemberOperation[] = operations
        .filter(op => op.groupExternalId)
        .map(op => ({
          groupId: op.groupId,
          groupExternalId: op.groupExternalId!,
          userEmail: op.userEmail,
          operation: op.operation,
        }));

      if (gwOperations.length > 0) {
        const gwResult = await googleWorkspaceBatchService.bulkGroupMemberOperations(
          organizationId,
          gwOperations,
          (processed, total) => {
            if (progressCallback) progressCallback(processed, total, 'google_workspace');
          }
        );

        gwResults.push(...gwResult.results);

        logger.info('Google Workspace bulk group membership completed', {
          organizationId,
          totalOperations: gwOperations.length,
          gwSuccess: gwResult.successCount,
          gwFailure: gwResult.failureCount,
        });
      }
    }

    return {
      localResults,
      gwResults,
      successCount,
      failureCount,
    };
  }

  /**
   * Get estimated time for a bulk operation
   */
  public estimateBulkOperationTime(
    itemCount: number,
    includeGoogleWorkspaceSync: boolean = false
  ): {
    localEstimateSeconds: number;
    gwEstimateSeconds: number;
    totalEstimateSeconds: number;
    totalEstimateMinutes: number;
  } {
    // Local operations: ~20ms per item
    const localEstimateSeconds = Math.ceil((itemCount * 20) / 1000);

    // Google Workspace sync estimate
    const gwEstimate = includeGoogleWorkspaceSync
      ? googleWorkspaceBatchService.estimateOperationTime(itemCount)
      : { estimatedSeconds: 0 };

    const totalEstimateSeconds = localEstimateSeconds + gwEstimate.estimatedSeconds;

    return {
      localEstimateSeconds,
      gwEstimateSeconds: gwEstimate.estimatedSeconds,
      totalEstimateSeconds,
      totalEstimateMinutes: Math.ceil(totalEstimateSeconds / 60),
    };
  }
}

export const bulkOperationsService = new BulkOperationsService();
