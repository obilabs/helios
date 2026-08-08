# ITFlow Codebase Analysis Report
## Comprehensive Analysis for Helios Development Strategy

**Analysis Date:** November 1, 2025
**ITFlow Version Analyzed:** 25.10.1 (Stable Release)
**Purpose:** Strategic guidance for Helios Client Portal development

---

## Executive Summary

ITFlow is a mature, production-ready open-source MSP platform that has solved real pain points for small-to-medium MSPs. This analysis reveals **critical patterns and features** that Helios must adopt to compete effectively, while identifying opportunities to **significantly exceed ITFlow's capabilities** through modern architecture and Google Workspace integration.

**Key Findings:**
- **80+ database tables** with sophisticated many-to-many relationship system
- **"Everything links to everything"** philosophy is ITFlow's killer feature
- **Modular feature flags** allow flexible deployment (ticketing, billing, documentation)
- **Client Portal** is table stakes for MSP software
- **Expiration tracking** across all entities is crucial for MSP value delivery
- **Billing integration** with documentation is what sets MSPs apart from helpdesk tools

---

## 1. Database Schema Analysis

### 1.1 Core Entity Tables (Primary Assets)

ITFlow organizes around **client-centric documentation**:

```sql
-- Primary Entities
clients (client_id, name, type, rate, net_terms, ...)
contacts (contact_id, name, email, phone, department, ...)
assets (asset_id, type, name, make, model, serial, os, ...)
credentials (credential_id, name, username, password, uri, ...)
domains (domain_id, name, expire, registrar, nameservers, ...)
certificates (certificate_id, domain, expire, issued_by, ...)
software (software_id, name, license_type, seats, expire, ...)
networks (network_id, network, gateway, vlan, dhcp_range, ...)
vendors (vendor_id, name, contact_info, ...)
documents (document_id, name, content, template_id, ...)
files (file_id, name, reference_name, description, ...)
locations (location_id, name, address, contact, ...)
```

**Clever Patterns Observed:**
1. **Dual foreign keys** - Most entities have BOTH direct foreign key (`credential_asset_id`) AND junction tables (`asset_credentials`)
2. **Archived_at pattern** - Soft deletes everywhere with `archived_at` datetime
3. **Accessed_at tracking** - Records last access time for security auditing
4. **Important flags** - `asset_important`, `contact_important`, `credential_important` for quick filtering

### 1.2 Junction Tables (The Magic Sauce)

ITFlow's **killer feature** is the comprehensive linking system:

```sql
-- Asset Relationships
asset_credentials (credential_id, asset_id)
asset_documents (asset_id, document_id)
asset_files (asset_id, file_id)
asset_interfaces (interface_id, asset_id)
asset_interface_links (interface_a_id, interface_b_id)
asset_notes (asset_note_id, asset_id)
asset_history (asset_history_id, asset_id)

-- Contact Relationships
contact_assets (contact_id, asset_id)
contact_credentials (contact_id, credential_id)
contact_documents (contact_id, document_id)
contact_files (contact_id, file_id)
contact_notes (contact_note_id, contact_id)

-- Software/License Relationships
software_assets (software_id, asset_id)
software_contacts (software_id, contact_id)
software_credentials (software_id, credential_id)
software_documents (software_id, document_id)
software_files (software_id, file_id)
software_key_asset_assignments (software_key_id, asset_id)
software_key_contact_assignments (software_key_id, contact_id)

-- Service Relationships
service_assets (service_id, asset_id)
service_certificates (service_id, certificate_id)
service_contacts (service_id, contact_id)
service_credentials (service_id, credential_id)
service_documents (service_id, document_id)
service_domains (service_id, domain_id)
service_vendors (service_id, vendor_id)

-- Vendor Relationships
vendor_credentials (vendor_id, credential_id)
vendor_documents (vendor_id, document_id)
vendor_files (vendor_id, file_id)
```

**Why This Matters:**
- **Context is everything** in MSP work - technicians need to see "everything related to X"
- When viewing a server, you see: credentials, contacts responsible, software installed, network config, documentation, files, certificates
- When viewing a contact, you see: their devices, passwords they use, documents about them, software assigned
- When viewing a domain, you see: SSL certificates, DNS records, hosting credentials, renewal vendor

### 1.3 Ticketing & Support Tables

```sql
tickets (ticket_id, subject, details, status, priority, billable, ...)
ticket_replies (ticket_reply_id, ticket_id, reply, type, ...)
ticket_assets (ticket_id, asset_id)
ticket_attachments (ticket_attachment_id, ticket_id, file_id)
ticket_watchers (ticket_id, user_id)
ticket_views (ticket_view_id, ticket_id, user_id, view_at)
ticket_history (ticket_history_id, ticket_id, action, ...)
recurring_tickets (recurring_ticket_id, frequency, ...)
recurring_ticket_assets (recurring_ticket_id, asset_id)
ticket_statuses (ticket_status_id, name, color, ...)
ticket_templates (ticket_template_id, subject, details, ...)
projects (project_id, name, prefix, budget, ...)
```

**Standout Features:**
- `ticket_billable` flag - crucial for MSP billing
- `ticket_onsite` flag - schedule on-site vs remote
- `ticket_schedule` - scheduled maintenance tickets
- `ticket_first_response_at` - SLA tracking
- Asset linking to tickets
- Watchers system for notifications
- View tracking for ticket accountability

### 1.4 Billing & Accounting Tables

```sql
invoices (invoice_id, prefix, number, status, amount, ...)
invoice_items (item_id, invoice_id, product_id, qty, price, tax, ...)
recurring_invoices (recurring_invoice_id, frequency, ...)
quotes (quote_id, prefix, number, amount, ...)
quote_files (quote_id, file_id)
payments (payment_id, amount, method, account_id, ...)
payment_providers (provider_id, name, public_key, private_key, ...)
client_saved_payment_methods (method_id, client_id, provider_id, ...)
accounts (account_id, name, type, balance, ...)
expenses (expense_id, amount, vendor_id, category_id, ...)
recurring_expenses (recurring_expense_id, frequency, ...)
revenues (revenue_id, amount, category_id, account_id, ...)
products (product_id, name, description, price, type, stock, ...)
product_stock (stock_id, product_id, location_id, quantity, ...)
credits (credit_id, amount, type, client_id, ...)
taxes (tax_id, name, percent, ...)
budget (budget_id, month, year, amount, category_id)
```

**Critical MSP Features:**
- **Recurring invoices** with frequency automation
- **Stripe integration** via payment_providers
- **Multi-account tracking** (bank accounts)
- **Expense tracking** linked to vendors and categories
- **Stock management** for product sales
- **Quote-to-invoice conversion**
- **Client credits system**
- **Budget tracking** by category

### 1.5 Module & Configuration Tables

```sql
modules (module_id, name, enabled)
settings (massive config table with 100+ fields)
categories (category_id, name, type, color, icon, parent)
custom_fields (custom_field_id, table, label, type, location)
custom_values (custom_value_id, field_id, entity_id, value)
custom_links (custom_link_id, name, uri, location)
tags (tag_id, name, type, color)
client_tags (client_id, tag_id)
contact_tags (contact_id, tag_id)
credential_tags (credential_id, tag_id)
location_tags (location_id, tag_id)
```

**Extensibility Patterns:**
- **Module flags** control entire feature sets (ticketing, billing, documentation)
- **Custom fields system** allows field additions without schema changes
- **Tagging system** across multiple entity types
- **Categories with hierarchies** (parent support)
- **Custom links** for external tool integration

### 1.6 Advanced Features Tables

```sql
-- AI Integration
ai_providers (provider_id, name, api_url, api_key)
ai_models (model_id, name, prompt, use_case, provider_id)

-- Identity & Access
users (user_id, name, email, password, role_id, ...)
user_roles (role_id, name, description)
user_role_permissions (role_id, permission, level)
user_client_permissions (user_id, client_id)
auth_logs (auth_log_id, status, ip, user_agent, ...)
remember_tokens (remember_token_id, selector, token, user_id)

-- Notifications & Communication
notifications (notification_id, type, message, user_id, ...)
email_queue (email_id, recipient, subject, content, status, ...)
shared_items (shared_item_id, type, entity_id, url_key, ...)

-- Automation
calendar_events (event_id, title, start, end, repeat, ...)
calendar_event_attendees (attendee_id, event_id, contact_id, ...)
task_templates (template_id, name, description)
tasks (task_id, name, due_date, completed_at, ...)
document_templates (template_id, name, content)
document_versions (version_id, document_id, content, ...)

-- Logging & Auditing
logs (log_id, type, action, description, user_id, client_id, ...)
app_logs (app_log_id, category, type, details)
history (history_id, table, column, old_value, new_value, ...)
domain_history (history_id, domain_id, column, old, new)
certificate_history (history_id, certificate_id, column, old, new)
asset_history (history_id, asset_id, status, description)

-- Physical Infrastructure
racks (rack_id, name, location_id, units, ...)
rack_units (rack_unit_id, rack_id, position, asset_id)

-- Trips (Mileage Tracking)
trips (trip_id, date, purpose, source, destination, miles, ...)
```

---

## 2. Complete Feature List

### 2.1 Core MSP Documentation Features

**Client Management:**
- Client profiles with custom fields
- Lead tracking (client_lead flag)
- Client types (residential, commercial, etc.)
- Billing rates per client
- Net terms per client
- Client tags for organization
- Client referral source tracking
- Client notes
- Client access history tracking

**Contact Management:**
- Multiple contacts per client
- Contact roles (primary, billing, technical)
- Importance flagging
- Department tracking
- Contact photos
- Custom PIN for portal access
- Phone/mobile with country codes
- Contact linking to assets, credentials, documents

**Asset Management:**
- Comprehensive asset tracking
- Asset types, makes, models
- Serial numbers, OS versions
- Multiple URIs (admin panel, client access)
- Purchase dates, warranty expiration
- Installation dates (with 7-year retirement alerts)
- Physical location tracking
- Asset photos
- Asset interfaces with IP/MAC tracking
- Interface linking (cables/connections)
- Asset history logging
- Asset notes
- Link assets to credentials, documents, files, contacts, software

**Password/Credential Management:**
- Encrypted credential storage (varbinary)
- OTP secret storage (2FA)
- Dual URI support (primary + backup)
- Folder organization
- Importance flagging
- Last access tracking
- Password change date tracking
- Link credentials to assets, contacts, software, services, vendors

**Domain Management:**
- Domain expiration tracking
- Registrar, webhost, DNS host, mail host tracking (separate vendors)
- IP address, nameservers, mail servers
- TXT records storage
- Raw WHOIS data caching
- Domain history tracking
- Auto-refresh via cron jobs

**SSL Certificate Management:**
- Certificate expiration tracking
- Public key storage
- Issuing authority
- Link certificates to domains
- Certificate history tracking
- Auto-refresh via cron jobs

**Software/License Management:**
- License tracking with expiration
- Seat counting
- License keys
- Multiple license types
- Software versions
- Purchase tracking
- Link software to assets, contacts, credentials, documents
- Software key assignments to specific assets/contacts

**Network Documentation:**
- Network/subnet documentation
- VLAN configuration
- Gateway, DNS settings
- DHCP range tracking
- Link networks to locations

**Vendor Management:**
- Vendor contact information
- Link vendors to credentials, documents, files
- Vendor templates
- Expense tracking per vendor

**Document Management:**
- Rich text documents (TinyMCE)
- Document templates
- Document versioning
- Link documents to assets, contacts, software, services, vendors
- Folders for organization
- Document files attachments

**File Storage:**
- File uploads with reference names
- File linking to assets, contacts, software, vendors
- File descriptions

**Location Tracking:**
- Multiple locations per client
- Full address information
- Location photos
- Location tagging
- Link locations to assets, contacts, networks

### 2.2 Ticketing & Support Features

**Ticket System:**
- Customizable ticket prefixes
- Ticket numbering
- Source tracking (email, portal, in-app)
- Categories
- Priority levels
- Status workflow (customizable statuses)
- Billable flag
- Scheduled tickets
- On-site flag
- Vendor ticket number linking
- Feedback collection
- First response time tracking
- Resolution time tracking
- Link tickets to assets, contacts, locations, quotes, invoices, projects
- Ticket attachments
- Ticket watchers (notifications)
- Ticket view tracking
- Ticket history
- Ticket templates
- AI-powered ticket summaries

**Recurring Tickets:**
- Automated ticket generation
- Frequency configuration
- Link recurring tickets to assets

**Projects:**
- Project tracking
- Project budget
- Link projects to tickets
- Project templates
- Tasks within projects

**Calendar:**
- Calendar events
- Event attendees (contacts)
- Recurring events
- Multiple calendars

### 2.3 Billing & Accounting Features

**Quoting:**
- Quote generation
- Quote templates
- Quote-to-invoice conversion
- Quote files
- Email quotes to clients
- Client quote acceptance

**Invoicing:**
- Invoice generation with custom prefixes
- Line items linked to products
- Tax calculation
- Recurring invoices
- Late fee automation
- Invoice templates
- Email invoices to clients
- Invoice status tracking (draft, sent, viewed, paid, cancelled)
- Link invoices to tickets (bill for support)

**Payment Processing:**
- Multiple payment providers (Stripe, etc.)
- Saved payment methods for clients
- Payment thresholds for auto-charging
- Payment method tracking
- Payment history
- Link payments to invoices

**Accounting:**
- Multiple account tracking (checking, savings, etc.)
- Expense tracking
- Revenue tracking
- Budget management by category
- Transfers between accounts
- Account reconciliation

**Products:**
- Product catalog
- Service vs Product types
- Stock/inventory management
- Stock ledger
- Multi-location stock
- Product categories
- Pricing tiers

**Recurring Billing:**
- Recurring invoices with automation
- Recurring expenses
- Client autopay setup
- Saved payment methods

**Financial Reporting:**
- Revenue reports
- Expense reports
- Profit/loss
- Budget vs actual
- Client billing history

### 2.4 Client Portal Features

**Client Self-Service:**
- Client login (email + PIN or password)
- Microsoft SSO support
- View invoices
- Pay invoices online (Stripe)
- View quotes
- Accept quotes
- View tickets
- Create tickets
- Select assets when creating tickets
- View documents
- View assets
- View contacts
- Saved payment methods
- Recurring invoice management
- Company logo display

### 2.5 Reporting & Analytics Features

**Built-in Reports:**
- Client overview
- Asset reports
- Expiration reports (domains, certificates, licenses, warranties)
- Ticket reports (response time, resolution time)
- Financial reports
- Aging reports
- Stale ticket alerts

**Dashboard Widgets:**
- Recent activity
- Important contacts
- Stale tickets
- Expiring items (domains, certificates, licenses, warranties)
- Shared items
- Calendar events
- Financial summary

### 2.6 Integration & API Features

**API:**
- RESTful API
- API key management
- Per-client API keys
- Endpoints for clients, contacts, assets, tickets, locations, documents

**Email Integration:**
- SMTP configuration
- IMAP configuration (ticket email parser)
- OAuth2 support (Microsoft 365, Google Workspace)
- Email queue
- Email templates
- Automated email notifications

**Payment Integration:**
- Stripe integration
- Payment provider abstraction
- Webhook handling
- Saved payment methods

**AI Integration:**
- Multiple AI provider support (OpenAI, Ollama, LocalAI)
- Configurable models
- Ticket summarization
- Custom prompts

### 2.7 Security & Administration Features

**User Management:**
- Multi-user support
- Role-based permissions
- Per-client user permissions
- User settings
- 2FA support (TOTP)
- Session management
- Remember me tokens
- Password policies

**Authentication Logging:**
- Login attempt tracking
- IP address logging
- User agent tracking
- Failed login detection

**Audit Logging:**
- Activity logs per user
- Entity change history
- Document version history
- Asset history
- Domain/certificate change tracking

**Security:**
- Encrypted credentials (varbinary)
- API key encryption
- Session management
- CSRF protection
- SQL injection prevention (prepared statements)
- XSS prevention (htmlentities)

**Data Management:**
- Backup functionality
- Database export
- CSV import/export
- Soft deletes (archived_at)
- Data retention

### 2.8 Advanced Features

**Module System:**
- Enable/disable ticketing module
- Enable/disable billing module
- Enable/disable documentation module

**Customization:**
- Custom fields for any entity
- Custom links in navigation
- Custom themes (dark mode)
- Custom categories
- Custom document templates
- Custom ticket templates

**Tagging System:**
- Client tags
- Contact tags
- Credential tags
- Location tags
- Tag colors

**Services (Client IT Services):**
- Service catalog
- Service importance tracking
- Service backup configuration
- Service review dates
- Link services to assets, certificates, contacts, credentials, documents, domains, vendors

**Mileage Tracking:**
- Trip logging
- Odometer tracking
- Round trip calculation
- Client trip assignment

**Notification System:**
- User notifications
- Dismissible notifications
- Action links in notifications

**Shared Items:**
- Generate shareable links
- URL key generation
- Expiration for shared links
- Share passwords, documents, files

**Discount Codes:**
- Promo code support
- Discount management

**Identity Provider:**
- SSO configuration
- Microsoft 365 login
- Google Workspace login potential

---

## 3. Data Relationship Patterns

### 3.1 The "Everything Links to Everything" Philosophy

ITFlow's competitive advantage is **contextual relationships**:

```
ASSET (Server)
├── Credentials (5 passwords for this server)
├── Contacts (2 people responsible)
├── Documents (Setup guide, runbook)
├── Files (Config backups, diagrams)
├── Software (10 licenses installed)
├── Interfaces (3 network interfaces)
│   ├── Interface Links (connected to switch)
│   └── Networks (assigned to Production VLAN)
├── Tickets (12 tickets about this server)
├── Notes (Internal technician notes)
├── History (Change log)
└── Services (Email service, File share service)

DOMAIN (example.com)
├── Certificates (Wildcard SSL)
├── DNS Records (A, MX, TXT records)
├── Credentials (Registrar login, DNS panel login)
├── Vendors (Registrar, DNS host, web host, mail host)
├── Documents (DNS diagram)
├── Services (Website hosting service, Email service)
└── History (WHOIS changes, renewal dates)

CONTACT (John Smith, IT Manager)
├── Assets (Laptop, phone assigned to John)
├── Credentials (Passwords John uses)
├── Documents (Onboarding docs, training docs)
├── Files (John's ID scan, certifications)
├── Software (Licenses assigned to John)
├── Tickets (Tickets John submitted)
├── Calendar Events (Meetings with John)
└── Services (Services John is contact for)

SOFTWARE LICENSE (Microsoft 365 E3)
├── Assets (10 computers with this license)
├── Contacts (10 users assigned)
├── Credentials (Admin portal login)
├── Documents (License agreement)
├── Files (License key file)
└── Software Keys (Individual seat assignments)
```

### 3.2 Junction Table Pattern

ITFlow uses **many-to-many relationships** extensively:

```sql
-- Pattern: {entity_a}_{entity_b} table
-- Always has composite primary key
-- Always has CASCADE delete

CREATE TABLE asset_credentials (
  credential_id INT NOT NULL,
  asset_id INT NOT NULL,
  PRIMARY KEY (credential_id, asset_id),
  FOREIGN KEY (credential_id) REFERENCES credentials(credential_id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);
```

**Why this works:**
- Delete an asset → automatically removes all relationships
- Delete a credential → removes from all assets
- Query "all passwords for server X" → simple JOIN
- Query "all servers using password Y" → simple JOIN

### 3.3 Dual Foreign Key Pattern

ITFlow uses **both** direct foreign keys AND junction tables:

```sql
-- Credentials table has BOTH:
CREATE TABLE credentials (
  credential_id INT PRIMARY KEY,
  credential_asset_id INT DEFAULT 0,      -- Direct "primary" link
  credential_contact_id INT DEFAULT 0,    -- Direct "primary" link
  credential_client_id INT NOT NULL       -- Client ownership
);

-- AND junction tables:
asset_credentials (credential_id, asset_id)
contact_credentials (contact_id, credential_id)
```

**Reasoning:**
- Direct FK = "this password's PRIMARY purpose is for this asset"
- Junction table = "this password ALSO works on these other assets"
- Allows quick filtering: "passwords specifically for this asset" vs "all passwords that work on this asset"

### 3.4 Client Ownership Pattern

**Every entity has client_id** for data isolation:

```sql
asset_client_id INT NOT NULL
credential_client_id INT NOT NULL
domain_client_id INT NOT NULL
ticket_client_id INT NOT NULL
```

This enables:
- Multi-client MSP deployments
- User permissions per client
- Client data export
- Client portal filtering
- Reporting per client

### 3.5 Temporal Tracking Pattern

ITFlow tracks **three time dimensions** on most entities:

```sql
entity_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
entity_updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
entity_archived_at DATETIME DEFAULT NULL
entity_accessed_at DATETIME DEFAULT NULL  -- For security auditing
```

Plus **domain-specific dates**:
```sql
-- Domains
domain_expire DATE

-- Certificates
certificate_expire DATE

-- Software
software_purchase DATE
software_expire DATE

-- Assets
asset_purchase_date DATE
asset_warranty_expire DATE
asset_install_date DATE

-- Credentials
credential_password_changed_at DATETIME
```

### 3.6 Expiration Alert System

ITFlow has **sophisticated expiration tracking**:

```sql
-- Find domains expiring in 8-45 days
SELECT * FROM domains
WHERE domain_expire > CURRENT_DATE
  AND domain_expire < CURRENT_DATE + INTERVAL 45 DAY
  AND domain_archived_at IS NULL;

-- Find certificates expiring soon
SELECT * FROM certificates
WHERE certificate_expire > CURRENT_DATE
  AND certificate_expire < CURRENT_DATE + INTERVAL 45 DAY;

-- Find assets retiring (7 year lifecycle)
SELECT * FROM assets
WHERE asset_install_date + INTERVAL 7 YEAR > CURRENT_DATE
  AND asset_install_date + INTERVAL 7 YEAR <= CURRENT_DATE + INTERVAL 45 DAY;
```

**MSP Value Proposition:**
This is **THE killer feature** - MSPs get paid to:
- Renew domains before they expire
- Renew SSL certificates proactively
- Plan asset replacements
- Renew software licenses

---

## 4. UI/UX Patterns

### 4.1 Navigation Structure

**Three-Level Navigation:**

```
Level 1: Global Navigation (Always visible)
├── Dashboard
├── Clients (with count badge)
├── SUPPORT section
│   ├── Tickets (with active count)
│   ├── Recurring Tickets
│   └── Projects
├── Calendar
├── BILLING section
│   ├── Quotes
│   ├── Invoices (with open count)
│   ├── Recurring Invoices
│   ├── Revenues
│   └── Products
├── FINANCE section
│   ├── Payments
│   ├── Vendors
│   ├── Expenses
│   ├── Recurring Expenses
│   ├── Accounts
│   ├── Transfers
│   └── Trips
├── Client Overview (all clients)
└── Reports

Level 2: Client-Specific Navigation (When client selected)
├── Overview (Dashboard for this client)
├── Contacts
├── Locations
├── SUPPORT section
│   ├── Tickets
│   ├── Recurring Tickets
│   └── Projects
├── Vendors
├── Calendar
├── DOCUMENTATION section
│   ├── Assets
│   ├── Licenses (Software)
│   ├── Credentials
│   ├── Domains
│   ├── Certificates
│   ├── Networks
│   ├── Services
│   ├── Documents
│   └── Files
├── BILLING section
│   ├── Quotes
│   ├── Invoices
│   ├── Recurring Invoices
│   └── Payments
└── Activity Logs

Level 3: Entity Detail (When viewing specific item)
├── Entity header with key info
├── Related tabs
│   ├── Details
│   ├── Related Assets
│   ├── Related Credentials
│   ├── Related Documents
│   ├── Related Contacts
│   ├── History
│   └── Notes
└── Actions (Edit, Delete, Archive, etc.)
```

### 4.2 Dashboard Design

**Client Overview Dashboard** shows:
- Recent activity (last 5 logs)
- Important contacts (primary, billing, technical)
- Recent tickets
- Recent credentials (last accessed)
- Shared items
- **Action Items Section** (This is brilliant!)
  - Stale tickets (>7 days no update)
  - Domains expiring (8-45 days)
  - Certificates expiring (8-45 days)
  - Licenses expiring (8-45 days)
  - Warranties expiring (8-45 days)
  - Assets retiring (7 year mark)
- **Expired Items Section**
  - Domains expired
  - Certificates expired
  - Licenses expired
  - Warranties expired

### 4.3 List View Patterns

**Standard list features:**
- Search box
- Filter dropdowns (status, category, assigned to, etc.)
- Date range filters
- Items per page (25, 50, 100, 250, 500)
- Bulk actions checkbox
- Sortable columns
- Badge counts (open tickets, etc.)
- Export to CSV
- Quick actions (eye icon = view, pencil = edit)

### 4.4 Detail View Patterns

**Consistent entity detail structure:**
- Header card with key info
- Action buttons (Edit, Delete, Archive)
- Related items in cards or tabs
- History/audit log at bottom
- Quick add related items (+ buttons)

### 4.5 Modal Patterns

**Modal usage:**
- Add/Edit forms in modals (faster than full page)
- Delete confirmations
- Bulk action confirmations
- Quick view modals for credentials (show password)

### 4.6 Notable UX Decisions

**Copy-to-clipboard everywhere:**
- Passwords with eye/copy icons
- License keys
- IP addresses
- URIs

**Important flags:**
- Star icons on important items
- Important items float to top of lists
- Visual distinction (bold, color)

**Badge system:**
- Numerical badges on navigation (ticket count, invoice count)
- Color-coded status badges (success, warning, danger)
- Client-specific badges (abbreviation badges)

**Dark mode:**
- Full dark theme support
- Theme switcher in settings

**Responsive design:**
- Sidebar collapse on mobile
- Table scrolling on mobile
- Mobile-friendly forms

---

## 5. Pain Points ITFlow Solves

### 5.1 MSP Problems Solved

**Documentation Chaos:**
- ❌ Old way: Passwords in spreadsheets, docs in Google Drive, asset info in heads
- ✅ ITFlow: Everything centralized, linked, searchable

**Client Context Loss:**
- ❌ Old way: Technician wastes time finding "where is the domain registered?"
- ✅ ITFlow: Click domain → see registrar, credentials, SSL cert, all in one place

**Expiration Disasters:**
- ❌ Old way: Domain expires, client's email goes down, emergency renewal
- ✅ ITFlow: 45-day advance warnings, cron jobs auto-check expirations

**Billing for Documentation Time:**
- ❌ Old way: Can't bill clients for "updating documentation"
- ✅ ITFlow: Link tickets to invoices, bill for everything

**Technician Onboarding:**
- ❌ Old way: New tech has no idea where anything is
- ✅ ITFlow: Click client → see everything about that client

**Client Portal Demands:**
- ❌ Old way: Clients email "what's my invoice status?"
- ✅ ITFlow: Client logs in, sees invoices, pays online

**Multi-Tool Chaos:**
- ❌ Old way: ITGlue for docs, Freshdesk for tickets, QuickBooks for billing
- ✅ ITFlow: One system, one database, everything linked

### 5.2 What Users Love (From Web Research)

**Free & Open Source:**
- No per-user licensing like ITGlue ($30-50/user/month)
- Self-hosted = full control
- No vendor lock-in

**All-in-One:**
- Documentation + Ticketing + Billing in one system
- Data stays linked across modules
- Single source of truth

**Relationship Mapping:**
- "Everything links to everything" philosophy
- Visual relationship navigation
- Contextual information always available

**Customization:**
- Custom fields
- Custom categories
- Module on/off switches
- Custom branding

**Active Development:**
- Monthly releases (25.09, 25.10, 25.11 pattern)
- Community forum
- Responsive to feedback
- Stable 1.0 release in 2025

### 5.3 What Users Complain About

**Performance at Scale:**
- PHP/MySQL can be slow with large datasets
- No background job queue (uses cron)

**Limited Integrations:**
- No RMM integration (ConnectWise, Kaseya, etc.)
- Limited PSA integrations
- API is basic

**UI/UX:**
- AdminLTE theme is dated
- Mobile experience could be better
- Some workflows are clunky

**Reporting:**
- Reporting is basic
- No custom report builder
- Limited data visualization

**Multi-Tenant Limitations:**
- Single company deployment (no true multi-tenant)
- Can't manage multiple MSP companies in one install

**Client Portal:**
- Basic functionality
- Limited customization
- No mobile app

---

## 6. Integration Points

### 6.1 How They Handle Client Data

**Client-Centric Architecture:**
```sql
-- Every table has client_id
SELECT * FROM assets WHERE asset_client_id = 123;
SELECT * FROM tickets WHERE ticket_client_id = 123;
SELECT * FROM credentials WHERE credential_client_id = 123;
```

**Client Isolation:**
- User permissions can limit to specific clients
- API keys can be client-specific
- Reports filter by client
- Client portal only shows their data

### 6.2 API Structure

**REST API Endpoints:**
```
/api/v1/clients
/api/v1/clients/{id}
/api/v1/contacts
/api/v1/assets
/api/v1/tickets
/api/v1/locations
/api/v1/documents
```

**Authentication:**
- API key in header
- Per-key permissions
- Per-client API keys optional

**Response Format:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Success"
}
```

### 6.3 Multi-Tenant Architecture

**ITFlow is NOT multi-tenant:**
- One company per installation
- All users belong to one company
- Clients are "customers of the company"
- Not "multiple MSPs in one system"

**How they handle it:**
- Self-hosted per MSP
- Managed hosting available
- Docker deployment

### 6.4 Provider Access Patterns

**User Roles:**
- Administrator (full access)
- Technician (limited admin access)
- Accountant (billing only)
- Custom roles with granular permissions

**Permissions System:**
```sql
user_role_permissions (
  role_id,
  permission,  -- 'module_client', 'module_support', 'module_sales', etc.
  level        -- 0 = none, 1 = read, 2 = write, 3 = admin
)
```

**Per-Client Permissions:**
```sql
user_client_permissions (
  user_id,
  client_id
)
```

Allows: "This user can only see clients A, B, and C"

---

## 7. Recommendations for Helios

### 7.1 MUST-HAVE Features (Copy ITFlow)

**1. Comprehensive Linking System**
```sql
-- Helios MUST support:
user_assets (user_id, asset_id)
user_credentials (user_id, credential_id)
user_documents (user_id, document_id)
asset_credentials (asset_id, credential_id)
domain_certificates (domain_id, certificate_id)
```

**Why:** This is ITFlow's killer feature. Users love seeing "everything related to X."

**2. Expiration Tracking & Alerts**
```sql
-- Helios needs expiration dates on:
domains (expire_date)
certificates (expire_date)
software_licenses (expire_date)
user_employment (end_date)
vendor_contracts (expire_date)
```

**Why:** MSPs get paid to proactively manage renewals.

**3. Ticketing System with Billing Link**
```sql
tickets (
  ticket_id,
  subject,
  details,
  billable BOOLEAN,
  time_spent DECIMAL,
  invoice_id INT  -- Link ticket to invoice
)
```

**Why:** MSPs need to bill for support. ITGlue doesn't have this, ITFlow does.

**4. Client Portal**
```
Features needed:
- View tickets
- Create tickets
- View invoices
- Pay invoices online
- View their assets
- View their contacts
```

**Why:** Table stakes. Every MSP tool has this now.

**5. Module System with Feature Flags**
```sql
organization_modules (
  organization_id,
  module_name,
  enabled BOOLEAN
)

-- Modules:
- ticketing
- billing
- documentation
- projects
- calendar
- inventory
```

**Why:** Not every org needs every feature. Let them turn off what they don't use.

**6. Audit Logging**
```sql
audit_logs (
  log_id,
  user_id,
  action,
  entity_type,
  entity_id,
  old_value JSON,
  new_value JSON,
  ip_address,
  user_agent,
  created_at
)
```

**Why:** Compliance, security, debugging. Essential for enterprise.

**7. Soft Deletes (archived_at pattern)**
```sql
-- Every table needs:
deleted_at TIMESTAMP NULL
archived_at TIMESTAMP NULL
```

**Why:** Accidental deletions are common. Soft deletes save lives.

**8. Important Flags**
```sql
-- On relevant entities:
user_important BOOLEAN DEFAULT FALSE
asset_important BOOLEAN DEFAULT FALSE
credential_important BOOLEAN DEFAULT FALSE
contact_important BOOLEAN DEFAULT FALSE
```

**Why:** Quick filtering, VIP treatment, priority sorting.

**9. Tagging System**
```sql
tags (tag_id, name, type, color)
user_tags (user_id, tag_id)
group_tags (group_id, tag_id)
asset_tags (asset_id, tag_id)
```

**Why:** Flexible organization without rigid categories.

**10. Custom Fields**
```sql
custom_fields (
  field_id,
  table_name,
  field_name,
  field_type,  -- text, number, date, dropdown
  field_options JSON
)

custom_values (
  value_id,
  field_id,
  entity_id,
  value TEXT
)
```

**Why:** Every org has unique needs. Custom fields prevent "we need to add a column for X."

### 7.2 Features to SKIP Initially

**1. Accounting Module**
- ITFlow has full accounting (accounts, transfers, budgets)
- Helios should integrate with QuickBooks/Xero instead
- Don't reinvent accounting software

**2. Mileage Tracking**
- Niche feature, low priority
- Use Everlance or similar

**3. Calendar with Attendees**
- Google Calendar integration is better
- Don't build another calendar

**4. Physical Rack Management**
- Very niche (datacenter MSPs only)
- Low ROI

**5. Stock/Inventory Management**
- Focus on IT documentation, not retail inventory
- Most MSPs don't track physical stock

**6. Trip Management**
- Niche feature
- Mileage tracking apps are better

**7. Payment Provider Abstraction**
- Start with Stripe only
- Add others later if needed

**8. Document Versioning**
- Complex feature, low usage
- Use Google Drive integration instead

**9. Email Queue System**
- Use SendGrid, Mailgun, or Postmark
- Don't build email infrastructure

**10. AI Integration**
- Cool feature, not core
- Add after core features solid

### 7.3 How to Do It BETTER Than ITFlow

**1. Modern Tech Stack**
```
ITFlow:           Helios:
PHP/MySQL         Node.js/PostgreSQL
AdminLTE          React + TailwindCSS
No realtime       Socket.io for realtime updates
Cron jobs         Bull queue for background jobs
No tests          Jest + Playwright tests
```

**Why Better:** Performance, developer experience, maintainability.

**2. Google Workspace Integration (Helios Superpower)**

ITFlow has NO workspace integration. Helios can:

```typescript
// Auto-import from Google Workspace:
- Users from Google Admin
- Groups from Google Admin
- Devices from Google endpoint management
- Email aliases
- OU structure
- License assignments

// Auto-sync bidirectionally:
- User suspensions
- Password resets
- Group memberships
- License changes

// Display in Helios:
- Gmail usage
- Drive usage
- Last login
- Security alerts
- Device compliance
```

**Why Better:** ITFlow requires MANUAL entry of users, assets, etc. Helios auto-syncs from Google.

**3. Canonical Data Model**

ITFlow has separate tables:
- `contacts` (client contacts)
- `users` (technician accounts)
- No linking

Helios has:
```sql
-- ONE users table:
organization_users (
  id,
  email,
  first_name,
  last_name,
  type,  -- 'admin', 'manager', 'user', 'contact'
  google_workspace_id,
  synced_from_google
)

-- Google users automatically become Helios users
-- Client contacts can become users with portal access
-- All in one canonical model
```

**Why Better:** No duplicate data, single source of truth, easier permissions.

**4. Real-Time Updates**

ITFlow: Refresh page to see changes

Helios:
```typescript
// Socket.io events:
- Ticket assigned → notification appears instantly
- User updated → profile refreshes live
- Invoice paid → dashboard updates
- Document edited → collaborators see changes
```

**Why Better:** Modern UX, collaborative features.

**5. Modern UI/UX**

ITFlow: AdminLTE (Bootstrap 4, dated design)

Helios:
```typescript
// Design System (from DESIGN-SYSTEM.md):
- Lucide icons (not FontAwesome)
- Purple primary (#8b5cf6)
- Subtle grays (not harsh borders)
- 48px row heights
- Smooth animations
- Mobile-first responsive
- Accessible (WCAG 2.1 AA)
```

**Why Better:** Professional, modern, on-brand.

**6. Advanced Search**

ITFlow: Basic SQL LIKE queries

Helios:
```typescript
// Postgres full-text search:
- Search across all entities
- Fuzzy matching
- Relevance ranking
- Search filters (by type, date, user)
- Saved searches
```

**Why Better:** Find anything fast, power-user friendly.

**7. Webhooks & API-First**

ITFlow: Basic REST API

Helios:
```typescript
// Modern API:
- GraphQL API (flexible queries)
- REST API (compatibility)
- Webhooks (event notifications)
- Rate limiting
- API versioning
- OpenAPI spec
- SDK libraries (Python, JavaScript)
```

**Why Better:** Integration ecosystem, automation, partner tools.

**8. Background Job Queue**

ITFlow: Cron jobs

Helios:
```typescript
// Bull queue with Redis:
- Google sync jobs
- Email sending
- Report generation
- Bulk operations
- Retry logic
- Job monitoring dashboard
```

**Why Better:** Reliable, scalable, observable.

**9. Testing & Quality**

ITFlow: No automated tests

Helios:
```typescript
// Comprehensive testing:
- Unit tests (Jest)
- Integration tests (Supertest)
- E2E tests (Playwright) ✅ Already started!
- API tests
- Load tests
- Security scanning
```

**Why Better:** Fewer bugs, faster development, confident deployments.

**10. Enterprise Features**

ITFlow: Basic permissions

Helios:
```typescript
// Enterprise-grade:
- SSO (Google, Microsoft, Okta)
- SCIM provisioning
- Advanced RBAC
- Audit logs with retention
- SOC 2 compliance tracking
- Data residency options
- SLA tracking
- Compliance reports
```

**Why Better:** Enterprise sales, compliance requirements, security.

### 7.4 Helios Unique Advantages

**1. Google Workspace Native**
- ITFlow: Manual data entry
- Helios: Auto-sync from Google
- **Win:** Save 10+ hours/week on data entry

**2. Canonical User Model**
- ITFlow: Contacts vs Users separate
- Helios: One user table, multiple roles
- **Win:** Simpler permissions, less duplication

**3. Feature Flags**
- ITFlow: Module on/off only
- Helios: Granular feature flags per organization
- **Win:** A/B testing, gradual rollouts, custom pricing

**4. Modern Stack**
- ITFlow: PHP/MySQL
- Helios: Node.js/PostgreSQL/React
- **Win:** Better performance, developer talent pool

**5. Real-Time**
- ITFlow: Page refreshes
- Helios: Socket.io real-time updates
- **Win:** Modern UX, collaboration

**6. API-First**
- ITFlow: API is afterthought
- Helios: API from day one, GraphQL option
- **Win:** Integration ecosystem

**7. Single-Tenant Focus**
- ITFlow: Single company only
- Helios: Single organization (clearer messaging)
- **Win:** Simpler, faster, more secure

**8. Self-Service**
- ITFlow: Admin portal + basic client portal
- Helios: End-user self-service from day one
- **Win:** Lower support burden, user empowerment

**9. Compliance Built-In**
- ITFlow: Basic logging
- Helios: Audit logs, compliance reports, data exports
- **Win:** Enterprise sales, regulated industries

**10. Testing Culture**
- ITFlow: No tests
- Helios: Tests from start (already has Playwright tests!)
- **Win:** Faster iteration, fewer bugs

### 7.5 Go-to-Market Differentiation

**Positioning:**

```
ITFlow:
"Free open-source alternative to ITGlue"

Helios:
"Modern IT management for Google Workspace organizations"
```

**Target Market:**

```
ITFlow:
- Small MSPs (1-5 technicians)
- Price-sensitive
- Self-hosted comfort

Helios:
- Google Workspace organizations (5-500 users)
- Internal IT teams
- Small MSPs with Google clients
- Value time over money
- Want hosted solution
```

**Pricing Strategy:**

```
ITFlow:
- Free (self-hosted)
- $25/mo (hosted)

Helios:
- Free tier: Up to 25 users
- Pro: $10/user/month (min $100/mo)
- Enterprise: Custom pricing
```

**Key Differentiators:**

1. **Google Workspace Native**
   - "Sync users, groups, devices automatically"
   - "No manual data entry"

2. **Modern UX**
   - "Built for 2025, not 2015"
   - "Mobile-first, real-time updates"

3. **End-User Self-Service**
   - "Empower users to help themselves"
   - "Reduce helpdesk tickets by 40%"

4. **API-First**
   - "Integrate with your tools"
   - "Automate everything via API"

5. **Enterprise-Ready**
   - "SOC 2 compliant"
   - "SSO, SCIM, audit logs"

---

## 8. Implementation Roadmap

### 8.1 Phase 1: Core Documentation (MUST-HAVE)

**Goal:** Match ITFlow's documentation basics

```typescript
// Database tables needed:
- users (already have ✅)
- groups (already have ✅)
- assets (NEW - computers, phones, tablets)
- credentials (NEW - passwords)
- domains (NEW - domain tracking)
- certificates (NEW - SSL certs)
- software_licenses (NEW - license tracking)
- locations (NEW - office locations)
- vendors (NEW - vendor contacts)

// Junction tables:
- user_assets
- user_credentials
- asset_credentials
- domain_certificates

// Features:
- CRUD for all entities
- Linking system (assign asset to user)
- Search functionality
- List views with filters
- Detail views with relationships
- Expiration tracking
- Audit logging
```

**Timeline:** 4-6 weeks

### 8.2 Phase 2: Ticketing System

**Goal:** Internal helpdesk

```typescript
// Database tables:
- tickets
- ticket_replies
- ticket_statuses
- ticket_assets (link ticket to asset)
- ticket_watchers
- ticket_attachments

// Features:
- Create ticket
- Assign ticket
- Comment on ticket
- Close ticket
- Email notifications
- SLA tracking (first response, resolution)
- Ticket templates
```

**Timeline:** 3-4 weeks

### 8.3 Phase 3: Client Portal

**Goal:** User self-service

```typescript
// Features:
- User login (Google SSO)
- View my tickets
- Create ticket
- View my assets
- View organization contacts
- Password reset requests
- Request access to apps
```

**Timeline:** 2-3 weeks

### 8.4 Phase 4: Google Workspace Sync

**Goal:** Auto-import from Google

```typescript
// Features:
- Sync users from Google Admin
- Sync groups
- Sync Chrome OS devices
- Sync mobile devices
- Sync organizational units
- Sync license assignments
- Auto-update on changes (webhooks)
- Bi-directional sync (suspend user → Google)
```

**Timeline:** 4-6 weeks

### 8.5 Phase 5: Advanced Features

**Goal:** Exceed ITFlow

```typescript
// Features:
- Advanced search (full-text)
- Bulk operations
- CSV import/export
- Custom fields
- Tagging system
- Webhooks
- GraphQL API
- Real-time updates (Socket.io)
- Mobile app (React Native)
```

**Timeline:** 8-12 weeks

### 8.6 Phase 6: Billing Module (Optional)

**Goal:** Invoice clients

```typescript
// Features:
- Invoice generation
- Stripe integration
- Recurring invoices
- Link tickets to invoices
- Payment tracking
- Client payment portal
```

**Timeline:** 6-8 weeks

---

## 9. Key Takeaways

### 9.1 What Makes ITFlow Successful

1. **Solves real MSP pain** - documentation, ticketing, billing in one place
2. **Free & open source** - no per-user licensing
3. **Everything links** - contextual relationships
4. **Expiration tracking** - proactive value delivery
5. **Client portal** - reduces support burden
6. **Module system** - flexible deployment
7. **Active development** - monthly releases, responsive community

### 9.2 What Helios Can Do Better

1. **Google Workspace native** - auto-sync users, devices, licenses
2. **Modern tech stack** - faster, better UX, easier to develop
3. **Canonical data model** - no duplicate user tables
4. **Real-time updates** - Socket.io for live collaboration
5. **API-first** - GraphQL + REST, webhooks, SDKs
6. **Enterprise features** - SSO, SCIM, SOC 2, audit logs
7. **Better UX** - modern design system, mobile-first
8. **Testing culture** - automated tests from day one
9. **Background jobs** - reliable async processing
10. **Single-tenant focus** - simpler, faster, more secure

### 9.3 Must-Have Features for v1.0

1. ✅ User management (have it)
2. ✅ Group management (have it)
3. ❌ **Asset management** (computers, phones, tablets)
4. ❌ **Credential management** (passwords)
5. ❌ **Domain tracking** (with expiration)
6. ❌ **Certificate tracking** (with expiration)
7. ❌ **Software license tracking** (with expiration)
8. ❌ **Ticketing system** (with asset linking)
9. ❌ **Client portal** (user self-service)
10. ❌ **Google Workspace sync** (auto-import)
11. ❌ **Linking system** (everything to everything)
12. ❌ **Expiration alerts** (proactive notifications)
13. ❌ **Audit logging** (compliance)
14. ❌ **Search** (find anything fast)
15. ✅ **Module flags** (enable/disable features) - partial

### 9.4 Competitive Advantages

**Helios vs ITFlow:**

| Feature | ITFlow | Helios |
|---------|--------|--------|
| **Price** | Free (self-hosted) | Free tier + paid plans |
| **Google Workspace** | ❌ None | ✅ Native integration |
| **User Management** | Manual entry | ✅ Auto-sync from Google |
| **Tech Stack** | PHP/MySQL | ✅ Node.js/PostgreSQL |
| **UI/UX** | AdminLTE (dated) | ✅ Modern React + Tailwind |
| **Real-Time** | ❌ Page refreshes | ✅ Socket.io |
| **API** | Basic REST | ✅ GraphQL + REST + Webhooks |
| **Testing** | ❌ None | ✅ Jest + Playwright |
| **Mobile** | Responsive web | ✅ Mobile-first + app potential |
| **SSO** | Basic | ✅ Google, Microsoft, Okta |
| **Deployment** | Self-hosted or managed | ✅ SaaS-first |
| **Documentation** | ✅ Excellent | Build on this |
| **Ticketing** | ✅ Excellent | Match feature parity |
| **Billing** | ✅ Excellent | ⚠️ Phase 2 - Integrate with Stripe |
| **Accounting** | ✅ Full accounting | ❌ Skip - integrate QuickBooks |
| **Everything Links** | ✅ Excellent | Must match |
| **Expiration Tracking** | ✅ Excellent | Must match |
| **Client Portal** | Basic | ✅ Better UX |
| **Custom Fields** | ✅ Yes | Must have |
| **Tagging** | ✅ Yes | Must have |
| **Audit Logs** | Basic | ✅ Enterprise-grade |

### 9.5 Strategic Recommendations

**1. Don't compete on price with ITFlow**
- They're free (self-hosted)
- Compete on: Google integration, modern UX, hosted ease, support

**2. Focus on Google Workspace users**
- ITFlow has no Google integration
- This is Helios's unfair advantage
- Market to Google Workspace admins, not generic MSPs

**3. Build the linking system early**
- This is what users love about ITFlow
- Essential for documentation usefulness
- Junction tables are cheap, add them liberally

**4. Expiration tracking is table stakes**
- Domains, certs, licenses must have expire dates
- Build alert system early
- This is how MSPs prove value

**5. Client portal is required**
- Every competitor has this
- Build it in Phase 3
- Focus on better UX than ITFlow

**6. Skip the accounting module**
- Complex, low differentiation
- Integrate QuickBooks/Xero instead
- Focus on core competencies

**7. API-first from day one**
- ITFlow's API is basic
- Helios can dominate on integrations
- GraphQL gives flexibility

**8. Modern UX is a differentiator**
- ITFlow looks dated (AdminLTE)
- Helios's design system is already better
- Make it a selling point

**9. Testing prevents technical debt**
- ITFlow has no tests (hard to refactor)
- Helios already started with Playwright
- Maintain test coverage >80%

**10. Feature flags enable fast iteration**
- Turn features on/off per org
- A/B test pricing models
- Gradual rollouts reduce risk

---

## Appendix A: Complete ITFlow Table List

```
Core Tables (23):
- accounts, assets, calendars, calendar_events, categories
- certificates, clients, contacts, credentials, documents
- domains, files, folders, invoices, locations, networks
- payments, products, projects, quotes, software, tags
- tickets, vendors

Junction Tables (30):
- asset_credentials, asset_documents, asset_files
- asset_interface_links, contact_assets, contact_credentials
- contact_documents, contact_files, credential_tags
- client_tags, contact_tags, location_tags
- document_files, quote_files, service_assets
- service_certificates, service_contacts, service_credentials
- service_documents, service_domains, service_vendors
- software_assets, software_contacts, software_credentials
- software_documents, software_files, ticket_assets
- vendor_credentials, vendor_documents, vendor_files
- software_key_asset_assignments, software_key_contact_assignments

Support Tables (15):
- asset_custom, asset_history, asset_interfaces, asset_notes
- calendar_event_attendees, client_notes, contact_notes
- ticket_replies, ticket_attachments, ticket_watchers
- ticket_views, ticket_history, ticket_statuses
- ticket_templates, recurring_tickets, recurring_ticket_assets

Billing Tables (12):
- invoice_items, recurring_invoices, payment_methods
- payment_providers, client_payment_provider
- client_saved_payment_methods, expenses, recurring_expenses
- revenues, transfers, budget, taxes

Admin Tables (18):
- users, user_roles, user_role_permissions, user_settings
- user_client_permissions, settings, modules, custom_fields
- custom_values, custom_links, notifications, logs
- auth_logs, app_logs, history, remember_tokens
- shared_items, api_keys

Feature Tables (16):
- services, software_keys, software_templates
- document_templates, document_versions, vendor_templates
- project_templates, project_template_ticket_templates
- task_templates, tasks, trips, email_queue
- discount_codes, product_stock, credits, racks, rack_units

History/Audit Tables (5):
- asset_history, domain_history, certificate_history
- ticket_history, history

AI Tables (2):
- ai_providers, ai_models

Identity Tables (1):
- identity_provider

Total: ~82 tables
```

---

## Appendix B: ITFlow Code Patterns Worth Adopting

**1. Nullable HTML Entities Function:**
```php
function nullable_htmlentities($string) {
    if (empty($string)) {
        return '';
    }
    return htmlentities($string, ENT_QUOTES, 'UTF-8');
}
```
Prevents XSS, handles nulls gracefully.

**2. Archived At Soft Delete:**
```sql
WHERE entity_archived_at IS NULL
```
Every query filters archived records.

**3. Foreign Key Cascade Deletes:**
```sql
FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE
```
Clean up orphaned records automatically.

**4. Default Values for Foreign Keys:**
```sql
entity_client_id INT NOT NULL DEFAULT 0
```
Prevents null foreign keys, simplifies queries.

**5. Updated At Trigger:**
```sql
entity_updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
```
Automatic timestamp tracking.

**6. Permission Check Function:**
```php
if (lookupUserPermission("module_client") >= 1) {
    // Show feature
}
```
Centralized permission checking.

**7. Redirect Function:**
```php
function redirect($url) {
    header("Location: $url");
    exit();
}
```
Prevents redirect vulnerabilities.

**8. Flash Alert Function:**
```php
function flash_alert($message, $type = 'success') {
    $_SESSION['flash_message'] = $message;
    $_SESSION['flash_type'] = $type;
}
```
User-friendly notifications.

**9. Get Field By ID:**
```php
function getFieldById($table, $field, $id) {
    global $mysqli;
    $sql = mysqli_query($mysqli,
        "SELECT $field FROM $table WHERE {$table}_id = $id"
    );
    $row = mysqli_fetch_array($sql);
    return $row[$field];
}
```
Reusable data fetching.

**10. URL Key Generation:**
```sql
entity_url_key VARCHAR(200) DEFAULT NULL
```
Secure shareable links without exposing IDs.

---

## Appendix C: ITFlow UI Component Patterns

**Badge Component:**
```html
<span class="badge badge-success">Active</span>
<span class="badge badge-danger">Expired</span>
<span class="badge badge-warning">Expiring Soon</span>
```

**Action Buttons:**
```html
<a href="edit.php?id=123" class="btn btn-sm btn-primary">
    <i class="fas fa-edit"></i>
</a>
<a href="delete.php?id=123" class="btn btn-sm btn-danger">
    <i class="fas fa-trash"></i>
</a>
```

**Modal Trigger:**
```html
<button data-toggle="modal" data-target="#addModal">
    Add New
</button>
```

**Copy to Clipboard:**
```html
<i class="fas fa-copy copy-to-clipboard"
   data-clipboard-text="password123"></i>
```

**Show/Hide Password:**
```html
<i class="fas fa-eye toggle-password"
   data-target="#passwordField"></i>
```

**Important Star:**
```html
<i class="fas fa-star <?php if ($important) echo 'text-warning'; ?>"></i>
```

---

**End of Report**

This analysis provides a comprehensive blueprint for Helios development. The key insight: **ITFlow proves the market exists for integrated IT management platforms**, and **Helios can win by being the Google Workspace-native alternative** with modern architecture and superior UX.

Focus on the linking system, expiration tracking, and Google sync - these are the differentiators that will make Helios indispensable.
