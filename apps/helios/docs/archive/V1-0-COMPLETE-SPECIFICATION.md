# Helios v1.0 - Complete Product Specification

**Date:** November 2, 2025
**Status:** Comprehensive spec before implementation
**Goal:** Document EVERYTHING so we don't lose context

---

## 🎯 Your Strategic Decisions

### **1. User Deletion Rules** ✅
```
RULE: Never delete from Helios while user exists in Google
REASON: Breaks traceability, sync will recreate user

IF googleWorkspaceId EXISTS:
  → MUST choose Google action (keep/block/suspend/delete)
  → THEN Helios reflects that state

IF googleWorkspaceId IS NULL:
  → CAN delete from Helios (local-only)
```

### **2. Soft Delete Retention** ✅
```
Helios retention: 1 year (configurable)
- Preserves audit trail
- Enables re-onboarding
- Admin manually purges

Google restore capability: 28 days max
- Full restore (with data): 0-28 days
- Re-onboard only (no data): 28 days - 1 year
- Expired: > 1 year
```

### **3. User States** ✅
```
ACTIVE    → Normal use
PENDING   → Awaiting password setup
BLOCKED   → Security lockout (NEW!) 🔒
SUSPENDED → Temporarily disabled
DELETED   → Soft-deleted (restorable)
```

### **4. Block User Feature** ✅ NEW
```
Emergency security lockout:
1. Generate random password
2. Sign out all sessions
3. Revoke all app passwords
4. Revoke all OAuth tokens
5. Remove mobile devices (optional)
6. Set user_status = 'blocked'
7. Optional: Enable delegation for manager
8. Optional: Set up email forwarding

User cannot access ANYTHING
Manager CAN access via delegation
Helios tracks as BLOCKED
Security events if login attempted
```

### **5. Email Forwarding via Hidden Groups** ✅ INNOVATIVE
```
Instead of routing rules (no API):
1. Create hidden Google Group with user's email
2. Add recipients as members
3. Configure: Hidden, receive-only, no posting
4. Tag in Helios: system_email_forward
5. Optional: Auto-reply enabled

Benefits:
✅ Has API (automated)
✅ Permanent (no expiration)
✅ Traceable in Helios
✅ Can modify later
✅ Better than Google's routing
```

### **6. Security Events System** ✅
```
Monitor and alert on:
- Blocked user login attempts → CRITICAL
- Delegate added outside Helios → WARNING
- Admin promoted outside Helios → WARNING
- OAuth token used on blocked account → CRITICAL

UI: Settings → Security → Security Events
Shows unacknowledged events with severity
```

### **7. Reusable UI Components** ✅
```
NO MORE confirm() and alert()!

Build once, use everywhere:
- <Modal /> - Base modal component
- <ConfirmDialog /> - Confirmation prompts
- <Toast /> - Notifications (already exists!)
- <UserSelector /> - User dropdown
- <CheckboxGroup /> - Multi-select
```

### **8. Icon Consistency** ✅
```
CURRENT: Mix of emojis and Lucide icons ❌
SHOULD: Lucide icons everywhere ✅

Fix: Replace all emoji icons with Lucide
Navigation: ⚡📋📈 → <Zap />, <FileText />, <BarChart />
```

---

## 📐 User Lifecycle Architecture

### **User State Machine:**

```
┌─────────┐
│ CREATED │ (new user, no password)
└────┬────┘
     │ set password
     ▼
┌─────────┐
│ PENDING │ (password setup email sent)
└────┬────┘
     │ complete setup
     ▼
┌─────────┐
│ ACTIVE  │ (normal use) ◄────────┐
└────┬────┘                        │ unblock
     │                             │
     ├─► BLOCKED   (security) ─────┘
     │   • All access revoked
     │   • Delegation works
     │   • Security monitoring
     │
     ├─► SUSPENDED (temporary)
     │   • Google Workspace suspended
     │   • Still billed ⚠️
     │
     └─► DELETED   (soft delete)
         ├─► 0-28 days:  Full restore available
         ├─► 28d-1yr:    Re-onboard only
         └─► >1 year:    Purged
```

---

## 🎨 Delete Modal - Selectable Blocks Design

### **New UX Pattern: Expandable Selection Blocks**

```tsx
<DeleteUserModal user={user}>
  <Header>
    <h2>What should happen to {user.name}'s account?</h2>
    <p>{user.email} • Google Workspace User</p>
  </Header>

  {/* Block 1: Keep Active */}
  <SelectableBlock
    selected={action === 'keep'}
    onClick={() => setAction('keep')}
  >
    <BlockHeader>
      <Lock size={20} color="green" />
      <Title>Keep Active & Enable Delegation</Title>
      <Badge variant="info">No billing change</Badge>
    </BlockHeader>

    <BlockDescription>
      Keep Google account active so managers can access via delegation.
      User retains all data. You continue to be billed.
    </BlockDescription>

    {action === 'keep' && (
      <ExpandedOptions>
        <UserSelector
          label="Grant mailbox delegation to:"
          value={delegateTo}
          onChange={setDelegateTo}
        />

        <Checkbox checked={emailForwarding}>
          Forward incoming emails
        </Checkbox>

        {emailForwarding && (
          <UserSelector
            label="Forward to:"
            value={forwardTo}
            onChange={setForwardTo}
            multiple
          />
        )}

        <InfoBox>
          ℹ️ Delegation allows {delegateTo} to access mailbox as {user.name}
        </InfoBox>
      </ExpandedOptions>
    )}
  </SelectableBlock>

  {/* Block 2: Block Account */}
  <SelectableBlock
    selected={action === 'block'}
    onClick={() => setAction('block')}
  >
    <BlockHeader>
      <ShieldOff size={20} color="orange" />
      <Title>Block Account (Security Lockout)</Title>
      <Badge variant="warning">Still billed</Badge>
    </BlockHeader>

    <BlockDescription>
      Immediately lock user out while keeping mailbox accessible for delegation.
      Perfect for terminated employees.
    </BlockDescription>

    {action === 'block' && (
      <ExpandedOptions>
        <SecurityActionsList>
          ✅ Random password generated
          ✅ All sessions signed out
          ✅ App passwords revoked
          ✅ OAuth tokens revoked
          ✅ Mobile devices removed
          ✅ Status set to BLOCKED
        </SecurityActionsList>

        <UserSelector
          label="Grant delegation to:"
          value={delegateTo}
          onChange={setDelegateTo}
        />

        <CheckboxGroup label="Email Forwarding">
          <Checkbox checked={forwardEmail}>
            Forward {user.email} to:
          </Checkbox>
          {forwardEmail && (
            <UserSelector
              value={forwardTo}
              onChange={setForwardTo}
              multiple
            />
          )}
        </CheckboxGroup>

        <CheckboxGroup label="Data Transfer">
          <Checkbox checked={transferDrive}>Drive files</Checkbox>
          <Checkbox checked={transferCalendar}>Calendar</Checkbox>
          <Checkbox checked={transferSites}>Sites</Checkbox>
        </CheckboxGroup>

        <WarningBox>
          ⚠️ User is blocked but account remains active.
          You are still billed for this license.
        </WarningBox>
      </ExpandedOptions>
    )}
  </SelectableBlock>

  {/* Block 3: Suspend */}
  <SelectableBlock
    selected={action === 'suspend'}
    onClick={() => setAction('suspend')}
  >
    <BlockHeader>
      <PauseCircle size={20} color="orange" />
      <Title>Suspend (Temporary Hold)</Title>
      <Badge variant="warning">Still billed</Badge>
    </BlockHeader>

    <BlockDescription>
      Temporarily disable account (vacation, investigation, compliance hold).
      ⚠️ You are STILL billed for this license!
    </BlockDescription>

    {action === 'suspend' && (
      <ExpandedOptions>
        <InfoBox>
          User cannot login but all data remains intact.
          Use Block instead if you want delegation access.
        </InfoBox>
      </ExpandedOptions>
    )}
  </SelectableBlock>

  {/* Block 4: Permanently Delete */}
  <SelectableBlock
    selected={action === 'delete'}
    onClick={() => setAction('delete')}
  >
    <BlockHeader>
      <Trash2 size={20} color="red" />
      <Title>Permanently Delete</Title>
      <Badge variant="success">License freed ✅</Badge>
    </BlockHeader>

    <BlockDescription>
      Permanently delete from Google Workspace. License freed immediately.
      ⚠️ All data deleted. Cannot be undone.
    </BlockDescription>

    {action === 'delete' && (
      <ExpandedOptions>
        <WarningBox variant="critical">
          ⚠️ This is permanent! Data will be deleted after transfer.
        </WarningBox>

        <CheckboxGroup label="Before Deletion - Transfer Data">
          <UserSelector
            label="Transfer to:"
            value={transferTo}
            onChange={setTransferTo}
          />

          <Checkbox checked={transferDrive}>
            📁 Google Drive files
          </Checkbox>
          <Checkbox checked={transferCalendar}>
            📅 Google Calendar events
          </Checkbox>
          <Checkbox checked={transferSites}>
            🌐 Google Sites
          </Checkbox>
          <Checkbox checked={transferGroups}>
            👥 Group ownership
          </Checkbox>
        </CheckboxGroup>

        <CheckboxGroup label="Email Forwarding (After Deletion)">
          <Checkbox checked={forwardEmail}>
            Forward {user.email} emails to:
          </Checkbox>

          {forwardEmail && (
            <>
              <UserSelector
                value={forwardTo}
                onChange={setForwardTo}
                multiple
              />

              <InfoBox>
                ℹ️ Helios will create a hidden email group to handle
                forwarding. This is permanent and can be modified later.
              </InfoBox>
            </>
          )}
        </CheckboxGroup>

        <InfoBox>
          💾 Savings: $12/month × 12 months = $144/year per user
        </InfoBox>
      </ExpandedOptions>
    )}
  </SelectableBlock>

  <Footer>
    <SummaryPanel>
      {action === 'delete' && <Stat>License freed: $144/year</Stat>}
      {forwardEmail && <Stat>Emails forwarded to {forwardTo.length} user(s)</Stat>}
      {transferEnabled && <Stat>{transferItems.length} items transferred</Stat>}
    </SummaryPanel>

    <ButtonGroup>
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button variant="danger" onClick={handleProceed}>
        {action === 'block' ? 'Block User' :
         action === 'delete' ? 'Delete User' :
         action === 'suspend' ? 'Suspend User' :
         'Keep Active'}
      </Button>
    </ButtonGroup>
  </Footer>
</DeleteUserModal>
```

---

## 🔒 Block User Implementation

### **Backend Endpoint:**

`POST /api/organization/users/:userId/block`

**Request Body:**
```json
{
  "reason": "Terminated employee",
  "delegateTo": "mike@obilabs.dev",
  "emailForwarding": {
    "enabled": true,
    "forwardTo": ["mike@obilabs.dev", "hr@obilabs.dev"]
  },
  "dataTransfer": {
    "enabled": true,
    "transferTo": "mike@obilabs.dev",
    "items": ["drive", "calendar", "sites"]
  }
}
```

**Backend Implementation:**

```typescript
router.post('/users/:userId/block', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const { reason, delegateTo, emailForwarding, dataTransfer } = req.body;

  const user = await getUser(userId);

  if (!user.googleWorkspaceId) {
    return res.status(400).json({
      error: 'Cannot block local-only user. Use suspend instead.'
    });
  }

  // Execute block operations via transparent proxy
  const token = req.headers.authorization;

  // 1. Generate random password (64 chars)
  const randomPassword = crypto.randomBytes(32).toString('base64');

  await fetch(`/api/google/admin/directory/v1/users/${user.googleWorkspaceId}`, {
    method: 'PATCH',
    headers: { 'Authorization': token },
    body: JSON.stringify({
      password: randomPassword,
      changePasswordAtNextLogin: false  // Don't force change!
    })
  });

  // 2. Sign out all sessions
  await fetch(`/api/google/admin/directory/v1/users/${user.googleWorkspaceId}/signOut`, {
    method: 'POST',
    headers: { 'Authorization': token }
  });

  // 3. Revoke all ASPs (App-Specific Passwords)
  const asps = await fetch(`/api/google/admin/directory/v1/users/${user.googleWorkspaceId}/asps`, {
    headers: { 'Authorization': token }
  });

  for (const asp of asps.items || []) {
    await fetch(`/api/google/admin/directory/v1/users/${user.googleWorkspaceId}/asps/${asp.codeId}`, {
      method: 'DELETE',
      headers: { 'Authorization': token }
    });
  }

  // 4. Revoke all OAuth tokens
  const tokens = await fetch(`/api/google/admin/directory/v1/users/${user.googleWorkspaceId}/tokens`, {
    headers: { 'Authorization': token }
  });

  for (const token of tokens.items || []) {
    await fetch(`/api/google/admin/directory/v1/users/${user.googleWorkspaceId}/tokens/${token.clientId}`, {
      method: 'DELETE',
      headers: { 'Authorization': token }
    });
  }

  // 5. Remove mobile devices (optional - very destructive)
  // Skipping for now - can add as option

  // 6. Set up delegation if requested
  if (delegateTo) {
    await fetch(`/api/google/gmail/v1/users/${user.email}/settings/delegates`, {
      method: 'POST',
      headers: { 'Authorization': token },
      body: JSON.stringify({ delegateEmail: delegateTo })
    });
  }

  // 7. Set up email forwarding if requested
  if (emailForwarding?.enabled) {
    await createHiddenForwardingGroup(user, emailForwarding, token);
  }

  // 8. Transfer data if requested
  if (dataTransfer?.enabled) {
    await initiateDataTransfer(user, dataTransfer, token);
  }

  // 9. Update Helios DB
  await db.query(`
    UPDATE organization_users
    SET
      user_status = 'blocked',
      is_active = false,
      blocked_at = NOW(),
      blocked_by = $1,
      blocked_reason = $2
    WHERE id = $3
  `, [req.user.userId, reason, userId]);

  // 10. Create security event
  await db.query(`
    INSERT INTO security_events (
      organization_id,
      event_type,
      severity,
      user_id,
      details
    ) VALUES ($1, 'user_blocked', 'warning', $2, $3)
  `, [
    req.user.organizationId,
    userId,
    JSON.stringify({ reason, blockedBy: req.user.email })
  ]);

  res.json({
    success: true,
    message: 'User account blocked successfully',
    details: {
      passwordReset: true,
      sessionsSignedOut: true,
      aspsRevoked: asps.items?.length || 0,
      tokensRevoked: tokens.items?.length || 0,
      delegationEnabled: !!delegateTo,
      emailForwardingEnabled: !!emailForwarding?.enabled
    }
  });
});
```

---

## 📧 Hidden Email Forwarding Group

### **Function:** `createHiddenForwardingGroup()`

```typescript
async function createHiddenForwardingGroup(
  user: User,
  config: { forwardTo: string[]; autoReply?: { message: string } },
  authToken: string
) {
  // 1. Create group with user's email
  const groupResponse = await fetch('/api/google/admin/directory/v1/groups', {
    method: 'POST',
    headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,  // anthony@obilabs.dev
      name: `Email Forwarding - ${user.firstName} ${user.lastName}`,
      description: 'System-managed email forwarding group (hidden from directory)'
    })
  });

  const group = await groupResponse.json();

  // 2. Configure group settings (Groups Settings API)
  await fetch(`/api/google/groupssettings/v1/groups/${user.email}`, {
    method: 'PATCH',
    headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // HIDE FROM DIRECTORY
      includeInGlobalAddressList: 'false',
      showInGroupDirectory: 'false',

      // RECEIVE-ONLY
      whoCanPostMessage: 'NONE_CAN_POST',
      whoCanJoin: 'INVITED_CAN_JOIN',
      whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW',
      whoCanViewGroup: 'ALL_MANAGERS_CAN_VIEW',

      // DELIVERY
      messageModerationLevel: 'MODERATE_NONE',
      isArchived: 'false',
      allowExternalMembers: 'false',
      allowGoogleCommunication: 'false',
      membersCanPostAsTheGroup: 'false',

      // REPLY (if auto-reply enabled)
      sendMessageDenyNotification: 'false',
      defaultMessageDenyNotificationText: config.autoReply?.message || ''
    })
  });

  // 3. Add forwarding recipients as members
  for (const recipientEmail of config.forwardTo) {
    await fetch(`/api/google/admin/directory/v1/groups/${user.email}/members`, {
      method: 'POST',
      headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: recipientEmail,
        role: 'MEMBER',
        delivery_settings: 'ALL_MAIL'  // Deliver all messages
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
      metadata
    ) VALUES ($1, $2, $3, $4, 'system_email_forward', true, $5)
  `, [
    user.organizationId,
    user.email,
    `Email Forwarding - ${user.firstName} ${user.lastName}`,
    group.id,
    JSON.stringify({
      originalUserId: user.id,
      originalUserEmail: user.email,
      forwardingTo: config.forwardTo,
      purpose: 'email_forwarding',
      createdAt: new Date()
    })
  ]);

  return { success: true, groupId: group.id };
}
```

---

## 🔔 Security Events System

### **Database Migration:**

```sql
CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type VARCHAR(50) NOT NULL,  -- 'blocked_user_login', 'external_delegate', etc.
  severity VARCHAR(20) NOT NULL,    -- 'info', 'warning', 'critical'
  user_id UUID REFERENCES organization_users(id),
  user_email VARCHAR(255),
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES organization_users(id),
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_security_events_org ON security_events(organization_id);
CREATE INDEX idx_security_events_severity ON security_events(severity) WHERE acknowledged = false;
CREATE INDEX idx_security_events_user ON security_events(user_id) WHERE user_id IS NOT NULL;
```

### **Event Types:**

```typescript
enum SecurityEventType {
  // User lifecycle
  BLOCKED_USER_LOGIN_ATTEMPT = 'blocked_user_login_attempt',        // CRITICAL
  BLOCKED_USER_APP_ACCESS = 'blocked_user_app_access',              // CRITICAL
  DELETED_USER_LOGIN_ATTEMPT = 'deleted_user_login_attempt',        // WARNING

  // External changes
  DELEGATE_ADDED_EXTERNALLY = 'delegate_added_externally',          // WARNING
  DELEGATE_REMOVED_EXTERNALLY = 'delegate_removed_externally',      // INFO
  ADMIN_PROMOTED_EXTERNALLY = 'admin_promoted_externally',          // CRITICAL
  ADMIN_DEMOTED_EXTERNALLY = 'admin_demoted_externally',            // WARNING
  PASSWORD_CHANGED_EXTERNALLY = 'password_changed_externally',      // WARNING

  // Suspicious activity
  MULTIPLE_FAILED_LOGINS = 'multiple_failed_logins',                // WARNING
  LOGIN_FROM_NEW_LOCATION = 'login_from_new_location',              // INFO
  LOGIN_FROM_NEW_DEVICE = 'login_from_new_device',                  // INFO
}
```

### **Monitoring via Google Reports API:**

```typescript
// Daily sync job
async function monitorSecurityEvents(organizationId: string) {
  // Get blocked users
  const blockedUsers = await db.query(`
    SELECT id, email, google_workspace_id
    FROM organization_users
    WHERE organization_id = $1
      AND user_status = 'blocked'
  `, [organizationId]);

  // Check Google Reports API for login activity
  const activities = await fetch(
    `/api/google/admin/reports/v1/activity/users/all/applications/login?maxResults=1000`,
    { headers: { 'Authorization': token } }
  );

  // Check if any blocked users logged in
  for (const activity of activities.items) {
    const blockedUser = blockedUsers.rows.find(u => u.email === activity.actor.email);

    if (blockedUser) {
      // CRITICAL: Blocked user logged in!
      await db.query(`
        INSERT INTO security_events (
          organization_id,
          event_type,
          severity,
          user_id,
          user_email,
          details,
          ip_address
        ) VALUES ($1, 'blocked_user_login_attempt', 'critical', $2, $3, $4, $5)
      `, [
        organizationId,
        blockedUser.id,
        blockedUser.email,
        JSON.stringify(activity),
        activity.ipAddress
      ]);

      // Send alert email/notification
      await sendSecurityAlert({
        type: 'blocked_user_login',
        user: blockedUser,
        details: activity
      });
    }
  }
}
```

---

## 🎨 Icon Consistency Fix

### **Replace ALL Emojis with Lucide Icons:**

**Navigation (App.tsx):**
```tsx
// Before:
<span className="nav-icon">⚡</span> Workflows
<span className="nav-icon">📋</span> Templates
<span className="nav-icon">📈</span> Reports
<span className="nav-icon">🔍</span> Analytics

// After:
<Zap size={16} /> Workflows
<FileText size={16} /> Templates
<TrendingUp size={16} /> Reports
<Search size={16} /> Analytics
```

**User States:**
```tsx
// Before:
✅ Active
⚠️ Inactive

// After:
<CheckCircle size={14} /> Active
<AlertCircle size={14} /> Inactive
<ShieldOff size={14} /> Blocked  // NEW!
```

---

## 📋 Database Schema Updates

### **Add to organization_users table:**

```sql
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES organization_users(id),
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Update user_status type to include 'blocked'
-- (if using ENUM, otherwise just VARCHAR is fine)
```

### **Add to access_groups table:**

```sql
ALTER TABLE access_groups
ADD COLUMN IF NOT EXISTS group_type VARCHAR(50) DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Types:
-- 'standard' - Regular user-created group
-- 'system_email_forward' - Email forwarding group (hide from UI)
-- 'system_automation' - System automation group
```

---

## 🚀 Implementation Order (Per Your Request: C → B → A)

### **C) Complete Spec** ✅ THIS DOCUMENT

### **B) Backend Implementation** (Day 1-2)

**Day 1:**
1. Database migration (blocked_at, group_type, security_events table)
2. Block user endpoint
3. Hidden group creation function
4. Data transfer function
5. Security event monitoring

**Day 2:**
6. Update delete endpoint with new logic
7. Test all backend functions
8. Verify via curl/Postman

### **A) Frontend/UI** (Day 3-5)

**Day 3:**
9. Build reusable components (Modal, ConfirmDialog, UserSelector)
10. Replace all confirm()/alert() with components

**Day 4:**
11. Build new delete modal with selectable blocks
12. Implement block user UI
13. Add Deleted users tab

**Day 5:**
14. Add ellipsis menu
15. Add Security Events page
16. Add Audit Logs page
17. Fix icon inconsistency (remove all emojis)

---

## 📊 Complete Feature Matrix

| Feature | Backend | Frontend | Priority |
|---------|---------|----------|----------|
| Delete user (3 options) | ✅ Done | ✅ Done | P0 |
| Block user | ⏳ Spec | ⏳ Spec | P0 |
| Email forwarding (hidden groups) | ⏳ Spec | ⏳ Spec | P0 |
| Data transfer | ⏳ Spec | ⏳ Spec | P0 |
| Deleted users tab | ✅ Endpoint exists | ❌ Missing | P0 |
| Suspend quick action | ✅ Endpoint exists | ❌ Missing | P0 |
| Ellipsis menu | N/A | ❌ Missing | P0 |
| Audit logs viewer | ✅ Data exists | ❌ Missing | P1 |
| Security events | ❌ Missing | ❌ Missing | P1 |
| Icon consistency | N/A | ❌ Emojis | P1 |

---

## ✅ This Spec Captures Everything

**User lifecycle:**
- ✅ Block, suspend, delete with proper options
- ✅ Soft delete for 1 year
- ✅ 28-day full restore window
- ✅ Re-onboarding after 28 days

**Email forwarding:**
- ✅ Via hidden groups (your innovation!)
- ✅ Permanent solution with API
- ✅ Traceable in Helios

**Security:**
- ✅ Block user feature
- ✅ Security events monitoring
- ✅ Alerts for blocked user activity

**UX:**
- ✅ Reusable components
- ✅ Consistent icons (Lucide everywhere)
- ✅ Selectable blocks (better than radio)
- ✅ Ellipsis menus for quick actions

**Next: Implement B (backend), then A (frontend)**

Ready to start backend implementation?
