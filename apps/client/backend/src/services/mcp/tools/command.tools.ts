/**
 * Command Generation Tools for AI Assistant
 *
 * These tools generate ready-to-use commands (curl, PowerShell, Python) for
 * various actions. The AI can generate commands but cannot execute them.
 * Users copy and run the commands themselves.
 */

import { logger } from '../../../utils/logger.js';

/**
 * Supported output formats for generated commands
 */
export type CommandFormat = 'curl' | 'powershell' | 'python' | 'javascript';

/**
 * Supported actions for command generation
 */
export type CommandAction =
  | 'create_user'
  | 'update_user'
  | 'disable_user'
  | 'add_to_group'
  | 'remove_from_group'
  | 'trigger_sync'
  | 'get_user'
  | 'list_users'
  | 'get_group'
  | 'list_groups';

/**
 * MCP Tool Definition: generate_api_command
 */
export const generateApiCommandToolDefinition = {
  name: 'generate_api_command',
  description: 'Generate an API command (curl/PowerShell/Python/JavaScript) for a specific action. The user will copy and execute this command themselves.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'create_user',
          'update_user',
          'disable_user',
          'add_to_group',
          'remove_from_group',
          'trigger_sync',
          'get_user',
          'list_users',
          'get_group',
          'list_groups'
        ],
        description: 'The action to generate a command for'
      },
      parameters: {
        type: 'object',
        description: 'Action-specific parameters',
        properties: {
          email: { type: 'string', description: 'User email address' },
          userId: { type: 'string', description: 'User ID (UUID)' },
          groupId: { type: 'string', description: 'Group ID (UUID)' },
          firstName: { type: 'string', description: 'First name for user creation' },
          lastName: { type: 'string', description: 'Last name for user creation' },
          department: { type: 'string', description: 'Department name' },
          jobTitle: { type: 'string', description: 'Job title' },
          role: { type: 'string', enum: ['admin', 'manager', 'user'], description: 'User role' },
          source: { type: 'string', enum: ['google', 'microsoft'], description: 'Integration source' }
        }
      },
      format: {
        type: 'string',
        enum: ['curl', 'powershell', 'python', 'javascript'],
        default: 'curl',
        description: 'Output format for the command'
      },
      baseUrl: {
        type: 'string',
        description: 'Base URL for API (defaults to current host)',
        default: 'https://your-helios-domain.com'
      }
    },
    required: ['action', 'parameters']
  }
};

/**
 * MCP Tool Definition: generate_bulk_script
 */
export const generateBulkScriptToolDefinition = {
  name: 'generate_bulk_script',
  description: 'Generate a script for bulk operations on multiple users or groups. The user will review and execute this script themselves.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'disable_users',
          'add_users_to_group',
          'remove_users_from_group',
          'export_users',
          'export_groups'
        ],
        description: 'Bulk action to perform'
      },
      targets: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of email addresses or IDs to target'
      },
      groupId: {
        type: 'string',
        description: 'Group ID for group membership operations'
      },
      format: {
        type: 'string',
        enum: ['powershell', 'python', 'bash'],
        default: 'bash',
        description: 'Script format'
      },
      baseUrl: {
        type: 'string',
        description: 'Base URL for API',
        default: 'https://your-helios-domain.com'
      }
    },
    required: ['action', 'targets']
  }
};

/**
 * Generate an API command for a specific action
 */
export async function generateApiCommand(
  organizationId: string,
  action: CommandAction,
  params: Record<string, any>,
  format: CommandFormat = 'curl',
  baseUrl: string = 'https://your-helios-domain.com'
): Promise<GeneratedCommand> {
  logger.debug('Generating API command', { action, params, format });

  const apiBase = `${baseUrl}/api/v1`;

  switch (action) {
    case 'create_user':
      return generateCreateUserCommand(apiBase, params, format);
    case 'update_user':
      return generateUpdateUserCommand(apiBase, params, format);
    case 'disable_user':
      return generateDisableUserCommand(apiBase, params, format);
    case 'add_to_group':
      return generateAddToGroupCommand(apiBase, params, format);
    case 'remove_from_group':
      return generateRemoveFromGroupCommand(apiBase, params, format);
    case 'trigger_sync':
      return generateTriggerSyncCommand(apiBase, params, format);
    case 'get_user':
      return generateGetUserCommand(apiBase, params, format);
    case 'list_users':
      return generateListUsersCommand(apiBase, params, format);
    case 'get_group':
      return generateGetGroupCommand(apiBase, params, format);
    case 'list_groups':
      return generateListGroupsCommand(apiBase, params, format);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Generate a bulk script for multiple operations
 */
export async function generateBulkScript(
  organizationId: string,
  action: string,
  targets: string[],
  params: Record<string, any>,
  format: 'powershell' | 'python' | 'bash' = 'bash',
  baseUrl: string = 'https://your-helios-domain.com'
): Promise<GeneratedScript> {
  logger.debug('Generating bulk script', { action, targetCount: targets.length, format });

  const apiBase = `${baseUrl}/api/v1`;

  switch (action) {
    case 'disable_users':
      return generateBulkDisableScript(apiBase, targets, format);
    case 'add_users_to_group':
      return generateBulkAddToGroupScript(apiBase, targets, params.groupId, format);
    case 'remove_users_from_group':
      return generateBulkRemoveFromGroupScript(apiBase, targets, params.groupId, format);
    case 'export_users':
      return generateExportUsersScript(apiBase, targets, format);
    case 'export_groups':
      return generateExportGroupsScript(apiBase, format);
    default:
      throw new Error(`Unknown bulk action: ${action}`);
  }
}

// ============================================================================
// Command Generators
// ============================================================================

function generateCreateUserCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const endpoint = `${apiBase}/organization/users`;
  const body = {
    email: params.email || 'user@example.com',
    firstName: params.firstName || 'John',
    lastName: params.lastName || 'Doe',
    department: params.department,
    jobTitle: params.jobTitle,
    role: params.role || 'user'
  };

  return {
    action: 'create_user',
    method: 'POST',
    endpoint,
    description: `Create a new user: ${body.email}`,
    command: formatCommand(endpoint, 'POST', body, format),
    format,
    warnings: [
      'Replace YOUR_API_TOKEN with a valid API key or JWT token',
      'Ensure the email is unique within the organization'
    ]
  };
}

function generateUpdateUserCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  if (!params.userId && !params.email) {
    throw new Error('Either userId or email is required');
  }

  const userId = params.userId || '{USER_ID}';
  const endpoint = `${apiBase}/organization/users/${userId}`;
  const body: Record<string, any> = {};

  if (params.firstName) body.firstName = params.firstName;
  if (params.lastName) body.lastName = params.lastName;
  if (params.department) body.department = params.department;
  if (params.jobTitle) body.jobTitle = params.jobTitle;
  if (params.role) body.role = params.role;

  return {
    action: 'update_user',
    method: 'PATCH',
    endpoint,
    description: `Update user ${params.email || userId}`,
    command: formatCommand(endpoint, 'PATCH', body, format),
    format,
    warnings: params.userId ? [] : ['Replace {USER_ID} with the actual user UUID']
  };
}

function generateDisableUserCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const userId = params.userId || '{USER_ID}';
  const endpoint = `${apiBase}/organization/users/${userId}`;
  const body = { isActive: false };

  return {
    action: 'disable_user',
    method: 'PATCH',
    endpoint,
    description: `Disable user ${params.email || userId}`,
    command: formatCommand(endpoint, 'PATCH', body, format),
    format,
    warnings: [
      'This will disable the user account',
      ...(params.userId ? [] : ['Replace {USER_ID} with the actual user UUID'])
    ]
  };
}

function generateAddToGroupCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const groupId = params.groupId || '{GROUP_ID}';
  const endpoint = `${apiBase}/access-groups/${groupId}/members`;
  const body = {
    userId: params.userId || '{USER_ID}'
  };

  return {
    action: 'add_to_group',
    method: 'POST',
    endpoint,
    description: `Add user to group`,
    command: formatCommand(endpoint, 'POST', body, format),
    format,
    warnings: [
      ...(params.groupId ? [] : ['Replace {GROUP_ID} with the actual group UUID']),
      ...(params.userId ? [] : ['Replace {USER_ID} with the actual user UUID'])
    ]
  };
}

function generateRemoveFromGroupCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const groupId = params.groupId || '{GROUP_ID}';
  const userId = params.userId || '{USER_ID}';
  const endpoint = `${apiBase}/access-groups/${groupId}/members/${userId}`;

  return {
    action: 'remove_from_group',
    method: 'DELETE',
    endpoint,
    description: `Remove user from group`,
    command: formatCommand(endpoint, 'DELETE', null, format),
    format,
    warnings: [
      ...(params.groupId ? [] : ['Replace {GROUP_ID} with the actual group UUID']),
      ...(params.userId ? [] : ['Replace {USER_ID} with the actual user UUID'])
    ]
  };
}

function generateTriggerSyncCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const source = params.source || 'google';
  const endpoint = source === 'microsoft'
    ? `${apiBase}/microsoft/sync`
    : `${apiBase}/google-workspace/sync`;

  return {
    action: 'trigger_sync',
    method: 'POST',
    endpoint,
    description: `Trigger ${source === 'microsoft' ? 'Microsoft 365' : 'Google Workspace'} sync`,
    command: formatCommand(endpoint, 'POST', {}, format),
    format,
    warnings: ['This will sync all users and groups from the external directory']
  };
}

function generateGetUserCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const userId = params.userId || params.email || '{USER_ID_OR_EMAIL}';
  const endpoint = `${apiBase}/organization/users/${userId}`;

  return {
    action: 'get_user',
    method: 'GET',
    endpoint,
    description: `Get user details`,
    command: formatCommand(endpoint, 'GET', null, format),
    format,
    warnings: []
  };
}

function generateListUsersCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const queryParams = new URLSearchParams();
  if (params.department) queryParams.set('department', params.department);
  if (params.role) queryParams.set('role', params.role);
  if (params.search) queryParams.set('search', params.search);
  if (params.limit) queryParams.set('limit', params.limit);

  const query = queryParams.toString();
  const endpoint = `${apiBase}/organization/users${query ? `?${query}` : ''}`;

  return {
    action: 'list_users',
    method: 'GET',
    endpoint,
    description: `List users${params.department ? ` in ${params.department}` : ''}`,
    command: formatCommand(endpoint, 'GET', null, format),
    format,
    warnings: []
  };
}

function generateGetGroupCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const groupId = params.groupId || '{GROUP_ID}';
  const endpoint = `${apiBase}/access-groups/${groupId}`;

  return {
    action: 'get_group',
    method: 'GET',
    endpoint,
    description: `Get group details`,
    command: formatCommand(endpoint, 'GET', null, format),
    format,
    warnings: params.groupId ? [] : ['Replace {GROUP_ID} with the actual group UUID']
  };
}

function generateListGroupsCommand(
  apiBase: string,
  params: Record<string, any>,
  format: CommandFormat
): GeneratedCommand {
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set('search', params.search);
  if (params.limit) queryParams.set('limit', params.limit);

  const query = queryParams.toString();
  const endpoint = `${apiBase}/access-groups${query ? `?${query}` : ''}`;

  return {
    action: 'list_groups',
    method: 'GET',
    endpoint,
    description: `List groups`,
    command: formatCommand(endpoint, 'GET', null, format),
    format,
    warnings: []
  };
}

// ============================================================================
// Bulk Script Generators
// ============================================================================

function generateBulkDisableScript(
  apiBase: string,
  targets: string[],
  format: 'powershell' | 'python' | 'bash'
): GeneratedScript {
  const scripts: Record<typeof format, string> = {
    bash: `#!/bin/bash
# Bulk disable users script
# Replace YOUR_API_TOKEN with a valid API key

TOKEN="YOUR_API_TOKEN"
BASE_URL="${apiBase}"

USERS=(
${targets.map(t => `  "${t}"`).join('\n')}
)

echo "Disabling \${#USERS[@]} users..."

for USER in "\${USERS[@]}"; do
  echo "Disabling user: $USER"
  curl -s -X PATCH "$BASE_URL/organization/users/$USER" \\
    -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/json" \\
    -d '{"isActive": false}'
  echo ""
done

echo "Done!"
`,
    powershell: `# Bulk disable users script
# Replace YOUR_API_TOKEN with a valid API key

$Token = "YOUR_API_TOKEN"
$BaseUrl = "${apiBase}"

$Users = @(
${targets.map(t => `    "${t}"`).join('\n')}
)

Write-Host "Disabling $($Users.Count) users..."

foreach ($User in $Users) {
    Write-Host "Disabling user: $User"
    $headers = @{
        "Authorization" = "Bearer $Token"
        "Content-Type" = "application/json"
    }
    $body = '{"isActive": false}'

    try {
        Invoke-RestMethod -Uri "$BaseUrl/organization/users/$User" -Method Patch -Headers $headers -Body $body
        Write-Host "  Success" -ForegroundColor Green
    } catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "Done!"
`,
    python: `#!/usr/bin/env python3
"""Bulk disable users script"""
import requests

TOKEN = "YOUR_API_TOKEN"
BASE_URL = "${apiBase}"

users = [
${targets.map(t => `    "${t}",`).join('\n')}
]

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

print(f"Disabling {len(users)} users...")

for user in users:
    print(f"Disabling user: {user}")
    try:
        response = requests.patch(
            f"{BASE_URL}/organization/users/{user}",
            headers=headers,
            json={"isActive": False}
        )
        response.raise_for_status()
        print("  Success")
    except requests.exceptions.RequestException as e:
        print(f"  Failed: {e}")

print("Done!")
`
  };

  return {
    action: 'disable_users',
    targetCount: targets.length,
    description: `Disable ${targets.length} users`,
    script: scripts[format],
    format,
    warnings: [
      'Review the list of users before running this script',
      'Replace YOUR_API_TOKEN with a valid API key',
      'This action cannot be easily undone'
    ]
  };
}

function generateBulkAddToGroupScript(
  apiBase: string,
  targets: string[],
  groupId: string,
  format: 'powershell' | 'python' | 'bash'
): GeneratedScript {
  const gid = groupId || '{GROUP_ID}';

  const scripts: Record<typeof format, string> = {
    bash: `#!/bin/bash
# Bulk add users to group script

TOKEN="YOUR_API_TOKEN"
BASE_URL="${apiBase}"
GROUP_ID="${gid}"

USERS=(
${targets.map(t => `  "${t}"`).join('\n')}
)

echo "Adding \${#USERS[@]} users to group..."

for USER in "\${USERS[@]}"; do
  echo "Adding user: $USER"
  curl -s -X POST "$BASE_URL/access-groups/$GROUP_ID/members" \\
    -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/json" \\
    -d "{\\"userId\\": \\"$USER\\"}"
  echo ""
done

echo "Done!"
`,
    powershell: `# Bulk add users to group script

$Token = "YOUR_API_TOKEN"
$BaseUrl = "${apiBase}"
$GroupId = "${gid}"

$Users = @(
${targets.map(t => `    "${t}"`).join('\n')}
)

Write-Host "Adding $($Users.Count) users to group..."

foreach ($User in $Users) {
    Write-Host "Adding user: $User"
    $headers = @{
        "Authorization" = "Bearer $Token"
        "Content-Type" = "application/json"
    }
    $body = @{ userId = $User } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri "$BaseUrl/access-groups/$GroupId/members" -Method Post -Headers $headers -Body $body
        Write-Host "  Success" -ForegroundColor Green
    } catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "Done!"
`,
    python: `#!/usr/bin/env python3
"""Bulk add users to group script"""
import requests

TOKEN = "YOUR_API_TOKEN"
BASE_URL = "${apiBase}"
GROUP_ID = "${gid}"

users = [
${targets.map(t => `    "${t}",`).join('\n')}
]

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

print(f"Adding {len(users)} users to group...")

for user in users:
    print(f"Adding user: {user}")
    try:
        response = requests.post(
            f"{BASE_URL}/access-groups/{GROUP_ID}/members",
            headers=headers,
            json={"userId": user}
        )
        response.raise_for_status()
        print("  Success")
    except requests.exceptions.RequestException as e:
        print(f"  Failed: {e}")

print("Done!")
`
  };

  return {
    action: 'add_users_to_group',
    targetCount: targets.length,
    description: `Add ${targets.length} users to group ${gid}`,
    script: scripts[format],
    format,
    warnings: [
      'Review the list of users before running this script',
      'Replace YOUR_API_TOKEN with a valid API key',
      ...(groupId ? [] : ['Replace {GROUP_ID} with the actual group UUID'])
    ]
  };
}

function generateBulkRemoveFromGroupScript(
  apiBase: string,
  targets: string[],
  groupId: string,
  format: 'powershell' | 'python' | 'bash'
): GeneratedScript {
  const gid = groupId || '{GROUP_ID}';

  const scripts: Record<typeof format, string> = {
    bash: `#!/bin/bash
# Bulk remove users from group script

TOKEN="YOUR_API_TOKEN"
BASE_URL="${apiBase}"
GROUP_ID="${gid}"

USERS=(
${targets.map(t => `  "${t}"`).join('\n')}
)

echo "Removing \${#USERS[@]} users from group..."

for USER in "\${USERS[@]}"; do
  echo "Removing user: $USER"
  curl -s -X DELETE "$BASE_URL/access-groups/$GROUP_ID/members/$USER" \\
    -H "Authorization: Bearer $TOKEN"
  echo ""
done

echo "Done!"
`,
    powershell: `# Bulk remove users from group script

$Token = "YOUR_API_TOKEN"
$BaseUrl = "${apiBase}"
$GroupId = "${gid}"

$Users = @(
${targets.map(t => `    "${t}"`).join('\n')}
)

Write-Host "Removing $($Users.Count) users from group..."

foreach ($User in $Users) {
    Write-Host "Removing user: $User"
    $headers = @{
        "Authorization" = "Bearer $Token"
    }

    try {
        Invoke-RestMethod -Uri "$BaseUrl/access-groups/$GroupId/members/$User" -Method Delete -Headers $headers
        Write-Host "  Success" -ForegroundColor Green
    } catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "Done!"
`,
    python: `#!/usr/bin/env python3
"""Bulk remove users from group script"""
import requests

TOKEN = "YOUR_API_TOKEN"
BASE_URL = "${apiBase}"
GROUP_ID = "${gid}"

users = [
${targets.map(t => `    "${t}",`).join('\n')}
]

headers = {
    "Authorization": f"Bearer {TOKEN}"
}

print(f"Removing {len(users)} users from group...")

for user in users:
    print(f"Removing user: {user}")
    try:
        response = requests.delete(
            f"{BASE_URL}/access-groups/{GROUP_ID}/members/{user}",
            headers=headers
        )
        response.raise_for_status()
        print("  Success")
    except requests.exceptions.RequestException as e:
        print(f"  Failed: {e}")

print("Done!")
`
  };

  return {
    action: 'remove_users_from_group',
    targetCount: targets.length,
    description: `Remove ${targets.length} users from group ${gid}`,
    script: scripts[format],
    format,
    warnings: [
      'Review the list of users before running this script',
      'Replace YOUR_API_TOKEN with a valid API key',
      ...(groupId ? [] : ['Replace {GROUP_ID} with the actual group UUID'])
    ]
  };
}

function generateExportUsersScript(
  apiBase: string,
  targets: string[],
  format: 'powershell' | 'python' | 'bash'
): GeneratedScript {
  const scripts: Record<typeof format, string> = {
    bash: `#!/bin/bash
# Export users to CSV script

TOKEN="YOUR_API_TOKEN"
BASE_URL="${apiBase}"
OUTPUT_FILE="users_export_$(date +%Y%m%d_%H%M%S).csv"

echo "Exporting users to $OUTPUT_FILE..."

# Get users and convert to CSV
curl -s "$BASE_URL/organization/users?limit=1000" \\
  -H "Authorization: Bearer $TOKEN" \\
  | jq -r '.data[] | [.email, .firstName, .lastName, .department, .jobTitle, .role, .isActive] | @csv' \\
  > "$OUTPUT_FILE"

# Add header
sed -i '1i email,firstName,lastName,department,jobTitle,role,isActive' "$OUTPUT_FILE"

echo "Exported to $OUTPUT_FILE"
`,
    powershell: `# Export users to CSV script

$Token = "YOUR_API_TOKEN"
$BaseUrl = "${apiBase}"
$OutputFile = "users_export_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"

Write-Host "Exporting users to $OutputFile..."

$headers = @{
    "Authorization" = "Bearer $Token"
}

$response = Invoke-RestMethod -Uri "$BaseUrl/organization/users?limit=1000" -Headers $headers

$response.data | Select-Object email, firstName, lastName, department, jobTitle, role, isActive |
    Export-Csv -Path $OutputFile -NoTypeInformation

Write-Host "Exported to $OutputFile"
`,
    python: `#!/usr/bin/env python3
"""Export users to CSV script"""
import requests
import csv
from datetime import datetime

TOKEN = "YOUR_API_TOKEN"
BASE_URL = "${apiBase}"

output_file = f"users_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

print(f"Exporting users to {output_file}...")

headers = {
    "Authorization": f"Bearer {TOKEN}"
}

response = requests.get(
    f"{BASE_URL}/organization/users?limit=1000",
    headers=headers
)
response.raise_for_status()

users = response.json().get("data", [])

with open(output_file, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "email", "firstName", "lastName", "department",
        "jobTitle", "role", "isActive"
    ])
    writer.writeheader()
    for user in users:
        writer.writerow({
            "email": user.get("email", ""),
            "firstName": user.get("firstName", ""),
            "lastName": user.get("lastName", ""),
            "department": user.get("department", ""),
            "jobTitle": user.get("jobTitle", ""),
            "role": user.get("role", ""),
            "isActive": user.get("isActive", "")
        })

print(f"Exported {len(users)} users to {output_file}")
`
  };

  return {
    action: 'export_users',
    targetCount: targets.length || 0,
    description: 'Export all users to CSV',
    script: scripts[format],
    format,
    warnings: ['Replace YOUR_API_TOKEN with a valid API key']
  };
}

function generateExportGroupsScript(
  apiBase: string,
  format: 'powershell' | 'python' | 'bash'
): GeneratedScript {
  const scripts: Record<typeof format, string> = {
    bash: `#!/bin/bash
# Export groups to CSV script

TOKEN="YOUR_API_TOKEN"
BASE_URL="${apiBase}"
OUTPUT_FILE="groups_export_$(date +%Y%m%d_%H%M%S).csv"

echo "Exporting groups to $OUTPUT_FILE..."

curl -s "$BASE_URL/access-groups?limit=1000" \\
  -H "Authorization: Bearer $TOKEN" \\
  | jq -r '.data[] | [.id, .name, .email, .memberCount, .groupType] | @csv' \\
  > "$OUTPUT_FILE"

sed -i '1i id,name,email,memberCount,groupType' "$OUTPUT_FILE"

echo "Exported to $OUTPUT_FILE"
`,
    powershell: `# Export groups to CSV script

$Token = "YOUR_API_TOKEN"
$BaseUrl = "${apiBase}"
$OutputFile = "groups_export_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"

Write-Host "Exporting groups to $OutputFile..."

$headers = @{
    "Authorization" = "Bearer $Token"
}

$response = Invoke-RestMethod -Uri "$BaseUrl/access-groups?limit=1000" -Headers $headers

$response.data | Select-Object id, name, email, memberCount, groupType |
    Export-Csv -Path $OutputFile -NoTypeInformation

Write-Host "Exported to $OutputFile"
`,
    python: `#!/usr/bin/env python3
"""Export groups to CSV script"""
import requests
import csv
from datetime import datetime

TOKEN = "YOUR_API_TOKEN"
BASE_URL = "${apiBase}"

output_file = f"groups_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

print(f"Exporting groups to {output_file}...")

headers = {
    "Authorization": f"Bearer {TOKEN}"
}

response = requests.get(
    f"{BASE_URL}/access-groups?limit=1000",
    headers=headers
)
response.raise_for_status()

groups = response.json().get("data", [])

with open(output_file, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "id", "name", "email", "memberCount", "groupType"
    ])
    writer.writeheader()
    for group in groups:
        writer.writerow({
            "id": group.get("id", ""),
            "name": group.get("name", ""),
            "email": group.get("email", ""),
            "memberCount": group.get("memberCount", 0),
            "groupType": group.get("groupType", "")
        })

print(f"Exported {len(groups)} groups to {output_file}")
`
  };

  return {
    action: 'export_groups',
    targetCount: 0,
    description: 'Export all groups to CSV',
    script: scripts[format],
    format,
    warnings: ['Replace YOUR_API_TOKEN with a valid API key']
  };
}

// ============================================================================
// Formatting Functions
// ============================================================================

function formatCommand(
  endpoint: string,
  method: string,
  body: Record<string, any> | null,
  format: CommandFormat
): string {
  switch (format) {
    case 'curl':
      return formatCurlCommand(endpoint, method, body);
    case 'powershell':
      return formatPowerShellCommand(endpoint, method, body);
    case 'python':
      return formatPythonCommand(endpoint, method, body);
    case 'javascript':
      return formatJavaScriptCommand(endpoint, method, body);
    default:
      return formatCurlCommand(endpoint, method, body);
  }
}

function formatCurlCommand(
  endpoint: string,
  method: string,
  body: Record<string, any> | null
): string {
  let cmd = `curl -X ${method} "${endpoint}" \\\n  -H "Authorization: Bearer YOUR_API_TOKEN"`;

  if (body && Object.keys(body).length > 0) {
    cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body, null, 2).replace(/'/g, "\\'")}'`;
  }

  return cmd;
}

function formatPowerShellCommand(
  endpoint: string,
  method: string,
  body: Record<string, any> | null
): string {
  let cmd = `$headers = @{
    "Authorization" = "Bearer YOUR_API_TOKEN"
`;

  if (body && Object.keys(body).length > 0) {
    cmd += `    "Content-Type" = "application/json"
}
$body = @'
${JSON.stringify(body, null, 2)}
'@

Invoke-RestMethod -Uri "${endpoint}" -Method ${method} -Headers $headers -Body $body`;
  } else {
    cmd += `}

Invoke-RestMethod -Uri "${endpoint}" -Method ${method} -Headers $headers`;
  }

  return cmd;
}

function formatPythonCommand(
  endpoint: string,
  method: string,
  body: Record<string, any> | null
): string {
  let cmd = `import requests

headers = {
    "Authorization": "Bearer YOUR_API_TOKEN"`;

  if (body && Object.keys(body).length > 0) {
    cmd += `,
    "Content-Type": "application/json"
}

response = requests.${method.toLowerCase()}(
    "${endpoint}",
    headers=headers,
    json=${JSON.stringify(body, null, 4).replace(/"/g, '"')}
)

print(response.json())`;
  } else {
    cmd += `
}

response = requests.${method.toLowerCase()}(
    "${endpoint}",
    headers=headers
)

print(response.json())`;
  }

  return cmd;
}

function formatJavaScriptCommand(
  endpoint: string,
  method: string,
  body: Record<string, any> | null
): string {
  let cmd = `const response = await fetch("${endpoint}", {
  method: "${method}",
  headers: {
    "Authorization": "Bearer YOUR_API_TOKEN"`;

  if (body && Object.keys(body).length > 0) {
    cmd += `,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${JSON.stringify(body, null, 4)})
});

const data = await response.json();
console.log(data);`;
  } else {
    cmd += `
  }
});

const data = await response.json();
console.log(data);`;
  }

  return cmd;
}

// ============================================================================
// Formatting for LLM
// ============================================================================

export function formatCommandForLLM(result: GeneratedCommand): string {
  let output = `## ${result.description}\n\n`;
  output += `**Method:** ${result.method}\n`;
  output += `**Endpoint:** ${result.endpoint}\n\n`;
  output += `### ${result.format.toUpperCase()} Command\n\n`;
  output += '```' + (result.format === 'curl' ? 'bash' : result.format) + '\n';
  output += result.command;
  output += '\n```\n';

  if (result.warnings.length > 0) {
    output += '\n**Notes:**\n';
    result.warnings.forEach(w => {
      output += `- ⚠️ ${w}\n`;
    });
  }

  return output;
}

export function formatScriptForLLM(result: GeneratedScript): string {
  let output = `## ${result.description}\n\n`;
  output += `**Targets:** ${result.targetCount} items\n`;
  output += `**Format:** ${result.format}\n\n`;
  output += `### Script\n\n`;
  output += '```' + result.format + '\n';
  output += result.script;
  output += '\n```\n';

  if (result.warnings.length > 0) {
    output += '\n**Important:**\n';
    result.warnings.forEach(w => {
      output += `- ⚠️ ${w}\n`;
    });
  }

  return output;
}

// ============================================================================
// Types
// ============================================================================

export interface GeneratedCommand {
  action: CommandAction;
  method: string;
  endpoint: string;
  description: string;
  command: string;
  format: CommandFormat;
  warnings: string[];
}

export interface GeneratedScript {
  action: string;
  targetCount: number;
  description: string;
  script: string;
  format: 'powershell' | 'python' | 'bash';
  warnings: string[];
}
