# Helios Developer Console CLI Commands

## Overview

The Helios Developer Console provides a powerful command-line interface for managing Google Workspace resources, users, groups, and more.

## Command Structure

```
helios <module> <resource> <action> [options]
```

## Available Modules

### 1. Google Workspace (`gw`)

Full Google Workspace management via Domain-Wide Delegation.

#### Users

```bash
# List users
helios gw users list [--max=100] [--ou=/Staff]

# Get user details
helios gw users get <email>

# Create user
helios gw users create <email> --firstName=<name> --lastName=<name> --password=<pwd> [--ou=/Staff]

# Update user
helios gw users update <email> --firstName=<name> --lastName=<name>

# Suspend user
helios gw users suspend <email>

# Restore user
helios gw users restore <email>

# Delete user (permanent)
helios gw users delete <email>

# Move user to OU
helios gw users move <email> --ou=/Staff/Sales

# Get user's groups
helios gw users groups <email>
```

#### Groups

```bash
# List groups
helios gw groups list [--max=100]

# Get group details
helios gw groups get <group-email>

# Create group
helios gw groups create <email> --name="Group Name" [--description="Description"]

# Update group
helios gw groups update <group-email> --name="New Name" [--description="New Description"]

# Delete group
helios gw groups delete <group-email>

# List group members
helios gw groups members <group-email>

# Add member to group
helios gw groups add-member <group-email> <user-email> [--role=MEMBER|MANAGER|OWNER]

# Remove member from group
helios gw groups remove-member <group-email> <user-email>
```

#### Organizational Units

```bash
# List OUs
helios gw orgunits list

# Get OU details
helios gw orgunits get </Staff/Sales>

# Create OU
helios gw orgunits create <path> --name="Sales" [--description="Sales Team"]

# Update OU
helios gw orgunits update </Staff/Sales> --name="New Name"

# Delete OU
helios gw orgunits delete </Staff/Sales>
```

#### Email Delegation

```bash
# List delegates for a user
helios gw delegates list <user-email>

# Add delegate
helios gw delegates add <user-email> <delegate-email>

# Remove delegate
helios gw delegates remove <user-email> <delegate-email>
```

#### Sync Operations

```bash
# Manual sync users
helios gw sync users

# Manual sync groups
helios gw sync groups

# Manual sync OUs
helios gw sync orgunits

# Sync all
helios gw sync all
```

### 2. Helios Users (`users`)

Manage Helios platform users (local database).

```bash
# List all users
helios users list [--status=active|staged|suspended|deleted] [--type=staff|guest|contact]

# Get user details
helios users get <user-id>

# Update user
helios users update <user-id> --field=value

# Change user status
helios users status <user-id> <active|staged|suspended|deleted>

# Debug user data
helios users debug
```

### 3. Helios Groups (`groups`)

Manage Helios access groups (local database).

```bash
# List groups
helios groups list

# Get group details
helios groups get <group-id>

# Create group
helios groups create --name="Group Name" --description="Description"

# Update group
helios groups update <group-id> --name="New Name"

# Delete group
helios groups delete <group-id>

# List members
helios groups members <group-id>

# Add member
helios groups add-member <group-id> <user-id>

# Remove member
helios groups remove-member <group-id> <user-id>
```

### 4. Direct API Access (`api`)

Make direct REST API calls to any Helios endpoint.

```bash
# GET request
helios api GET /api/organization/users

# POST request
helios api POST /api/google-workspace/sync-now '{"organizationId":"..."}'

# PATCH request
helios api PATCH /api/organization/users/123 '{"firstName":"John"}'

# DELETE request
helios api DELETE /api/organization/users/123
```

### 5. Transparent Proxy

Access ANY Google Workspace API directly through Helios proxy (with audit logging and sync).

```bash
# Create user via proxy
helios api POST /api/google/admin/directory/v1/users '{"primaryEmail":"user@company.com","name":{"givenName":"John","familyName":"Doe"},"password":"TempPass123!"}'

# List calendar resources
helios api GET /api/google/admin/directory/v1/customer/my_customer/resources/calendars

# Update group settings
helios api PATCH /api/google/admin/directory/v1/groups/group@company.com '{"name":"New Group Name"}'
```

## Advanced Features

### Variable Assignment (Planned)

```bash
# Save output to variable
$users = helios gw users list

# Use variable in another command
helios gw groups create sales@company.com --name="Sales Team"
$groupId = $result.data.id

# Add users from variable
foreach ($user in $users) {
  helios gw groups add-member $groupId $user.email
}
```

### Command Piping (Planned)

```bash
# Pipe output to filter
helios gw users list | grep "@sales"

# Chain commands
helios gw users list --ou=/Staff/Sales | helios gw groups add-member sales@company.com

# Export to file
helios gw users list > users.json
```

### Batch Operations (Planned)

```bash
# Run multiple commands from file
helios batch run commands.txt

# Template-based bulk operations
helios batch create-users users.csv
```

## Help Commands

```bash
# General help
help

# Module-specific help
helios gw --help

# Resource-specific help
helios gw users --help

# Command-specific help
helios gw users create --help

# Show examples
examples

# Clear console
clear
```

## Output Formats

Default: Table format
```bash
EMAIL                         FIRST NAME     LAST NAME      STATUS
============================================================================
john@company.com              John           Doe            active
jane@company.com              Jane           Smith          active
```

JSON format (via --json flag):
```bash
helios gw users list --json
```

CSV format (via --csv flag):
```bash
helios gw users list --csv > users.csv
```

## Error Handling

All commands return:
- Exit code 0 on success
- Exit code 1 on error
- Detailed error messages with troubleshooting hints

```bash
Error: User not found
Suggestion: Check the email address and ensure the user exists in Google Workspace.
```

## Authentication

All commands use the current user's JWT token from localStorage.
API Key authentication is also supported via the transparent proxy.

## Rate Limiting

Commands respect Google Workspace API rate limits:
- Automatic retry with exponential backoff
- Progress indicators for long-running operations
- Batch operations are automatically throttled

## Audit Logging

All commands are automatically logged to:
- Activity logs table (UI: Settings > Audit Logs)
- Actor attribution (user/service/vendor)
- Full request/response capture

## Best Practices

1. **Test first**: Use `--dry-run` flag to preview changes
2. **Backup**: Export data before bulk operations
3. **Incremental**: Make changes in small batches
4. **Verify**: Check results with `list` commands
5. **Monitor**: Review audit logs for errors

## Examples

See detailed examples with: `examples` command

## Future Enhancements

- [ ] Variable assignment ($users = ...)
- [ ] Command piping (| grep, > file)
- [ ] Batch operations from CSV
- [ ] Interactive mode (autocomplete)
- [ ] Script execution (.helios files)
- [ ] Output formatting (--json, --csv, --table)
- [ ] Progress bars for long operations
- [ ] Dry-run mode (--dry-run)
- [ ] Transaction support (rollback)
- [ ] Scheduled command execution
