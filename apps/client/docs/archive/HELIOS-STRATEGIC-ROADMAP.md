# Helios Strategic Roadmap - Path to Market Leadership

**Date**: November 1, 2025
**Status**: Strategic Direction Document
**Decision**: Build ITSM as Integrated Helios Module

---

## 🎯 Executive Summary

**Recommendation**: Build ITSM capabilities as integrated Helios modules, NOT a standalone app.

**Rationale**:
1. Leverage existing enterprise foundation (canonical model, feature flags, API keys)
2. Unique market position: "Only ITSM native to Google Workspace"
3. 5-7 weeks to MVP vs 6 months for standalone
4. Superior UX (one login, one platform, zero sync lag)
5. Your API key system PERFECTLY enables provider access model

**Target**: Internal IT teams at Google Workspace organizations (5-500 users)
**Path to $100K ARR**: 500 customers @ $200/month in 12-18 months
**Competitive Advantage**: Google Workspace integration + modern architecture + provider API keys

---

## 📊 Market Analysis

### Current Landscape:

**ITFlow** (Open Source, MSP-focused):
- Target: Small MSPs (1-5 techs)
- Pricing: Free (self-hosted)
- Tech: PHP/MySQL
- Strength: Free, feature-complete
- Weakness: Dated UI, no workspace integration, self-hosted only

**FreshService** (Commercial, Enterprise):
- Target: Enterprise IT teams
- Pricing: $29-99/user/month
- Strength: Mature, integrated suite
- Weakness: Expensive, complex, poor Google integration

**BetterCloud** (SaaS Management):
- Target: Google/M365 admins
- Pricing: $2-5/user/month
- Strength: Excellent workspace integration
- Weakness: No ITSM/ticketing

**ServiceNow** (Enterprise):
- Target: Fortune 500
- Pricing: $100+/user/month
- Strength: Everything
- Weakness: Massively expensive, complex

### Helios's White Space:

```
           Low Cost ←→ High Cost
Simple ↑    ITFlow  |  Helios  |  FreshService
       |           |    ★    |
Complex ↓          | BetterCloud | ServiceNow
```

**Helios Sweet Spot**:
- Google Workspace orgs (underserved!)
- Internal IT teams (5-50 people)
- Want hosted solution (not self-hosted)
- Value time over money
- Need ITSM + workspace management

**Total Addressable Market**:
- 10M+ Google Workspace organizations globally
- 40% need ITSM (4M potential customers)
- Even 0.01% = 400 customers = $80K/month ARR

---

## 🏗️ Helios Product Evolution

### Current State: Helios v1.0 (What You Have)

```
Helios Client Portal
├── User Directory (Google Workspace sync) ✅
├── Group Management ✅
├── Org Units ✅
├── Settings ✅
├── Canonical Data Model ✅
├── Feature Flags ✅
└── API Key System (backend complete) ✅
```

**Status**: 82% complete
**Target Market**: Single organization workspace management
**Pricing**: $10-20/user/month

---

### Phase 1: Helios Pro (ITSM Core) - 6-8 weeks

**Add ITSM Module with:**

```typescript
// New canonical entities
entity.asset              // Computers, phones, network devices
entity.credential         // Passwords, API keys, licenses
entity.document           // Policies, procedures, diagrams
entity.ticket             // Support tickets
entity.domain             // Domains with DNS/cert tracking
entity.certificate        // SSL certificates
entity.software_license   // Software licenses
entity.service           // Documented IT services
```

**Features**:
1. ✅ **Asset Management**
   - Computers, phones, tablets, network gear
   - Auto-import from Google Workspace (Chrome OS, Mobile MDM!)
   - Link to users, credentials, documents
   - Track warranties, purchase dates

2. ✅ **Credential Vault**
   - Encrypted password storage (AES-256)
   - OTP support (TOTP)
   - Link to assets, services, contacts
   - Expiration tracking
   - Shared credentials (controlled access)

3. ✅ **Domain & Certificate Tracking**
   - Auto-fetch DNS records (daily)
   - Certificate expiration monitoring
   - Email alerts (30/14/7 days before expiration)
   - Automatic renewal reminders
   - Registrar/vendor tracking

4. ✅ **Software License Management**
   - Track licenses (seats, expiration)
   - Link to assets (which computer has which software)
   - Auto-import from Google Workspace (Chrome licenses!)
   - Renewal alerts

5. ✅ **Ticketing System**
   - Create/assign/track tickets
   - Link tickets to assets, users, credentials
   - Status workflow (New → In Progress → Resolved → Closed)
   - Priority levels
   - Internal notes vs public replies
   - Email notifications

6. ✅ **Client Portal** (User Self-Service)
   - Users submit tickets
   - View their tickets
   - View their assets
   - Knowledge base search
   - **Uses existing Helios auth!**

7. ✅ **Linking System** ("Everything to Everything")
   ```typescript
   // Junction tables for comprehensive linking
   asset_credentials
   asset_documents
   asset_software
   user_assets
   user_credentials
   domain_certificates
   domain_credentials
   ticket_assets
   ticket_users
   service_assets
   ```

8. ✅ **Expiration Dashboard**
   - Domains expiring soon
   - Certificates expiring soon
   - Software licenses expiring
   - Warranties expiring
   - Credentials needing rotation

**Pricing**: $30-50/user/month
**Target**: Google Workspace orgs wanting integrated ITSM
**Timeline**: 6-8 weeks to MVP

---

### Phase 2: Helios Enterprise (Advanced ITSM) - 8-12 weeks

**Add**:
1. ✅ **Projects & Tasks**
   - Project tracking
   - Task assignments
   - Time tracking
   - Billable hours

2. ✅ **Knowledge Base**
   - Articles with categories
   - Search functionality
   - Public vs internal articles
   - Link to tickets (solutions)

3. ✅ **Service Catalog**
   - Documented IT services
   - SLA definitions
   - Service dependencies
   - Health monitoring

4. ✅ **Change Management**
   - Change requests
   - Approval workflows
   - Rollback procedures
   - Change calendar

5. ✅ **Vendor Management**
   - Vendor directory
   - Contracts tracking
   - SLA monitoring
   - Vendor performance

6. ✅ **Advanced Reporting**
   - Custom reports
   - Dashboards
   - Export to PDF/Excel
   - Scheduled reports

**Pricing**: $50-100/user/month
**Target**: Larger orgs (50-500 users) with complex IT

---

### Phase 3: Helios MTP (Multi-Tenant Platform) - 12-16 weeks

**For MSPs managing multiple clients:**

```
MSP Dashboard (Helios MTP)
├── Client 1 (Acme Corp)
│   ├── Users (Google Workspace)
│   ├── Tickets
│   ├── Assets
│   └── Billing
├── Client 2 (Gridworx)
│   └── ...
└── Provider Features
    ├── Cross-client reporting
    ├── Provider team management
    ├── Client billing aggregation
    ├── White-label client portals
```

**Features**:
1. ✅ Multi-tenant architecture
2. ✅ Per-client billing
3. ✅ Provider team management
4. ✅ Cross-client reporting
5. ✅ White-label portals
6. ✅ Provider API access (using Vendor keys!)

**Pricing**: $5-15/endpoint/month for MSPs
**Target**: MSPs managing 10-100 clients

---

## 🎯 Strategic Positioning

### Helios Client Portal (Current)
**Tagline**: "Modern workspace management for Google organizations"

**For**: Internal IT teams at companies using Google Workspace
**Problems Solved**:
- Manual Google Admin tasks → Automated
- User provisioning → Self-service
- Scattered tools → Unified dashboard

---

### Helios Pro (ITSM Integrated)
**Tagline**: "The only ITSM built natively for Google Workspace"

**For**: IT teams who want ITSM WITHOUT giving up workspace control
**Problems Solved**:
- Duplicate data entry (users in both systems) → Auto-synced
- Context switching (Google Admin + ITSM tool) → One platform
- Stale asset inventory → Auto-updated from Google
- Missing workspace context in tickets → Automatically linked

**Competitive Advantages**:
1. **Zero Sync Lag** - Same database, instant updates
2. **Auto-Asset Discovery** - Import from Google Workspace
3. **User Context** - Tickets know user's devices, groups, OU
4. **Modern UX** - React/TypeScript vs PHP admin panels
5. **Provider Access** - API keys with actor attribution (unique!)

**USP**: "Stop managing two systems. Helios is workspace + ITSM in one."

---

### Helios MTP (MSP Platform)
**Tagline**: "Client-sovereign IT management for modern MSPs"

**For**: MSPs who want to offer clients data ownership
**Problems Solved**:
- Vendor lock-in → Clients own their data
- Limited provider access → Granular API keys
- Expensive platforms → Open-core pricing
- Complex migrations → Built-in export/import

**Competitive Advantage vs ITFlow**:
1. **Hosted Solution** (ITFlow is self-hosted only)
2. **Modern Stack** (ITFlow is PHP/MySQL)
3. **Google Native** (ITFlow has ZERO Google integration)
4. **Better UX** (ITFlow UI is dated AdminLTE theme)
5. **API-First** (ITFlow has minimal API)

---

## 🏛️ Architecture Decision: Integrated vs Standalone

### ✅ **Decision: Build ITSM as Helios Modules**

**Why**:

**1. Technical Efficiency**
```
Existing Helios Infrastructure (Reuse 100%):
✅ canonical data model       → ITSM entities map cleanly
✅ Feature flags              → Enable/disable ITSM features
✅ API key system             → Provider access (PERFECT FIT!)
✅ User directory             → Ticket assignments, asset owners
✅ Module system              → ITSM is just another module
✅ Authentication             → Single sign-on
✅ Database (PostgreSQL)      → Add ITSM tables
✅ Testing framework          → Add ITSM tests
✅ LabelsContext              → Customize ITSM terminology

Timeline: 6-8 weeks to ITSM MVP

vs Standalone:
❌ Rebuild all of above      → 4-6 months
❌ Integration complexity     → Ongoing maintenance nightmare
```

**2. User Experience**
```
Integrated:
User logs into Helios → Sees everything
- Directory tab
- ITSM tab (Tickets, Assets, Credentials)
- Settings tab
- ONE search bar (finds users AND tickets AND assets)

Standalone:
User logs into Helios → Manages workspace
User logs into ITSM → Separate login, separate data
User creates ticket → Can't see Helios users easily
```

**3. Data Model Synergy**
```typescript
// Tickets ALREADY HAVE users!
ticket {
  id: "T-001",
  title: "Laptop not working",
  assignedTo: entity.user("mike@company.com"), // ← Already in Helios!
  relatedAsset: entity.asset("laptop-123"),
  createdBy: entity.user("jane@company.com"),  // ← Already in Helios!
  workspace: entity.workspace("Engineering"),  // ← Already defined!
}

// No synchronization needed - same database!
```

**4. Provider Access Model**
```typescript
// Your API key system ALREADY DOES THIS!

Vendor API Key for MSP Provider:
{
  key: "helios_vendor_abc123",
  permissions: [
    "read:tickets",
    "write:tickets",
    "read:assets",
    "read:users"  // Can see user info for context
  ],
  requiresActor: true // Every action shows tech name!
}

Request headers:
X-API-Key: helios_vendor_abc123
X-Actor-Name: "John Smith"
X-Actor-Email: "john@msp.com"
X-Client-Reference: "TICKET-789"

Audit log shows:
"John Smith from GridWorx MSP created ticket T-456 for Acme Corp"
```

**Your decentralized vision IS ACHIEVABLE with integrated approach!**

---

## 🗺️ Detailed Roadmap

### **Immediate: Complete Current Work** (1 week)

**Week 1**:
1. Complete API Keys UI (Settings > Integrations)
2. Complete User Detail View
3. Polish existing features
4. Get to 100% on current scope

**Deliverable**: Helios v1.0 - Workspace Management
**Status**: Production-ready

---

### **Phase 1: Documentation Module** (2-3 weeks)

**Why First**: Lowest complexity, highest MSP need

**Entities**:
```sql
-- Documents for IT documentation
documents (
  id, organization_id, name, description,
  content_type, file_path, folder_id,
  created_by, updated_at
)

-- Folders for organization
folders (
  id, organization_id, name, parent_folder_id
)

-- Link documents to assets, users, services
document_assets (document_id, asset_id)
document_users (document_id, user_id)
```

**Features**:
- Upload/organize IT documentation
- Link docs to users, groups, assets
- Search functionality
- Version history
- Access control (internal vs client-visible)

**Integration with Helios**:
- Link docs to Google Workspace users
- Link docs to devices
- Use LabelsContext (customize "Documents" to "Runbooks")

**Value**: IT teams have centralized documentation immediately

---

### **Phase 2: Asset & Credential Management** (3-4 weeks)

**Entities**:
```sql
-- Assets (computers, phones, network gear)
assets (
  id, organization_id, name, type, make, model,
  serial_number, os, purchase_date, warranty_expiry,
  location_id, assigned_user_id, status
)

-- Credentials (passwords, API keys)
credentials (
  id, organization_id, name, username,
  password_encrypted, uri, notes,
  otp_secret, created_by, last_rotated
)

-- Linking system
asset_credentials (asset_id, credential_id)
asset_documents (asset_id, document_id)
user_assets (user_id, asset_id)
```

**Auto-Import from Google Workspace**:
```typescript
// Helios SUPERPOWER - ITFlow can't do this!
async function syncAssetsFromGoogle(orgId) {
  // Import Chrome OS devices
  const chromebooks = await google.admin.chromeosdevices.list();
  chromebooks.forEach(device => {
    db.insert('assets', {
      organization_id: orgId,
      name: device.deviceId,
      type: 'chromebook',
      serial_number: device.serialNumber,
      os: device.osVersion,
      assigned_user_id: findUser(device.annotatedUser), // ← Already in Helios!
      last_synced: NOW()
    });
  });

  // Import mobile devices
  const phones = await google.admin.mobiledevices.list();
  // ... same pattern
}
```

**Features**:
- Asset inventory (auto-synced from Google!)
- Credential vault (AES-256 encrypted)
- Link assets to users (already in system!)
- Link credentials to assets
- Warranty tracking
- Location tracking

**Value**: Asset inventory that's ALWAYS up-to-date (Google sync!)

---

### **Phase 3: Domain & Certificate Tracking** (2-3 weeks)

**Entities**:
```sql
-- Domains
domains (
  id, organization_id, name, registrar,
  expire_date, auto_renew, nameservers,
  created_at
)

-- DNS records (auto-fetched daily)
domain_dns_records (
  id, domain_id, type, name, value,
  ttl, last_checked, changed_at
)

-- Certificates
certificates (
  id, organization_id, domain_id, name,
  expire_date, issued_by, issued_to,
  status, last_checked
)

-- Linking
domain_credentials (domain_id, credential_id) -- Registrar login
domain_documents (domain_id, document_id)     -- Config docs
```

**Features (ITFlow's Most Loved!)**:
- Add domain → Auto-fetch DNS records
- Daily monitoring for DNS changes
- Alert on unauthorized changes
- Certificate expiration tracking
- Email alerts (30/14/7 days before expiry)
- Dashboard widget showing expiring items

**Technical Implementation**:
```typescript
// Daily cron job
async function monitorDomains() {
  const domains = await db.query('SELECT * FROM domains WHERE is_active = true');

  for (const domain of domains) {
    // Fetch current DNS records
    const currentRecords = await dns.resolve(domain.name);

    // Compare with stored records
    const changes = detectChanges(storedRecords, currentRecords);

    if (changes.length > 0) {
      // Alert admins!
      await sendAlert({
        type: 'dns_change_detected',
        domain: domain.name,
        changes: changes,
        severity: 'medium'
      });

      // Update audit log
      await auditLog.create({
        action: 'dns_changed',
        entity: 'domain',
        entityId: domain.id,
        changes: changes
      });
    }

    // Check certificate expiration
    const cert = await ssl.getCertificate(domain.name);
    if (cert.daysUntilExpiry < 30) {
      await sendAlert({
        type: 'certificate_expiring',
        domain: domain.name,
        daysRemaining: cert.daysUntilExpiry
      });
    }
  }
}
```

**Value**: Proactive monitoring prevents outages!

---

### **Phase 4: Ticketing System** (3-4 weeks)

**Entities**:
```sql
-- Tickets
tickets (
  id, organization_id, subject, details,
  status, priority, category,
  assigned_to, created_by,
  asset_id, billable_hours,
  created_at, resolved_at
)

-- Ticket replies
ticket_replies (
  id, ticket_id, reply_text, type,
  created_by, is_internal, created_at
)

-- Ticket attachments
ticket_attachments (
  id, ticket_id, file_name, file_path, uploaded_by
)

-- Linking
ticket_assets (ticket_id, asset_id)
ticket_users (ticket_id, user_id)
ticket_documents (ticket_id, document_id)
```

**Features**:
- Create tickets (by IT staff OR end users)
- Assign to IT staff
- Link to assets (auto-populate from user!)
- Status workflow
- Priority levels
- Internal notes (IT only) vs replies (user sees)
- Email notifications
- Time tracking (billable)
- Attach files
- Search tickets

**Helios Integration**:
```typescript
// When user creates ticket, auto-populate context!
const ticket = {
  created_by: currentUser.id,
  assigned_to: getITStaff()[0].id,

  // Auto-link user's assets!
  relatedAssets: await getAssetsForUser(currentUser.id),

  // Auto-include user context
  userInfo: {
    ou: currentUser.orgUnit,           // From Google Workspace
    groups: currentUser.groups,        // From Google Workspace
    manager: currentUser.manager,      // From Google Workspace
    recentLogins: currentUser.lastLogin
  }
};
```

**Client Portal**:
- Users submit tickets via portal
- View ticket status
- Reply to tickets
- View knowledge base
- **Same login as Helios main portal!**

---

### **Phase 5: Provider Access & External Support** (2-3 weeks)

**This is where your decentralized vision shines!**

**Use Cases**:

**A. Internal IT Supporting Internal Users**:
```
Internal IT Team (employees):
- Full access to all modules
- Manage users, assets, tickets
- Normal JWT authentication
- All features available
```

**B. Internal IT Supporting External Clients** (Your MSP features):
```
// Organization has BOTH internal users AND external clients

Organization: "GridWorx MSP"
├── Internal Users (IT staff)
│   └── Manage both internal operations AND client support
├── External Clients (via separate module)
│   ├── Client A Portal
│   ├── Client B Portal
│   └── Each client has isolated data
```

**C. External Provider Supporting Internal Users** (Your API key vision!):
```
Organization: "Acme Corp"
- Internal IT team (small, 2 people)
- External MSP (GridWorx) helping via API

GridWorx has Vendor API Key:
{
  permissions: ["read:tickets", "write:tickets", "read:assets"],
  requiresActor: true
}

Every action by GridWorx tech shows:
"John Smith from GridWorx MSP resolved ticket T-456 for Acme Corp"
```

**Implementation**:
```sql
-- External provider access (already built!)
api_keys (type = 'vendor', vendor_config = {...})

-- Client management (for organizations supporting external clients)
external_clients (
  id, organization_id, client_name,
  is_active, billing_enabled
)

external_client_users (
  client_id, user_id, portal_access
)

external_client_tickets (
  client_id, ticket_id, billable
)
```

**Key Insight**: **You don't need separate apps!**

Use Helios's existing architecture:
- **Internal IT** → Full Helios access
- **External providers** → Vendor API keys (with actor attribution)
- **External clients** → Client portal module (data isolation via permissions)

---

## 💡 How to Avoid Over-Complication

### Your Concerns Addressed:

**1. "Internal staff vs external client data leakage"**

**Solution**: Permission-based data isolation (not separate apps)

```typescript
// All in one database, isolated by permissions

// IT Staff sees EVERYTHING
if (user.role === 'admin' || user.role === 'it_staff') {
  tickets = getAllTickets();
}

// External client user sees ONLY their organization's tickets
if (user.type === 'external_client') {
  tickets = getTickets({
    where: { external_client_id: user.external_client_id }
  });
}

// External provider (via API) sees what they're granted
if (request.apiKey.type === 'vendor') {
  tickets = getTickets({
    where: {
      id: IN(request.apiKey.permissions.allowedTickets)
    }
  });
}
```

**No separate apps needed - just permissions!**

**2. "MTP bringing multiple tenants together"**

**Solution**: Phase 3 (not now!)

Focus:
- Phase 1: Single-org ITSM (internal IT teams) ← THIS
- Phase 2: Client portal (support external clients)
- Phase 3: MTP (MSPs managing multiple single-orgs)

**Don't build multi-tenant yet!** Perfect the single-org experience first.

**3. "Unified Endpoint Management"**

**Solution**: Module for later (Phase 6)

```typescript
// UEM as optional module
entity.device_policy
entity.device_compliance
entity.device_application

// Integrates with:
- Google Workspace Mobile Management
- Microsoft Intune
- Jamf (for macOS)
```

**Don't build this until ITSM core is proven!**

---

## 🎯 Focused Roadmap (Next 6 Months)

### **Month 1: Complete Helios v1.0**
- [ ] API Keys UI
- [ ] User Detail View
- [ ] Settings > Customization UI
- [ ] Polish existing features
- [ ] 100% test coverage

**Deliverable**: Helios Client Portal v1.0
**Launch**: Soft launch to 5-10 beta customers

---

### **Month 2-3: ITSM Core (Documentation + Assets + Credentials)**

**Week 1-2: Database & Backend**
- [ ] Create ITSM module in `available_modules`
- [ ] Database migration: assets, credentials, documents tables
- [ ] Junction tables (asset_credentials, etc.)
- [ ] Backend services (CRUD for each entity)
- [ ] API routes

**Week 3-4: Frontend**
- [ ] Assets page (list, create, edit, link)
- [ ] Credentials page (vault, encrypted storage)
- [ ] Documents page (upload, organize, link)
- [ ] Linking UI (attach credential to asset, etc.)

**Week 5-6: Google Sync**
- [ ] Auto-import Chrome OS devices as assets
- [ ] Auto-import mobile devices as assets
- [ ] Auto-link devices to users
- [ ] Daily sync job

**Deliverable**: Helios Pro v2.0 (with Documentation + Assets)
**Launch**: Expand beta to 25 customers

---

### **Month 4: Domain Tracking + Ticketing**

**Week 1-2: Domains**
- [ ] Domain entity + DNS monitoring
- [ ] Certificate tracking
- [ ] Expiration alerts
- [ ] Daily DNS change detection

**Week 3-4: Ticketing**
- [ ] Ticket entity + workflows
- [ ] Ticket creation (IT staff + end users)
- [ ] Assignment + status management
- [ ] Link to assets, users
- [ ] Email notifications

**Deliverable**: Helios Pro v2.5 (Full ITSM Core)
**Launch**: Public launch, start charging

---

### **Month 5: Client Portal + Provider API Access**

**Week 1-2: Client Portal**
- [ ] User-facing ticket submission
- [ ] View my tickets
- [ ] View my assets
- [ ] Knowledge base access
- [ ] Uses existing Helios auth!

**Week 3-4: Provider Access**
- [ ] Document Vendor API key usage for providers
- [ ] Create provider onboarding flow
- [ ] Test provider access patterns
- [ ] Build provider usage dashboard

**Deliverable**: Helios Pro v3.0 (with Client Portal + Provider Access)
**Launch**: Marketing push to MSPs

---

### **Month 6: Advanced Features + Scale**

**Week 1-2: Advanced ITSM**
- [ ] Knowledge base (articles, search)
- [ ] Service catalog
- [ ] SLA tracking
- [ ] Projects/tasks

**Week 3-4: Scale Prep**
- [ ] Performance optimization
- [ ] Advanced reporting
- [ ] Microsoft 365 integration (use Workspaces entity!)
- [ ] Prepare for MTP (multi-tenant architecture planning)

**Deliverable**: Helios Enterprise v4.0
**Status**: 100+ customers, $20K MRR

---

## 🎨 Feature Priority Matrix

### Must Have (MVP - Month 2-4):
1. ✅ Asset management with Google sync
2. ✅ Credential vault
3. ✅ Domain/cert tracking with expiration alerts
4. ✅ Software license tracking
5. ✅ Ticketing system
6. ✅ Document management
7. ✅ Linking system (everything to everything)
8. ✅ Client portal (user self-service)

### Should Have (v2.0 - Month 5-6):
1. ✅ Knowledge base
2. ✅ Service catalog
3. ✅ Projects/tasks
4. ✅ Provider API access documentation
5. ✅ Advanced reporting
6. ✅ Microsoft 365 integration

### Could Have (v3.0 - Month 7-12):
1. ❓ Change management
2. ❓ Contract management
3. ❓ Vendor management
4. ❓ Time tracking
5. ❓ Simple invoicing
6. ❓ Multi-tenant (MTP)

### Won't Have (Integrate Instead):
1. ❌ Full accounting (use QuickBooks API)
2. ❌ Email server (use Gmail API)
3. ❌ Calendar (use Google Calendar API)
4. ❌ File storage (use Google Drive)
5. ❌ Chat (use Google Chat)

---

## 💰 Revenue Model

### **Helios Client Portal** (Current)
- **Price**: $15/user/month
- **Target**: Google Workspace orgs wanting better admin tools
- **Features**: User management, group management, sync
- **ARR Goal**: $10K (50 orgs × 10 users avg)

### **Helios Pro** (+ ITSM Module)
- **Price**: $40/user/month
- **Target**: Google Workspace orgs wanting integrated ITSM
- **Features**: Everything in Client + Assets + Tickets + Docs + Credentials
- **ARR Goal**: $50K (100 orgs × 10 users avg)

### **Helios Enterprise** (+ Advanced Features)
- **Price**: $75/user/month
- **Target**: Larger orgs (50-500 users) with complex needs
- **Features**: Everything + Knowledge Base + Service Catalog + M365
- **ARR Goal**: $200K (50 orgs × 50 users avg)

### **Helios MTP** (For MSPs - Future)
- **Price**: $10/endpoint/month
- **Target**: MSPs managing 10-100 clients
- **Features**: Multi-tenant, provider access, billing
- **ARR Goal**: $500K (50 MSPs × 100 clients × 10 endpoints avg)

**Total Potential ARR**: $760K within 24 months

---

## 🏆 Competitive Advantages (How Helios Wins)

### vs ITFlow:

| Feature | ITFlow | Helios Pro |
|---------|--------|------------|
| **Google Workspace Integration** | ❌ None | ✅ Native, auto-sync |
| **Modern UI** | ❌ AdminLTE (dated) | ✅ React + Design System |
| **Hosted Option** | ❌ Self-host only | ✅ SaaS-first |
| **Real-time Updates** | ❌ Page refreshes | ✅ Socket.io |
| **API Quality** | ⚠️ Basic | ✅ GraphQL + REST |
| **Testing** | ❌ Minimal | ✅ Comprehensive E2E |
| **Tech Stack** | ❌ PHP/MySQL | ✅ Node.js/PostgreSQL |
| **Canonical Model** | ❌ Hardcoded | ✅ Customizable labels |
| **Provider Access** | ❌ Basic users | ✅ API keys + actor attribution |
| **Price** | ✅ Free | ⚠️ Paid ($40/user) |

**Helios Wins On**: Integration, UX, Tech, Hosting
**ITFlow Wins On**: Price (free)

**Target Different Markets!**
- ITFlow → Small MSPs, self-hosted, price-sensitive
- Helios → Google Workspace orgs, hosted, value-time-over-money

### vs FreshService:

| Feature | FreshService | Helios Pro |
|---------|--------------|------------|
| **Google Workspace Integration** | ⚠️ Basic API | ✅ Deep native integration |
| **Price** | ❌ $29-99/user | ✅ $40/user (better value) |
| **Complexity** | ❌ Enterprise-heavy | ✅ SMB-friendly |
| **Setup Time** | ❌ Weeks | ✅ Hours |
| **Asset Auto-Discovery** | ⚠️ Agent required | ✅ Google Workspace API |
| **User Context** | ❌ Separate | ✅ Same database! |

**Helios Wins On**: Price, Simplicity, Google Integration
**FreshService Wins On**: Maturity, Enterprise features

---

## 🎯 Go-to-Market Strategy

### Positioning:

**Primary Message**:
> "Helios is the only IT management platform built natively for Google Workspace. Stop managing users in two places—Helios syncs your Google Workspace AND manages your IT operations in one beautiful dashboard."

**Secondary Messages**:
1. "Auto-discover assets from Google Workspace—no agents, no manual entry"
2. "Secure provider access with full audit trails—your data, your control"
3. "Modern, fast, and actually enjoyable to use"

### Target Customers (Beachhead Market):

**Primary**: Google Workspace organizations with 10-100 users
- Education institutions
- Tech startups
- Consulting firms
- Digital agencies
- Non-profits

**Why This Segment**:
- ✅ Use Google Workspace (your superpower!)
- ✅ Need ITSM but can't afford FreshService
- ✅ Don't have dedicated IT team (2-5 people max)
- ✅ Value modern tools
- ✅ Willing to pay for time savings

### Distribution:

**Phase 1**: Direct (Month 1-6)
- Google Workspace Marketplace listing
- Reddit (r/gsuite, r/msp)
- Product Hunt launch
- Content marketing (blog, tutorials)

**Phase 2**: Partner (Month 7-12)
- Partner with Google Workspace resellers
- MSP partnerships (use MTP tier)
- Referral program

**Phase 3**: Scale (Month 13+)
- Enterprise sales team
- Channel partners
- International expansion

---

## 📋 Immediate Next Steps (This Week)

### Option A: Finish Current Helios v1.0 (Recommended)
**Time**: 3-5 days
1. Complete API Keys UI (wizard, show-once modal)
2. Complete User Detail View
3. Polish existing features
4. Get to 100% on current scope
5. **Launch Helios Client Portal v1.0** to beta customers

**Why**: Ship what's 98% done, get users, get feedback

### Option B: Start ITSM Immediately
**Time**: Start now, but...
**Risk**: Helios v1.0 sits at 98% forever, never launches

**Why Not**: Finish what you started! Ship v1.0, then build ITSM with user feedback.

---

## 🎓 My Strategic Recommendation:

### **The Phased Approach** (De-Risk, Ship Often)

**This Week**:
- ✅ Finish API Keys UI
- ✅ Finish User Detail View
- ✅ Ship Helios v1.0 to 5-10 beta users

**Next 2 Weeks**:
- ✅ Get feedback from beta users
- ✅ Create OpenSpec proposal for "Add ITSM Module"
- ✅ Design ITSM database schema (adapt from ITFlow analysis)
- ✅ Write comprehensive specs for ITSM entities

**Month 2-3**:
- ✅ Build ITSM Core (Assets + Credentials + Documents)
- ✅ Test with existing beta users
- ✅ Iterate based on feedback

**Month 4**:
- ✅ Add Ticketing
- ✅ Add Domain tracking
- ✅ **Launch Helios Pro v2.0** publicly

**Month 5-6**:
- ✅ Scale to 100 customers
- ✅ Add advanced features based on user requests
- ✅ Prepare for MTP (if MSP demand exists)

---

## 🚀 Bottom Line:

**Build ITSM as integrated Helios modules.**

**Why**:
1. ✅ Leverage everything you've built (6 months of work!)
2. ✅ Unique market position (Google native ITSM)
3. ✅ Faster time-to-market (6 weeks vs 6 months)
4. ✅ Better UX (one login, one platform, zero sync)
5. ✅ Your API key system enables provider access perfectly
6. ✅ Clear product evolution (Client → Pro → Enterprise → MTP)
7. ✅ Can spin out later if needed (but won't need to!)

**Don't**:
- ❌ Overcomplicate with UEM now (wait for customer demand)
- ❌ Build multi-tenant yet (nail single-org first)
- ❌ Rebuild what exists (leverage Helios foundation)
- ❌ Try to beat ServiceNow (pick your battles - beat ITFlow!)

**Do**:
- ✅ Ship Helios v1.0 THIS WEEK
- ✅ Create ITSM OpenSpec proposal NEXT WEEK
- ✅ Build ITSM module MONTH 2-3
- ✅ Launch Helios Pro MONTH 4
- ✅ Scale to $100K ARR MONTH 12

**I'll lead the implementation. Just approve the direction and let's ship!** 🚀

**Ready to create the OpenSpec proposal for "Add ITSM Module"?**