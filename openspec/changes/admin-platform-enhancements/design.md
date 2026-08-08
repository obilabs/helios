# Admin Platform Enhancements - Design Document

## Offboarding Workflow Design

### The License Cost Problem

| User State | Monthly Cost | Data Status |
|------------|--------------|-------------|
| Active | $18-30/user | Full access |
| **Suspended** | **$18-30/user** | Preserved, no access |
| Archived User License | $4-7/user | Preserved in Vault |
| Deleted | $0 | Gone forever |

**Critical insight:** Suspending users does NOT save money. Organizations with 100 suspended users pay $18,000-36,000/year for accounts nobody uses.

**Source:** [GAT Labs](https://gatlabs.com/blogpost/cost-saving-strategies-for-archived-users-au-accounts-in-google-workspace/)

---

## Offboarding Workflow Requirements

### Order of Operations

Data transfer **must** happen before deletion. The workflow enforces this order:

```
1. Access Revocation (immediate)
   ├── Force sign-out all devices
   ├── Reset password
   ├── Revoke OAuth tokens
   └── Remove from groups

2. Data Transfer (required before deletion)
   ├── Drive ownership → Manager or Shared Drive
   ├── Calendar events → Manager or delete
   └── Email handling → Forward, delegate, or archive

3. Account Disposition (after transfer complete)
   ├── Suspend (30 days default)
   ├── Convert to AU license
   └── Schedule deletion
```

### Safety Validations

The system MUST prevent known error conditions:

```typescript
interface DelegateValidation {
  targetEmail: string;
  checks: {
    userExists: boolean;
    notSuspended: boolean;
    notArchived: boolean;
    notPendingDeletion: boolean;
    hasActiveSession: boolean;
    existsInHelios: boolean;
  };
  result: 'valid' | 'invalid' | 'warning';
  message?: string;
}

// Validation rules:
const validateDelegate = async (email: string): Promise<DelegateValidation> => {
  const gwUser = await googleAdmin.users.get({ userKey: email });

  if (!gwUser) {
    return { result: 'invalid', message: 'User not found in Google Workspace' };
  }

  if (gwUser.suspended) {
    return { result: 'invalid', message: 'Cannot delegate to suspended user' };
  }

  if (gwUser.archived) {
    return { result: 'invalid', message: 'Cannot delegate to archived user' };
  }

  if (gwUser.deletionTime) {
    return { result: 'invalid', message: 'Cannot delegate to user pending deletion' };
  }

  const heliosUser = await db.query(
    'SELECT id FROM organization_users WHERE email = $1',
    [email]
  );

  if (!heliosUser) {
    return {
      result: 'warning',
      message: 'User exists in Google but not synced to Helios'
    };
  }

  return { result: 'valid' };
};
```

### Transfer Options

#### Drive Transfer

```typescript
interface DriveTransferOptions {
  targetType: 'user' | 'shared_drive';
  targetId: string;

  // What to transfer
  includeMyDrive: boolean;
  includeSharedWithMe: boolean; // Ownership only, not shared items

  // Conflict handling
  onDuplicate: 'skip' | 'rename' | 'replace';

  // Progress tracking
  estimatedFiles: number;
  estimatedSize: string;
}

// API: POST /api/google/admin/datatransfer/v1/transfers
const initiateTransfer = async (
  fromUserId: string,
  toUserId: string,
  applications: ('drive' | 'calendar')[]
) => {
  return fetch('/api/google/admin/datatransfer/v1/transfers', {
    method: 'POST',
    body: JSON.stringify({
      oldOwnerUserId: fromUserId,
      newOwnerUserId: toUserId,
      applicationDataTransfers: applications.map(app => ({
        applicationId: APPLICATION_IDS[app],
        applicationTransferParams: []
      }))
    })
  });
};
```

#### Email Handling Options

```typescript
interface EmailHandlingOptions {
  // For incoming email after offboarding
  incomingEmail:
    | { action: 'bounce'; autoReplyMessage?: string }
    | { action: 'forward'; targetEmail: string }
    | { action: 'forward_to_group'; groupEmail: string };

  // For existing email access
  existingEmail:
    | { action: 'delegate'; delegates: string[] }  // Max 25 delegates
    | { action: 'archive_to_helios' }              // Premium feature
    | { action: 'export_mbox'; notifyEmail: string }
    | { action: 'no_access' };

  // Validation
  delegatesValidated: boolean;
  delegateValidationResults: DelegateValidation[];
}
```

---

## Email Archive Feature (Strategic)

### Value Proposition

**Without Helios Archive:**
- Keep user on AU license: $4-7/month × 12 = $48-84/year per user
- 100 departed employees = $4,800-8,400/year

**With Helios Archive:**
- S3 Standard: ~$0.12/month per 5GB mailbox
- 100 departed employees × 5GB = $12/year total storage
- **Savings: 99.7%**

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Email Archive System                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌────────────────┐    ┌──────────────────────────┐ │
│  │ Google       │    │ Archive        │    │ Object Storage           │ │
│  │ Takeout API  │───▶│ Processor      │───▶│ (S3/GCS)                 │ │
│  │ (MBOX)       │    │ Service        │    │                          │ │
│  └──────────────┘    └───────┬────────┘    │ ┌─────────────────────┐  │ │
│                              │             │ │ /archives/          │  │ │
│                              │             │ │   /{org_id}/        │  │ │
│                              │             │ │     /{user_id}/     │  │ │
│                              │             │ │       messages.mbox │  │ │
│                              │             │ │       metadata.json │  │ │
│                              ▼             │ └─────────────────────┘  │ │
│                     ┌────────────────┐     └──────────────────────────┘ │
│                     │ Search Index   │                                   │
│                     │ (Elasticsearch)│                                   │
│                     │                │                                   │
│                     │ - sender       │                                   │
│                     │ - recipient    │                                   │
│                     │ - subject      │                                   │
│                     │ - body_text    │                                   │
│                     │ - date         │                                   │
│                     │ - attachments  │                                   │
│                     └───────┬────────┘                                   │
│                             │                                            │
│                             ▼                                            │
│                     ┌────────────────┐                                   │
│                     │ Archive Viewer │                                   │
│                     │ (Frontend)     │                                   │
│                     │                │                                   │
│                     │ - Search       │                                   │
│                     │ - Browse       │                                   │
│                     │ - Read         │                                   │
│                     │ - Export       │                                   │
│                     └────────────────┘                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Email archive metadata
CREATE TABLE email_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES organization_users(id),

  -- Original user info (preserved after deletion)
  original_email VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),

  -- Archive details
  archive_status VARCHAR(50) DEFAULT 'pending',
  -- pending, processing, completed, failed

  storage_path TEXT,  -- S3 key
  storage_size_bytes BIGINT,
  message_count INTEGER,

  -- Retention
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT FALSE,

  -- Audit
  archived_by UUID REFERENCES organization_users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Archive access delegation
CREATE TABLE email_archive_delegates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id UUID REFERENCES email_archives(id),
  delegate_user_id UUID REFERENCES organization_users(id),

  access_level VARCHAR(50) DEFAULT 'read',
  -- read, export, admin

  granted_by UUID REFERENCES organization_users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(archive_id, delegate_user_id)
);

-- Archive access audit log
CREATE TABLE email_archive_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id UUID REFERENCES email_archives(id),
  accessed_by UUID REFERENCES organization_users(id),

  action VARCHAR(50) NOT NULL,
  -- search, view_message, export, download_attachment

  details JSONB,
  -- { messageId, searchQuery, exportFormat, etc. }

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for search
CREATE INDEX idx_email_archives_org ON email_archives(organization_id);
CREATE INDEX idx_email_archives_email ON email_archives(original_email);
CREATE INDEX idx_archive_delegates_user ON email_archive_delegates(delegate_user_id);
```

### Archive Viewer UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Archived Mailbox: john.smith@company.com                    [Export ▼]  │
│ Archived: Dec 1, 2025 • 2,847 messages • 4.2 GB                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌─ Search ─────────────────────────────────────────────────────────────┐│
│ │ [                                            ] [Search]              ││
│ │ From: [          ] To: [          ] Date: [       ] - [       ]      ││
│ └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│ ┌─ Folders ───────┐ ┌─ Messages ────────────────────────────────────────┐│
│ │                 │ │                                                   ││
│ │ [>] Inbox (1,523)│ │ From          Subject                    Date    ││
│ │ [ ] Sent (847)  │ │ ─────────────────────────────────────────────────││
│ │ [ ] Drafts (12) │ │ Alice Wong    Re: Q4 Budget Review      Nov 28   ││
│ │ [ ] Spam (234)  │ │ Bob Chen      Project Timeline Update   Nov 27   ││
│ │ [ ] Trash (89)  │ │ Carol Davis   Meeting Notes             Nov 27   ││
│ │ [>] Labels      │ │ HR Team       Benefits Enrollment       Nov 26   ││
│ │   [ ] Project A │ │ ...                                              ││
│ │   [ ] Clients   │ │                                                   ││
│ │                 │ │ Showing 1-25 of 1,523                   [< 1 2 >]││
│ └─────────────────┘ └───────────────────────────────────────────────────┘│
│                                                                          │
│ ┌─ Message Preview ─────────────────────────────────────────────────────┐│
│ │                                                                       ││
│ │ From: Alice Wong <alice.wong@company.com>                             ││
│ │ To: John Smith <john.smith@company.com>                               ││
│ │ Date: November 28, 2025 at 2:34 PM                                    ││
│ │ Subject: Re: Q4 Budget Review                                         ││
│ │                                                                       ││
│ │ ──────────────────────────────────────────────────────────────────── ││
│ │                                                                       ││
│ │ Hi John,                                                              ││
│ │                                                                       ││
│ │ Thanks for the budget breakdown. A few questions:                     ││
│ │ ...                                                                   ││
│ │                                                                       ││
│ │ [Attachment: Q4_Budget_v3.xlsx (245 KB)]  [Download]                  ││
│ │                                                                       ││
│ └───────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│ Access Log: Last accessed by sarah.jones@company.com on Dec 10, 2025    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation Phases

**Phase 1: Foundation (Week 1-2)**
- Database schema for archives and delegates
- S3 bucket configuration with lifecycle policies
- Basic MBOX parser

**Phase 2: Archive Creation (Week 2-3)**
- Google Takeout API integration
- Background job for archive processing
- Progress tracking and notifications

**Phase 3: Search & Indexing (Week 3-4)**
- Elasticsearch index setup
- Message parsing and indexing
- Search API endpoints

**Phase 4: Viewer UI (Week 4-5)**
- Archive listing page
- Message browser
- Search interface
- Export functionality

**Phase 5: Access Control (Week 5-6)**
- Delegate management
- Access audit logging
- Retention policy enforcement
- Legal hold functionality

---

## Offboarding UI Design

### Step-by-Step Wizard

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Offboard User                                          Step 1 of 5      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User: John Smith (john.smith@company.com)                              │
│  Department: Engineering • Manager: Sarah Jones                          │
│  Google Workspace: Active • Helios: Active                              │
│                                                                          │
│  ════════════════════════════════════════════════════════════════════   │
│  ● Access   ○ Drive   ○ Calendar   ○ Email   ○ Disposition              │
│  ════════════════════════════════════════════════════════════════════   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                                                                     ││
│  │  Immediate Security Actions                                         ││
│  │                                                                     ││
│  │  These actions will be performed immediately:                       ││
│  │                                                                     ││
│  │  [✓] Force sign-out from all devices and browsers                   ││
│  │  [✓] Reset password to random value                                 ││
│  │  [✓] Revoke all third-party app access (OAuth tokens)               ││
│  │  [✓] Remove from all Google Groups                                  ││
│  │  [✓] Wipe company data from mobile devices                          ││
│  │                                                                     ││
│  │  ⚠️  These actions cannot be undone. The user will lose access     ││
│  │     immediately after clicking "Next".                              ││
│  │                                                                     ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│                                              [Cancel]  [Next: Drive →]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Validation Inline

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Email Forwarding & Delegation                                           │
│                                                                          │
│  Forward incoming emails to:                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ sarah.jones@company.com                           [✓ Valid]         ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  Grant mailbox access to:                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ sarah.jones@company.com                           [✓ Valid]         ││
│  │ mike.suspended@company.com                        [✗ Suspended]     ││
│  │                                                                     ││
│  │ ⚠️  Cannot delegate to suspended users. This user will be removed. ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  [+ Add delegate]                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Summary with Cost Impact

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Offboarding Summary                                     Step 5 of 5     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─ Actions to be performed ───────────────────────────────────────────┐│
│  │                                                                     ││
│  │  ✓ Force sign-out and password reset                                ││
│  │  ✓ Revoke 12 OAuth tokens                                           ││
│  │  ✓ Remove from 5 Google Groups                                      ││
│  │  ✓ Transfer 847 Drive files to sarah.jones@company.com              ││
│  │  ✓ Transfer 23 calendar events to sarah.jones@company.com           ││
│  │  ✓ Forward incoming email to sarah.jones@company.com                ││
│  │  ✓ Grant mailbox access to sarah.jones@company.com                  ││
│  │  ✓ Archive mailbox to Helios (4.2 GB, 2,847 messages)               ││
│  │  ✓ Delete Google account after 30-day retention period              ││
│  │                                                                     ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─ License Impact ────────────────────────────────────────────────────┐│
│  │                                                                     ││
│  │  Current monthly cost:     $23.00  (Business Plus license)          ││
│  │  During retention (30d):   $23.00  (suspended, still billed)        ││
│  │  After deletion:           $0.00   (license freed)                  ││
│  │                                                                     ││
│  │  Annual savings:           $276.00                                  ││
│  │                                                                     ││
│  │  ┌──────────────────────────────────────────────────────────────┐   ││
│  │  │ 💡 Without email archiving, you would need to keep this      │   ││
│  │  │    user on an Archived User license ($4-7/month) to          │   ││
│  │  │    retain email access. With Helios archiving, the           │   ││
│  │  │    license is freed immediately.                             │   ││
│  │  └──────────────────────────────────────────────────────────────┘   ││
│  │                                                                     ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─ Notifications ─────────────────────────────────────────────────────┐│
│  │                                                                     ││
│  │  [✓] Send summary to manager (sarah.jones@company.com)              ││
│  │  [✓] Send summary to HR                                             ││
│  │  [✓] Generate audit report                                          ││
│  │                                                                     ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│                                [← Back]  [Cancel]  [Confirm Offboarding] │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Console Commands for Offboarding

```typescript
// Full offboarding via console
'helios gw users offboard john@company.com --transfer-to sarah@company.com --archive-email --delete-after 30d'

// Individual transfer commands
'helios gw transfer drive john@company.com --to sarah@company.com'
'helios gw transfer calendar john@company.com --to sarah@company.com'

// Email handling
'helios gw delegates add john@company.com --delegate sarah@company.com'
'helios gw forwarding set john@company.com --to sarah@company.com'

// Archive (premium)
'helios gw archive email john@company.com'
'helios gw archive status john@company.com'

// Check before delegation
'helios gw users validate sarah@company.com --for-delegation'
// Output: ✓ User is active and can receive delegation
```

---

## Implementation Priority (Revised)

### P0 - Critical (Week 1)
1. Data transfer API (Drive, Calendar)
2. Email forwarding/delegation
3. Validation for delegates (no suspended/deleted)
4. Offboarding wizard UI (Steps 1-4)

### P1 - High (Week 2-3)
5. Bulk revocation (tokens, groups, devices)
6. Retention period scheduling
7. Audit logging for all offboarding actions
8. Console commands for transfer

### P2 - Strategic (Week 4-6)
9. Email archive to Helios (S3 storage)
10. Archive viewer UI
11. Search/indexing
12. Legal hold functionality

### P3 - Future
13. Microsoft 365 offboarding parity
14. Automated offboarding via HRIS webhook
15. Retention policy templates
