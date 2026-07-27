/**
 * Script to create test groups in Google Workspace
 * Run with: npx ts-node scripts/create-test-groups.ts
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/database/connection';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const ORGANIZATION_ID = '161da501-7076-4bd5-91b5-248e35f178c1';

// Test groups to create
const TEST_GROUPS = [
  {
    name: 'Sales Team',
    email: 'sales-team@obilabs.dev',
    description: 'Sales department collaboration and updates',
    members: ['anthony@obilabs.dev', 'coriander@obilabs.dev', 'mike@obilabs.dev']
  },
  {
    name: 'IT Department',
    email: 'it-dept@obilabs.dev',
    description: 'IT team for technical discussions and alerts',
    members: ['mike@obilabs.dev']
  },
  {
    name: 'All Staff',
    email: 'all-staff@obilabs.dev',
    description: 'Company-wide announcements and updates',
    members: ['mike@obilabs.dev', 'anthony@obilabs.dev', 'coriander@obilabs.dev', 'pewter@obilabs.dev']
  },
  {
    name: 'HR Team',
    email: 'hr-team@obilabs.dev',
    description: 'Human Resources team communications',
    members: ['pewter@obilabs.dev', 'mike@obilabs.dev']
  },
  {
    name: 'Leadership',
    email: 'leadership@obilabs.dev',
    description: 'Executive team and department heads',
    members: ['mike@obilabs.dev']
  }
];

async function getCredentials() {
  const result = await db.query(
    'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
    [ORGANIZATION_ID]
  );

  if (result.rows.length === 0) {
    throw new Error('No credentials found');
  }

  return {
    credentials: JSON.parse(result.rows[0].service_account_key),
    adminEmail: result.rows[0].admin_email
  };
}

async function createGroup(admin: any, groupData: typeof TEST_GROUPS[0]) {
  console.log(`\nCreating group: ${groupData.name} (${groupData.email})`);

  try {
    // Create the group
    const group = await admin.groups.insert({
      requestBody: {
        email: groupData.email,
        name: groupData.name,
        description: groupData.description
      }
    });

    console.log(`✅ Group created: ${group.data.id}`);

    // Add members to the group
    for (const memberEmail of groupData.members) {
      try {
        await admin.members.insert({
          groupKey: groupData.email,
          requestBody: {
            email: memberEmail,
            role: 'MEMBER'
          }
        });
        console.log(`  ✅ Added member: ${memberEmail}`);
      } catch (error: any) {
        if (error.code === 409) {
          console.log(`  ⚠️ Member already exists: ${memberEmail}`);
        } else {
          console.error(`  ❌ Failed to add member ${memberEmail}:`, error.message);
        }
      }
    }

    return group.data;
  } catch (error: any) {
    if (error.code === 409) {
      console.log(`⚠️ Group already exists: ${groupData.email}`);

      // Try to add members anyway
      for (const memberEmail of groupData.members) {
        try {
          await admin.members.insert({
            groupKey: groupData.email,
            requestBody: {
              email: memberEmail,
              role: 'MEMBER'
            }
          });
          console.log(`  ✅ Added member: ${memberEmail}`);
        } catch (memberError: any) {
          if (memberError.code === 409) {
            console.log(`  ⚠️ Member already exists: ${memberEmail}`);
          }
        }
      }
    } else {
      console.error(`❌ Failed to create group:`, error.message);
    }
  }
}

async function main() {
  console.log('🚀 Creating test groups in Google Workspace...\n');

  try {
    // Get credentials
    const { credentials, adminEmail } = await getCredentials();
    console.log(`Using admin email: ${adminEmail}`);

    // Create auth client
    const authClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.group',
        'https://www.googleapis.com/auth/admin.directory.group.member'
      ],
      subject: adminEmail
    });

    // Create admin client
    const admin = google.admin({ version: 'directory_v1', auth: authClient });

    // Create all test groups
    for (const groupData of TEST_GROUPS) {
      await createGroup(admin, groupData);
      // Wait a bit between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ All groups created successfully!');
    console.log('\nNext steps:');
    console.log('1. Run the groups sync in the UI: Click "Sync Groups" on the Groups page');
    console.log('2. Or sync via API: POST http://localhost:3001/api/google-workspace/sync-groups');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    await db.close();
  }
}

main().catch(console.error);
