# v1.0 UX Completion Plan

**Date:** November 2, 2025
**Goal:** Complete all critical UX features for production launch

---

## 📋 Missing Features (Your Observations)

You identified critical gaps:
1. ❌ No ellipsis menu (quick actions)
2. ❌ No Deleted users tab (can't restore)
3. ❌ No Audit Logs viewer
4. ❌ No Suspend action in UI
5. ❌ No Lock Account feature
6. ❌ No data transfer options when deleting
7. ❌ No email forwarding setup

**All correct - these are blocking v1.0 launch.**

---

## 🎯 Implementation Plan - 3 Days

### **Day 1: Core User Management** (8 hours)

#### Morning (4 hours):
**1.1 Add Deleted Users Tab** (1 hour)
- Add 'deleted' to StatusFilter type
- Update getStatusTabs() to include Deleted
- Query: `WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '30 days'`
- Show "Deleted X days ago" and Restore button

**1.2 Add Ellipsis Menu** (2 hours)
- Import MoreVertical from lucide-react
- Add to each user row
- Dropdown menu with:
  - View Details
  - Suspend / Restore (toggle based on status)
  - Lock Account
  - Copy Email
  - Copy Google ID
  - Delete...

**1.3 Implement Quick Suspend/Restore** (1 hour)
- API calls to existing endpoints
- No modal needed (quick action)
- Toast notification for feedback

#### Afternoon (4 hours):
**1.4 Fix Delete Modal** (already done, just verify after frontend reload)

**1.5 Add Data Transfer Options** (3 hours)
- User dropdown selector
- Checkboxes for Drive, Calendar, Sites, Groups
- Call Google Data Transfer API via proxy:
  ```bash
  POST /api/google/admin/datatransfer/v1/transfers
  ```
- Show progress/completion status

---

### **Day 2: Email & Security** (8 hours)

#### Morning (4 hours):
**2.1 Email Forwarding Options** (2 hours)
- Radio buttons:
  - No forwarding
  - Gmail Delegation (30 days, has API)
  - Routing Rule (permanent, manual setup)
- If delegation: Call delegate API before deleting
- If routing: Generate Admin Console instructions after delete

**2.2 Lock Account Feature** (2 hours)
- New backend endpoint: `POST /users/:id/lock`
- Calls via transparent proxy:
  - Change password (random)
  - Sign out sessions
  - Revoke ASPs
  - Revoke OAuth tokens
  - Suspend account
- Single button in ellipsis menu
- Confirmation dialog

#### Afternoon (4 hours):
**2.3 Audit Logs Page** (4 hours)
- New route: `/audit-logs`
- Component: `AuditLogs.tsx`
- Query `activity_logs` table
- Filters:
  - Action type
  - User
  - Time range
  - Search
- Pagination
- Export to CSV

---

### **Day 3: Polish & Testing** (8 hours)

#### Morning (4 hours):
**3.1 UI Polish**
- Consistent styling
- Loading states
- Error handling
- Toast notifications

**3.2 Add Missing Features**
- Copy operations (clipboard API)
- Keyboard shortcuts (?)
- Bulk actions in ellipsis menu context

#### Afternoon (4 hours):
**3.3 Comprehensive Testing**
- Test all quick actions
- Test deleted users tab + restore
- Test audit logs filtering
- Test lock account
- Test data transfer
- Test email forwarding

**3.4 Documentation**
- User guide for each feature
- Screenshots
- Best practices

---

## 🚀 API Endpoints Needed

### **Existing (Already Work):**
- ✅ DELETE /users/:id (with googleAction)
- ✅ PATCH /users/:id/status (suspend/restore)
- ✅ PATCH /users/:id/restore
- ✅ GET /activity_logs (just need to create route)

### **New Endpoints Needed:**
1. **Lock Account:** `POST /users/:id/lock`
2. **Data Transfer:** Use transparent proxy to Google Data Transfer API
3. **Email Delegation:** Use transparent proxy to Gmail delegates API

### **Via Transparent Proxy:**
- ✅ POST /api/google/gmail/v1/users/{id}/settings/delegates
- ✅ POST /api/google/admin/datatransfer/v1/transfers
- ✅ POST /api/google/admin/directory/v1/users/{id}/signOut
- ✅ GET/DELETE /api/google/admin/directory/v1/users/{id}/asps/{code}
- ✅ GET/DELETE /api/google/admin/directory/v1/users/{id}/tokens/{client}

**All already work through transparent proxy!**

---

## 💡 Key Insights

### **Email Forwarding:**
- User-level forwarding (Gmail API) → Stops when deleted ❌
- Delegation (Gmail API) → Works ~30 days after deleted ✅ (has API!)
- Routing rules (Admin Console) → Permanent ✅ (NO API, manual setup)

**Recommendation:**
- Offer delegation (automated via API)
- Offer routing (generate instructions for manual setup)
- Let user choose

### **Data Transfer:**
- Drive, Calendar, Sites, Groups → Has API! ✅
- Gmail messages → NO API ❌ (must use Takeout or keep mailbox)

**Recommendation:**
- Automate Drive/Calendar transfer via API
- For Gmail: Offer delegation so manager can access mailbox

---

## ✅ Next Steps

**Option A: Fix delete modal + test** (30 min)
- Frontend restarted, modal should show now
- Hard-refresh browser (Ctrl+Shift+R)
- Test delete flow
- Verify new modal appears

**Option B: Build all Day 1 features** (8 hours)
- Deleted tab
- Ellipsis menu
- Quick actions
- Data transfer

**Option C: Create detailed spec for all features** (2 hours)
- Wireframes
- API mappings
- Component architecture
- Then implement systematically

---

**What do you want to do?**
1. Test the delete modal now (hard refresh browser)
2. Build all critical UX features systematically
3. Spec everything first, then build

Your call!
