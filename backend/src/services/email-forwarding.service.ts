import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';

interface EmailForwardingConfig {
  enabled: boolean;
  forwardTo: string[];
  autoReply?: {
    enabled: boolean;
    message: string;
  };
}

export async function createHiddenForwardingGroup(
  user: any,
  config: EmailForwardingConfig,
  authToken: string,
  organizationId: string
): Promise<{ success: boolean; groupId?: string; error?: string }> {
  try {
    // 1. Create group with user's email
    const createGroupResponse = await fetch('http://localhost:3001/api/google/admin/directory/v1/groups', {
      method: 'POST',
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        name: `Email Forwarding - ${user.first_name} ${user.last_name}`,
        description: 'System-managed email forwarding group (hidden from directory)'
      })
    });

    if (!createGroupResponse.ok) {
      const error: any = await createGroupResponse.json();
      return { success: false, error: error.message || 'Failed to create forwarding group' };
    }

    const groupData: any = await createGroupResponse.json();

    // 2. Configure group settings (Groups Settings API)
    const settingsResponse = await fetch(`http://localhost:3001/api/google/groupssettings/v1/groups/${user.email}`, {
      method: 'PATCH',
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        includeInGlobalAddressList: 'false',
        showInGroupDirectory: 'false',
        whoCanPostMessage: 'NONE_CAN_POST',
        whoCanJoin: 'INVITED_CAN_JOIN',
        whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
        whoCanViewGroup: 'ALL_MANAGERS_CAN_VIEW',
        messageModerationLevel: 'MODERATE_NONE',
        isArchived: 'false',
        allowExternalMembers: 'false',
        allowGoogleCommunication: 'false',
        membersCanPostAsTheGroup: 'false'
      })
    });

    // 3. Add forwarding recipients as members
    for (const recipientEmail of config.forwardTo) {
      await fetch(`http://localhost:3001/api/google/admin/directory/v1/groups/${user.email}/members`, {
        method: 'POST',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: recipientEmail,
          role: 'MEMBER',
          delivery_settings: 'ALL_MAIL'
        })
      });
    }

    // 4. Tag in Helios as system group
    await db.query(`
      INSERT INTO access_groups (
        organization_id,
        email,
        name,
        google_workspace_id,
        group_type,
        is_system,
        metadata,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, 'system_email_forward', true, $5, NOW(), NOW())
      ON CONFLICT (organization_id, email) DO UPDATE
      SET
        google_workspace_id = EXCLUDED.google_workspace_id,
        group_type = EXCLUDED.group_type,
        is_system = EXCLUDED.is_system,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `, [
      organizationId,
      user.email,
      `Email Forwarding - ${user.first_name} ${user.last_name}`,
      groupData.id,
      JSON.stringify({
        originalUserId: user.id,
        originalUserEmail: user.email,
        forwardingTo: config.forwardTo,
        purpose: 'email_forwarding',
        autoReply: config.autoReply,
        createdAt: new Date()
      })
    ]);

    logger.info('Hidden forwarding group created', {
      groupEmail: user.email,
      groupId: groupData.id,
      forwardingTo: config.forwardTo
    });

    return { success: true, groupId: groupData.id };

  } catch (error: any) {
    logger.error('Failed to create hidden forwarding group', {
      userEmail: user.email,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}
