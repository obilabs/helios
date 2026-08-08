# Email Forwarding & Data Transfer for Deleted Users

**Date:** November 2, 2025
**Your Question:** "Does Google have API for forwarding email after user deleted?"

---

## 🎯 The Answer

**YES and NO - It's complicated:**

### **Gmail API Forwarding** ❌ Stops When User Deleted
```
User-level forwarding (Gmail API):
- Set via: gmail.users.settings.forwardingAddresses
- Stops working when user deleted
- Not suitable for ex-employees
```

### **Admin Routing Rules** ✅ Continues After Deletion
```
Domain-level routing (Admin Console only):
- Set in: Apps → Gmail → Routing
- Works even after user deleted
- Email to deleted@company.com → forwards to newperson@company.com
- NO API AVAILABLE ⚠️
```

---

## 🚨 The Problem

**Google Workspace Admin Routing Rules have NO API!**

Per Stack Overflow + Google Issue Tracker:
> "There is currently no direct API available to programmatically manage the routing rules found in the Google Workspace Admin Console."

**This means:**
- ❌ Can't create routing rules via API
- ❌ Can't delete routing rules via API
- ✅ Can only configure manually in Admin Console
- ✅ Or use GAM (which also doesn't have direct API access)

---

## 💡 Solution: Helios Delete Workflow

### **Your Vision for Delete Modal:**

```
┌──────────────────────────────────────────────────────┐
│  ⚠️ Delete User: Anthony Chike                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  What should happen in Google Workspace?             │
│                                                       │
│  ○ Keep account active                               │
│  ○ Suspend account (still billed!)                   │
│  ● Permanently delete (frees license) ✅             │
│                                                       │
├──────────────────────────────────────────────────────┤
│  📧 Email Management                                  │
│                                                       │
│  What should happen to incoming emails?              │
│                                                       │
│  ○ Stop delivering (emails will bounce)              │
│  ● Forward to another user:                          │
│     [Select user ▼] mike@obilabs.dev                │
│                                                       │
│  ⚠️ Note: Email routing must be configured in        │
│     Google Admin Console. This will generate         │
│     instructions for you to copy/paste.              │
│                                                       │
├──────────────────────────────────────────────────────┤
│  📁 Data Transfer (Optional)                          │
│                                                       │
│  Transfer data to: [Select user ▼] mike@obilabs.dev │
│                                                       │
│  Transfer options:                                    │
│  ☑ Gmail messages and labels                         │
│  ☑ Google Drive files                                │
│  ☑ Calendar events                                   │
│  ☐ Google Sites                                      │
│  ☐ Google Groups ownership                           │
│                                                       │
│  ⚠️ Transfer will happen via Google Data Export      │
│     and may take several hours to complete.          │
│                                                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  [ Cancel ]              [ Generate Instructions ]   │
│                          [ Delete User ]             │
└──────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation Strategy

### **Approach 1: Generate Admin Console Instructions** ✅ RECOMMENDED

Since routing rules have no API, Helios should:

1. **Show delete modal with email forwarding option**
2. **Generate instructions for admin to copy:**

```
After clicking "Delete User":

┌──────────────────────────────────────────────────────┐
│  ✅ User Deleted Successfully                         │
├──────────────────────────────────────────────────────┤
│                                                       │
│  📋 Email Forwarding Setup Required                   │
│                                                       │
│  You selected to forward anthony@obilabs.dev emails  │
│  to mike@obilabs.dev                                 │
│                                                       │
│  Google Admin Console doesn't have an API for this.  │
│  Follow these steps:                                 │
│                                                       │
│  1. Open Google Admin Console                        │
│     https://admin.google.com                         │
│                                                       │
│  2. Go to: Apps → Gmail → Routing                    │
│                                                       │
│  3. Click "Add Another Rule"                         │
│                                                       │
│  4. Configure:                                       │
│     • Envelope recipient: anthony@obilabs.dev        │
│     • Also affect: ✓ User is in /Suspended OU        │
│     • Change route: ✓ Forward to: mike@obilabs.dev  │
│     • Save                                           │
│                                                       │
│  [ Copy Instructions ]  [ Done ]                     │
└──────────────────────────────────────────────────────┘
```

---

### **Approach 2: Email Delegation** ✅ WORKS AFTER DELETION

**Alternative:** Use Gmail Delegation instead of routing

**API:** Available via Gmail API!
```bash
# Add delegate BEFORE deleting user
POST /api/google/gmail/v1/users/anthony@obilabs.dev/settings/delegates
{
  "delegateEmail": "mike@obilabs.dev"
}

# Delegate can access mailbox even after user deleted (for ~30 days)
```

**Benefits:**
- ✅ Has API (we can automate!)
- ✅ Works through our transparent proxy
- ✅ Mike can access Anthony's mailbox directly
- ✅ Reads, sends as Anthony

**Limitations:**
- ⚠️ Only works for ~30 days after deletion
- ⚠️ Requires manual access (delegate logs in as themselves, switches to Anthony's mailbox)

---

## 📁 Google Data Transfer API

**Good news:** Google HAS an API for data transfer!

**API:** `admin.datatransfer.transfers`

```bash
# Transfer Drive, Calendar, etc. to another user
POST /admin/datatransfer/v1/transfers
{
  "oldOwnerUserId": "anthony@obilabs.dev",
  "newOwnerUserId": "mike@obilabs.dev",
  "applicationDataTransfers": [
    {
      "applicationId": "435070579839",  // Google Drive
      "applicationTransferParams": [
        {
          "key": "PRIVACY_LEVEL",
          "value": ["SHARED", "PRIVATE"]
        }
      ]
    },
    {
      "applicationId": "55656082996",  // Google Calendar
      "applicationTransferParams": []
    }
  ]
}
```

**Supported transfers:**
- ✅ Google Drive files
- ✅ Google Calendar events
- ✅ Google Sites
- ✅ Google Keep notes
- ✅ Google Groups ownership
- ❌ Gmail messages (NOT supported in transfer API!)

---

## 🎯 Complete Delete Modal Design (Fixed)

```tsx
┌──────────────────────────────────────────────────────┐
│  Delete User: Anthony Chike                          │
├──────────────────────────────────────────────────────┤
│                                                       │
│  STEP 1: Google Workspace Action                     │
│                                                       │
│  ○ Keep account active                               │
│     User retains access. You continue to be billed.  │
│                                                       │
│  ○ Suspend account                                   │
│     User blocked. ⚠️ You are STILL billed!           │
│                                                       │
│  ● Permanently delete ✅ Recommended                 │
│     License freed. All data deleted.                 │
│                                                       │
├──────────────────────────────────────────────────────┤
│  STEP 2: Email Forwarding (After Deletion)           │
│                                                       │
│  ● Forward emails to:  [mike@obilabs.dev    ▼]      │
│                                                       │
│  Method:                                             │
│  ○ Delegate access (works ~30 days, has API)        │
│  ● Routing rule (permanent, needs manual setup)     │
│                                                       │
├──────────────────────────────────────────────────────┤
│  STEP 3: Data Transfer (Before Deletion)             │
│                                                       │
│  Transfer data to:  [mike@obilabs.dev       ▼]      │
│                                                       │
│  ☑ Google Drive files                                │
│  ☑ Google Calendar events                            │
│  ☐ Google Sites                                      │
│  ☐ Google Groups ownership                           │
│  ☐ Gmail delegate access (for 30 days)               │
│                                                       │
│  ⚠️ Note: Gmail messages cannot be transferred       │
│     via API. Use routing or delegation.              │
│                                                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  [ Cancel ]                        [ Delete User ]   │
│                                                       │
│  After deletion, you'll receive routing setup        │
│  instructions if you selected routing.               │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## 🔧 Fixed Implementation Plan

### **Immediate Fix: Why Modal Not Showing**

The agent created the modal, but the old `confirm()` is still being called. Let me check what happened:

**Problem:** UserSlideOut.tsx line 140 still has:
```typescript
if (!confirm(warningMessage)) return;
```

**Should be:**
```typescript
// Open modal instead
setShowDeleteModal(true);
return;
```

Let me create a Task to fix this properly and add ALL missing features.

---

## 📋 Complete Feature List to Add

### **Critical (Must have for v1.0):**
1. Fix delete modal (replace confirm with real modal)
2. Add Deleted users tab
3. Add ellipsis menu with Suspend action
4. Add email forwarding options
5. Add data transfer via Google Transfer API

### **High Priority:**
6. Audit Logs page
7. Lock Account feature
8. Copy operations (email, ID)

---

Should I:
**A) Fix the delete modal immediately** (agent's changes didn't apply correctly)
**B) Build all critical features systematically** (ellipsis menu, deleted tab, etc.)
**C) Create detailed spec first, then implement all at once**

What's your preference?