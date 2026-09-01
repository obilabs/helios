/**
 * Microsoft Graph Transparent Proxy Middleware
 *
 * Proxies Microsoft Graph API calls through Helios for:
 * - Full audit trail
 * - Actor attribution (user/service/vendor)
 * - Intelligent sync to Helios database
 *
 * Usage:
 *   User calls: POST /api/microsoft/graph/v1.0/users
 *   Helios proxies to: https://graph.microsoft.com/v1.0/users
 *   Result: Graph's response + audit log + DB sync
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from './auth.js';
import { encryptionService } from '../services/encryption.service.js';
// Record/replay seam for the two outbound Microsoft calls below (token exchange
// + Graph API call). In production (and any test that does not opt in) this is a
// straight passthrough to axios — no behavior change. Tests activate replay via
// useGraphReplay(); setting HELIOS_GRAPH_RECORD=1 captures sanitized fixtures.
// See testing/graph-replay.ts.
import { graphHttp } from '../testing/graph-replay.js';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

export const microsoftTransparentProxyRouter = Router();

// ===== INTERFACES =====

interface ProxyRequest {
  method: string;
  path: string;
  body: any;
  query: any;
  headers: any;
}

interface Actor {
  type: 'user' | 'service' | 'vendor';
  id: string;
  name: string;
  email: string;
  vendorName?: string;
  serviceName?: string;
  serviceOwner?: string;
  apiKeyId?: string;
  technicianName?: string;
  technicianEmail?: string;
  ticketReference?: string;
}

interface MicrosoftCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

// Cache for access tokens to avoid repeated token requests
const tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

// ===== MAIN PROXY ROUTE =====

/**
 * Combined authentication middleware for transparent proxy
 * Accepts BOTH JWT tokens AND API keys
 */
const combinedAuth = (req: Request, res: Response, next: NextFunction): void => {
  // If API key is set (by api-key-auth middleware), populate req.user from it
  if (req.apiKey) {
    // SECURITY: an API key carries ONLY the permissions it was issued with.
    // See the matching comment in transparent-proxy.ts — this previously
    // hardcoded admin for any valid key, yielding arbitrary Microsoft Graph
    // access to any user who could mint one.
    const keyPermissions: string[] = Array.isArray(req.apiKey.permissions)
      ? req.apiKey.permissions
      : [];
    const keyIsAdmin = keyPermissions.includes('admin');

    req.user = {
      userId: req.apiKey.id,
      email: req.actorContext?.email || 'api-key',
      role: keyIsAdmin ? 'admin' : 'service',
      organizationId: req.apiKey.organizationId,
      isAdmin: keyIsAdmin,
      isEmployee: false,
      keyType: req.apiKey.type,
      apiKeyId: req.apiKey.id,
      apiKeyName: req.apiKey.name,
      serviceName: req.apiKey.serviceConfig?.serviceName,
      serviceEmail: req.apiKey.serviceConfig?.serviceEmail,
      serviceOwner: req.apiKey.serviceConfig?.serviceOwner,
      vendorName: req.apiKey.vendorConfig?.vendorName,
      firstName: req.actorContext?.name?.split(' ')[0],
      lastName: req.actorContext?.name?.split(' ').slice(1).join(' ')
    };
    return next();
  }

  // Otherwise, use JWT authentication
  authenticateToken(req, res, next);
};

/**
 * @openapi
 * /microsoft/graph/{path}:
 *   get:
 *     summary: Proxy GET request to Microsoft Graph API
 *     description: |
 *       Transparently proxies requests to Microsoft Graph API.
 *       All requests are logged to the audit trail.
 *
 *       Examples:
 *       - GET /api/microsoft/graph/v1.0/users
 *       - GET /api/microsoft/graph/v1.0/groups
 *       - GET /api/microsoft/graph/v1.0/users/{id}/memberOf
 *     tags: [Microsoft 365 Proxy]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The Microsoft Graph API path (e.g., v1.0/users)
 *     responses:
 *       200:
 *         description: Response from Microsoft Graph API
 *       401:
 *         description: Not authenticated
 *       400:
 *         description: Microsoft 365 not configured
 *       500:
 *         description: Proxy error
 *   post:
 *     summary: Proxy POST request to Microsoft Graph API
 *     description: Transparently proxies POST requests to Microsoft Graph API.
 *     tags: [Microsoft 365 Proxy]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Response from Microsoft Graph API
 *   patch:
 *     summary: Proxy PATCH request to Microsoft Graph API
 *     description: Transparently proxies PATCH requests to Microsoft Graph API.
 *     tags: [Microsoft 365 Proxy]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Response from Microsoft Graph API
 *   delete:
 *     summary: Proxy DELETE request to Microsoft Graph API
 *     description: Transparently proxies DELETE requests to Microsoft Graph API.
 *     tags: [Microsoft 365 Proxy]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Response from Microsoft Graph API
 */
microsoftTransparentProxyRouter.all('/api/microsoft/graph/*', combinedAuth, async (req: Request, res: Response) => {
  const startTime = Date.now();
  let auditLogId: string | null = null;

  try {
    // 1. EXTRACT GRAPH API PATH
    // /api/microsoft/graph/v1.0/users → v1.0/users
    const graphApiPath = req.path.replace('/api/microsoft/graph/', '');

    logger.info('Microsoft Graph proxy request received', {
      method: req.method,
      path: graphApiPath,
      organizationId: req.user?.organizationId
    });

    // 2. EXTRACT ACTOR INFORMATION
    const actor = extractActor(req);

    // 3. CREATE AUDIT LOG ENTRY (START)
    auditLogId = await createAuditLogEntry({
      organizationId: req.user?.organizationId,
      actor,
      method: req.method,
      path: graphApiPath,
      body: req.body,
      query: req.query
    });

    // 4. GET MICROSOFT CREDENTIALS
    const msCreds = await getMicrosoftCredentials(req.user?.organizationId);

    if (!msCreds) {
      await updateAuditLogEntry(auditLogId, {
        status: 'failure',
        statusCode: 400,
        error: 'Microsoft 365 not configured',
        duration: Date.now() - startTime
      });

      return res.status(400).json({
        success: false,
        error: 'Microsoft 365 not configured for this organization'
      });
    }

    // 5. PROXY TO MICROSOFT GRAPH
    const graphResponse = await proxyToMicrosoftGraph({
      method: req.method,
      path: graphApiPath,
      body: req.body,
      query: req.query,
      headers: req.headers
    }, msCreds);

    // 6. INTELLIGENT SYNC
    await intelligentSync({
      method: req.method,
      path: graphApiPath,
      response: graphResponse,
      organizationId: req.user?.organizationId
    });

    // 7. UPDATE AUDIT LOG (SUCCESS)
    await updateAuditLogEntry(auditLogId, {
      status: 'success',
      statusCode: graphResponse.status,
      responseBody: graphResponse.data,
      duration: Date.now() - startTime
    });

    // 8. RETURN GRAPH'S RESPONSE
    return res.status(graphResponse.status).json(graphResponse.data);

  } catch (error: any) {
    logger.error('Microsoft Graph proxy request failed', {
      error: error.message,
      stack: error.stack,
      path: req.path
    });

    // Update audit log with error
    if (auditLogId) {
      await updateAuditLogEntry(auditLogId, {
        status: 'failure',
        statusCode: error.response?.status || 500,
        error: error.message,
        responseBody: error.response?.data,
        duration: Date.now() - startTime
      });
    }

    // Return error response
    const statusCode = error.status || error.response?.status || 500;
    const errorData = error.data || error.response?.data || {
      error: {
        code: statusCode,
        message: error.message
      }
    };

    return res.status(statusCode).json(errorData);
  }
});

// ===== HELPER FUNCTIONS =====

/**
 * Extract actor information from request
 */
function extractActor(req: Request): Actor {
  const user = req.user as any;

  // Service API Key
  if (user?.keyType === 'service') {
    return {
      type: 'service',
      id: user.apiKeyId || 'unknown',
      name: user.apiKeyName || 'Unknown Service',
      email: user.serviceEmail || 'service',
      serviceName: user.serviceName,
      serviceOwner: user.serviceOwner
    };
  }

  // Vendor API Key
  if (user?.keyType === 'vendor') {
    return {
      type: 'vendor',
      id: user.apiKeyId || 'unknown',
      name: req.headers['x-actor-name'] as string || 'Unknown',
      email: req.headers['x-actor-email'] as string || 'unknown',
      vendorName: user.vendorName
    };
  }

  // Regular User
  return {
    type: 'user',
    id: user?.userId || 'unknown',
    name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || req.user?.email || 'Unknown User',
    email: req.user?.email || 'unknown'
  };
}

/**
 * Get Microsoft 365 credentials for organization
 */
async function getMicrosoftCredentials(organizationId?: string): Promise<MicrosoftCredentials | null> {
  if (!organizationId) {
    return null;
  }

  try {
    const result = await db.query(
      `SELECT tenant_id, client_id, client_secret_encrypted
       FROM ms_credentials
       WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const clientSecret = await encryptionService.decrypt(row.client_secret_encrypted);

    return {
      tenantId: row.tenant_id,
      clientId: row.client_id,
      clientSecret
    };
  } catch (error) {
    logger.error('Failed to get Microsoft credentials', { organizationId, error });
    return null;
  }
}

/**
 * Get or refresh access token for Microsoft Graph
 */
async function getAccessToken(credentials: MicrosoftCredentials): Promise<string> {
  const cacheKey = `${credentials.tenantId}:${credentials.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if still valid (with 5 minute buffer)
  if (cached && cached.expiresAt > Date.now() + 300000) {
    return cached.token;
  }

  // Request new token using client credentials flow
  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append('client_id', credentials.clientId);
  params.append('client_secret', credentials.clientSecret);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');

  const response = await graphHttp.post(tokenUrl, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const token = response.data.access_token;
  const expiresIn = response.data.expires_in || 3600;

  // Cache the token
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + (expiresIn * 1000)
  });

  return token;
}

/**
 * Proxy request to Microsoft Graph API
 */
async function proxyToMicrosoftGraph(
  proxyRequest: ProxyRequest,
  credentials: MicrosoftCredentials
): Promise<{ status: number; data: any; headers: any }> {

  const accessToken = await getAccessToken(credentials);

  // Build URL for Microsoft Graph API
  const baseUrl = 'https://graph.microsoft.com';
  const url = `${baseUrl}/${proxyRequest.path}`;

  logger.info('Proxying to Microsoft Graph API', {
    method: proxyRequest.method,
    url,
    hasBody: !!proxyRequest.body,
    hasQuery: !!proxyRequest.query && Object.keys(proxyRequest.query).length > 0
  });

  try {
    const requestConfig: any = {
      method: proxyRequest.method,
      url: url,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    // Add query parameters
    if (proxyRequest.query && Object.keys(proxyRequest.query).length > 0) {
      requestConfig.params = proxyRequest.query;
    }

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(proxyRequest.method.toUpperCase()) && proxyRequest.body) {
      requestConfig.data = proxyRequest.body;
    }

    const response = await graphHttp(requestConfig);

    logger.info('Microsoft Graph API request successful', {
      status: response.status,
      hasData: !!response.data
    });

    return {
      status: response.status,
      data: response.data,
      headers: response.headers
    };

  } catch (error: any) {
    logger.error('Microsoft Graph API request failed', {
      path: proxyRequest.path,
      method: proxyRequest.method,
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });

    throw {
      status: error.response?.status || 500,
      message: error.message,
      data: error.response?.data
    };
  }
}

/**
 * Create audit log entry for proxy request
 */
async function createAuditLogEntry(params: {
  organizationId?: string;
  actor: Actor;
  method: string;
  path: string;
  body: any;
  query: any;
}): Promise<string> {
  let userId = null;
  let actorId = null;
  let actorType: 'internal' | 'service' | 'vendor' = 'internal';

  if (params.actor.type === 'user') {
    userId = params.actor.id;
    actorId = params.actor.id;
    actorType = 'internal';
  } else if (params.actor.type === 'service') {
    actorType = 'service';
  } else if (params.actor.type === 'vendor') {
    actorType = 'vendor';
  }

  const result = await db.query(`
    INSERT INTO activity_logs (
      organization_id,
      user_id,
      actor_id,
      action,
      resource_type,
      resource_id,
      description,
      metadata,
      ip_address,
      user_agent,
      actor_type,
      api_key_id,
      api_key_name,
      vendor_name,
      vendor_technician_name,
      vendor_technician_email,
      ticket_reference,
      service_name,
      service_owner,
      result,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
    RETURNING id
  `, [
    params.organizationId,
    userId,
    actorId,
    `microsoft_graph_${params.method.toLowerCase()}`,
    'microsoft_graph',
    params.path,
    `${params.method} ${params.path} via ${params.actor.type} (${params.actor.name})`,
    JSON.stringify({
      method: params.method,
      path: params.path,
      body: params.body,
      query: params.query,
      status: 'in_progress'
    }),
    null, // IP address
    null, // User agent
    actorType,
    params.actor.apiKeyId || null,
    params.actor.name || null,
    params.actor.vendorName || null,
    params.actor.technicianName || null,
    params.actor.technicianEmail || null,
    params.actor.ticketReference || null,
    params.actor.serviceName || null,
    params.actor.serviceOwner || null,
    'success' // Default to success, will be updated on completion
  ]);

  return result.rows[0].id;
}

/**
 * Update audit log entry with results
 */
async function updateAuditLogEntry(
  auditLogId: string,
  update: {
    status: 'success' | 'failure';
    statusCode: number;
    responseBody?: any;
    error?: string;
    duration: number;
  }
): Promise<void> {
  await db.query(`
    UPDATE activity_logs
    SET
      metadata = metadata || $1::jsonb,
      result = $3,
      created_at = created_at
    WHERE id = $2
  `, [
    JSON.stringify({
      status: update.status,
      statusCode: update.statusCode,
      responseBody: update.responseBody ? JSON.stringify(update.responseBody).substring(0, 5000) : null,
      error: update.error,
      durationMs: update.duration,
      completedAt: new Date().toISOString()
    }),
    auditLogId,
    update.status
  ]);
}

/**
 * Intelligent sync - update Helios DB based on proxied request
 */
async function intelligentSync(params: {
  method: string;
  path: string;
  response: any;
  organizationId?: string;
}): Promise<void> {
  if (!params.organizationId) {
    return;
  }

  const resourceType = identifyResourceType(params.path);

  if (!resourceType) {
    logger.debug('Skipping sync for non-tracked resource', { path: params.path });
    return;
  }

  try {
    switch (resourceType) {
      case 'users':
        await syncUserResource(params);
        break;
      case 'groups':
        await syncGroupResource(params);
        break;
      default:
        logger.debug('No sync handler for resource type', { resourceType });
    }
  } catch (error: any) {
    logger.error('Microsoft intelligent sync failed', {
      resourceType,
      error: error.message,
      path: params.path
    });
    // Don't throw - sync failures shouldn't break the proxy
  }
}

/**
 * Identify resource type from API path
 */
function identifyResourceType(path: string): string | null {
  const pathLower = path.toLowerCase();

  if (pathLower.includes('/users')) return 'users';
  if (pathLower.includes('/groups')) return 'groups';

  return null;
}

/**
 * Sync user resource changes to Helios DB
 */
async function syncUserResource(params: {
  method: string;
  path: string;
  response: any;
  organizationId?: string;
}): Promise<void> {
  const method = params.method.toUpperCase();
  const responseData = params.response.data;

  // CREATE USER (POST)
  if (method === 'POST' && responseData?.id) {
    await db.query(`
      INSERT INTO ms_synced_users (
        organization_id,
        ms_id,
        upn,
        display_name,
        given_name,
        surname,
        email,
        job_title,
        department,
        office_location,
        company_name,
        mobile_phone,
        business_phones,
        is_account_enabled,
        last_sync_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (organization_id, ms_id)
      DO UPDATE SET
        upn = EXCLUDED.upn,
        display_name = EXCLUDED.display_name,
        given_name = EXCLUDED.given_name,
        surname = EXCLUDED.surname,
        email = EXCLUDED.email,
        job_title = EXCLUDED.job_title,
        department = EXCLUDED.department,
        is_account_enabled = EXCLUDED.is_account_enabled,
        last_sync_at = NOW()
    `, [
      params.organizationId,
      responseData.id,
      responseData.userPrincipalName,
      responseData.displayName,
      responseData.givenName,
      responseData.surname,
      responseData.mail,
      responseData.jobTitle,
      responseData.department,
      responseData.officeLocation,
      responseData.companyName,
      responseData.mobilePhone,
      JSON.stringify(responseData.businessPhones || []),
      responseData.accountEnabled !== false
    ]);

    logger.info('Synced Microsoft user creation', {
      upn: responseData.userPrincipalName,
      msId: responseData.id
    });
  }

  // DELETE USER (DELETE)
  else if (method === 'DELETE') {
    const userKey = extractUserKeyFromPath(params.path);

    await db.query(`
      DELETE FROM ms_synced_users
      WHERE organization_id = $1
        AND (upn = $2 OR ms_id = $2)
    `, [params.organizationId, userKey]);

    logger.info('Synced Microsoft user deletion', { userKey });
  }

  // UPDATE USER (PATCH)
  else if (method === 'PATCH' && responseData?.id) {
    await db.query(`
      UPDATE ms_synced_users
      SET
        display_name = COALESCE($1, display_name),
        given_name = COALESCE($2, given_name),
        surname = COALESCE($3, surname),
        job_title = COALESCE($4, job_title),
        department = COALESCE($5, department),
        is_account_enabled = COALESCE($6, is_account_enabled),
        last_sync_at = NOW()
      WHERE organization_id = $7
        AND ms_id = $8
    `, [
      responseData.displayName,
      responseData.givenName,
      responseData.surname,
      responseData.jobTitle,
      responseData.department,
      responseData.accountEnabled,
      params.organizationId,
      responseData.id
    ]);

    logger.info('Synced Microsoft user update', { msId: responseData.id });
  }

  // LIST USERS (GET)
  else if (method === 'GET' && responseData?.value && Array.isArray(responseData.value)) {
    for (const user of responseData.value) {
      await db.query(`
        INSERT INTO ms_synced_users (
          organization_id,
          ms_id,
          upn,
          display_name,
          given_name,
          surname,
          email,
          job_title,
          department,
          office_location,
          company_name,
          mobile_phone,
          business_phones,
          is_account_enabled,
          last_sync_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (organization_id, ms_id)
        DO UPDATE SET
          upn = EXCLUDED.upn,
          display_name = EXCLUDED.display_name,
          given_name = EXCLUDED.given_name,
          surname = EXCLUDED.surname,
          email = EXCLUDED.email,
          job_title = EXCLUDED.job_title,
          department = EXCLUDED.department,
          is_account_enabled = EXCLUDED.is_account_enabled,
          last_sync_at = NOW()
      `, [
        params.organizationId,
        user.id,
        user.userPrincipalName,
        user.displayName,
        user.givenName,
        user.surname,
        user.mail,
        user.jobTitle,
        user.department,
        user.officeLocation,
        user.companyName,
        user.mobilePhone,
        JSON.stringify(user.businessPhones || []),
        user.accountEnabled !== false
      ]);
    }

    logger.info('Synced Microsoft user list', { count: responseData.value.length });
  }
}

/**
 * Sync group resource changes to Helios DB
 */
async function syncGroupResource(params: {
  method: string;
  path: string;
  response: any;
  organizationId?: string;
}): Promise<void> {
  const method = params.method.toUpperCase();
  const responseData = params.response.data;

  // CREATE GROUP
  if (method === 'POST' && responseData?.id) {
    await db.query(`
      INSERT INTO ms_synced_groups (
        organization_id,
        ms_id,
        display_name,
        description,
        mail,
        mail_enabled,
        security_enabled,
        group_types,
        last_sync_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (organization_id, ms_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        mail = EXCLUDED.mail,
        mail_enabled = EXCLUDED.mail_enabled,
        security_enabled = EXCLUDED.security_enabled,
        group_types = EXCLUDED.group_types,
        last_sync_at = NOW()
    `, [
      params.organizationId,
      responseData.id,
      responseData.displayName,
      responseData.description,
      responseData.mail,
      responseData.mailEnabled || false,
      responseData.securityEnabled || false,
      JSON.stringify(responseData.groupTypes || [])
    ]);

    logger.info('Synced Microsoft group creation', {
      displayName: responseData.displayName,
      msId: responseData.id
    });
  }

  // DELETE — group OR member removal
  else if (method === 'DELETE') {
    // A member-remove path is /groups/{gid}/members/{uid}/$ref. The historic bug
    // ran extractGroupKeyFromPath here (which matches the GROUP id in that path)
    // and DELETE'd the whole group row, cascading away every membership. Detect
    // the member path and remove only the membership.
    const memberMatch = params.path.match(/groups\/([^/?]+)\/members\/([^/?]+)/i);
    if (memberMatch) {
      const gMsId = decodeURIComponent(memberMatch[1]);
      const uMsId = decodeURIComponent(memberMatch[2]);
      try {
        await db.query(`
          DELETE FROM ms_group_memberships m
          USING ms_synced_groups g, ms_synced_users u
          WHERE m.group_id = g.id AND m.user_id = u.id
            AND m.organization_id = $1 AND g.ms_id = $2 AND u.ms_id = $3
        `, [params.organizationId, gMsId, uMsId]);
        await db.query(`
          UPDATE ms_synced_groups SET member_count = (SELECT COUNT(*) FROM ms_group_memberships WHERE group_id = ms_synced_groups.id)
          WHERE organization_id = $1 AND ms_id = $2
        `, [params.organizationId, gMsId]);
      } catch (e) {
        logger.warn('proxy member-remove mirror failed', { error: (e as Error).message });
      }
      logger.info('Synced Microsoft group member removal', { group: gMsId, user: uMsId });
    } else {
      const groupKey = extractGroupKeyFromPath(params.path);
      await db.query(`
        DELETE FROM ms_synced_groups
        WHERE organization_id = $1
          AND ms_id = $2
      `, [params.organizationId, groupKey]);
      logger.info('Synced Microsoft group deletion', { groupKey });
    }
  }

  // LIST GROUPS (GET)
  else if (method === 'GET' && responseData?.value && Array.isArray(responseData.value)) {
    for (const group of responseData.value) {
      await db.query(`
        INSERT INTO ms_synced_groups (
          organization_id,
          ms_id,
          display_name,
          description,
          mail,
          mail_enabled,
          security_enabled,
          group_types,
          last_sync_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (organization_id, ms_id)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          mail = EXCLUDED.mail,
          mail_enabled = EXCLUDED.mail_enabled,
          security_enabled = EXCLUDED.security_enabled,
          group_types = EXCLUDED.group_types,
          last_sync_at = NOW()
      `, [
        params.organizationId,
        group.id,
        group.displayName,
        group.description,
        group.mail,
        group.mailEnabled || false,
        group.securityEnabled || false,
        JSON.stringify(group.groupTypes || [])
      ]);
    }

    logger.info('Synced Microsoft group list', { count: responseData.value.length });
  }
}

/**
 * Extract user key from API path
 * Example: v1.0/users/john@company.com → john@company.com
 */
function extractUserKeyFromPath(path: string): string {
  const match = path.match(/users\/([^\/\?]+)/);
  return match ? match[1] : '';
}

/**
 * Extract group key from API path
 */
function extractGroupKeyFromPath(path: string): string {
  const match = path.match(/groups\/([^\/\?]+)/);
  return match ? match[1] : '';
}

export default microsoftTransparentProxyRouter;
