/**
 * Email Security Routes
 *
 * Provides security admin tools for:
 * - Searching messages across all mailboxes
 * - Deleting malicious/spam messages organization-wide
 * - Audit logging for all email security operations
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../database/connection.js';
import axios from 'axios';

const router = express.Router();

/**
 * @openapi
 * tags:
 *   - name: Email Security
 *     description: Organization-wide email search and deletion for security
 */

interface MessageSearchResult {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  recipients: number;
}

/**
 * @openapi
 * /api/v1/email-security/search:
 *   get:
 *     summary: Search emails across organization
 *     description: Search for messages across all user mailboxes.
 *     tags: [Email Security]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchBy
 *         required: true
 *         schema:
 *           type: string
 *           enum: [sender, messageId, subject]
 *       - in: query
 *         name: value
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Missing parameters
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/search', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { searchBy, value, dateFrom, dateTo } = req.query;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!searchBy || !value) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: searchBy, value'
      });
    }

    // Get all users in the organization from Google Workspace
    const usersResponse = await axios.get(
      `http://localhost:3001/api/google/admin/directory/v1/users?customer=my_customer&maxResults=500`,
      {
        headers: {
          'Authorization': req.headers.authorization
        }
      }
    );

    if (!usersResponse.data.users || usersResponse.data.users.length === 0) {
      return res.json({
        success: true,
        data: { messages: [] }
      });
    }

    // Build Gmail search query based on search type
    let gmailQuery = '';
    switch (searchBy) {
      case 'sender':
        gmailQuery = `from:${value}`;
        break;
      case 'messageId':
        gmailQuery = `rfc822msgid:${value}`;
        break;
      case 'subject':
        gmailQuery = `subject:${value}`;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid searchBy parameter'
        });
    }

    // Add date filters if provided
    if (dateFrom) {
      const afterDate = new Date(dateFrom as string).toISOString().split('T')[0].replace(/-/g, '/');
      gmailQuery += ` after:${afterDate}`;
    }
    if (dateTo) {
      const beforeDate = new Date(dateTo as string).toISOString().split('T')[0].replace(/-/g, '/');
      gmailQuery += ` before:${beforeDate}`;
    }

    // Search across all users
    const foundMessages = new Map<string, MessageSearchResult>();

    for (const user of usersResponse.data.users) {
      try {
        // Search messages in this user's mailbox
        const messagesResponse = await axios.get(
          `http://localhost:3001/api/google/gmail/v1/users/${user.primaryEmail}/messages`,
          {
            params: {
              q: gmailQuery,
              maxResults: 50
            },
            headers: {
              'Authorization': req.headers.authorization
            }
          }
        );

        if (messagesResponse.data.messages && messagesResponse.data.messages.length > 0) {
          // Get full message details for each match
          for (const message of messagesResponse.data.messages) {
            // Skip if we already have this message (by message ID)
            if (foundMessages.has(message.id)) {
              const existing = foundMessages.get(message.id)!;
              existing.recipients++;
              continue;
            }

            // Fetch full message details
            try {
              const messageDetail = await axios.get(
                `http://localhost:3001/api/google/gmail/v1/users/${user.primaryEmail}/messages/${message.id}`,
                {
                  params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date', 'Message-ID'] },
                  headers: {
                    'Authorization': req.headers.authorization
                  }
                }
              );

              const headers = messageDetail.data.payload?.headers || [];
              const getHeader = (name: string) =>
                headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

              foundMessages.set(message.id, {
                messageId: getHeader('Message-ID') || message.id,
                subject: getHeader('Subject'),
                from: getHeader('From'),
                date: getHeader('Date'),
                recipients: 1
              });
            } catch (detailError) {
              console.error(`Failed to get message details for ${message.id}:`, detailError);
            }
          }
        }
      } catch (userError: any) {
        // Log but continue - some users may not have Gmail enabled
        console.warn(`Failed to search mailbox for ${user.primaryEmail}:`, userError.message);
      }
    }

    // Convert map to array
    const messages = Array.from(foundMessages.values());

    // Log the search operation
    await logEmailSecurityAction({
      organizationId,
      userId: req.user?.userId,
      action: 'email_search',
      searchCriteria: { searchBy, value, dateFrom, dateTo },
      resultsCount: messages.length
    });

    return res.json({
      success: true,
      data: { messages }
    });

  } catch (error: any) {
    console.error('Email search error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to search emails'
    });
  }
});

/**
 * @openapi
 * /api/v1/email-security/delete:
 *   post:
 *     summary: Delete emails across organization
 *     description: Delete messages from all user mailboxes (admin only).
 *     tags: [Email Security]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - searchBy
 *               - value
 *               - reason
 *             properties:
 *               searchBy:
 *                 type: string
 *                 enum: [sender, messageId, subject]
 *               value:
 *                 type: string
 *               reason:
 *                 type: string
 *               dateFrom:
 *                 type: string
 *                 format: date
 *               dateTo:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Deletion results
 *       400:
 *         description: Missing parameters
 *       403:
 *         description: Admin access required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/delete', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { searchBy, value, reason, dateFrom, dateTo } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!searchBy || !value || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: searchBy, value, reason'
      });
    }

    // Verify user has admin role
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can delete messages organization-wide'
      });
    }

    // Get all users in the organization
    const usersResponse = await axios.get(
      `http://localhost:3001/api/google/admin/directory/v1/users?customer=my_customer&maxResults=500`,
      {
        headers: {
          'Authorization': req.headers.authorization
        }
      }
    );

    if (!usersResponse.data.users || usersResponse.data.users.length === 0) {
      return res.json({
        success: true,
        data: {
          deletedCount: 0,
          failedCount: 0,
          affectedUsers: []
        }
      });
    }

    // Build Gmail search query
    let gmailQuery = '';
    switch (searchBy) {
      case 'sender':
        gmailQuery = `from:${value}`;
        break;
      case 'messageId':
        gmailQuery = `rfc822msgid:${value}`;
        break;
      case 'subject':
        gmailQuery = `subject:${value}`;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid searchBy parameter'
        });
    }

    // Add date filters
    if (dateFrom) {
      const afterDate = new Date(dateFrom).toISOString().split('T')[0].replace(/-/g, '/');
      gmailQuery += ` after:${afterDate}`;
    }
    if (dateTo) {
      const beforeDate = new Date(dateTo).toISOString().split('T')[0].replace(/-/g, '/');
      gmailQuery += ` before:${beforeDate}`;
    }

    // Delete messages across all users
    let deletedCount = 0;
    let failedCount = 0;
    const affectedUsers: string[] = [];

    for (const user of usersResponse.data.users) {
      try {
        // Find messages matching query in this user's mailbox
        const messagesResponse = await axios.get(
          `http://localhost:3001/api/google/gmail/v1/users/${user.primaryEmail}/messages`,
          {
            params: {
              q: gmailQuery,
              maxResults: 100 // Gmail API limit
            },
            headers: {
              'Authorization': req.headers.authorization
            }
          }
        );

        if (messagesResponse.data.messages && messagesResponse.data.messages.length > 0) {
          let userDeletedCount = 0;

          // Delete each message
          for (const message of messagesResponse.data.messages) {
            try {
              await axios.delete(
                `http://localhost:3001/api/google/gmail/v1/users/${user.primaryEmail}/messages/${message.id}`,
                {
                  headers: {
                    'Authorization': req.headers.authorization
                  }
                }
              );
              deletedCount++;
              userDeletedCount++;
            } catch (deleteError) {
              console.error(`Failed to delete message ${message.id} for ${user.primaryEmail}:`, deleteError);
              failedCount++;
            }
          }

          if (userDeletedCount > 0) {
            affectedUsers.push(user.primaryEmail);
          }
        }
      } catch (userError: any) {
        console.warn(`Failed to process mailbox for ${user.primaryEmail}:`, userError.message);
      }
    }

    // Log the deletion operation
    await logEmailSecurityAction({
      organizationId,
      userId: req.user?.userId,
      action: 'email_delete',
      searchCriteria: { searchBy, value, dateFrom, dateTo },
      reason,
      deletedCount,
      failedCount,
      affectedUsers
    });

    return res.json({
      success: true,
      data: {
        deletedCount,
        failedCount,
        affectedUsers
      }
    });

  } catch (error: any) {
    console.error('Email deletion error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete emails'
    });
  }
});

/**
 * @openapi
 * /api/v1/email-security/history:
 *   get:
 *     summary: Get email security action history
 *     description: Get recent email security actions (searches and deletions).
 *     tags: [Email Security]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Action history
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/history', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Get recent email security actions from audit log
    const result = await db.query(`
      SELECT
        id,
        action,
        description,
        metadata,
        created_at,
        actor_id
      FROM activity_logs
      WHERE organization_id = $1
        AND action IN ('email_search', 'email_delete')
      ORDER BY created_at DESC
      LIMIT 50
    `, [organizationId]);

    const history = result.rows.map((row: any) => ({
      id: row.id,
      action: row.action,
      description: row.description,
      metadata: row.metadata,
      timestamp: row.created_at,
      actorId: row.actor_id
    }));

    return res.json({
      success: true,
      data: { history }
    });

  } catch (error: any) {
    console.error('Failed to fetch email security history:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch history'
    });
  }
});

/**
 * Helper: Log email security action to audit trail
 */
async function logEmailSecurityAction(params: {
  organizationId?: string;
  userId?: string;
  action: 'email_search' | 'email_delete';
  searchCriteria: any;
  reason?: string;
  resultsCount?: number;
  deletedCount?: number;
  failedCount?: number;
  affectedUsers?: string[];
}) {
  try {
    await db.query(`
      INSERT INTO activity_logs (
        organization_id,
        user_id,
        actor_id,
        action,
        resource_type,
        description,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      params.organizationId,
      params.userId,
      params.userId,
      params.action,
      'email_security',
      params.action === 'email_search'
        ? `Searched emails: ${params.searchCriteria.searchBy}=${params.searchCriteria.value}`
        : `Deleted emails: ${params.searchCriteria.searchBy}=${params.searchCriteria.value} (Reason: ${params.reason})`,
      JSON.stringify({
        searchCriteria: params.searchCriteria,
        reason: params.reason,
        resultsCount: params.resultsCount,
        deletedCount: params.deletedCount,
        failedCount: params.failedCount,
        affectedUsers: params.affectedUsers,
        timestamp: new Date().toISOString()
      })
    ]);
  } catch (error) {
    console.error('Failed to log email security action:', error);
    // Don't throw - logging failures shouldn't break the main operation
  }
}

export default router;
