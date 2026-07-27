# Sync Conflict Resolution System Design

## Overview

This document outlines the architecture for handling bidirectional sync between Helios and external identity providers (Google Workspace, Microsoft 365) with proper conflict resolution, lifecycle management, and audit logging.

## User Questions Addressed

1. **Per-module vs global sync settings?** Per-module, accessible from the Configure popup
2. **User lifecycle management** (deletion/suspension escalation)
3. **Bidirectional sync behavior**
4. **Clear audit logging for external changes**
5. **Same patterns for groups**

---

## 1. Sync Settings Architecture

### Per-Module Configuration (Recommended)

Each integration module stores its own sync settings in `organization_modules.config`:

```typescript
interface ModuleSyncConfig {
  // Sync behavior
  syncDirection: 'inbound_only' | 'outbound_only' | 'bidirectional';
  syncInterval: number; // seconds (min: 300, default: 900, max: 86400)
  autoSync: boolean;

  // Conflict resolution
  conflictResolution: {
    fieldPriority: 'external_wins' | 'helios_wins' | 'most_recent_wins';

    // Per-field overrides (optional)
    fieldOverrides?: {
      firstName?: 'external_wins' | 'helios_wins';
      lastName?: 'external_wins' | 'helios_wins';
      department?: 'external_wins' | 'helios_wins';
      jobTitle?: 'external_wins' | 'helios_wins';
      // ... other fields
    };
  };

  // User lifecycle policies
  userLifecycle: {
    // What happens when user is deleted in external system
    onExternalDelete: 'flag' | 'notify' | 'suspend' | 'delete';

    // What happens when user is suspended in external system
    onExternalSuspend: 'flag' | 'notify' | 'suspend';

    // What happens when user is deleted in Helios (outbound)
    onHeliosDelete: 'keep_external' | 'suspend_external' | 'delete_external';

    // What happens when user is suspended in Helios (outbound)
    onHeliosSuspend: 'keep_external' | 'suspend_external';

    // Notification settings
    notifyAdmins: boolean;
    notifyUserOnSuspend: boolean;
    gracePeriodDays: number; // Days before escalating delete -> actual delete
  };

  // Group sync settings
  groupSync: {
    enabled: boolean;
    syncDirection: 'inbound_only' | 'outbound_only' | 'bidirectional';
    onExternalDelete: 'flag' | 'notify' | 'delete';
    onHeliosDelete: 'keep_external' | 'delete_external';
  };
}
```

### Default Configuration

```typescript
const DEFAULT_SYNC_CONFIG: ModuleSyncConfig = {
  syncDirection: 'bidirectional',
  syncInterval: 900, // 15 minutes
  autoSync: true,

  conflictResolution: {
    fieldPriority: 'external_wins', // Safe default - external is source of truth
    fieldOverrides: {}
  },

  userLifecycle: {
    onExternalDelete: 'suspend', // Safe - don't auto-delete, admin can review
    onExternalSuspend: 'suspend',
    onHeliosDelete: 'suspend_external', // Safe - suspend rather than delete
    onHeliosSuspend: 'suspend_external',
    notifyAdmins: true,
    notifyUserOnSuspend: false,
    gracePeriodDays: 7
  },

  groupSync: {
    enabled: true,
    syncDirection: 'bidirectional',
    onExternalDelete: 'flag',
    onHeliosDelete: 'keep_external'
  }
};
```

---

## 2. User Lifecycle State Machine

### User Status Progression

```
                External System                    Helios
                     |                               |
    ┌────────────────┼───────────────────────────────┼────────────────┐
    │                │                               │                │
    │   [ACTIVE] ◄───┼─── Sync ────────────────────►│    [ACTIVE]    │
    │                │                               │                │
    │       │        │                               │        │       │
    │       ▼        │                               │        ▼       │
    │  [SUSPENDED]◄──┼─── onExternalSuspend ───────►│  [SUSPENDED]   │
    │                │                               │                │
    │       │        │                               │        │       │
    │       ▼        │                               │        ▼       │
    │   [DELETED] ───┼─── onExternalDelete ────────►│ [FLAGGED] ─────┤
    │                │                               │      │         │
    │                │                               │      ▼         │
    │                │                               │ [SUSPENDED] ───┤
    │                │                               │      │         │
    │                │                               │      ▼         │
    │                │                               │ [DELETED] ─────┤
    │                │                               │                │
    └────────────────┴───────────────────────────────┴────────────────┘
```

### Escalation Policies

| External Action | Helios Response (Configurable) |
|-----------------|-------------------------------|
| User Suspended  | `flag` → `notify` → `suspend` |
| User Deleted    | `flag` → `notify` → `suspend` → `delete` |
| Group Deleted   | `flag` → `notify` → `delete` |

| Helios Action    | External Response (Configurable) |
|------------------|----------------------------------|
| User Suspended   | `keep_external` or `suspend_external` |
| User Deleted     | `keep_external`, `suspend_external`, or `delete_external` |
| Group Deleted    | `keep_external` or `delete_external` |

---

## 3. Audit Logging System

### Sync Event Log Schema

```sql
CREATE TABLE sync_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Event identification
  event_type VARCHAR(50) NOT NULL, -- 'user_created', 'user_updated', 'user_deleted', etc.
  entity_type VARCHAR(50) NOT NULL, -- 'user', 'group', 'ou'
  entity_id UUID, -- Reference to the entity in Helios
  external_entity_id VARCHAR(255), -- ID in external system

  -- Source tracking
  source VARCHAR(50) NOT NULL, -- 'google_workspace', 'microsoft_365', 'helios_admin', 'helios_api'
  initiated_by VARCHAR(255), -- Email of admin or 'system' for auto-sync

  -- Change details
  change_summary TEXT, -- Human-readable summary
  previous_values JSONB, -- What it was before
  new_values JSONB, -- What it is now

  -- Conflict resolution
  conflict_detected BOOLEAN DEFAULT FALSE,
  conflict_resolution VARCHAR(50), -- 'external_wins', 'helios_wins', 'manual'
  conflict_details JSONB,

  -- Status
  status VARCHAR(50) DEFAULT 'completed', -- 'completed', 'pending_review', 'failed'
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sync_events_org ON sync_events(organization_id);
CREATE INDEX idx_sync_events_entity ON sync_events(entity_type, entity_id);
CREATE INDEX idx_sync_events_source ON sync_events(source);
CREATE INDEX idx_sync_events_type ON sync_events(event_type);
CREATE INDEX idx_sync_events_date ON sync_events(created_at);
```

### Event Types

```typescript
enum SyncEventType {
  // User events
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_SUSPENDED = 'user_suspended',
  USER_UNSUSPENDED = 'user_unsuspended',
  USER_DELETED = 'user_deleted',
  USER_RESTORED = 'user_restored',

  // External change detection
  USER_DELETED_EXTERNALLY = 'user_deleted_externally',
  USER_SUSPENDED_EXTERNALLY = 'user_suspended_externally',
  USER_UNSUSPENDED_EXTERNALLY = 'user_unsuspended_externally',

  // Group events
  GROUP_CREATED = 'group_created',
  GROUP_UPDATED = 'group_updated',
  GROUP_DELETED = 'group_deleted',
  GROUP_MEMBER_ADDED = 'group_member_added',
  GROUP_MEMBER_REMOVED = 'group_member_removed',

  // External group changes
  GROUP_DELETED_EXTERNALLY = 'group_deleted_externally',
  GROUP_MEMBER_ADDED_EXTERNALLY = 'group_member_added_externally',
  GROUP_MEMBER_REMOVED_EXTERNALLY = 'group_member_removed_externally',

  // Sync events
  SYNC_STARTED = 'sync_started',
  SYNC_COMPLETED = 'sync_completed',
  SYNC_FAILED = 'sync_failed',

  // Conflict events
  CONFLICT_DETECTED = 'conflict_detected',
  CONFLICT_RESOLVED = 'conflict_resolved'
}
```

### Example Audit Log Entries

**User deleted in Google Workspace:**
```json
{
  "event_type": "user_deleted_externally",
  "entity_type": "user",
  "entity_id": "uuid-of-helios-user",
  "external_entity_id": "google-user-id-123",
  "source": "google_workspace",
  "initiated_by": "system",
  "change_summary": "User john.doe@company.com was deleted in Google Workspace. User suspended in Helios per lifecycle policy.",
  "previous_values": {
    "status": "active",
    "google_workspace_id": "google-user-id-123"
  },
  "new_values": {
    "status": "suspended",
    "google_workspace_id": null,
    "suspension_reason": "external_deletion"
  },
  "conflict_detected": false,
  "status": "completed"
}
```

**Field conflict detected:**
```json
{
  "event_type": "conflict_detected",
  "entity_type": "user",
  "entity_id": "uuid-of-helios-user",
  "source": "google_workspace",
  "change_summary": "Department field conflict: Google says 'Engineering', Helios says 'Product'. Resolved using 'external_wins' policy.",
  "previous_values": {
    "department": "Product"
  },
  "new_values": {
    "department": "Engineering"
  },
  "conflict_detected": true,
  "conflict_resolution": "external_wins",
  "conflict_details": {
    "field": "department",
    "helios_value": "Product",
    "external_value": "Engineering",
    "helios_updated_at": "2025-01-15T10:00:00Z",
    "external_updated_at": "2025-01-15T11:00:00Z"
  }
}
```

---

## 4. UI Integration

### Module Configure Modal - Sync Tab

The Configure popup for each integration (Google Workspace, Microsoft 365) should include a **Sync Settings** tab:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Configure Google Workspace                              [x] Close  │
├─────────────────────────────────────────────────────────────────────┤
│  [Connection] [Sync Settings] [User Lifecycle] [Groups]            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Sync Direction                                                     │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ [●] Bidirectional (recommended)                     │           │
│  │ [ ] Inbound only (Google → Helios)                  │           │
│  │ [ ] Outbound only (Helios → Google)                 │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  Sync Interval                                                      │
│  ┌──────────────────────────────┐                                  │
│  │ Every 15 minutes          ▼ │                                   │
│  └──────────────────────────────┘                                  │
│                                                                     │
│  Conflict Resolution                                                │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ When data conflicts:                                │           │
│  │ [●] External system wins (Google is source of truth)│           │
│  │ [ ] Helios wins (local changes take priority)       │           │
│  │ [ ] Most recent wins (by timestamp)                 │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  [Save Settings]                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### User Lifecycle Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│ Configure Google Workspace                              [x] Close  │
├─────────────────────────────────────────────────────────────────────┤
│  [Connection] [Sync Settings] [User Lifecycle] [Groups]            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  When user is SUSPENDED in Google Workspace:                        │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ [ ] Flag for review only                            │           │
│  │ [ ] Notify admins                                   │           │
│  │ [●] Suspend in Helios (recommended)                 │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  When user is DELETED in Google Workspace:                          │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ [ ] Flag for review only                            │           │
│  │ [ ] Notify admins                                   │           │
│  │ [●] Suspend in Helios (recommended)                 │           │
│  │ [ ] Delete from Helios                              │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  ──────────────────────────────────────────────────────────────    │
│                                                                     │
│  When user is SUSPENDED in Helios:                                  │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ [ ] Keep Google account active                      │           │
│  │ [●] Suspend in Google (recommended)                 │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  When user is DELETED in Helios:                                    │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ [ ] Keep Google account active                      │           │
│  │ [ ] Suspend in Google                               │           │
│  │ [●] Delete from Google (recommended)                │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  [i] Deleting a Google user frees the license immediately.         │
│                                                                     │
│  ☑ Notify admins of lifecycle changes                              │
│  Grace period before deletion: [ 7 ] days                          │
│                                                                     │
│  [Save Settings]                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Audit Log View (Settings > Audit Logs)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Audit Logs                                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Filter: [All Sources ▼] [All Types ▼] [Last 7 days ▼] [Search...] │
│                                                                     │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ 📥 User john.doe@company.com deleted in Google Workspace       │  │
│ │    Action: Suspended in Helios per lifecycle policy            │  │
│ │    Source: Google Workspace • 5 minutes ago • System           │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ ⚠️ Conflict resolved: jane.smith@company.com department        │  │
│ │    Google: "Engineering" → Helios: "Product" (external wins)   │  │
│ │    Source: Google Workspace • 12 minutes ago • System          │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ ✅ Sync completed: 45 users processed, 2 updated, 0 conflicts  │  │
│ │    Duration: 3.2s                                              │  │
│ │    Source: Google Workspace • 15 minutes ago • System          │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ 📤 User bob@company.com suspended by admin                     │  │
│ │    Google Workspace: Suspended (per sync policy)               │  │
│ │    Source: Helios Admin • 1 hour ago • admin@company.com       │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Implementation Phases

### Phase 1: Core Infrastructure (Foundation)
- [ ] Create `sync_events` table migration
- [ ] Implement `SyncEventLogger` service
- [ ] Add event logging to existing sync operations
- [ ] Basic audit log API endpoint

### Phase 2: Lifecycle Management
- [ ] Add `config` field support for sync settings in modules
- [ ] Implement lifecycle policy enforcement in sync service
- [ ] External deletion detection
- [ ] External suspension detection
- [ ] Outbound lifecycle actions (Helios → External)

### Phase 3: UI Integration
- [ ] Module Configure modal - Sync Settings tab
- [ ] Module Configure modal - User Lifecycle tab
- [ ] Audit Logs page in Settings
- [ ] Admin notifications for lifecycle events

### Phase 4: Group Sync
- [ ] Group sync lifecycle policies
- [ ] Group membership change detection
- [ ] Group deletion handling
- [ ] Group audit logging

### Phase 5: Advanced Features
- [ ] Per-field conflict resolution overrides
- [ ] Grace period enforcement
- [ ] Scheduled reports
- [ ] Webhook notifications for external systems

---

## 6. Best Practices Summary

1. **Default to Safe Actions**: Suspend rather than delete, flag rather than suspend
2. **External is Source of Truth**: For most orgs, Google/Microsoft Admin Console is primary
3. **Audit Everything**: Every change should be logged with source, actor, and timestamp
4. **Clear Visual Indicators**: Show when a change came from external source
5. **Admin Notifications**: Alert admins to lifecycle changes they didn't initiate
6. **Grace Periods**: Allow time to reverse accidental deletions
7. **Per-Module Settings**: Each integration can have different policies
