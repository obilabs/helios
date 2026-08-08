# Admin Platform Enhancements - Technical Specifications

## Overview

This document contains the technical specifications for all features in this proposal.

---

## Spec 1: Feature Flags System

### Requirement: Database-Driven Feature Flags

The system SHALL provide a feature flag system to manage incomplete features.

#### Database Schema

```sql
-- Simple feature flags for single-tenant installation
-- No organization_id needed - Helios Client is one org per install
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(100) NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',  -- For status notes like {"status": "partial", "todo": [...]}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feature_flags_key ON feature_flags(feature_key);
```

#### Default Feature Flags

```sql
-- Simple inserts - no organization_id for single-tenant
INSERT INTO feature_flags (feature_key, enabled, metadata) VALUES
-- Automation features
('automation.offboarding_templates', true, '{"status": "complete"}'),
('automation.offboarding_execution', false, '{"status": "partial", "todo": ["drive_transfer", "email_forwarding"]}'),
('automation.onboarding_templates', true, '{"status": "complete"}'),
('automation.onboarding_execution', false, '{"status": "partial"}'),
('automation.scheduled_actions', true, '{"status": "partial"}'),
('automation.workflows', false, '{"status": "not_started"}'),

-- Console features
('console.pop_out', false, '{"status": "not_started"}'),
('console.pinnable_help', false, '{"status": "not_started"}'),
('console.command_audit', false, '{"status": "not_started"}'),

-- Premium features
('email_archive', false, '{"status": "not_started"}'),
('microsoft_365_relay', false, '{"status": "not_started"}'),

-- Users page
('users.export', false, '{"status": "not_started"}'),
('users.platform_filter', false, '{"status": "not_started"}');
```

#### Backend Service

```typescript
// backend/src/services/feature-flags.service.ts
// Simple single-tenant feature flags - no organization context needed

interface FeatureFlag {
  featureKey: string;
  enabled: boolean;
  metadata: Record<string, any>;
}

class FeatureFlagsService {
  // Simple check - is this feature enabled?
  async isEnabled(featureKey: string): Promise<boolean> {
    const flag = await this.getFlag(featureKey);
    return flag?.enabled ?? false;
  }

  async getFlag(featureKey: string): Promise<FeatureFlag | null> {
    const result = await db.query(
      `SELECT feature_key, enabled, metadata
       FROM feature_flags
       WHERE feature_key = $1`,
      [featureKey]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async getAllFlags(): Promise<FeatureFlag[]> {
    const result = await db.query(
      `SELECT feature_key, enabled, metadata
       FROM feature_flags
       ORDER BY feature_key`
    );

    return result.rows.map(this.mapRow);
  }

  async setFlag(
    featureKey: string,
    enabled: boolean,
    metadata?: Record<string, any>
  ): Promise<void> {
    await db.query(
      `INSERT INTO feature_flags (feature_key, enabled, metadata)
       VALUES ($1, $2, COALESCE($3, '{}'))
       ON CONFLICT (feature_key)
       DO UPDATE SET enabled = $2, metadata = COALESCE($3, feature_flags.metadata), updated_at = NOW()`,
      [featureKey, enabled, metadata ? JSON.stringify(metadata) : null]
    );
  }

  private mapRow(row: any): FeatureFlag {
    return {
      featureKey: row.feature_key,
      enabled: row.enabled,
      metadata: row.metadata || {},
    };
  }
}

export const featureFlagsService = new FeatureFlagsService();
```

#### Frontend Hook

```typescript
// frontend/src/hooks/useFeatureFlags.ts

import { createContext, useContext, useEffect, useState } from 'react';

interface FeatureFlagsContextType {
  isEnabled: (featureKey: string) => boolean;
  flags: Record<string, boolean>;
  loading: boolean;
}

export const FeatureFlagsContext = createContext<FeatureFlagsContextType>({
  isEnabled: () => false,
  flags: {},
  loading: true,
});

export const useFeatureFlags = () => useContext(FeatureFlagsContext);

// Usage in components:
const { isEnabled } = useFeatureFlags();

{isEnabled('automation.workflows') && (
  <button onClick={() => onNavigate('workflows')}>
    Workflows
  </button>
)}
```

#### API Endpoint

```
GET /api/v1/organization/feature-flags
  - Returns all flags for current organization

PUT /api/v1/organization/feature-flags/:key
  - Admin only: Update flag for this organization
```

---

## Spec 2: Delegate Validation

### Requirement: Validate Delegate Before Assignment

The system SHALL validate that a delegate target is valid before allowing delegation.

#### Validation Rules

```typescript
interface DelegateValidationResult {
  valid: boolean;
  status: 'valid' | 'invalid' | 'warning';
  errors: string[];
  warnings: string[];
  user?: {
    email: string;
    name: string;
    suspended: boolean;
    archived: boolean;
    existsInHelios: boolean;
  };
}

async function validateDelegate(
  organizationId: string,
  targetEmail: string
): Promise<DelegateValidationResult> {
  const result: DelegateValidationResult = {
    valid: true,
    status: 'valid',
    errors: [],
    warnings: [],
  };

  // 1. Check Google Workspace
  const gwUser = await googleAdmin.users.get({ userKey: targetEmail });

  if (!gwUser) {
    result.valid = false;
    result.status = 'invalid';
    result.errors.push('User not found in Google Workspace');
    return result;
  }

  // 2. Check not suspended
  if (gwUser.suspended) {
    result.valid = false;
    result.status = 'invalid';
    result.errors.push('Cannot delegate to a suspended user');
    return result;
  }

  // 3. Check not archived
  if (gwUser.archived) {
    result.valid = false;
    result.status = 'invalid';
    result.errors.push('Cannot delegate to an archived user');
    return result;
  }

  // 4. Check not pending deletion
  if (gwUser.deletionTime) {
    result.valid = false;
    result.status = 'invalid';
    result.errors.push('Cannot delegate to a user pending deletion');
    return result;
  }

  // 5. Check Helios sync status (warning only)
  const heliosUser = await db.query(
    'SELECT id FROM organization_users WHERE email = $1 AND organization_id = $2',
    [targetEmail, organizationId]
  );

  if (heliosUser.rows.length === 0) {
    result.status = 'warning';
    result.warnings.push('User exists in Google but not synced to Helios');
  }

  result.user = {
    email: targetEmail,
    name: `${gwUser.name?.givenName} ${gwUser.name?.familyName}`,
    suspended: gwUser.suspended || false,
    archived: gwUser.archived || false,
    existsInHelios: heliosUser.rows.length > 0,
  };

  return result;
}
```

#### API Endpoint

```
GET /api/v1/organization/users/validate-delegate?email=<email>

Response:
{
  "success": true,
  "data": {
    "valid": true,
    "status": "valid",
    "errors": [],
    "warnings": [],
    "user": {
      "email": "sarah@company.com",
      "name": "Sarah Jones",
      "suspended": false,
      "archived": false,
      "existsInHelios": true
    }
  }
}
```

---

## Spec 3: Data Transfer API

### Requirement: Transfer Drive and Calendar Data

The system SHALL support transferring Drive and Calendar data during offboarding.

#### Google Data Transfer API Integration

```typescript
// backend/src/services/google-transfer.service.ts

interface TransferRequest {
  fromUserId: string;
  toUserId: string;
  applications: ('drive' | 'calendar')[];
}

interface TransferStatus {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  applicationStatus: {
    application: string;
    status: string;
    bytesTransferred?: number;
  }[];
}

class GoogleTransferService {
  private readonly APPLICATION_IDS = {
    drive: '55656082996',      // Google Drive
    calendar: '435070579839',  // Google Calendar
  };

  async initiateTransfer(
    organizationId: string,
    request: TransferRequest
  ): Promise<TransferStatus> {
    const credentials = await this.getCredentials(organizationId);
    const adminEmail = await this.getAdminEmail(organizationId);

    const client = this.createTransferClient(credentials, adminEmail);

    const response = await client.transfers.insert({
      requestBody: {
        oldOwnerUserId: request.fromUserId,
        newOwnerUserId: request.toUserId,
        applicationDataTransfers: request.applications.map(app => ({
          applicationId: this.APPLICATION_IDS[app],
          applicationTransferParams: [],
        })),
      },
    });

    return this.mapTransferResponse(response.data);
  }

  async getTransferStatus(
    organizationId: string,
    transferId: string
  ): Promise<TransferStatus> {
    const credentials = await this.getCredentials(organizationId);
    const adminEmail = await this.getAdminEmail(organizationId);

    const client = this.createTransferClient(credentials, adminEmail);

    const response = await client.transfers.get({
      dataTransferId: transferId,
    });

    return this.mapTransferResponse(response.data);
  }
}
```

#### API Endpoints

```
POST /api/v1/organization/users/:id/transfer
{
  "toUserId": "uuid",
  "applications": ["drive", "calendar"]
}

GET /api/v1/organization/users/:id/transfer/:transferId/status
```

---

## Spec 4: Actor Attribution in Audit Logs

### Requirement: Track All Actor Types

The system SHALL clearly identify who performed each action, supporting three actor types:

#### Actor Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| **internal** | Organization's own users | user_id, email, role |
| **service** | Automated applications/scripts | api_key_id, app_name, owner |
| **vendor** | External MSP/consultant | api_key_id, vendor_name, technician_name, technician_email, ticket_number |

#### Unified Audit Log Entry

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: Date;

  // What happened
  action: string;              // 'user_suspended', 'group_created', etc.
  resource_type: string;       // 'user', 'group', 'console', etc.
  resource_id?: string;
  description: string;
  result: 'success' | 'failure' | 'denied';

  // Who did it - CRITICAL for traceability
  actor_type: 'internal' | 'service' | 'vendor';

  // For internal users
  actor_user_id?: string;
  actor_email?: string;
  actor_role?: string;

  // For API key access (service or vendor)
  api_key_id?: string;
  api_key_name?: string;

  // For service applications
  service_name?: string;
  service_owner?: string;

  // For vendor access - WHO at the vendor performed action
  vendor_name?: string;
  vendor_technician_name?: string;
  vendor_technician_email?: string;
  ticket_reference?: string;  // Nullable - required for vendor, optional for others

  // Context
  ip_address: string;
  user_agent?: string;
  request_duration_ms?: number;
  metadata?: Record<string, any>;
}
```

#### Database Schema Update

```sql
-- Ensure activity_logs table has all actor fields
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS actor_type VARCHAR(20);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_technician_name VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_technician_email VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ticket_reference VARCHAR(100);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS service_name VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS result VARCHAR(20);

-- Index for filtering by actor type
CREATE INDEX idx_activity_logs_actor_type ON activity_logs(actor_type);
CREATE INDEX idx_activity_logs_vendor ON activity_logs(vendor_name) WHERE vendor_name IS NOT NULL;
```

#### Example Log Entries

**Internal User Action:**
```json
{
  "action": "user_suspended",
  "resource_type": "user",
  "resource_id": "john@company.com",
  "actor_type": "internal",
  "actor_user_id": "uuid-123",
  "actor_email": "admin@company.com",
  "actor_role": "admin",
  "result": "success"
}
```

**Service/Application Action:**
```json
{
  "action": "sync_completed",
  "resource_type": "google_workspace",
  "actor_type": "service",
  "api_key_id": "uuid-456",
  "api_key_name": "Backup Automation",
  "service_name": "nightly-backup-job",
  "service_owner": "devops@company.com",
  "result": "success"
}
```

**Vendor Action:**
```json
{
  "action": "user_password_reset",
  "resource_type": "user",
  "resource_id": "john@company.com",
  "actor_type": "vendor",
  "api_key_id": "uuid-789",
  "api_key_name": "Acme MSP Production",
  "vendor_name": "Acme MSP Solutions",
  "vendor_technician_name": "Mike Smith",
  "vendor_technician_email": "mike@acme-msp.com",
  "ticket_reference": "INC-2024-1234",
  "result": "success"
}
```

#### API Key Header Requirements

Vendor API keys MUST include actor attribution headers:

```http
POST /api/google/admin/directory/v1/users/john@company.com
Authorization: Bearer helios_vendor_a8k3...
X-Actor-Name: Mike Smith
X-Actor-Email: mike@acme-msp.com
X-Ticket-Reference: INC-2024-1234
```

If `requireActorAttribution` is enabled for the vendor API key and headers are missing, the request should be rejected with 400 Bad Request.

#### Audit Log Viewer Filters

The UI should support filtering by:
- Actor type (internal / service / vendor)
- Specific vendor name
- Specific technician
- Ticket reference
- Date range
- Action type
- Result (success / failure)

---

## Spec 5: Console Command Audit Logging

### Requirement: Log All Console Commands

The system SHALL log all Developer Console commands to the audit trail.

#### Audit Log Entry Format

```typescript
interface ConsoleAuditEntry {
  action: 'console_command_executed';
  resource_type: 'developer_console';
  description: string;  // The command executed
  metadata: {
    command: string;
    duration_ms: number;
    result_status: 'success' | 'error';
    result_count?: number;
    error_message?: string;
  };
}
```

#### Frontend Integration

```typescript
// In DeveloperConsole.tsx executeCommand()

const startTime = Date.now();
try {
  const result = await executeCommand(command);

  // Log success
  await fetch('/api/v1/organization/audit-logs', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'console_command_executed',
      resource_type: 'developer_console',
      description: command,
      metadata: {
        command,
        duration_ms: Date.now() - startTime,
        result_status: 'success',
        result_count: Array.isArray(result) ? result.length : 1,
      },
    }),
  });
} catch (error) {
  // Log error
  await fetch('/api/v1/organization/audit-logs', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'console_command_executed',
      resource_type: 'developer_console',
      description: command,
      metadata: {
        command,
        duration_ms: Date.now() - startTime,
        result_status: 'error',
        error_message: error.message,
      },
    }),
  });
}
```

---

## Spec 5: Pinnable Help Panel

### Requirement: Dockable Command Reference Panel

The system SHALL provide a dockable help panel in the Developer Console.

#### State Management

```typescript
interface HelpPanelState {
  isOpen: boolean;
  dockPosition: 'left' | 'right' | 'modal';
  activeTab: 'commands' | 'examples';
  searchQuery: string;
  width: number;  // For resizable panel
}

// Persist to localStorage
const STORAGE_KEY = 'helios_console_help_panel';

const defaultState: HelpPanelState = {
  isOpen: false,
  dockPosition: 'right',
  activeTab: 'commands',
  searchQuery: '',
  width: 320,
};
```

#### Component Structure

```tsx
// frontend/src/components/ConsoleHelpPanel.tsx

interface ConsoleHelpPanelProps {
  isOpen: boolean;
  dockPosition: 'left' | 'right' | 'modal';
  onClose: () => void;
  onDockChange: (position: 'left' | 'right' | 'modal') => void;
  onInsertCommand: (command: string) => void;
}

const ConsoleHelpPanel: React.FC<ConsoleHelpPanelProps> = ({
  isOpen,
  dockPosition,
  onClose,
  onDockChange,
  onInsertCommand,
}) => {
  const [activeTab, setActiveTab] = useState<'commands' | 'examples'>('commands');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    return COMMANDS.filter(cmd =>
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className={`help-panel help-panel--${dockPosition}`}>
      <div className="help-panel__header">
        <div className="help-panel__tabs">
          <button
            className={activeTab === 'commands' ? 'active' : ''}
            onClick={() => setActiveTab('commands')}
          >
            Commands
          </button>
          <button
            className={activeTab === 'examples' ? 'active' : ''}
            onClick={() => setActiveTab('examples')}
          >
            Examples
          </button>
        </div>
        <div className="help-panel__dock-buttons">
          <button onClick={() => onDockChange('left')} title="Dock Left">
            <PanelLeft size={14} />
          </button>
          <button onClick={() => onDockChange('right')} title="Dock Right">
            <PanelRight size={14} />
          </button>
          <button onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="help-panel__search">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search commands..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="help-panel__content">
        {filteredCommands.map(cmd => (
          <div key={cmd.command} className="command-item">
            <code>{cmd.command}</code>
            <p>{cmd.description}</p>
            <button onClick={() => onInsertCommand(cmd.template)}>
              Insert
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## Spec 6: Users Page Export

### Requirement: Export Users to CSV/JSON

The system SHALL allow exporting the current user list.

#### API Endpoint

```
GET /api/v1/organization/users/export?format=csv&platform=google_workspace&status=active

Response Headers:
  Content-Type: text/csv (or application/json)
  Content-Disposition: attachment; filename="users-2025-12-14.csv"

CSV Format:
  email,first_name,last_name,department,role,status,platform,last_login
  alice@company.com,Alice,Smith,Engineering,admin,active,google_workspace,2025-12-13T10:00:00Z
```

#### Backend Implementation

```typescript
router.get('/users/export', authenticateToken, async (req, res) => {
  const { format = 'csv', platform, status, search } = req.query;
  const organizationId = req.user?.organizationId;

  // Build query with filters
  let query = `
    SELECT email, first_name, last_name, department, role, user_status,
           source_platform, last_login_at
    FROM organization_users
    WHERE organization_id = $1
  `;
  const values: any[] = [organizationId];

  if (platform) {
    values.push(platform);
    query += ` AND source_platform = $${values.length}`;
  }
  if (status) {
    values.push(status);
    query += ` AND user_status = $${values.length}`;
  }

  query += ` ORDER BY email`;

  const result = await db.query(query, values);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().split('T')[0]}.json"`);
    return res.json(result.rows);
  }

  // CSV format
  const csv = convertToCSV(result.rows, [
    'email', 'first_name', 'last_name', 'department',
    'role', 'user_status', 'source_platform', 'last_login_at'
  ]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});
```

---

## Spec 7: Platform Filter

### Requirement: Filter Users by Platform

The system SHALL allow filtering users by source platform.

#### Filter Options

```typescript
type PlatformFilter =
  | 'all'
  | 'local'           // Created in Helios only
  | 'google_workspace'
  | 'microsoft_365';
```

#### API Query Parameter

```
GET /api/v1/organization/users?platform=google_workspace

Backend logic:
- 'all': No filter
- 'local': WHERE source_platform = 'local' OR google_workspace_id IS NULL
- 'google_workspace': WHERE google_workspace_id IS NOT NULL
- 'microsoft_365': WHERE microsoft_365_id IS NOT NULL
```

---

## Spec 8: Email Archive (Strategic)

### Requirement: Archive Mailboxes to Helios

The system SHALL support archiving email to Helios storage for viewing after user deletion.

#### Database Schema

```sql
CREATE TABLE email_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  original_email VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),

  archive_status VARCHAR(50) DEFAULT 'pending',
  storage_path TEXT,
  storage_size_bytes BIGINT,
  message_count INTEGER,

  archived_at TIMESTAMPTZ DEFAULT NOW(),
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT FALSE,
  archived_by UUID REFERENCES organization_users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_archive_delegates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id UUID REFERENCES email_archives(id) ON DELETE CASCADE,
  delegate_user_id UUID REFERENCES organization_users(id),
  access_level VARCHAR(50) DEFAULT 'read',
  granted_by UUID REFERENCES organization_users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(archive_id, delegate_user_id)
);

CREATE TABLE email_archive_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id UUID REFERENCES email_archives(id),
  accessed_by UUID REFERENCES organization_users(id),
  action VARCHAR(50) NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Migration Order

1. `045_create_feature_flags.sql` - Feature flags table
2. `046_add_user_export_fields.sql` - Any missing export fields
3. `047_create_email_archives.sql` - Email archive tables (if implementing)

---

## Testing Requirements

### Unit Tests

```typescript
describe('FeatureFlagsService', () => {
  it('should return global default when no org override', async () => {
    await featureFlagsService.setFlag(null, 'test.feature', true);
    const result = await featureFlagsService.isEnabled('org-123', 'test.feature');
    expect(result).toBe(true);
  });

  it('should return org override when present', async () => {
    await featureFlagsService.setFlag(null, 'test.feature', true);
    await featureFlagsService.setFlag('org-123', 'test.feature', false);
    const result = await featureFlagsService.isEnabled('org-123', 'test.feature');
    expect(result).toBe(false);
  });
});

describe('DelegateValidation', () => {
  it('should reject suspended users', async () => {
    const result = await validateDelegate('org-123', 'suspended@company.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Cannot delegate to a suspended user');
  });
});
```

### E2E Tests

```typescript
test('Offboarding wizard validates delegates', async ({ page }) => {
  await page.goto('/users');
  await page.click('[data-testid="user-row-john"]');
  await page.click('[data-testid="offboard-button"]');

  // Enter suspended user as delegate
  await page.fill('[data-testid="delegate-email"]', 'suspended@company.com');
  await page.click('[data-testid="validate-delegate"]');

  // Should show error
  await expect(page.locator('.delegate-error')).toContainText('suspended');
});
```
