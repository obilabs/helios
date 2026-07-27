# Phase 1 Sprint Plan - MVP Launch
**Start Date:** November 7, 2025
**Target Completion:** December 7, 2025 (4 weeks)
**Goal:** Launch production-ready Helios with 60 CLI commands + core UI improvements

---

## 🎯 Sprint Objectives

### Primary Goals
1. ✅ Implement 60 high-quality CLI commands (30 Google, 30 Microsoft)
2. ✅ Build unified dashboard with at-a-glance metrics
3. ✅ Add advanced filtering to all list views
4. ✅ Implement CSV import/export
5. ✅ Server-side storage for large exports
6. ✅ Mobile responsive design

### Success Criteria
- [ ] All 60 commands working and tested
- [ ] Dashboard loads in <2 seconds
- [ ] Can provision new user in <2 minutes (both platforms)
- [ ] CSV export works for any table (1-click)
- [ ] Bulk operations with preview work correctly
- [ ] Mobile responsive at 320px, 768px, 1024px breakpoints

---

## 📅 4-Week Timeline

### Week 1: Foundation + Top 10 Google Commands
**Dates:** Nov 7-13

**Monday-Tuesday (Backend):**
- [ ] Review existing Google Workspace commands
- [ ] Implement missing top 10 commands:
  - [ ] `gw users create` ✅ (already exists)
  - [ ] `gw users list` ✅ (already exists)
  - [ ] `gw users update` ✅ (already exists)
  - [ ] `gw users suspend` ✅ (already exists)
  - [ ] `gw groups add-member` ✅ (already exists)
  - [ ] `gw users reset-password` (NEW)
  - [ ] `gw drive transfer-ownership` (NEW)
  - [ ] `gw users restore` ✅ (already exists)
  - [ ] `gw shared-drives create` (NEW)
  - [ ] `gw shared-drives list-permissions` (NEW)

**Wednesday-Thursday (Frontend):**
- [ ] Create unified dashboard component
- [ ] Add metrics cards (users, licenses, storage, groups)
- [ ] Add quick actions section
- [ ] Add recent activity feed

**Friday (Testing & Polish):**
- [ ] Test all Google Workspace commands
- [ ] Add help text for new commands
- [ ] Update documentation

### Week 2: Top 10 Microsoft 365 Commands
**Dates:** Nov 14-20

**Monday-Wednesday (Backend - Microsoft Graph API):**
- [ ] Set up Microsoft Graph API service
- [ ] Implement authentication flow
- [ ] Implement top 10 Microsoft 365 commands:
  - [ ] `ms users list`
  - [ ] `ms users create`
  - [ ] `ms users reset-password`
  - [ ] `ms licenses assign`
  - [ ] `ms users update`
  - [ ] `ms groups add-member`
  - [ ] `ms mailbox get-permissions`
  - [ ] `ms licenses list-available`
  - [ ] `ms users disable`
  - [ ] `ms users delete`

**Thursday-Friday (Integration):**
- [ ] Add Microsoft 365 status to dashboard
- [ ] Update platform visibility (users list shows M365)
- [ ] Test cross-platform workflows

### Week 3: Advanced UI Features
**Dates:** Nov 21-27

**Monday-Tuesday (Filtering):**
- [ ] Implement advanced filtering component
- [ ] Add real-time search
- [ ] Add filter chips (Status, Department, Type)
- [ ] Add "Save Filter" functionality
- [ ] Auto-apply filters (no search button)

**Wednesday (Bulk Operations):**
- [ ] Add bulk selection to users list
- [ ] Create bulk action toolbar
- [ ] Implement preview modal
- [ ] Add progress indicators

**Thursday (CSV):**
- [ ] CSV export from any table
- [ ] Download as CSV/Excel/JSON
- [ ] Template downloads
- [ ] Server-side storage for large exports

**Friday (Testing):**
- [ ] Test filtering with 10,000 users
- [ ] Test bulk operations (100+ users)
- [ ] Test CSV export (1,000+ rows)

### Week 4: Remaining 40 Commands + Polish
**Dates:** Nov 28 - Dec 4

**Monday-Tuesday (Google Workspace - Remaining 20):**
- [ ] Groups commands (create, update, delete, list-members, remove-member)
- [ ] Org Units commands (create, update, delete, move-user)
- [ ] Delegates commands (already exist ✅)
- [ ] Shared Drives commands (get, update, delete, add-member, remove-member)
- [ ] Reports commands (users, admin, drive)
- [ ] Sync commands (status, conflicts)

**Wednesday (Microsoft 365 - Remaining 15):**
- [ ] Groups commands (list, get, create, delete, remove-member, add-owner, remove-owner)
- [ ] Mail commands (send, list, get, delegates-add)
- [ ] Reports commands (users, teams, security)
- [ ] Sync commands

**Thursday (UI Polish):**
- [ ] Mobile responsive layouts
- [ ] Loading states
- [ ] Error states
- [ ] Empty states
- [ ] Toast notifications
- [ ] Accessibility (WCAG 2.1 AA)

**Friday (Final Testing & Docs):**
- [ ] End-to-end testing
- [ ] Performance testing
- [ ] Update all documentation
- [ ] Create video tutorials
- [ ] Prepare for launch

### Launch Week: Dec 5-7
- [ ] Final QA
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Collect user feedback

---

## 📋 Detailed Task Breakdown

### 1. Google Workspace Commands (30 Total)

#### Users (12 commands)
- [x] `gw users list` - Already implemented
- [x] `gw users get <email>` - Already implemented
- [x] `gw users create <email> --firstName=X --lastName=Y --password=Z` - Already implemented
- [x] `gw users update <email> --firstName=X --ou=Y` - Already implemented
- [x] `gw users suspend <email>` - Already implemented
- [x] `gw users restore <email>` - Already implemented
- [x] `gw users delete <email>` - Already implemented
- [x] `gw users move <email> --ou=/Staff/Sales` - Already implemented
- [ ] `gw users reset-password <email> [--password=X]` - **NEW**
- [ ] `gw users add-alias <email> <alias>` - **NEW**
- [ ] `gw users remove-alias <email> <alias>` - **NEW**
- [ ] `gw users make-admin <email>` - **NEW**

#### Groups (8 commands)
- [x] `gw groups list` - Already implemented
- [x] `gw groups get <email>` - Already implemented
- [x] `gw groups create <email> --name=X` - Already implemented
- [x] `gw groups update <email> --name=X` - Already implemented
- [x] `gw groups delete <email>` - Already implemented
- [x] `gw groups members <email>` - Already implemented
- [x] `gw groups add-member <group> <user> --role=MEMBER` - Already implemented
- [x] `gw groups remove-member <group> <user>` - Already implemented

#### Shared Drives (5 commands) - **ALL NEW**
- [ ] `gw shared-drives create --name="Marketing" --ou=/Marketing`
- [ ] `gw shared-drives list`
- [ ] `gw shared-drives get <drive-id>`
- [ ] `gw shared-drives add-member <drive-id> <email> --role=writer`
- [ ] `gw shared-drives list-permissions <drive-id>`

#### Org Units (3 commands)
- [x] `gw orgunits list` - Already implemented
- [x] `gw orgunits create <parent> --name=Sales` - Already implemented
- [x] `gw orgunits delete </Staff/Sales>` - Already implemented

#### Delegates (2 commands)
- [x] `gw delegates list <user>` - Already implemented
- [x] `gw delegates add <user> <delegate>` - Already implemented

**Total: 30 commands (22 exist, 8 new)**

---

### 2. Microsoft 365 Commands (30 Total)

#### Users (12 commands) - **ALL NEW**
- [ ] `ms users list [--filter=X]`
- [ ] `ms users get <email>`
- [ ] `ms users create <email> --displayName=X --password=Y`
- [ ] `ms users update <email> --department=X --jobTitle=Y`
- [ ] `ms users delete <email>`
- [ ] `ms users disable <email>`
- [ ] `ms users enable <email>`
- [ ] `ms users reset-password <email> [--password=X]`
- [ ] `ms users assign-license <email> <sku>`
- [ ] `ms users revoke-license <email> <sku>`
- [ ] `ms users get-licenses <email>`
- [ ] `ms users add-to-group <email> <group-id>`

#### Groups (8 commands) - **ALL NEW**
- [ ] `ms groups list [--filter=X]`
- [ ] `ms groups get <id>`
- [ ] `ms groups create --displayName=X --mailNickname=Y`
- [ ] `ms groups delete <id>`
- [ ] `ms groups add-member <group> <user>`
- [ ] `ms groups remove-member <group> <user>`
- [ ] `ms groups add-owner <group> <user>`
- [ ] `ms groups list-members <group>`

#### Licenses (3 commands) - **NEW**
- [ ] `ms licenses list-available` - Show SKUs and available count
- [ ] `ms licenses list-assigned [--user=X]` - Show all assigned licenses
- [ ] `ms licenses get-sku <sku>` - Get SKU details

#### Mail (4 commands) - **NEW**
- [ ] `ms mail get-permissions <user>` - List mailbox delegates
- [ ] `ms mail add-permission <user> <delegate> --access=FullAccess`
- [ ] `ms mail remove-permission <user> <delegate>`
- [ ] `ms mail list-forwarding-rules <user>`

#### Reports (3 commands) - **NEW**
- [ ] `ms reports users-activity` - User activity report
- [ ] `ms reports teams-usage` - Teams usage report
- [ ] `ms reports mailbox-usage` - Mailbox sizes

**Total: 30 commands (0 exist, 30 new)**

---

## 🎨 UI Components to Build

### 1. Unified Dashboard
**Location:** `frontend/src/pages/Dashboard.tsx`

**Components:**
```tsx
<Dashboard>
  <MetricsRow>
    <MetricCard title="Users" value={245} change="+12" />
    <MetricCard title="Licenses" value="223/250" usage={89} />
    <MetricCard title="Storage" value="2.1 TB" change="+120 GB" />
    <MetricCard title="Groups" value={34} change="+2" />
  </MetricsRow>

  <QuickActions>
    <Button icon="user-plus">Add User</Button>
    <Button icon="upload">Import CSV</Button>
    <Button icon="download">Export Report</Button>
    <Button icon="refresh">Sync Now</Button>
  </QuickActions>

  <TwoColumnLayout>
    <RecentActivity items={activities} />
    <AlertsPanel alerts={alerts} />
  </TwoColumnLayout>
</Dashboard>
```

**Acceptance Criteria:**
- [ ] Loads in <2 seconds
- [ ] Shows real-time data from both Google & Microsoft
- [ ] Updates without page refresh
- [ ] Responsive on mobile (320px+)

### 2. Advanced Filtering Component
**Location:** `frontend/src/components/AdvancedFilter.tsx`

**Features:**
- Real-time search (debounced 300ms)
- Filter chips (Status, Type, Department, Date Range)
- Save custom filters
- Auto-apply (results update as you type)
- Clear all filters button

**Acceptance Criteria:**
- [ ] Search works with 10,000+ users
- [ ] Filters apply instantly
- [ ] Can save and load custom filters
- [ ] Mobile-friendly (collapsible on small screens)

### 3. Bulk Operations Modal
**Location:** `frontend/src/components/BulkOperationModal.tsx`

**Features:**
- Preview affected users
- Warning for admin accounts
- Progress indicator
- Undo capability (7-day window)
- Success/error summary

**Acceptance Criteria:**
- [ ] Shows accurate preview
- [ ] Warns before destructive actions
- [ ] Handles errors gracefully
- [ ] Can undo within 7 days

### 4. CSV Import Wizard
**Location:** `frontend/src/components/CSVImportWizard.tsx`

**Steps:**
1. Upload (drag-and-drop)
2. Map columns
3. Validate (show errors/duplicates)
4. Confirm and import

**Acceptance Criteria:**
- [ ] Supports CSV, Excel (XLSX), JSON
- [ ] Validates data before import
- [ ] Shows duplicate detection
- [ ] Provides detailed error messages
- [ ] Can download template files

### 5. Downloads Panel
**Location:** `frontend/src/components/DownloadsPanel.tsx`

**Features:**
- List recent exports
- Re-download files
- Delete exports
- Shows expiry dates
- Storage usage indicator

**Acceptance Criteria:**
- [ ] Lists all exports for current user
- [ ] Can filter by type/date
- [ ] Shows file sizes
- [ ] One-click download

---

## 🔧 Technical Implementation Details

### Backend API Endpoints to Create

#### Microsoft 365 Service
**New file:** `backend/src/services/microsoft-graph.service.ts`

```typescript
export class MicrosoftGraphService {
  private client: Client;

  constructor(organizationId: string) {
    // Initialize Graph client with app credentials
  }

  // Users
  async listUsers(filter?: string): Promise<User[]>
  async getUser(email: string): Promise<User>
  async createUser(data: CreateUserDto): Promise<User>
  async updateUser(email: string, data: UpdateUserDto): Promise<User>
  async deleteUser(email: string): Promise<void>
  async disableUser(email: string): Promise<User>
  async resetPassword(email: string, password?: string): Promise<string>

  // Licenses
  async listAvailableLicenses(): Promise<License[]>
  async assignLicense(email: string, skuId: string): Promise<void>
  async revokeLicense(email: string, skuId: string): Promise<void>

  // Groups
  async listGroups(filter?: string): Promise<Group[]>
  async createGroup(data: CreateGroupDto): Promise<Group>
  async addGroupMember(groupId: string, userId: string): Promise<void>

  // Mail
  async getMailboxPermissions(email: string): Promise<Permission[]>
  async addMailboxPermission(email: string, delegate: string, access: string): Promise<void>
}
```

#### Storage Service
**New file:** `backend/src/services/export-storage.service.ts`

```typescript
export class ExportStorageService {
  async saveExport(options: {
    organizationId: string;
    userId: string;
    data: string;
    filename: string;
    format: 'csv' | 'excel' | 'json';
  }): Promise<string> {
    // Save to /var/helios/exports/{org}/{year}/{month}/
    // Return file ID
  }

  async getExport(fileId: string, userId: string): Promise<Buffer>
  async listExports(userId: string): Promise<Export[]>
  async deleteExport(fileId: string, userId: string): Promise<void>
}
```

### Database Schema Updates

```sql
-- Microsoft 365 credentials
CREATE TABLE ms365_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  tenant_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  client_secret_encrypted TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Microsoft 365 synced users
CREATE TABLE ms365_synced_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_principal_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  email VARCHAR(255),
  department VARCHAR(255),
  job_title VARCHAR(255),
  licenses JSONB,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Exported files
CREATE TABLE exported_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES organization_users(id),
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(100),
  export_type VARCHAR(50), -- 'users', 'groups', 'audit', 'report'
  format VARCHAR(20), -- 'csv', 'excel', 'json', 'pdf'
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  download_count INT DEFAULT 0,
  last_downloaded_at TIMESTAMP
);

CREATE INDEX idx_exported_files_user ON exported_files(user_id, expires_at);
CREATE INDEX idx_exported_files_org ON exported_files(organization_id, expires_at);

-- Bulk operation history
CREATE TABLE bulk_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES organization_users(id),
  operation_type VARCHAR(50), -- 'suspend', 'delete', 'move', 'update'
  target_count INT NOT NULL,
  success_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  status VARCHAR(20), -- 'pending', 'running', 'completed', 'failed'
  details JSONB,
  can_undo BOOLEAN DEFAULT TRUE,
  undo_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

---

## 🧪 Testing Strategy

### Unit Tests
- [ ] Test each CLI command with mock data
- [ ] Test Microsoft Graph service methods
- [ ] Test export storage service
- [ ] Test filtering logic
- [ ] Test CSV parsing/generation

### Integration Tests
- [ ] Test end-to-end user creation (both platforms)
- [ ] Test bulk operations
- [ ] Test CSV import with duplicates
- [ ] Test file export and download
- [ ] Test sync between platforms

### E2E Tests (Playwright)
- [ ] Test dashboard loads correctly
- [ ] Test filtering and search
- [ ] Test bulk selection and operations
- [ ] Test CSV import wizard flow
- [ ] Test mobile responsive layouts

### Performance Tests
- [ ] Dashboard with 10,000 users
- [ ] Filtering 10,000 users
- [ ] Bulk operation on 500 users
- [ ] CSV export of 5,000 users
- [ ] Page load time <2 seconds

---

## 📦 Dependencies to Add

### Backend
```json
{
  "@microsoft/microsoft-graph-client": "^3.0.7",
  "@azure/identity": "^4.0.0",
  "exceljs": "^4.4.0",
  "csv-parse": "^5.5.3",
  "csv-stringify": "^6.4.5"
}
```

### Frontend
```json
{
  "lucide-react": "^0.294.0",
  "react-dropzone": "^14.2.3",
  "recharts": "^2.10.3",
  "date-fns": "^2.30.0"
}
```

---

## 📝 Documentation to Create

1. **User Guide**
   - Getting started
   - CLI commands reference
   - UI walkthrough
   - Common workflows

2. **Admin Guide**
   - Initial setup
   - Google Workspace configuration
   - Microsoft 365 configuration
   - User management
   - Security best practices

3. **Developer Guide**
   - API documentation
   - Adding new commands
   - Testing guidelines
   - Contributing

4. **Video Tutorials** (5-10 minutes each)
   - Dashboard overview
   - Creating users (both platforms)
   - Bulk operations
   - CSV import
   - Filtering and search

---

## 🚀 Deployment Checklist

### Pre-Launch
- [ ] All 60 commands working
- [ ] All tests passing (100% critical paths)
- [ ] Documentation complete
- [ ] Video tutorials recorded
- [ ] Performance benchmarks met
- [ ] Security audit complete
- [ ] Backup and recovery tested

### Launch Day
- [ ] Deploy to production
- [ ] Monitor error logs
- [ ] Monitor performance metrics
- [ ] Set up alerts for critical errors
- [ ] Announce to beta users

### Post-Launch
- [ ] Collect user feedback
- [ ] Track usage metrics
- [ ] Identify top issues
- [ ] Plan Phase 2 based on feedback

---

## 📊 Success Metrics (Week 4 Review)

### Technical Metrics
- [ ] Page load time: <2 seconds (avg)
- [ ] API response time: <200ms p95
- [ ] Test coverage: >80%
- [ ] Error rate: <1%
- [ ] Uptime: >99.9%

### User Experience Metrics
- [ ] User provisioning time: <2 minutes
- [ ] CSV export time: <30 seconds (1,000 rows)
- [ ] Dashboard load: <2 seconds
- [ ] Mobile responsiveness: Works at 320px+
- [ ] Accessibility: WCAG 2.1 AA compliant

### Business Metrics
- [ ] Beta user satisfaction: >90%
- [ ] Feature completion: 100% of Phase 1
- [ ] Bug count: <10 P0/P1 bugs
- [ ] User onboarding time: <10 minutes
- [ ] Support tickets: <5 per week

---

**Status:** 🚀 Ready to launch Phase 1
**Team:** Ready
**Timeline:** 4 weeks (Nov 7 - Dec 7)
**Next Step:** Begin Week 1 implementation
