# Critical UX Improvements - User Management

**Date:** November 2, 2025
**Priority:** HIGH - These are basic admin portal features

---

## 🚨 Critical Missing Features

### **Your Observations (100% Correct):**

1. ❌ No quick actions menu (ellipsis/right-click)
2. ❌ No "Deleted" tab to view/restore deleted users
3. ❌ No audit logs viewer
4. ❌ No "Lock Account" feature (emergency security)
5. ❌ No quick suspend/restore without clicking through

**All of these are STANDARD in admin portals (JumpCloud, Okta, etc.)**

---

## 🎯 What Should Exist

### 1. **Ellipsis Menu (Three-Dot Menu)** - CRITICAL

**Current:** Click user row → Opens full slide-out
**Problem:** Too slow for quick actions

**Should be:**
```
User Row:
┌────────────────────────────────────────────────┬───┐
│ ● Anthony Chike  anthony@obilabs.dev   Active  │ ⋮ │ ← Ellipsis button
└────────────────────────────────────────────────┴───┘
                                                    │
                          Click ⋮ opens menu:       │
                          ┌─────────────────────────┘
                          │
                          ▼
                    ┌──────────────────────┐
                    │ View Details         │
                    │ ─────────────────    │
                    │ Suspend             │
                    │ Restore             │
                    │ Lock Account 🔒     │
                    │ ─────────────────    │
                    │ Copy Email          │
                    │ Copy Google ID      │
                    │ ─────────────────    │
                    │ Delete...           │
                    └──────────────────────┘
```

**Benefits:**
- ✅ Quick suspend/restore (2 clicks instead of 5)
- ✅ Emergency lock (instant security)
- ✅ Copy operations (no manual selection)
- ✅ Professional UX

---

### 2. **Deleted Users Tab** - CRITICAL

**Current Tabs:**
```
[ Staff ] [ Guests ] [ Contacts ]
  ↓
[ All ] [ Active ] [ Pending ] [ Suspended ]
```

**Missing:**
```
[ Deleted ] ← Shows soft-deleted users with Restore button
```

**Should add:**
```tsx
const getStatusTabs = () => {
  if (activeTab === 'staff') {
    return [
      { id: 'all', label: 'All', count: statusCounts.all },
      { id: 'active', label: 'Active', count: statusCounts.active },
      { id: 'pending', label: 'Pending', count: statusCounts.pending },
      { id: 'suspended', label: 'Suspended', count: statusCounts.suspended },
      { id: 'deleted', label: 'Deleted', count: statusCounts.deleted }  // ← ADD THIS
    ];
  }
}
```

**Deleted tab shows:**
- Users where `deleted_at IS NOT NULL`
- Shows when deleted
- Shows who deleted them
- Big "Restore" button
- Auto-purge after 30 days info

---

### 3. **Audit Logs Viewer** - HIGH PRIORITY

**Current:** No way to view audit logs from UI

**Should exist:**
```
Settings → Security → Audit Logs

OR

Dedicated page: /audit-logs
```

**Shows:**
```
┌─────────────────────────────────────────────────────────────┐
│  Audit Logs                                   🔍 Search      │
├─────────────────────────────────────────────────────────────┤
│  Filter: [All Actions ▼] [All Users ▼] [Last 7 days ▼]    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📝 User Created                          2 minutes ago     │
│      mike@obilabs.dev created anthony@obilabs.dev          │
│                                                              │
│  🗑️ User Deleted                          5 minutes ago     │
│      admin@obilabs.dev deleted intern@obilabs.dev          │
│      Action: Permanently deleted from Google (license freed)│
│                                                              │
│  🔄 Google API Call                       10 minutes ago    │
│      testproxy@obilabs.dev listed users via proxy          │
│      Endpoint: admin/directory/v1/users                     │
│      Status: 200 OK                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. **Lock Account Feature** - SECURITY

**Use case:** User reports account compromise

**One-Click Action:**
```
Lock Account 🔒
↓
1. Generate random password (user can't guess)
2. Sign out all active sessions
3. Revoke all app-specific passwords
4. Revoke all OAuth tokens
5. Set suspended = true
6. Send email to admin "Account locked"
```

**API calls (via transparent proxy):**
```bash
# 1. Change password to random
PATCH /api/google/admin/directory/v1/users/{id}
{ "password": "<random-64-char-string>" }

# 2. Sign out all sessions
POST /api/google/admin/directory/v1/users/{id}/signOut

# 3. List and delete all ASPs
GET /api/google/admin/directory/v1/users/{id}/asps
DELETE /api/google/admin/directory/v1/users/{id}/asps/{codeId}

# 4. List and delete OAuth tokens
GET /api/google/admin/directory/v1/users/{id}/tokens
DELETE /api/google/admin/directory/v1/users/{id}/tokens/{clientId}

# 5. Suspend account
PATCH /api/google/admin/directory/v1/users/{id}
{ "suspended": true }
```

**Benefit:** One click = complete account lockdown

---

### 5. **Status Tabs Missing "Deleted"**

**Current:**
```
type StatusFilter = 'all' | 'active' | 'pending' | 'suspended' | 'expired';
```

**Should be:**
```typescript
type StatusFilter = 'all' | 'active' | 'pending' | 'suspended' | 'expired' | 'deleted';
```

**Query for deleted users:**
```sql
SELECT * FROM organization_users
WHERE deleted_at IS NOT NULL
  AND deleted_at > NOW() - INTERVAL '30 days'
ORDER BY deleted_at DESC;
```

---

## 📋 Implementation Priority

### **Priority 1: Critical UX (2-3 hours)**
1. **Add Deleted tab** (30 min)
   - Add 'deleted' to StatusFilter type
   - Query users with deleted_at IS NOT NULL
   - Show Restore button in row

2. **Add Ellipsis Menu** (1-2 hours)
   - Add MoreVertical icon from Lucide to each row
   - Dropdown menu with quick actions
   - Suspend, Restore, Lock, Copy, Delete

3. **Add Audit Logs Page** (1 hour)
   - New route: /audit-logs
   - Query activity_logs table
   - Show filterable list
   - Link from Settings → Security

### **Priority 2: Quick Actions (2 hours)**
4. **Lock Account** (1 hour)
   - Backend endpoint or use proxy
   - Execute 5 operations via proxy
   - Show progress indicator

5. **Copy Operations** (30 min)
   - Copy email
   - Copy Google Workspace ID
   - Copy user details as JSON

---

## 🎨 Quick Actions Menu Design

### **Ellipsis Button on Each Row:**

```tsx
// In UserList table row
<div className="user-row">
  <div className="col-checkbox">...</div>
  <div className="col-user">...</div>
  <div className="col-email">...</div>
  ...
  <div className="col-actions">
    <button
      className="btn-ellipsis"
      onClick={(e) => {
        e.stopPropagation();
        openActionMenu(user.id);
      }}
    >
      <MoreVertical size={16} />
    </button>

    {/* Dropdown menu */}
    {actionMenuOpen === user.id && (
      <div className="action-menu">
        <button onClick={() => handleViewUser(user)}>
          <Eye size={14} /> View Details
        </button>
        <div className="menu-divider"></div>

        {user.isActive ? (
          <button onClick={() => handleQuickSuspend(user)}>
            <PauseCircle size={14} /> Suspend
          </button>
        ) : (
          <button onClick={() => handleQuickRestore(user)}>
            <PlayCircle size={14} /> Restore
          </button>
        )}

        <button onClick={() => handleLockAccount(user)}>
          <Lock size={14} /> Lock Account
        </button>

        <div className="menu-divider"></div>

        <button onClick={() => handleCopyEmail(user)}>
          <Copy size={14} /> Copy Email
        </button>

        {user.googleWorkspaceId && (
          <button onClick={() => handleCopyGoogleId(user)}>
            <Copy size={14} /> Copy Google ID
          </button>
        )}

        <div className="menu-divider"></div>

        <button
          onClick={() => handleDelete(user)}
          className="menu-item-danger"
        >
          <Trash2 size={14} /> Delete...
        </button>
      </div>
    )}
  </div>
</div>
```

---

## 📊 Deleted Users Tab Design

### **Status Tabs Update:**

```tsx
// Add to getStatusTabs() for staff
return [
  { id: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
  { id: 'active' as StatusFilter, label: 'Active', count: statusCounts.active },
  { id: 'pending' as StatusFilter, label: 'Pending', count: statusCounts.pending },
  { id: 'suspended' as StatusFilter, label: 'Suspended', count: statusCounts.suspended },
  { id: 'deleted' as StatusFilter, label: 'Deleted', count: statusCounts.deleted }  // NEW
];
```

### **Deleted Users View:**

```tsx
// When statusFilter === 'deleted'
<div className="deleted-users-info">
  <Info size={16} />
  Deleted users are kept for 30 days and can be restored.
  After 30 days, they are permanently purged.
</div>

<table>
  <tr className="user-row deleted">
    <td>Anthony Chike</td>
    <td>anthony@obilabs.dev</td>
    <td>Deleted 2 days ago</td>
    <td>by admin@obilabs.dev</td>
    <td>
      <button className="btn-primary btn-sm" onClick={handleRestore}>
        <RotateCcw size={14} /> Restore
      </button>
    </td>
  </tr>
</table>
```

---

## 🔍 Audit Logs Page Design

### **New Page:** `/audit-logs`

```tsx
export function AuditLogs({ organizationId }: Props) {
  return (
    <div className="audit-logs-page">
      <h1>Audit Logs</h1>

      {/* Filters */}
      <div className="filters">
        <select onChange={(e) => setActionFilter(e.target.value)}>
          <option value="all">All Actions</option>
          <option value="user_created">User Created</option>
          <option value="user_deleted">User Deleted</option>
          <option value="user_suspended">User Suspended</option>
          <option value="google_api_*">Google API Calls</option>
        </select>

        <select onChange={(e) => setUserFilter(e.target.value)}>
          <option value="all">All Users</option>
          {users.map(u => <option value={u.id}>{u.email}</option>)}
        </select>

        <select onChange={(e) => setTimeRange(e.target.value)}>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Log entries */}
      <div className="log-entries">
        {logs.map(log => (
          <div className="log-entry">
            <div className="log-icon">{getActionIcon(log.action)}</div>
            <div className="log-details">
              <strong>{log.description}</strong>
              <div className="log-meta">
                {log.actor_email} • {formatTimestamp(log.created_at)}
              </div>
              {log.metadata && (
                <div className="log-metadata">
                  {/* Show relevant details based on action */}
                  {log.metadata.googleAction && (
                    <span>Google Action: {log.metadata.googleAction}</span>
                  )}
                  {log.metadata.statusCode && (
                    <span className={log.metadata.statusCode === 200 ? 'success' : 'error'}>
                      Status: {log.metadata.statusCode}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 🔒 Lock Account Feature

### **Backend Implementation:**

**New endpoint:** `POST /api/organization/users/:userId/lock`

**What it does:**
```typescript
async function lockUserAccount(userId: string, organizationId: string) {
  // 1. Get user info
  const user = await getUser(userId);

  if (user.googleWorkspaceId) {
    // Use transparent proxy to lock Google account

    // Generate random password
    const randomPassword = crypto.randomBytes(32).toString('base64');

    // Change password via proxy
    await fetch('/api/google/admin/directory/v1/users/' + user.googleWorkspaceId, {
      method: 'PATCH',
      body: JSON.stringify({ password: randomPassword })
    });

    // Sign out all sessions
    await fetch('/api/google/admin/directory/v1/users/' + user.googleWorkspaceId + '/signOut', {
      method: 'POST'
    });

    // Get and revoke all ASPs
    const asps = await fetch('/api/google/admin/directory/v1/users/' + user.googleWorkspaceId + '/asps');
    for (const asp of asps.items) {
      await fetch('/api/google/admin/directory/v1/users/' + user.googleWorkspaceId + '/asps/' + asp.codeId, {
        method: 'DELETE'
      });
    }

    // Get and revoke all OAuth tokens
    const tokens = await fetch('/api/google/admin/directory/v1/users/' + user.googleWorkspaceId + '/tokens');
    for (const token of tokens.items) {
      await fetch('/api/google/admin/directory/v1/users/' + user.googleWorkspaceId + '/tokens/' + token.clientId, {
        method: 'DELETE'
      });
    }

    // Suspend account
    await fetch('/api/google/admin/directory/v1/users/' + user.googleWorkspaceId, {
      method: 'PATCH',
      body: JSON.stringify({ suspended: true })
    });
  }

  // Update Helios DB
  await db.query(`
    UPDATE organization_users
    SET
      user_status = 'locked',
      is_active = false,
      locked_at = NOW(),
      locked_by = $1
    WHERE id = $2
  `, [adminUserId, userId]);

  // Log security event
  await db.query(`
    INSERT INTO activity_logs (organization_id, action, description, ...)
    VALUES (..., 'account_locked', 'Account locked due to security concern', ...)
  `);

  return { success: true, message: 'Account locked successfully' };
}
```

---

## 🎨 Implementation Roadmap

### **Phase 1: Essential UX** (1 day)

**Morning:**
1. Add "Deleted" status tab (1 hour)
2. Query deleted users (30 min)
3. Add Restore button (30 min)

**Afternoon:**
4. Add ellipsis menu to UserList rows (2 hours)
5. Implement quick actions (suspend, restore, copy)

### **Phase 2: Security & Audit** (1 day)

**Morning:**
6. Build Audit Logs page (2-3 hours)
7. Add filters and search

**Afternoon:**
8. Implement Lock Account feature (2-3 hours)
9. Test thoroughly

---

## 🔧 Quick Implementation

Let me create the missing features in priority order. Should I:

**A) Add Deleted tab first** (30 min - critical for restoring users)
**B) Add ellipsis menu first** (1 hour - improves daily workflow)
**C) Add Audit Logs page first** (2 hours - compliance/visibility)
**D) Add Lock Account first** (2 hours - security)
**E) Do all of them systematically** (1-2 days)

---

## 💡 Your UX Instincts Are Correct

**These aren't "nice to have" - these are ESSENTIAL for an admin portal:**

1. **Quick actions** - Admins do suspend/restore 10x/day
2. **Deleted users view** - Mistakes happen, need easy restore
3. **Audit logs** - Compliance requirement
4. **Lock account** - Security incidents happen

**Every major admin portal has these** (JumpCloud, Okta, Azure AD, etc.)

---

**What should we tackle first?**
