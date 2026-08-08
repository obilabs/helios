# 🚀 NEXT SESSION - START HERE

**Date Created**: November 1, 2025
**Status**: Ready to Execute
**Priority**: HIGH - Complete specs while context is fresh!

---

## 🎯 IMMEDIATE ACTION (Start Here!)

### **Step 1: Complete ITSM OpenSpec Proposal** (2-3 hours)

**Why First**: Capture all ITFlow analysis while it's fresh in context. This prevents losing critical insights.

**What to Do**:
1. Open: `openspec/changes/add-itsm-module/`
2. Complete these files (proposal.md already started):
   - [ ] `design.md` - Architectural decisions
   - [ ] `tasks.md` - Implementation checklist
   - [ ] `specs/asset-management/spec.md` - Requirements for assets
   - [ ] `specs/credential-management/spec.md` - Requirements for credentials
   - [ ] `specs/domain-tracking/spec.md` - Requirements for domains/certs
   - [ ] `specs/ticketing/spec.md` - Requirements for tickets
   - [ ] `specs/linking-system/spec.md` - Requirements for "everything links to everything"

3. Validate:
   ```bash
   npx openspec validate add-itsm-module --strict
   ```

4. Get approval (from yourself/stakeholders)

**Deliverable**: Complete ITSM specification capturing all ITFlow insights + Helios advantages

**Reference Documents** (Created this session):
- `ITFLOW-ANALYSIS-REPORT.md` - Complete ITFlow analysis
- `ITFLOW-KEY-INSIGHTS.md` - TL;DR of key patterns
- `ITFLOW-DATABASE-SCHEMA-FOR-HELIOS.md` - Adapted database schema
- `HELIOS-STRATEGIC-ROADMAP.md` - Full strategic direction

---

### **Step 2: Complete Helios v1.0** (3-5 days)

**After** ITSM spec is done, finish these:

#### **A. API Keys UI** (4-6 hours)
**Status**: Backend 100% complete, frontend not started

**Tasks**:
- [ ] Create `frontend/src/components/integrations/ApiKeyList.tsx`
- [ ] Create `frontend/src/components/integrations/ApiKeyWizard.tsx`
  - [ ] Step 1: Type selection (Service vs Vendor)
  - [ ] Step 2: Configuration (name, permissions, expiration)
  - [ ] Step 3: Review & Create
- [ ] Create `frontend/src/components/integrations/ShowOnceModal.tsx`
  - [ ] Display key (only once!)
  - [ ] Copy to clipboard button
  - [ ] Confirmation checkbox "I've saved this key"
  - [ ] Cannot close until confirmed
- [ ] Wire up to Settings > Integrations tab (already created!)
- [ ] Test full flow

**Acceptance Criteria**:
- [ ] Admin can create Service API key
- [ ] Admin can create Vendor API key (requires actor config)
- [ ] Key shown once in modal, never retrievable
- [ ] Key works for authentication (test with curl)
- [ ] List shows all keys with status badges
- [ ] Can revoke keys

#### **B. User Detail View** (2-3 hours)
**Status**: Component exists (`UserSlideOut.tsx`), not integrated

**Tasks**:
- [ ] Wire UserSlideOut into Users page
- [ ] Click user row → Opens slide-out
- [ ] Show user details, groups, OU
- [ ] Edit user info
- [ ] Test integration

**Acceptance Criteria**:
- [ ] Clicking user opens detail view
- [ ] All user info displays correctly
- [ ] Can edit and save changes
- [ ] Integrates with Google Workspace sync

#### **C. Final Polish** (1-2 hours)
- [ ] Remove debug console.logs
- [ ] Update README with v1.0 features
- [ ] Create release notes
- [ ] Tag git commit as v1.0.0

**Deliverable**: Helios Client Portal v1.0 - Ready for beta launch!

---

## 📊 Current Status

### ✅ Completed (Production-Ready):
- Authentication & authorization
- User directory with Google Workspace sync
- Group management (now Access Groups with canonical model!)
- Org Units
- Settings (Modules, Organization, Security, Customization partial, **Integrations tab created**)
- **Canonical Data Model** (enterprise-grade!)
- **Feature Flags** (module-based visibility)
- **API Key Management Backend** (dual-tier, actor attribution)
- **Workspaces Infrastructure** (tables, routes, page created)

### ⚠️ In Progress:
- API Keys Frontend UI (backend done, UI pending)
- User Detail View (component exists, integration pending)

### 📋 Queued for Later:
- ITSM Module (proposal started, implementation Month 2-3)
- Settings > Customization UI remake (use new labels system)
- Microsoft 365 integration (entities ready!)

---

## 🧪 Test Status: 21/21 Passing (100%)

```bash
# Run full test suite
cd openspec/testing
npx playwright test tests/login-jack.test.ts tests/users-list.test.ts tests/groups.test.ts tests/settings.test.ts tests/canonical-model.test.ts --reporter=list --workers=1

# Expected: 21 passed
```

**Test Coverage**:
- ✅ Login flows
- ✅ User management
- ✅ Group management
- ✅ Settings navigation
- ✅ **Canonical model (labels, feature flags, validation)**

---

## 💰 Monetization Strategy (Open-Core Model)

### **Your Question**: "How to monetize if open source?"

**Answer**: **Open-Core Model** (Like GitLab, Sentry, Supabase)

### The Model:

```
┌─────────────────────────────────────────────────────┐
│  HELIOS OPEN-SOURCE (MIT License) - FREE           │
├─────────────────────────────────────────────────────┤
│  ✅ Core Platform                                   │
│  ✅ User Directory                                  │
│  ✅ Google Workspace Sync (Basic)                   │
│  ✅ Group Management                                │
│  ✅ Settings                                        │
│  ✅ Self-Hosted Deployment                          │
├─────────────────────────────────────────────────────┤
│  HELIOS PRO (Hosted + Premium Features) - $40/user │
├─────────────────────────────────────────────────────┤
│  ✅ Everything in Open-Source +                     │
│  💎 ITSM Module (Assets, Credentials, Tickets)      │
│  💎 Domain/Certificate Monitoring                   │
│  💎 Client Portal                                   │
│  💎 Advanced Google Workspace Sync                  │
│  💎 Hosted on our infrastructure                    │
│  💎 Automatic updates                               │
│  💎 Support (email/chat)                            │
├─────────────────────────────────────────────────────┤
│  HELIOS ENTERPRISE - $75/user                       │
├─────────────────────────────────────────────────────┤
│  ✅ Everything in Pro +                             │
│  💎 Microsoft 365 Integration                       │
│  💎 Service Catalog                                 │
│  💎 Knowledge Base                                  │
│  💎 Advanced Reporting                              │
│  💎 SSO/SAML                                        │
│  💎 SLA Management                                  │
│  💎 Premium Support (phone/video)                   │
└─────────────────────────────────────────────────────┘
```

### **Code Structure for Open-Core**:

```
helios/
├── core/                    # MIT License (Open Source)
│   ├── authentication/
│   ├── user-directory/
│   ├── google-workspace-sync-basic/
│   ├── groups/
│   └── settings/
│
├── modules/                 # Proprietary (Paid Features)
│   ├── itsm/               # Helios Pro
│   │   ├── assets/
│   │   ├── credentials/
│   │   ├── tickets/
│   │   └── domains/
│   ├── microsoft-365/      # Helios Enterprise
│   ├── service-catalog/    # Helios Enterprise
│   └── sso-saml/          # Helios Enterprise
│
└── platform/               # Hosted Service (SaaS)
    ├── billing/
    ├── multi-tenant/
    └── support/
```

### **Repository Strategy**:

**Option A: Single Repo with License Files** (Recommended)
```
helios/
├── LICENSE-CORE.md        # MIT License for core/
├── LICENSE-MODULES.md     # Proprietary for modules/
├── core/                  # Open source
└── modules/               # Closed source (not in public repo)
```

**Option B: Separate Repos**
```
helios-core/          # Public, MIT License
helios-modules/       # Private, Proprietary
helios-platform/      # Private, SaaS infrastructure
```

### **How Modules Work**:

**As NPM Packages** (Can be Released Independently!):

```json
// package.json for @helios/itsm-module
{
  "name": "@helios/itsm-module",
  "version": "1.0.0",
  "license": "PROPRIETARY",
  "peerDependencies": {
    "@helios/core": "^1.0.0"
  }
}
```

**Installation**:
```bash
# Open Source (Free)
npm install @helios/core

# Pro (Paid - requires license key)
npm install @helios/itsm-module
# Prompts for license key on first run

# Enterprise (Paid)
npm install @helios/microsoft-365-module
npm install @helios/service-catalog-module
```

**YES! Each module can be released independently!**

### **Monetization Paths**:

**Path 1: SaaS-First** (Easiest Revenue)
```
Customer pays → Gets hosted Helios with modules enabled
No installation, no servers, just works
Price: $40/user/month for Pro, $75/user for Enterprise
```

**Path 2: Self-Hosted + License Keys**
```
Customer downloads Helios Core (free, open source)
Customer buys ITSM module license ($25/user/month)
Enters license key → Module unlocks
Annual renewal required
```

**Path 3: Hybrid** (Best of Both)
```
Helios Core: Open source, self-hosted, free
Helios Hosted: SaaS with all modules, $40-75/user/month

Small orgs: Self-host core (free)
Growing orgs: Upgrade to hosted Pro (convenience!)
Enterprise: Hosted Enterprise (all features)
```

### **License Key System** (Already Built!):

```typescript
// Use your API key system for module licensing!

const moduleLicense = {
  type: 'module_license',
  module: 'itsm',
  organization_id: 'org_123',
  tier: 'pro',
  expires_at: '2026-12-31',
  features: ['assets', 'credentials', 'tickets', 'domains']
};

// Backend checks license before enabling module
if (!hasValidLicense('itsm')) {
  return { error: 'ITSM module requires Helios Pro license' };
}
```

### **Revenue Projections**:

**Year 1** (Open-Core SaaS):
- 100 customers × $40/user × 5 avg users = $20K MRR = $240K ARR
- 80% hosted ($192K), 20% self-hosted licenses ($48K)

**Year 2**:
- 500 customers × $40/user × 7 avg users = $140K MRR = $1.68M ARR

**Why This Works**:
- ✅ Open source builds trust & community
- ✅ SaaS provides recurring revenue
- ✅ Modules are independent (can sell separately!)
- ✅ Clear upgrade path (free → Pro → Enterprise)

---

## 🎯 Next Session Priority:

### **START HERE:**

**1. Complete ITSM OpenSpec Proposal** ⭐ TOP PRIORITY

Open: `openspec/changes/add-itsm-module/proposal.md` (already started!)

**Missing pieces to complete**:
- [ ] Create `design.md` - Document architectural decisions:
  - Why integrate vs standalone
  - Junction table pattern ("everything links to everything")
  - Google Workspace auto-sync approach
  - Encryption strategy for credentials
  - Module licensing integration

- [ ] Create `tasks.md` - Break down implementation:
  ```markdown
  ## Phase 1: Database (Week 1-2)
  - [ ] Migration: assets, asset_types, locations tables
  - [ ] Migration: credentials, credential_categories tables
  - [ ] Migration: domains, certificates, dns_records tables
  - [ ] Migration: tickets, ticket_replies, ticket_statuses tables
  - [ ] Migration: documents, document_folders tables
  - [ ] Migration: 30+ junction tables for linking system
  - [ ] Migration: software, software_licenses tables

  ## Phase 2: Backend Services (Week 3-4)
  - [ ] AssetService (CRUD, linking, Google sync)
  - [ ] CredentialService (encrypt/decrypt, linking)
  - [ ] DomainService (DNS monitoring, cert tracking)
  - [ ] TicketService (CRUD, workflow, notifications)
  - [ ] DocumentService (upload, organize, linking)
  - [ ] LinkingService (manage all relationships)

  ## Phase 3: Google Workspace Sync (Week 5)
  - [ ] Sync Chrome OS devices → assets
  - [ ] Sync mobile devices → assets
  - [ ] Link devices to users automatically
  - [ ] Daily sync job

  ## Phase 4: Frontend Pages (Week 6-8)
  - [ ] Assets page (list, create, detail with links)
  - [ ] Credentials page (vault UI, encrypted display)
  - [ ] Domains page (DNS records, cert expiry)
  - [ ] Tickets page (kanban, list, detail)
  - [ ] Documents page (upload, organize)

  ## Phase 5: Automation (Week 9)
  - [ ] Daily domain DNS monitoring cron
  - [ ] Certificate expiration checking cron
  - [ ] Expiration alert emails

  ## Phase 6: Testing (Week 10-11)
  - [ ] E2E tests for each entity
  - [ ] E2E tests for linking system
  - [ ] E2E tests for Google sync
  ```

- [ ] Create `specs/asset-management/spec.md`:
  ```markdown
  ### Requirement: Asset Inventory
  The system SHALL maintain an inventory of IT assets.

  #### Scenario: Create asset manually
  **Given** an IT admin is on the Assets page
  **When** clicking "Add Asset"
  **And** entering asset details (name, type, serial number)
  **And** clicking "Save"
  **Then** asset is created
  **And** appears in asset list

  #### Scenario: Auto-import assets from Google Workspace
  **Given** Google Workspace sync is enabled
  **When** daily sync runs
  **Then** Chrome OS devices are imported as assets
  **And** mobile devices are imported as assets
  **And** devices are linked to their assigned users
  **And** asset metadata includes Google device ID
  ```

- [ ] Create specs for: credentials, domains, tickets, linking-system

- [ ] Validate all specs:
  ```bash
  npx openspec validate add-itsm-module --strict
  ```

**Time**: 2-3 focused hours

**Deliverable**: Complete ITSM specification that can be implemented without losing context

---

### **Step 2: Complete Helios v1.0** (After ITSM spec done)

**Then finish these features**:

**A. API Keys UI** (Settings > Integrations tab already created!)
- Backend APIs all working, just need UI
- Reference: `openspec/changes/add-api-key-management/`
- Timeline: 4-6 hours

**B. User Detail View**
- UserSlideOut component exists at `frontend/src/components/UserSlideOut.tsx`
- Just needs integration into Users page
- Timeline: 2-3 hours

**Total**: 1-2 days to ship v1.0

---

## 💰 MONETIZATION STRATEGY (Open-Core Model)

### **How to Make Money from Open Source**:

**Strategy: Open-Core + Hosted SaaS** (Like GitLab, Supabase)

### **What's Open Source (Free)**:

**Helios Core** (MIT License):
```
Repository: github.com/helios-platform/helios-core (PUBLIC)

Features:
✅ User directory
✅ Basic Google Workspace sync (users, groups)
✅ Group management
✅ Settings
✅ Authentication
✅ Self-hosted deployment instructions
✅ Docker Compose setup

Value Proposition: "Free, self-hosted Google Workspace management"
Target: Small orgs (5-20 users), technically savvy, price-sensitive
```

### **What's Proprietary (Paid)**:

**Helios Modules** (Proprietary License):
```
Repository: github.com/helios-platform/helios-modules (PRIVATE)

Modules:
💎 ITSM Module ($25/user/month)
   - Assets, Credentials, Domains, Tickets, Documents
   - Google Workspace auto-sync (advanced)
   - Linking system
   - Client portal

💎 Microsoft 365 Module ($15/user/month)
   - M365 user/group sync
   - Teams management
   - License management

💎 Enterprise Features ($35/user/month)
   - Service Catalog
   - Knowledge Base
   - Advanced Reporting
   - SSO/SAML

Distributed as: NPM packages requiring license keys
```

**Helios Hosted** (SaaS):
```
Service: https://app.helios.io

Tiers:
- Free: Core features only, self-host required
- Pro: Core + ITSM Module, fully hosted ($40/user/month)
- Enterprise: All modules, fully hosted ($75/user/month)

Value: No servers, no maintenance, automatic updates, support
```

### **How Modules Are Released Independently**:

**NPM Package Architecture**:

```bash
# Open source core
npm install @helios/core              # Free, MIT license

# Proprietary modules (require license key)
npm install @helios/itsm-module       # Paid
npm install @helios/m365-module       # Paid
npm install @helios/enterprise        # Paid
```

**Module Loading**:
```typescript
// backend/src/index.ts

// Core (always loaded)
import coreModules from '@helios/core';

// ITSM Module (checks license)
if (hasValidLicense('itsm')) {
  const itsmModule = await import('@helios/itsm-module');
  app.use('/api/itsm', itsmModule.routes);
} else {
  console.log('ITSM module not licensed. Upgrade to Helios Pro.');
}

// M365 Module (checks license)
if (hasValidLicense('microsoft365')) {
  const m365Module = await import('@helios/m365-module');
  app.use('/api/m365', m365Module.routes);
}
```

**License Validation**:
```typescript
// Uses your API key system!
const moduleLicense = {
  organization_id: 'org_123',
  module: 'itsm',
  tier: 'pro',
  expires_at: '2026-12-31',
  license_key: 'helios_license_abc123...',
  features: ['assets', 'credentials', 'tickets', 'domains']
};

// Check on startup and daily
if (new Date() > moduleLicense.expires_at) {
  // Disable module, show "License Expired" banner
  // Grace period: 30 days read-only access
}
```

### **Revenue Streams**:

**1. SaaS Hosting** (Primary - 70% of revenue)
```
Helios Hosted:
- Pro: $40/user/month (includes ITSM)
- Enterprise: $75/user/month (includes everything)
- Minimum: 5 users

100 customers × 10 users × $40 = $40K MRR = $480K ARR
```

**2. Module Licenses** (Secondary - 20% of revenue)
```
Self-Hosted with Module Licenses:
- ITSM Module: $25/user/month
- M365 Module: $15/user/month
- Enterprise Pack: $35/user/month

50 customers × 20 users × $25 = $25K MRR = $300K ARR
```

**3. Support & Services** (10% of revenue)
```
- Implementation services: $5K-20K one-time
- Premium support: $500/month
- Custom development: $150-200/hour
```

**Total Potential**: $780K ARR in Year 1

### **Module Independence**:

**YES! Each module can be:**
1. ✅ Released separately (own NPM package)
2. ✅ Versioned independently (itsm@1.0.0, m365@1.2.0)
3. ✅ Sold separately (buy ITSM without M365, or vice versa)
4. ✅ Enabled/disabled per organization
5. ✅ Licensed independently (organization buys just ITSM)

**Example Customer Journey**:
```
Month 1: Self-host Helios Core (free)
Month 3: "This is great! Want ITSM too"
        → Buy ITSM module license ($25/user/month)
        → npm install @helios/itsm-module
        → Enter license key
        → ITSM features unlock!

Month 6: "Managing servers is annoying"
        → Upgrade to Helios Hosted Pro ($40/user/month)
        → Migrate to our hosted platform
        → We manage servers, they just use it

Month 12: "Need Microsoft 365 too"
         → Upgrade to Enterprise ($75/user/month)
         → M365 module enabled
         → Both Google and Microsoft managed!
```

### **Competitive Pricing**:

```
ITFlow:        FREE (self-hosted only)
Helios Core:   FREE (self-hosted, open source) ← Compete here!

FreshService:  $29-99/user/month (hosted)
Helios Pro:    $40/user/month (hosted + ITSM) ← Undercut here!

ServiceNow:    $100+/user/month
Helios Enterprise: $75/user/month ← Massive value!
```

---

## 🎨 Open-Core Best Practices

### **What to Open Source**:
✅ Core platform (authentication, users, basic sync)
✅ Database schema (builds trust)
✅ API documentation (shows capabilities)
✅ Docker deployment (easy self-hosting)
✅ Basic features (user management, groups, settings)

### **What to Keep Proprietary**:
💎 Advanced modules (ITSM, M365, Enterprise features)
💎 Hosted platform infrastructure
💎 Auto-sync advanced features
💎 Premium integrations
💎 Advanced reporting
💎 Support & SLA

### **Why This Works**:

**For Small Orgs** (5-20 users):
- "Use Core for free, self-host, no credit card"
- They become advocates, create content, report bugs
- Some convert to paid when they grow

**For Medium Orgs** (20-100 users):
- "Core is nice but want ITSM + no server management"
- Pay $40/user/month for hosted Pro
- This is your bread and butter

**For Large Orgs** (100-500 users):
- "Need everything: Google + M365 + ITSM + SSO"
- Pay $75/user/month for Enterprise
- Higher ARPU, more stable

---

## 📦 Module Release Strategy

### **Independent Release Cadence**:

```
Core:        v1.0 → v1.1 → v1.2 (monthly releases)
ITSM Module: v1.0 (stable) → v1.1 (adds features)
M365 Module: v1.0 (when ready)

Customer can:
- Stay on Core v1.0 + ITSM v1.0 (no forced upgrades)
- Upgrade Core to v1.2 without changing ITSM
- Add M365 module without touching Core or ITSM
```

**Versioning**:
```json
{
  "dependencies": {
    "@helios/core": "^1.0.0",           // Open source, free
    "@helios/itsm-module": "^1.0.0",    // Paid, requires license
    "@helios/m365-module": "^1.0.0"     // Paid, requires license
  }
}
```

**Each module is independently**:
- Developed
- Tested
- Released
- Priced
- Licensed

---

## 🚀 Next Steps Summary

### **THIS SESSION** (Continue now if time):
1. Complete ITSM OpenSpec proposal (design.md, tasks.md, specs/)
2. Validate proposal
3. Document module licensing strategy

### **NEXT SESSION**:
1. Finish API Keys UI (4-6 hours)
2. Finish User Detail View (2-3 hours)
3. **Ship Helios Core v1.0** (open source!)

### **MONTH 2**:
1. Implement ITSM Module (following OpenSpec proposal)
2. Release as `@helios/itsm-module` v1.0 (proprietary)
3. Launch Helios Pro (hosted with ITSM)

---

## ✅ Your Questions Answered:

**Q: Can modules be released separately?**
**A**: YES! Each module is an NPM package with independent versioning.

**Q: How to monetize open source?**
**A**: Open-Core model - Core is MIT (free), Modules are proprietary (paid), SaaS hosting is premium.

**Q: Open source spirit?**
**A**: Core platform is genuinely open (users, groups, sync). Premium features (ITSM, M365, Enterprise) are paid. This is GitLab's model - works great!

---

**Next Action**: Complete ITSM OpenSpec proposal, then ship v1.0! 🚀
