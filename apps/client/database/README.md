# Helios Database

This directory contains the database schema for the Helios Client Portal.

## Quick Start

For fresh installations, use the consolidated schema file:

```bash
# Create the database schema
docker exec helios_client_postgres psql -U postgres -d helios_client -f /path/to/schema_organization.sql
```

Or, the backend will automatically initialize the database on first run.

## Database Architecture

**Single Organization Per Installation:**
- This is a single-tenant client portal
- One `organizations` record per installation
- All tables reference `organization_id` (not `tenant_id`)

## Schema Files

### `schema_organization.sql` (Primary)
- **Complete, consolidated schema** with all 86 tables
- Generated from live production database
- Use this for fresh installations
- Contains all extensions, functions, tables, indexes, triggers, and constraints

### `archived_migrations/` (Historical)
- Previous incremental migration files
- Kept for historical reference only
- **Do not run these** - use the consolidated schema instead

## Key Tables (86 total)

### Core System
- `organizations` - Single organization per installation
- `organization_users` - Users within the organization
- `organization_settings` - Org configuration
- `organization_modules` - Enabled modules

### Authentication (better-auth)
- `auth_sessions` - User sessions
- `auth_accounts` - OAuth/password accounts
- `auth_verifications` - Email/2FA verifications

### User Management
- `user_groups` - Groups/teams
- `user_group_memberships` - User-group relationships
- `departments` - Organizational structure
- `user_sessions` - Legacy sessions

### Google Workspace Integration
- `gw_credentials` - Service account credentials
- `gw_synced_users` - Cached GWS users
- `gw_groups` - Cached GWS groups
- `gw_org_units` - Cached GWS org units

### Microsoft 365 Integration
- `ms_credentials` - OAuth credentials
- `ms_synced_users` - Cached M365 users
- `ms_synced_groups` - Cached M365 groups
- `ms_licenses` - License tracking

### Lifecycle Management
- `onboarding_templates` - Onboarding workflows
- `offboarding_templates` - Offboarding workflows
- `user_requests` - Lifecycle requests queue
- `lifecycle_tasks` - Tasks for onboard/offboard
- `scheduled_user_actions` - Scheduled actions

### Training & Compliance
- `training_content` - Training materials
- `training_quiz_questions` - Quiz questions
- `user_training_progress` - User progress tracking

### Automation
- `automation_rules` - Dynamic rules engine
- `named_conditions` - Reusable conditions
- `rule_evaluation_log` - Rule audit log

### Signatures
- `signature_templates` - Email signature templates
- `signature_campaigns` - Campaign management
- `signature_assignments` - User assignments

### AI Features
- `ai_config` - AI configuration
- `ai_chat_history` - Chat history
- `ai_usage_log` - Usage tracking

## Common Operations

### View Current Schema
```bash
# Full schema export
docker exec helios_client_postgres pg_dump -U postgres -d helios_client --schema-only > export.sql

# List all tables
docker exec helios_client_postgres psql -U postgres -d helios_client -c "\dt"

# Describe a specific table
docker exec helios_client_postgres psql -U postgres -d helios_client -c "\d organization_users"
```

### Making Schema Changes

For development, add changes directly to `schema_organization.sql` and re-export:

```bash
# After making changes, regenerate the schema
docker exec helios_client_postgres pg_dump -U postgres -d helios_client --schema-only --no-owner --no-privileges > schema_organization.sql
```

## Database Connection

Docker Compose configuration:
```yaml
Database: helios_client
User: postgres
Password: postgres
Port: 5432 (host) → 5432 (container)
```

Connection string:
```
postgresql://postgres:postgres@localhost:5432/helios_client
```

## Common Pitfalls

### DON'T
- Create or reference `tenants` table (doesn't exist)
- Use `tenant_id` in new tables (use `organization_id`)
- Run archived migrations on new installations

### DO
- Use `organization_id` for all foreign keys to organizations table
- Use the consolidated `schema_organization.sql` for fresh installations
- Add indexes for all foreign keys
- Use `user_status` not `status` for user status

## Backups

**Development:**
```bash
docker exec helios_client_postgres pg_dump -U postgres -d helios_client > backup.sql
```

**Production:**
Use automated backup solution with retention policy.
