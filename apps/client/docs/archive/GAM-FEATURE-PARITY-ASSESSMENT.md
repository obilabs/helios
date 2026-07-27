# GAM Feature Parity Assessment
**Date:** November 1, 2025
**Goal:** Achieve 100% feature parity with GAM (Google Apps Manager) for Google Workspace operations

---

## 📊 Current Implementation Status

### ✅ IMPLEMENTED (Backend exists, needs testing)

#### User Operations:
- ✅ **Create local user** - `POST /api/organization/users` (line 595)
- ✅ **Delete user** - `DELETE /api/organization/users/:userId` (line 1020)
- ✅ **Suspend user** - `PATCH /api/organization/users/:userId/status` (line 1159)
- ✅ **Restore user** - `PATCH /api/organization/users/:userId/restore` (line 1267)
- ✅ **Promote user to admin** - `POST /api/organization/admins/promote/:userId` (line 1669)
- ✅ **Demote admin to user** - `POST /api/organization/admins/demote/:userId` (line 1726)
- ✅ **Update user** - `PUT /api/organization/users/:userId` (line 849)

#### Sync Operations:
- ✅ **Sync users from Google Workspace** - Google Workspace service has `getUsers()` method
- ✅ **Sync groups from Google Workspace** - Needs verification
- ✅ **Get organizational units** - `getOrgUnits()` method exists

---

## ❌ MISSING / NEEDS IMPLEMENTATION

### Priority 1: Core User Operations

#### 1. Create Google Workspace User
**GAM Equivalent:** `gam create user <email> firstname <first> lastname <last> password <password> [ou <ou>]`

**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- Backend endpoint to create user in Google Workspace via Admin SDK
- API: `admin.users.insert()`
- Must support:
  - Email, first name, last name, password
  - Organizational Unit selection
  - Optional: recovery email, phone
  - Should also create local record in Helios DB

**Implementation File:** `backend/src/services/google-workspace.service.ts`

---

#### 2. Convert Local User to Google Workspace User
**GAM Equivalent:** Not directly available, but Helios should support this

**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- Take existing local user in Helios
- Create corresponding user in Google Workspace
- Link accounts via `google_workspace_id`
- Sync attributes bidirectionally

**Workflow:**
1. Check if user exists in Google (via API)
2. If not, create in Google with Helios user attributes
3. Update Helios user with `google_workspace_id`
4. Mark as synced

---

#### 3. Suspend Google Workspace Linked User
**GAM Equivalent:** `gam update user <email> suspended true`

**Status:** ⚠️ PARTIALLY IMPLEMENTED (local suspend works, Google sync unclear)

**What's Needed:**
- When suspending user via PATCH `/api/organization/users/:userId/status`
- Must ALSO call `admin.users.update()` with `suspended: true` in Google
- Handle bidirectional sync (if suspended in Google, reflect in Helios)

---

#### 4. Delete Google Workspace Linked User
**GAM Equivalent:** `gam delete user <email>`

**Status:** ⚠️ PARTIALLY IMPLEMENTED (soft delete in Helios works, Google sync unclear)

**What's Needed:**
- DELETE endpoint should detect if user has `google_workspace_id`
- If yes, call `admin.users.delete()` OR `admin.users.update({suspended: true})`
- Show confirmation dialog explaining Google vs Helios deletion
- Options:
  - "Soft delete in Helios only" (keep Google account active)
  - "Suspend in Google + soft delete in Helios" (recommended)
  - "Permanently delete from Google" (dangerous, requires explicit confirmation)

---

### Priority 2: Group Operations

#### 5. Add User to Group
**GAM Equivalent:** `gam update group <group-email> add member user <user-email>`

**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- Endpoint: `POST /api/organization/groups/:groupId/members`
- Body: `{ userId: string }` or `{ email: string }`
- If group has `google_workspace_id`, call `admin.members.insert()`
- If local-only group, just update Helios DB

---

#### 6. Remove User from Group
**GAM Equivalent:** `gam update group <group-email> remove member <user-email>`

**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- Endpoint: `DELETE /api/organization/groups/:groupId/members/:userId`
- If Google-linked group, call `admin.members.delete()`
- Update Helios DB

---

#### 7. Create Local-Only Group
**GAM Equivalent:** N/A (Helios-specific)

**Status:** ✅ LIKELY EXISTS (need to verify access-groups.routes.ts)

**What's Needed:**
- Endpoint: `POST /api/organization/access-groups`
- Body: `{ name, description, type: 'local' }`
- Does NOT sync to Google Workspace

---

#### 8. Create Google-Linked Group
**GAM Equivalent:** `gam create group <group-email> name <name>`

**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- Endpoint: `POST /api/organization/access-groups`
- Body: `{ name, description, email, type: 'google', syncToGoogle: true }`
- Call `admin.groups.insert()` to create in Google
- Store `google_workspace_id` in Helios DB

---

#### 9. Delete Local-Only Group
**GAM Equivalent:** N/A

**Status:** ⚠️ NEEDS VERIFICATION

---

#### 10. Delete Google-Linked Group
**GAM Equivalent:** `gam delete group <group-email>`

**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- Endpoint: `DELETE /api/organization/access-groups/:groupId`
- If group has `google_workspace_id`:
  - Show confirmation: "Delete from Google Workspace too?"
  - If yes, call `admin.groups.delete()`
- Remove from Helios DB

---

### Priority 3: Advanced Features

#### 11. OU Selector for User Creation
**Status:** ❌ NOT IMPLEMENTED (UI component missing)

**What's Needed:**
- Dropdown/tree selector component in Add User modal
- Fetch OUs via `GET /api/google-workspace/org-units`
- Pass `orgUnitPath` when creating Google user

---

#### 12. Bulk Operations: Add Multiple Users to Groups
**Status:** ⚠️ BACKEND EXISTS (`bulk-operations.routes.ts`), UI UNCLEAR

**What's Needed:**
- UI: Select multiple users → "Add to Group" button → Select group
- Backend: Iterate users, call `admin.members.insert()` for each
- Show progress bar
- Handle failures gracefully (show which succeeded/failed)

---

#### 13. Bulk Operations: Add Multiple Groups to User
**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- UI: Select user → "Add to Groups" button → Multi-select groups
- Backend: Iterate groups, add user to each

---

#### 14. Delegate Sync from Google Workspace
**GAM Equivalent:** `gam user <email> show delegates`

**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- Sync delegates during user sync
- API: `gmail.users.settings.delegates.list()`
- Store in new table: `user_delegates`
  ```sql
  CREATE TABLE user_delegates (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES organization_users(id),
    delegate_email VARCHAR(255),
    delegate_user_id UUID REFERENCES organization_users(id),
    synced_from_google BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
  );
  ```

---

#### 15. Delegate Management UI
**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- New tab in UserSlideOut: "Delegates"
- List current delegates
- "Add Delegate" button
- "Remove Delegate" button
- If delegate added outside Helios (synced_from_google = true), show badge: "Added in Google"

---

#### 16. Security Event Flagging
**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
- New table: `security_events`
  ```sql
  CREATE TABLE security_events (
    id UUID PRIMARY KEY,
    organization_id UUID,
    event_type VARCHAR(50), -- 'delegate_added', 'delegate_removed', 'admin_promoted', etc.
    user_id UUID,
    actor_source VARCHAR(50), -- 'helios', 'google_workspace', 'microsoft_365'
    actor_email VARCHAR(255),
    details JSONB,
    severity VARCHAR(20), -- 'info', 'warning', 'critical'
    acknowledged BOOLEAN DEFAULT false,
    created_at TIMESTAMP
  );
  ```

- During sync, compare previous state to current state
- If changes detected (e.g., new delegate, new admin), log security event
- UI: Security Events page showing unacknowledged events

---

## 🧪 Testing Checklist

### User Operations Testing:
- [ ] Create local user (email/password)
- [ ] Create Google Workspace user (with OU selection)
- [ ] Convert local user to Google user
- [ ] Suspend local user (check Helios DB)
- [ ] Suspend Google-linked user (check Google Admin Console)
- [ ] Delete local user (soft delete in Helios)
- [ ] Delete Google-linked user (options: Helios only / suspend in Google / delete from Google)
- [ ] Promote user to admin
- [ ] Demote admin to user
- [ ] Update user details (name, email, phone, etc.)

### Group Operations Testing:
- [ ] Create local-only group
- [ ] Create Google-linked group
- [ ] Add user to local group
- [ ] Add user to Google-linked group (verify in Google Admin)
- [ ] Remove user from local group
- [ ] Remove user from Google-linked group (verify in Google Admin)
- [ ] Delete local group
- [ ] Delete Google-linked group (verify deletion in Google Admin)

### Bulk Operations Testing:
- [ ] Select 5 users → Add to group → Verify all added
- [ ] Select 1 user → Add to 5 groups → Verify all memberships
- [ ] Bulk suspend 10 users
- [ ] Bulk delete 3 users

### Delegate Testing:
- [ ] Add delegate to user in Google Admin Console → Sync → Verify shows in Helios
- [ ] Add delegate in Helios → Verify shows in Google
- [ ] Remove delegate in Helios → Verify removed from Google
- [ ] Remove delegate in Google → Sync → Verify removed in Helios

### Security Events Testing:
- [ ] Add delegate outside Helios → Sync → Security event logged
- [ ] Promote user to admin in Google → Sync → Security event logged
- [ ] Change user password in Google → Sync → Security event logged

---

## 📋 Implementation Order

### Phase 1: Core User Operations (Week 1)
1. Create Google Workspace user (with OU selector)
2. Suspend Google-linked user (bidirectional sync)
3. Delete Google-linked user (with confirmation)
4. Convert local user to Google user

### Phase 2: Group Operations (Week 2)
5. Add/remove user to/from groups (local and Google)
6. Create Google-linked group
7. Delete groups (local and Google)

### Phase 3: Bulk Operations (Week 3)
8. Bulk add users to group
9. Bulk add groups to user
10. Bulk suspend/delete

### Phase 4: Delegates & Security (Week 4)
11. Delegate sync from Google
12. Delegate management UI
13. Security event system
14. Security events dashboard

---

## 🔑 Key Technical Requirements

### Google Admin SDK Scopes Required:
```
https://www.googleapis.com/auth/admin.directory.user
https://www.googleapis.com/auth/admin.directory.group
https://www.googleapis.com/auth/admin.directory.orgunit
https://www.googleapis.com/auth/gmail.settings.basic  (for delegates)
https://www.googleapis.com/auth/admin.reports.audit.readonly  (for security events)
```

### Database Migrations Needed:
1. `user_delegates` table
2. `security_events` table
3. Add `org_unit_path` to `organization_users` if missing
4. Add `delegate_count` computed field to user views

### Frontend Components Needed:
1. OU Selector component (tree dropdown)
2. Delegate Management tab in UserSlideOut
3. Bulk operations modal
4. Security Events dashboard page
5. Confirmation dialogs for destructive Google operations

---

## 🎯 Success Criteria

**Helios v1.0 = 100% GAM Feature Parity** means:

✅ Every GAM command for user management has a Helios equivalent
✅ Every GAM command for group management has a Helios equivalent
✅ OU selection works for user creation
✅ Delegates sync bidirectionally
✅ Security events alert admins to external changes
✅ Bulk operations match GAM's efficiency
✅ All operations tested and documented

---

**Next Steps:**
1. Review this assessment with stakeholders
2. Prioritize phases based on urgency
3. Start Phase 1 implementation
4. Test each feature thoroughly before moving to next phase
