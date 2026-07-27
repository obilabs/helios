# Helios Feature Roadmap
## UI-Based Alternative to GAM & PSGSuite for Google Workspace

**Date:** October 5, 2025
**Purpose:** Strategic roadmap based on GAM/PSGSuite/Admin Console pain points

---

## 🎯 Market Opportunity

### Current Tool Landscape

**1. Google Admin Console (Native)**
- ❌ Inefficient for bulk operations (limited to <1,000 items)
- ❌ Slow and clunky UI (confirmed by users)
- ❌ Multiple clicks required for simple tasks
- ❌ Poor for automation and repetitive tasks
- ❌ Limited customization options
- ❌ Steep learning curve

**2. GAM (Command Line)**
- ✅ Excellent for bulk operations (parallel execution)
- ✅ Automation-friendly
- ✅ Features not available in Admin Console
- ❌ **Steep learning curve** - requires CLI/scripting expertise
- ❌ **Manual initiation** - no scheduled automation
- ❌ **Must keep computer running** - no cloud execution
- ❌ **Pull-based API** - struggles at scale
- ❌ **No real-time monitoring**
- ❌ **Confusing for non-technical admins**

**3. PSGSuite (PowerShell)**
- ✅ PowerShell integration
- ✅ Comprehensive Google Workspace coverage
- ❌ **Windows/PowerShell requirement**
- ❌ **Complex setup** (dependencies, configuration)
- ❌ **Scripting knowledge required**
- ❌ **No GUI**

---

## 💡 Helios Value Proposition

**"The GUI alternative that GAM users wish existed"**

Combine the power of GAM with the accessibility of a modern web UI:
- ✅ User-friendly GUI (no CLI/scripting required)
- ✅ Cloud-based (accessible anywhere, no local execution)
- ✅ Built-in automation & scheduling
- ✅ Real-time monitoring & notifications
- ✅ Bulk operations with visual feedback
- ✅ Audit trails & compliance reporting
- ✅ Multi-admin collaboration
- ✅ Self-service for end users

---

## 🏗️ Core Feature Categories

Based on GAM/PSGSuite capabilities and Admin Console gaps:

### 1. User Management ⭐ HIGH PRIORITY
**Current Status:** ✅ Partial (Google Workspace sync working)

#### Missing Features:
- [ ] **Manual user creation** (non-Google Workspace users)
- [ ] **Bulk user creation** (CSV import)
- [ ] **Bulk user updates** (modify multiple users at once)
- [ ] **User suspension/activation** (bulk operations)
- [ ] **Password resets** (bulk + individual)
- [ ] **User aliases management**
- [ ] **User profile updates** (photos, contact info)
- [ ] **User search & filtering** (advanced queries)
- [ ] **User comparison tool** (side-by-side)
- [ ] **User activity reports**

**Why Important:**
- Most common admin task
- Admin Console is slow for >10 users
- GAM requires scripting

---

### 2. Group Management ⭐ HIGH PRIORITY
**Current Status:** ✅ Implemented (create, edit, add/remove members)

#### Enhancement Opportunities:
- [ ] **Bulk member additions** (CSV import, multi-select)
- [ ] **Group templates** (pre-configured groups)
- [ ] **Nested groups visualization** (tree view)
- [ ] **Group membership comparison** (user overlap analysis)
- [ ] **Email aliases for groups**
- [ ] **Group settings** (posting permissions, moderation)
- [ ] **External member management** (outside domain)
- [ ] **Group activity logs** (who added/removed whom)
- [ ] **Smart groups** (auto-add based on OU/role)

**Why Important:**
- ✅ Already working well
- Extend to handle edge cases GAM users need

---

### 3. Organizational Units (OUs) ⭐ MEDIUM PRIORITY
**Current Status:** ✅ View only

#### Missing Features:
- [ ] **Create/edit/delete OUs**
- [ ] **Move users between OUs** (bulk operations)
- [ ] **OU hierarchy visualization** (tree view with drag-drop)
- [ ] **OU inheritance settings**
- [ ] **Bulk OU operations** (apply settings to all sub-OUs)
- [ ] **OU templates** (create standard structures)
- [ ] **OU search & filtering**

**Why Important:**
- Critical for large organizations
- Admin Console OU management is tedious
- GAM OU commands are complex

---

### 4. Gmail Management ⭐ HIGH PRIORITY
**Current Status:** ❌ Not implemented

#### Core Features Needed:
- [ ] **Email delegates** (view, add, remove - bulk)
- [ ] **Email forwarding** (configure, monitor)
- [ ] **Email filters** (create, manage - bulk apply)
- [ ] **Signatures** (HTML editor, bulk deploy)
- [ ] **Auto-reply/vacation settings** (bulk configure)
- [ ] **IMAP/POP settings** (bulk enable/disable)
- [ ] **Send-as aliases**
- [ ] **Gmail settings export/import** (templates)

**Why Important:**
- **GAM's #1 use case**
- Admin Console has no bulk delegate management
- Each setting requires multiple clicks per user

---

### 5. Google Drive Management ⭐ HIGH PRIORITY
**Current Status:** ❌ Not implemented

#### Core Features Needed:
- [ ] **File ownership transfer** (bulk, with filters)
- [ ] **Sharing permissions audit** (who has access to what)
- [ ] **External sharing report** (find all externally shared files)
- [ ] **Orphaned files** (files owned by deleted users)
- [ ] **Storage reports** (per-user, per-OU)
- [ ] **Bulk permission changes** (revoke external access)
- [ ] **File search** (across all users' drives)
- [ ] **Shared Drive management** (create, settings, members)

**Why Important:**
- **GAM's #2 use case**
- Admin Console has very limited Drive admin features
- Critical for offboarding and compliance

---

### 6. Calendar Management 🔶 MEDIUM PRIORITY
**Current Status:** ❌ Not implemented

#### Core Features Needed:
- [ ] **Resource calendars** (rooms, equipment)
- [ ] **Calendar ACLs** (sharing permissions - bulk)
- [ ] **Calendar delegates**
- [ ] **Event management** (bulk create/modify)
- [ ] **Calendar settings** (working hours, time zone)

**Why Important:**
- Common GAM use case
- Helpful for office management

---

### 7. Chrome/Mobile Device Management 🔶 MEDIUM PRIORITY
**Current Status:** ❌ Not implemented

#### Core Features Needed:
- [ ] **Device inventory** (list all devices)
- [ ] **Device search & filtering**
- [ ] **Remote wipe** (bulk operations)
- [ ] **Device status monitoring**
- [ ] **Chrome device assignment** (to users/OUs)
- [ ] **Mobile device policies** (bulk apply)

**Why Important:**
- GAM feature, less common but important
- Admin Console device management is basic

---

### 8. Licensing Management ⭐ HIGH PRIORITY
**Current Status:** ❌ Not implemented

#### Core Features Needed:
- [ ] **License inventory** (visual dashboard)
- [ ] **Assign licenses** (bulk operations)
- [ ] **License usage reports** (who has what)
- [ ] **Auto-assign rules** (by OU, group)
- [ ] **License cost tracking** (estimated billing)
- [ ] **License reclaim** (from inactive users)

**Why Important:**
- Cost management (critical for CFOs)
- Admin Console license view is confusing
- GAM license commands are tedious

---

### 9. Security & Compliance ⭐ HIGH PRIORITY
**Current Status:** ❌ Not implemented

#### Core Features Needed:
- [ ] **2FA enforcement monitoring** (compliance dashboard)
- [ ] **Security alerts** (suspicious activity)
- [ ] **Application-specific passwords** (audit)
- [ ] **OAuth token management** (revoke access)
- [ ] **Login history** (per-user, exportable)
- [ ] **Audit logs** (all admin actions)
- [ ] **Data export** (Vault takeout automation)
- [ ] **Compliance reports** (GDPR, SOC2 ready)

**Why Important:**
- Security teams need visibility
- Admin Console audit is buried
- GAM requires complex queries

---

### 10. Automation & Scheduling 🚀 DIFFERENTIATOR
**Current Status:** ❌ Not implemented

#### Killer Features:
- [ ] **Scheduled tasks** (run operations at specific times)
- [ ] **Workflows** (if-then automation)
  - Example: "If user joins 'Engineering' OU, add to 'Dev-Team' group and assign workspace license"
- [ ] **Recurring operations** (daily/weekly/monthly)
- [ ] **Approval workflows** (manager approval for access)
- [ ] **Notifications** (Slack, email, webhook)
- [ ] **Task templates** (save complex operations as templates)
- [ ] **Dry-run mode** (preview changes before applying)

**Why Important:**
- **This is Helios's killer feature**
- GAM can't do this (manual execution)
- PSGSuite requires custom scripts

---

### 11. Reporting & Analytics 🔶 MEDIUM PRIORITY
**Current Status:** ❌ Not implemented

#### Core Features Needed:
- [ ] **User activity reports** (last login, storage usage)
- [ ] **Group membership reports** (export, visualize)
- [ ] **Change history** (who changed what, when)
- [ ] **Custom reports** (build your own queries)
- [ ] **Scheduled reports** (email weekly summary)
- [ ] **Dashboards** (executive view)
- [ ] **Export to CSV/Excel** (all data)

**Why Important:**
- Compliance and auditing requirements
- Admin Console reports are limited

---

### 12. Classroom Management 🔷 LOW PRIORITY
**Current Status:** ❌ Not implemented

#### Features (if targeting education):
- [ ] **Class roster management**
- [ ] **Student invitations** (bulk)
- [ ] **Teacher assignments**
- [ ] **Class archiving**

**Why Important:**
- GAM/PSGSuite support this
- Only relevant for education sector

---

## 🎯 Recommended Development Phases

### Phase 1: Foundation (Current - Q1 2026)
**Goal:** Make Helios viable for basic Google Workspace administration

**Priority Features:**
1. ✅ ~~User sync from Google Workspace~~ (DONE)
2. ✅ ~~Group CRUD operations~~ (DONE)
3. 🔴 **Manual user creation** (local accounts)
4. 🔴 **Bulk user creation** (CSV import)
5. 🔴 **Gmail delegates management** (view, add, remove)
6. 🔴 **Email forwarding management**
7. 🔴 **OU create/edit/move users**
8. 🔴 **Basic audit logging** (track all admin actions)

**Success Metric:** Admins can do 50% of their daily tasks without GAM

---

### Phase 2: Bulk Operations (Q2 2026)
**Goal:** Replace GAM for bulk operations

**Priority Features:**
1. 🔴 **Bulk user updates** (select multiple, apply changes)
2. 🔴 **Bulk group member additions** (CSV, multi-select)
3. 🔴 **Drive ownership transfers** (bulk)
4. 🔴 **License assignments** (bulk)
5. 🔴 **Dry-run mode** (preview all operations)
6. 🔴 **Operation progress tracking** (real-time feedback)
7. 🔴 **CSV import/export** (users, groups, settings)

**Success Metric:** Admins can do 80% of GAM tasks via Helios UI

---

### Phase 3: Automation & Intelligence (Q3 2026)
**Goal:** Surpass GAM capabilities

**Priority Features:**
1. 🔴 **Scheduled tasks** (run operations on schedule)
2. 🔴 **Workflow automation** (if-then rules)
3. 🔴 **Smart suggestions** (AI-powered recommendations)
4. 🔴 **Approval workflows** (manager approval chains)
5. 🔴 **Notifications** (Slack, email, webhook)
6. 🔴 **Task templates** (save complex operations)
7. 🔴 **Compliance dashboards** (2FA, security posture)

**Success Metric:** Admins save 10+ hours/week vs GAM

---

### Phase 4: Advanced Features (Q4 2026+)
**Goal:** Comprehensive Google Workspace management

**Priority Features:**
1. 🔴 **Advanced Drive management** (external sharing audit, orphaned files)
2. 🔴 **Calendar resource management**
3. 🔴 **Device management** (Chrome, mobile)
4. 🔴 **Custom reports & dashboards**
5. 🔴 **API access** (for power users)
6. 🔴 **Classroom integration** (education customers)
7. 🔴 **Multi-organization support** (MSP features)

**Success Metric:** Helios is the #1 Google Workspace admin tool

---

## 🚀 Immediate Next Steps

### This Sprint (Next 2 Weeks)
1. ✅ Commit Groups feature changes
2. 🔴 **Build user creation flow** (manual accounts)
   - Backend: `POST /api/organization/users`
   - Frontend: "Add User" modal in Users page
   - Fields: Email, password, first/last name, role
3. 🔴 **Build bulk user CSV import**
   - Parse CSV (email, firstName, lastName, role)
   - Validation & error handling
   - Progress indicator
4. 🔴 **Add Gmail delegates UI**
   - View delegates for a user
   - Add delegate (with user search)
   - Remove delegate
   - Bulk delegate management

### This Month (November 2025)
1. 🔴 OU management (create, edit, move users)
2. 🔴 Email forwarding UI
3. 🔴 Basic audit log viewer
4. 🔴 User search & filtering improvements
5. 🔴 Bulk user updates UI

---

## 📊 Feature Comparison Matrix

| Feature | Admin Console | GAM | PSGSuite | **Helios Target** |
|---------|--------------|-----|----------|-------------------|
| User-friendly UI | ✅ Yes | ❌ No | ❌ No | ✅ **Yes** |
| Bulk operations | ⚠️ Limited | ✅ Yes | ✅ Yes | ✅ **Yes** |
| Automation | ❌ No | ⚠️ Manual | ⚠️ Scripts | ✅ **Built-in** |
| Cloud execution | ✅ Yes | ❌ No | ❌ No | ✅ **Yes** |
| Real-time monitoring | ⚠️ Basic | ❌ No | ❌ No | ✅ **Yes** |
| Audit logs | ⚠️ Basic | ❌ No | ❌ No | ✅ **Detailed** |
| Learning curve | ⚠️ Steep | 🔴 Very steep | 🔴 Very steep | ✅ **Shallow** |
| Gmail delegates | ⚠️ One at a time | ✅ Bulk | ✅ Bulk | ✅ **Bulk** |
| Drive management | ⚠️ Limited | ✅ Full | ✅ Full | ✅ **Full** |
| Scheduled tasks | ❌ No | ❌ No | ❌ No | ✅ **Yes** |
| Approval workflows | ❌ No | ❌ No | ❌ No | ✅ **Yes** |

---

## 🎓 Target User Personas

### 1. **The Non-Technical Admin** (Primary)
- Google Workspace admin at SMB (50-500 employees)
- No CLI/scripting experience
- Frustrated with Admin Console's limitations
- Needs bulk operations but can't use GAM
- **Pain:** "I know GAM can do this, but I don't know how to write the command"

### 2. **The Overwhelmed IT Manager** (Primary)
- Manages 500-5,000 Google Workspace users
- Uses GAM but hates it
- Spends hours on repetitive tasks
- Needs automation and delegation
- **Pain:** "I'm tired of running GAM scripts manually every week"

### 3. **The Security-Conscious Admin** (Secondary)
- Compliance and audit requirements
- Needs visibility into permissions, sharing, 2FA
- Wants reports and dashboards
- **Pain:** "I can't easily audit who has access to what"

### 4. **The MSP / Consultant** (Future)
- Manages multiple Google Workspace organizations
- Needs multi-tenant support
- Bills clients for admin services
- **Pain:** "I need a professional tool I can use for all my clients"

---

## 💰 Competitive Positioning

**Pricing Strategy (Future):**
- Free tier: Up to 50 users, basic features
- Pro tier: $5/user/month, all features + automation
- Enterprise: Custom pricing, dedicated support, SLA

**Competitive Advantages:**
1. **No scripting required** (vs GAM/PSGSuite)
2. **Cloud-based** (vs GAM/PSGSuite requiring local execution)
3. **Built-in automation** (vs manual GAM execution)
4. **Real-time monitoring** (vs GAM's pull-based approach)
5. **Compliance-ready** (audit logs, reports)

---

## 📚 Resources

- **GAM GitHub:** https://github.com/GAM-team/GAM
- **GAM Wiki:** https://github.com/GAM-team/GAM/wiki/
- **PSGSuite:** https://psgsuite.io/
- **Google Admin SDK:** https://developers.google.com/admin-sdk
- **Competitor (GW Manager):** https://www.gwmanager.com/

---

**Next Update:** After Phase 1 completion (Q1 2026)
