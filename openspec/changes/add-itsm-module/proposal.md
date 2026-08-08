# Add ITSM Module to Helios

## Summary
Transform Helios from a workspace management tool into a comprehensive IT management platform by adding an integrated ITSM module. This positions Helios as "the only ITSM platform built natively for Google Workspace" - combining workspace administration, asset management, credential vaulting, domain/certificate tracking, and ticketing in one unified system.

## Problem Statement

### Current State:
Organizations using Helios for Google Workspace management also need:
- **Asset inventory** - Track computers, phones, network devices (currently scattered in spreadsheets)
- **Credential management** - Secure password storage (currently in LastPass/1Password separately)
- **Domain/certificate tracking** - Monitor expiration, DNS changes (currently manual calendar reminders)
- **Ticketing system** - Support internal users (currently email chaos or separate tool like FreshService)
- **IT documentation** - Centralized docs, procedures (currently Google Drive folders)

### The Pain:
- **Data duplication**: Users exist in Helios AND in separate ITSM tool
- **Context switching**: Jump between Google Admin Console, Helios, ITSM tool, password manager
- **Sync lag**: Asset inventory out-of-date (manual updates)
- **No linking**: Ticket doesn't show user's assets, credentials, recent changes
- **Expensive**: FreshService is $29-99/user/month on top of Helios

### Market Gap:
- **ITFlow**: Free but zero Google Workspace integration, self-hosted only, dated UI
- **FreshService**: Good but expensive ($29-99/user/month), weak Google integration
- **BetterCloud**: Excellent Google integration but NO ITSM/ticketing
- **ServiceNow**: Enterprise-grade but $100+/user/month, massive overkill

**No one offers**: ITSM natively integrated with Google Workspace management.

## Proposed Solution

### ITSM as Integrated Helios Module

Add ITSM capabilities as a module within Helios, leveraging existing:
- ✅ Canonical data model (entity.asset, entity.credential, entity.ticket)
- ✅ Feature flags (ITSM features show only when module enabled)
- ✅ User directory (tickets assigned to existing users!)
- ✅ Authentication (single login!)
- ✅ API key system (perfect for external provider access!)

### Core ITSM Entities (MVP):

**1. Assets** - Computers, phones, network devices
- Auto-import from Google Workspace (Chrome OS, Mobile MDM)
- Link to users (already in system!)
- Link to credentials, documents, software
- Track warranties, locations

**2. Credentials** - Encrypted password vault
- AES-256 encryption
- OTP/TOTP support
- Link to assets, services, users
- Expiration tracking, rotation alerts

**3. Domains & Certificates** - Proactive monitoring
- Auto-fetch DNS records (daily monitoring)
- Detect DNS changes → Alert admins
- Certificate expiration tracking
- Email alerts (30/14/7 days before expiry)

**4. Tickets** - Internal support system
- Create/assign/track support tickets
- Link to assets, users, credentials (context!)
- Status workflow (New → In Progress → Resolved → Closed)
- Internal notes vs user-visible replies
- Email notifications

**5. Documents** - IT documentation hub
- Upload procedures, diagrams, policies
- Link to assets, services, tickets
- Search functionality
- Version history

**6. Linking System** - "Everything Links to Everything"
- asset_credentials, asset_documents, asset_software
- user_assets, user_credentials
- ticket_assets, ticket_users
- domain_certificates, domain_credentials
- **This contextual linking is the killer feature!**

**7. Client Portal** - User self-service
- Users submit tickets
- View their tickets & assets
- Search knowledge base
- Uses existing Helios authentication!

### Helios's Unique Advantages:

**Auto-Sync from Google Workspace**:
```typescript
// Import Chrome OS devices as assets (ITFlow CAN'T do this!)
const chromebooks = await google.admin.chromeosdevices.list();
chromebooks.forEach(device => {
  createAsset({
    name: device.deviceId,
    type: 'chromebook',
    assignedTo: findUser(device.user), // ← User already in Helios!
    os: device.osVersion,
    lastSync: device.lastSync
  });
});
```

**Same Database**:
```typescript
// Tickets have FULL user context instantly
const ticket = {
  subject: "Password reset",
  createdBy: user.id,
  userContext: {
    email: user.email,              // From Helios
    orgUnit: user.orgUnit,          // From Google Workspace
    manager: user.manager,          // From Google Workspace
    groups: user.groups,            // From Google Workspace
    devices: user.assets,           // From ITSM module
    recentLogins: user.lastLogin    // From Google Workspace
  }
};
// IT staff sees EVERYTHING in one view!
```

## Success Criteria
- ✅ IT staff can manage assets, credentials, domains, tickets in Helios
- ✅ Assets auto-import from Google Workspace (Chrome OS, Mobile devices)
- ✅ Domains auto-monitor DNS records daily, alert on changes
- ✅ Certificates track expiration, email alerts 30/14/7 days before
- ✅ Tickets link to assets, users, credentials (full context)
- ✅ Users can submit tickets via client portal
- ✅ Everything links to everything (30+ junction tables)
- ✅ Module can be enabled/disabled via feature flags
- ✅ All ITSM terminology customizable via labels system
- ✅ External providers can access via Vendor API keys (with actor attribution)
- ✅ Zero data duplication (uses existing Helios users)
- ✅ Feature parity with ITFlow core features (but better UX!)

## Scope

### In Scope (Phase 1 - ITSM Core)
- Asset management (computers, phones, network devices, peripherals)
- Asset auto-import from Google Workspace
- Credential management (encrypted vault, OTP support)
- Domain management (DNS monitoring, certificate tracking)
- Software license tracking
- Document management (upload, organize, link)
- Ticketing system (create, assign, track, resolve)
- Linking system (junction tables for all relationships)
- Client portal (user self-service ticket submission)
- Expiration alerts (domains, certs, licenses, warranties)
- ITSM module in `available_modules` with feature flag
- Integration with existing canonical model
- E2E tests for all ITSM features

### Out of Scope (Future Phases)
- Projects & task management (Phase 2)
- Knowledge base with articles (Phase 2)
- Service catalog (Phase 2)
- Change management (Phase 2)
- Vendor management (Phase 2)
- Time tracking / billing (Phase 3)
- Full accounting module (Never - integrate QuickBooks instead)
- Unified Endpoint Management (Phase 4 - wait for demand)
- Multi-tenant MTP (Phase 5 - after single-org perfected)

## Technical Approach

### Architecture: Module-Based Integration

**Module Definition**:
```typescript
{
  module_key: 'itsm',
  module_name: 'IT Service Management',
  module_type: 'feature',
  provides_entities: [
    'entity.asset',
    'entity.credential',
    'entity.domain',
    'entity.certificate',
    'entity.ticket',
    'entity.document',
    'entity.software_license'
  ],
  depends_on: ['core'], // Uses existing users, auth
  config_schema: {
    enable_client_portal: boolean,
    enable_asset_auto_sync: boolean,
    enable_domain_monitoring: boolean,
    ticket_statuses: string[],
    expiration_alert_days: number[]
  }
}
```

### Database Schema (High-Level):

**Core ITSM Tables** (~20 new tables):
```sql
-- Assets
assets, asset_types, asset_statuses, locations

-- Credentials
credentials, credential_categories

-- Domains & Certificates
domains, domain_dns_records, certificates

-- Software
software, software_licenses, software_asset (junction)

-- Tickets
tickets, ticket_statuses, ticket_priorities, ticket_replies, ticket_attachments

-- Documents
documents, document_folders

-- Linking (Junction Tables) - THE KILLER FEATURE
asset_credentials, asset_documents, asset_software, asset_users
user_credentials, user_documents
ticket_assets, ticket_users, ticket_documents, ticket_credentials
domain_certificates, domain_credentials, domain_documents
service_assets, service_certificates, service_credentials
```

### Integration Points:

**1. Canonical Entities**:
```typescript
// Add to frontend/src/config/entities.ts
ENTITIES.ASSET = 'entity.asset';
ENTITIES.CREDENTIAL = 'entity.credential';
ENTITIES.TICKET = 'entity.ticket';
ENTITIES.DOMAIN = 'entity.domain';

// Custom labels work automatically!
labels[ENTITIES.ASSET].plural → "Equipment" or "Devices"
labels[ENTITIES.TICKET].plural → "Issues" or "Requests"
```

**2. Feature Flags**:
```typescript
// Navigation shows ITSM only when module enabled
{isEntityAvailable(ENTITIES.ASSET) && (
  <NavItem to="/assets">{labels[ENTITIES.ASSET].plural}</NavItem>
)}

{isEntityAvailable(ENTITIES.TICKET) && (
  <NavItem to="/tickets">{labels[ENTITIES.TICKET].plural}</NavItem>
)}
```

**3. Google Workspace Auto-Sync**:
```typescript
// Daily sync job
async function syncAssetsFromGoogle() {
  // Import Chrome OS devices
  const devices = await googleWorkspaceService.getChromeOSDevices();
  devices.forEach(device => {
    upsertAsset({
      name: device.serialNumber,
      type: 'chromebook',
      assigned_user_id: findUserByEmail(device.user),
      platform: 'google_workspace',
      external_id: device.deviceId,
      metadata: { osVersion: device.osVersion, lastSync: device.lastSync }
    });
  });
}
```

**4. Provider Access**:
```typescript
// MSP Provider uses existing Vendor API Key system!
const apiKey = {
  type: 'vendor',
  permissions: ['read:tickets', 'write:tickets', 'read:assets', 'read:users'],
  vendor_config: {
    requiresActor: true,
    allowedActors: ['john@msp.com', 'sarah@msp.com']
  }
};

// Every provider action shows in audit:
"John from GridWorx MSP resolved ticket T-456 (actor attribution working!)"
```

## User Experience

### For IT Staff:

**Navigation** (ITSM module enabled):
```
Helios Dashboard
├── Directory
│   ├── Users (from Google Workspace)
│   ├── Groups
│   └── Org Units
├── ITSM (NEW!)
│   ├── Assets → Lists all devices (auto-synced from Google!)
│   ├── Credentials → Encrypted password vault
│   ├── Domains → DNS & cert monitoring
│   ├── Tickets → Support ticket system
│   └── Documents → IT documentation
└── Settings
    └── Modules → Enable/disable ITSM
```

**Asset Detail View**:
```
Asset: Mike's MacBook Pro
├── Basic Info: Serial, warranty, location
├── Assigned User: Mike Johnson (mike@company.com) ← Link to existing user!
├── Credentials: [Admin Password, FileVault Key, VPN Config]
├── Software: [Microsoft Office, Slack, Chrome]
├── Documents: [Setup Guide, Warranty PDF]
├── Related Tickets: [T-123: "Laptop won't boot", T-456: "Slow performance"]
└── History: Purchase date, warranty expiry, last sync
```

**Everything is linked!** Click any item to see its relationships.

### For End Users (Client Portal):

```
My IT Portal
├── Submit Ticket
├── My Tickets → View status, reply
├── My Assets → See assigned devices
└── Knowledge Base → Search for solutions
```

**Same login as main Helios!** No separate credentials.

## Timeline Estimate

**Phase 1: Database & Backend** (2-3 weeks)
- 20 new database tables
- 7 new backend services (asset, credential, domain, ticket, document, linking, sync)
- 7 new API route sets
- Google Workspace sync integration
- Junction table management

**Phase 2: Frontend** (3-4 weeks)
- 5 new pages (Assets, Credentials, Domains, Tickets, Documents)
- Linking UI (attach credential to asset, etc.)
- Client portal pages
- Dashboard widgets (expiring items, recent tickets)

**Phase 3: Automation** (1-2 weeks)
- Daily domain DNS monitoring cron job
- Certificate checking cron job
- Expiration alert emails
- Asset sync from Google Workspace (daily)

**Phase 4: Testing** (1-2 weeks)
- Unit tests for services
- Integration tests for APIs
- E2E tests for all ITSM workflows
- Load testing for sync jobs

**Total: 7-11 weeks (2-3 months)**

## Success Metrics
- ITSM module can be enabled/disabled via Settings > Modules
- 100+ assets auto-imported from Google Workspace for typical org
- Domain DNS changes detected within 24 hours
- Certificates expiring within 30 days show dashboard alert
- Tickets created by users appear immediately in IT staff view
- Average ticket resolution time tracked
- Zero data duplication (users, groups shared with main Helios)
- Feature parity with ITFlow core features
- Superior UX compared to ITFlow (modern React vs PHP/AdminLTE)
- 100% E2E test coverage for ITSM workflows

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope creep (trying to match ALL ITFlow features) | High | MVP focus - only core features in Phase 1 |
| Google Workspace API rate limits | Medium | Cache device data, sync daily not hourly |
| Credential encryption complexity | High | Use industry-standard AES-256, review by security expert |
| Domain DNS monitoring at scale | Medium | Use DNS provider APIs, not direct lookups |
| Feature flags performance | Low | Availability already cached in LabelsContext |

## Dependencies
- Existing canonical data model (entity system)
- Existing feature flags (module-entity registry)
- Existing user directory (ticket assignments)
- Existing API key system (provider access)
- Google Workspace API access (device sync)
- Encryption library (credential storage)

## References
- ITFlow Analysis: `ITFLOW-ANALYSIS-REPORT.md`
- ITFlow Key Insights: `ITFLOW-KEY-INSIGHTS.md`
- ITFlow Database Schema (Adapted): `ITFLOW-DATABASE-SCHEMA-FOR-HELIOS.md`
- Strategic Roadmap: `HELIOS-STRATEGIC-ROADMAP.md`
- Existing Canonical Model: `openspec/changes/implement-canonical-data-model/`
