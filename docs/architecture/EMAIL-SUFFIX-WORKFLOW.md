# Email Suffix Workflow - Keep Old Emails + Forward New Ones

**Your Innovation:** Rename user email to free up original for forwarding group

---

## 🎯 The Problem This Solves

**Scenario:** Employee leaves, need to:
- Access old emails ✅
- Forward new emails ✅
- Not pay for active license ❌

**Can't do:**
- Create group with same email as active user
- Access mailbox via delegation after deletion

---

## ✅ Your Solution: Email Suffix + Forwarding Group

### **Workflow:**

```
1. User: anthony@gridworx.io
   Status: Active, has 5 years of emails

2. Rename user email (via Google API):
   anthony@gridworx.io → anthony.old-20251102@gridworx.io

3. User account still exists:
   - Old emails accessible
   - Can grant delegation if needed
   - License: BILLED (but can delete later)

4. Create forwarding group:
   Email: anthony@gridworx.io (now available!)
   Members: manager@gridworx.io, anthony.old-20251102@gridworx.io

5. Result:
   - New emails to anthony@ → Forward to manager ✅
   - Old emails: In anthony.old@ account ✅
   - Can access old emails (via delegation or keep active) ✅
   - Original email address works for forwarding ✅

6. Optional - After manager exports needed emails:
   - Delete anthony.old@ account
   - License freed ✅
   - Forwarding group remains ✅
```

---

## 🔧 Implementation

### **Google API Call:**

```bash
# Rename user email (primary email change)
PATCH /api/google/admin/directory/v1/users/anthony@gridworx.io
{
  "primaryEmail": "anthony.old-20251102@gridworx.io"
}

# Wait for propagation (60 seconds)

# Create forwarding group with original email
POST /api/google/admin/directory/v1/groups
{
  "email": "anthony@gridworx.io",
  "name": "Email Forwarding - Anthony Chike"
}

# Configure as hidden
PATCH /api/google/groupssettings/v1/groups/anthony@gridworx.io
{
  "includeInGlobalAddressList": "false",
  ...
}

# Add members
POST /api/google/admin/directory/v1/groups/anthony@gridworx.io/members
{ "email": "manager@gridworx.io" }

POST /api/google/admin/directory/v1/groups/anthony@gridworx.io/members
{ "email": "anthony.old-20251102@gridworx.io" }
```

---

## 🎨 Enhanced Delete Modal

### **Add "Keep Old Emails" Option:**

```
┌──────────────────────────────────────────────────────┐
│  Delete User: Anthony Chike                          │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ☑ Keep old emails accessible                        │
│    Rename account to free up email for forwarding    │
│                                                       │
│    Original: anthony@gridworx.io                     │
│    Renamed to: anthony.old-20251102@gridworx.io      │
│                                                       │
│    Benefits:                                         │
│    ✅ Old emails remain accessible                   │
│    ✅ Can delegate to manager for access             │
│    ✅ Original email used for forwarding group       │
│    ✅ Can delete later after email export            │
│                                                       │
│    ⚠️ Account stays active (still billed) until      │
│       manager exports needed emails, then delete     │
│                                                       │
│  Forward new emails to:                              │
│  [x] manager@gridworx.io                             │
│  [ ] hr@gridworx.io                                  │
│                                                       │
│  Grant delegation to: [manager@gridworx.io    ▼]     │
│  (Delegation works because account stays active)     │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## 💾 Mailbox Archive Plugin (Your v1.1 Feature!)

### **Your Vision:**

```
Export emails to Helios database
→ Delete Google account (free license)
→ View archived emails in Helios UI
→ Searchable, viewable, read-only
→ No ongoing Google costs
```

### **Implementation:**

**Database Schema:**
```sql
CREATE TABLE archived_emails (
  id UUID PRIMARY KEY,
  organization_id UUID,
  original_user_id UUID,
  original_user_email VARCHAR(255),

  -- Email data
  message_id VARCHAR(255),
  thread_id VARCHAR(255),
  from_email VARCHAR(255),
  to_emails TEXT[],
  cc_emails TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  headers JSONB,

  -- Attachments
  has_attachments BOOLEAN,
  attachment_count INT,
  attachments JSONB,

  -- Metadata
  sent_date TIMESTAMP,
  received_date TIMESTAMP,
  labels TEXT[],
  is_read BOOLEAN,
  is_starred BOOLEAN,

  -- Archive info
  archived_at TIMESTAMP,
  archived_by UUID,

  created_at TIMESTAMP DEFAULT NOW()
);
```

**API:**
```typescript
// Export mailbox before deletion
POST /api/organization/users/:userId/export-mailbox
{
  "dateRange": {
    "start": "2020-01-01",
    "end": "2025-11-02"
  },
  "includeAttachments": true,
  "maxMessages": 10000
}

// View archived emails in Helios
GET /api/organization/archived-emails?userId={id}

// Search archived emails
GET /api/organization/archived-emails/search?q=contract
```

**UI:**
```
User Detail → Archived Emails Tab

Shows emails in Gmail-like interface:
- Subject, from, date
- Read/unread indicators
- Search
- Filter by date
- Read-only (can't reply)
```

**Benefits:**
- ✅ Delete Google account (free license)
- ✅ Keep email access forever
- ✅ Use original email for forwarding
- ✅ Compliance/audit capability
- ✅ No ongoing Google costs

**This is a KILLER feature!**

---

## 🔄 Workflow Builder System (v1.1)

### **Your Vision:**

```
Predefined Workflows:
- Offboard Employee
- Onboard Employee
- Transfer to Different Department
- Security Incident Response
- Compliance Hold

Each workflow = Series of API calls

Admin can:
- Enable/disable workflows
- Add to right-click menu
- Customize steps
- Set as default action
```

### **Example: Offboard Employee Workflow**

```typescript
{
  name: "Offboard Employee",
  description: "Complete employee offboarding",
  addToMenu: true,
  steps: [
    {
      step: 1,
      name: "Transfer Drive files",
      api: "POST /api/google/admin/datatransfer/v1/transfers",
      params: { items: ["drive"], transferTo: "{{manager}}" }
    },
    {
      step: 2,
      name: "Transfer Calendar",
      api: "POST /api/google/admin/datatransfer/v1/transfers",
      params: { items: ["calendar"], transferTo: "{{manager}}" }
    },
    {
      step: 3,
      name: "Export mailbox to Helios",
      api: "POST /api/organization/users/:id/export-mailbox",
      params: { includeAttachments: true }
    },
    {
      step: 4,
      name: "Rename email (add suffix)",
      api: "PATCH /api/google/admin/directory/v1/users/:id",
      params: { primaryEmail: "{{email}}.old-{{date}}" }
    },
    {
      step: 5,
      name: "Create forwarding group",
      api: "POST /hidden-forwarding-group",
      params: { originalEmail: "{{email}}", forwardTo: ["{{manager}}"] }
    },
    {
      step: 6,
      name: "Delete user account",
      api: "DELETE /api/google/admin/directory/v1/users/:id"
    },
    {
      step: 7,
      name: "Create security event",
      api: "POST /api/organization/security-events",
      params: { type: "user_offboarded", severity: "info" }
    }
  ]
}
```

**Right-Click Menu:**
```
User: Anthony Chike
  ├─ View Details
  ├─ ─────────────
  ├─ 🚀 Offboard Employee  ← Workflow!
  ├─ 🔄 Transfer Department
  ├─ 🔒 Security Lockdown
  ├─ ─────────────
  ├─ Suspend
  ├─ Delete...
```

**Execution:**
```
1. Admin clicks "Offboard Employee"
2. Modal opens:
   - Shows workflow steps
   - Select manager from dropdown
   - Checkboxes for optional steps
   - "Execute Workflow" button
3. Progress bar shows each step
4. Completion summary shows results
5. All actions logged in audit trail
```

---

## 🎯 My Recommendation

### **For v1.0 (This Week):**

**A) Implement Email Suffix Workflow** (4 hours)
- Add "Keep old emails" checkbox to delete modal
- Rename user email before deletion
- Create forwarding group with original email
- Test thoroughly

**Why:** This solves the delegation problem elegantly

**B) Document Mailbox Archive** (1 hour)
- Create spec for v1.1
- Don't implement yet (complex)
- Validate concept first

**C) Document Workflow Builder** (1 hour)
- Create spec for v1.1
- This is a major feature (1-2 weeks)
- Plan architecture

---

### **For v1.1 (Next Month):**

**D) Build Mailbox Archive Plugin** (1 week)
- Export Gmail via API
- Store in Helios database
- Read-only viewer UI
- Search functionality

**E) Build Workflow System** (2 weeks)
- Workflow engine
- Predefined workflows
- Right-click integration
- Progress tracking

---

## 💡 Architecture Question

**Mailbox Archive - Implementation Options:**

### **Option 1: Full Archive in Helios DB** (Your idea)
```
Pros:
✅ Delete Google account (free license)
✅ Emails in Helios forever
✅ Searchable
✅ No Google costs

Cons:
❌ Large database storage needed
❌ Attachments storage
❌ Complex to implement
```

### **Option 2: Gmail Takeout + Read-Only Delegate**
```
Steps:
1. Google Takeout (admin initiates)
2. Download mbox file
3. Store in Helios file storage
4. Provide download link to manager

Pros:
✅ Uses Google's export tool
✅ Standard mbox format
✅ Manager can import to any email client

Cons:
⚠️ Not searchable in Helios
⚠️ File storage needed
```

### **Option 3: Keep Account Active for 90 Days**
```
Temporary license cost:
90 days × $12/month / 30 days = $36

Use for:
- Manager exports what they need
- Archive important emails
- Then delete after 90 days

Pros:
✅ Simple (no new features)
✅ Manager has full Gmail access
✅ Can use existing delegation

Cons:
❌ Costs $36 for 90 days
```

---

## 🔥 What Should We Build FIRST?

**My recommendation for THIS session:**

**A) Email Suffix Workflow** (4 hours) ← DO THIS
- Solves immediate problem
- Enables delegation + forwarding
- Production-ready this week

**Then document for v1.1:**
**B) Mailbox Archive spec** (30 min)
**C) Workflow Builder spec** (1 hour)

---

**Should I implement the Email Suffix workflow right now?** It's the perfect solution for the delegation problem and we can ship it this week!

**Or do you want to:**
- Spec out Mailbox Archive first?
- Spec out Workflow Builder first?
- Ship v1.0 as-is and plan v1.1?

What's your call?