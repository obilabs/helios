# ITFlow Database Schema Adapted for Helios

## Recommended Schema for Helios v1.0

Based on ITFlow analysis, here's the recommended database schema for Helios Client Portal. This adapts ITFlow's proven patterns to Helios's single-organization, Google Workspace-centric model.

---

## Core Principle: Canonical User Model

**Unlike ITFlow** (which has separate `contacts` and `users` tables), **Helios uses ONE users table** with different roles:

```sql
organization_users (
  id INT PRIMARY KEY,
  organization_id INT NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  first_name VARCHAR(200),
  last_name VARCHAR(200),
  role VARCHAR(50) NOT NULL,  -- 'admin', 'manager', 'user', 'contact'
  is_active BOOLEAN DEFAULT TRUE,

  -- Google Workspace sync fields
  google_workspace_id VARCHAR(200),
  google_workspace_ou VARCHAR(500),
  synced_from_google BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMP,

  -- Contact info
  phone VARCHAR(50),
  mobile VARCHAR(50),
  department VARCHAR(200),
  title VARCHAR(200),
  photo_url VARCHAR(500),

  -- Flags
  is_primary BOOLEAN DEFAULT FALSE,
  is_important BOOLEAN DEFAULT FALSE,
  is_billing_contact BOOLEAN DEFAULT FALSE,
  is_technical_contact BOOLEAN DEFAULT FALSE,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,

  -- Foreign keys
  location_id INT DEFAULT NULL,
  manager_id INT DEFAULT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (manager_id) REFERENCES organization_users(id)
);
```

**Why this is better than ITFlow:**
- No duplicate data (ITFlow has `contacts` and `users` separate)
- Google Workspace users automatically become Helios users
- Simpler permissions model
- Single source of truth
- Easier to maintain

---

## Phase 1: Core Documentation Tables

### 1. Assets

```sql
assets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  asset_type VARCHAR(100) NOT NULL,  -- 'computer', 'phone', 'tablet', 'server', 'network_device', 'printer', 'other'
  description TEXT,

  -- Hardware details
  make VARCHAR(200),
  model VARCHAR(200),
  serial_number VARCHAR(200),
  os VARCHAR(200),
  os_version VARCHAR(100),

  -- URLs
  admin_url VARCHAR(500),
  client_url VARCHAR(500),
  uri_2 VARCHAR(500),

  -- Purchase/warranty
  purchase_date DATE,
  purchase_reference VARCHAR(200),
  warranty_expire_date DATE,
  install_date DATE,

  -- Location
  physical_location VARCHAR(200),
  location_id INT,

  -- Google Workspace sync (for Chrome OS devices)
  google_device_id VARCHAR(200),
  synced_from_google BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMP,

  -- Status
  status VARCHAR(100),  -- 'active', 'retired', 'repair', 'storage'

  -- Flags
  is_important BOOLEAN DEFAULT FALSE,

  -- Photo
  photo_url VARCHAR(500),

  -- Notes
  notes TEXT,

  -- Ownership
  assigned_to_user_id INT,
  vendor_id INT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (assigned_to_user_id) REFERENCES organization_users(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_assigned_user (assigned_to_user_id),
  INDEX idx_google_device (google_device_id),
  INDEX idx_warranty_expire (warranty_expire_date)
);
```

### 2. Credentials (Passwords)

```sql
credentials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(100),  -- 'email', 'website', 'application', 'vpn', 'wifi', 'server', 'other'

  -- URLs
  uri VARCHAR(500),
  uri_2 VARCHAR(500),

  -- Credential data (ENCRYPTED)
  username VARCHAR(500),
  password_encrypted BYTEA,  -- PostgreSQL encrypted binary
  otp_secret VARCHAR(200),

  -- Notes
  notes TEXT,

  -- Flags
  is_important BOOLEAN DEFAULT FALSE,

  -- Ownership/Association
  primary_user_id INT,
  primary_asset_id INT,
  folder_id INT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,
  password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (primary_user_id) REFERENCES organization_users(id),
  FOREIGN KEY (primary_asset_id) REFERENCES assets(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_primary_user (primary_user_id),
  INDEX idx_category (category)
);
```

### 3. Domains

```sql
domains (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Expiration (CRITICAL)
  expire_date DATE,

  -- DNS info
  ip_address VARCHAR(100),
  nameservers TEXT,
  mail_servers TEXT,
  txt_records TEXT,
  raw_whois TEXT,

  -- Vendors (different vendors for different services)
  registrar_vendor_id INT,
  webhost_vendor_id INT,
  dnshost_vendor_id INT,
  mailhost_vendor_id INT,

  -- Google Workspace
  is_google_workspace_domain BOOLEAN DEFAULT FALSE,
  google_domain_verified BOOLEAN DEFAULT FALSE,

  -- Notes
  notes TEXT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (registrar_vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (webhost_vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (dnshost_vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (mailhost_vendor_id) REFERENCES vendors(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_expire_date (expire_date),
  INDEX idx_google_workspace (is_google_workspace_domain)
);
```

### 4. Certificates (SSL)

```sql
certificates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  description TEXT,
  domain VARCHAR(200),

  -- Certificate details
  issued_by VARCHAR(200) NOT NULL,
  expire_date DATE,
  public_key TEXT,

  -- Linked domain
  domain_id INT,

  -- Notes
  notes TEXT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (domain_id) REFERENCES domains(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_expire_date (expire_date),
  INDEX idx_domain (domain_id)
);
```

### 5. Software Licenses

```sql
software_licenses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  description TEXT,
  version VARCHAR(100),

  -- License details
  license_type VARCHAR(100),  -- 'subscription', 'perpetual', 'trial', 'volume'
  license_key VARCHAR(500),
  seats INT,

  -- Purchase info
  purchase_date DATE,
  purchase_reference VARCHAR(200),
  expire_date DATE,

  -- Google Workspace sync (for Google licenses)
  google_license_sku VARCHAR(200),
  synced_from_google BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMP,

  -- Vendor
  vendor_id INT,

  -- Notes
  notes TEXT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_expire_date (expire_date),
  INDEX idx_google_license (google_license_sku)
);
```

### 6. Locations

```sql
locations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Address
  address VARCHAR(200),
  city VARCHAR(100),
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100),

  -- Contact
  phone VARCHAR(50),

  -- Photo
  photo_url VARCHAR(500),

  -- Notes
  notes TEXT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),

  INDEX idx_org_active (organization_id, archived_at)
);
```

### 7. Vendors

```sql
vendors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Contact
  contact_name VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  website VARCHAR(500),

  -- Address
  address VARCHAR(200),
  city VARCHAR(100),
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100),

  -- Account info
  account_number VARCHAR(200),

  -- Notes
  notes TEXT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),

  INDEX idx_org_active (organization_id, archived_at)
);
```

### 8. Documents

```sql
documents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Content
  content TEXT,  -- Rich text (HTML)

  -- Organization
  folder_id INT,
  template_id INT,

  -- Notes
  notes TEXT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,

  -- Creator
  created_by_user_id INT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id),
  FOREIGN KEY (template_id) REFERENCES document_templates(id),
  FOREIGN KEY (created_by_user_id) REFERENCES organization_users(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_folder (folder_id)
);
```

### 9. Files

```sql
files (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  reference_name VARCHAR(500) NOT NULL,  -- Actual filename on disk/S3
  description TEXT,

  -- File details
  file_type VARCHAR(100),
  file_size BIGINT,
  mime_type VARCHAR(100),

  -- Storage
  storage_path VARCHAR(1000),  -- S3 key or disk path

  -- Organization
  folder_id INT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,

  -- Creator
  uploaded_by_user_id INT NOT NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id),
  FOREIGN KEY (uploaded_by_user_id) REFERENCES organization_users(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_folder (folder_id)
);
```

### 10. Folders

```sql
folders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Hierarchy
  parent_folder_id INT,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (parent_folder_id) REFERENCES folders(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_parent (parent_folder_id)
);
```

---

## Junction Tables (The Linking System)

These enable the "everything links to everything" pattern.

### User Relationships

```sql
user_assets (
  user_id INT NOT NULL,
  asset_id INT NOT NULL,
  PRIMARY KEY (user_id, asset_id),
  FOREIGN KEY (user_id) REFERENCES organization_users(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

user_credentials (
  user_id INT NOT NULL,
  credential_id INT NOT NULL,
  PRIMARY KEY (user_id, credential_id),
  FOREIGN KEY (user_id) REFERENCES organization_users(id) ON DELETE CASCADE,
  FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE
);

user_documents (
  user_id INT NOT NULL,
  document_id INT NOT NULL,
  PRIMARY KEY (user_id, document_id),
  FOREIGN KEY (user_id) REFERENCES organization_users(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

user_files (
  user_id INT NOT NULL,
  file_id INT NOT NULL,
  PRIMARY KEY (user_id, file_id),
  FOREIGN KEY (user_id) REFERENCES organization_users(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

user_software_licenses (
  user_id INT NOT NULL,
  software_license_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, software_license_id),
  FOREIGN KEY (user_id) REFERENCES organization_users(id) ON DELETE CASCADE,
  FOREIGN KEY (software_license_id) REFERENCES software_licenses(id) ON DELETE CASCADE
);
```

### Asset Relationships

```sql
asset_credentials (
  asset_id INT NOT NULL,
  credential_id INT NOT NULL,
  PRIMARY KEY (asset_id, credential_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE
);

asset_documents (
  asset_id INT NOT NULL,
  document_id INT NOT NULL,
  PRIMARY KEY (asset_id, document_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

asset_files (
  asset_id INT NOT NULL,
  file_id INT NOT NULL,
  PRIMARY KEY (asset_id, file_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

asset_software_licenses (
  asset_id INT NOT NULL,
  software_license_id INT NOT NULL,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_id, software_license_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (software_license_id) REFERENCES software_licenses(id) ON DELETE CASCADE
);
```

### Domain/Certificate Relationships

```sql
domain_certificates (
  domain_id INT NOT NULL,
  certificate_id INT NOT NULL,
  PRIMARY KEY (domain_id, certificate_id),
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
  FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE CASCADE
);
```

### Vendor Relationships

```sql
vendor_credentials (
  vendor_id INT NOT NULL,
  credential_id INT NOT NULL,
  PRIMARY KEY (vendor_id, credential_id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE
);

vendor_documents (
  vendor_id INT NOT NULL,
  document_id INT NOT NULL,
  PRIMARY KEY (vendor_id, document_id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

vendor_files (
  vendor_id INT NOT NULL,
  file_id INT NOT NULL,
  PRIMARY KEY (vendor_id, file_id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

---

## Phase 2: Ticketing Tables

### Tickets

```sql
tickets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Numbering
  prefix VARCHAR(20) DEFAULT 'TKT',
  number INT NOT NULL,

  -- Basic info
  subject VARCHAR(500) NOT NULL,
  details TEXT NOT NULL,

  -- Classification
  category VARCHAR(100),
  priority VARCHAR(50),  -- 'low', 'medium', 'high', 'urgent'
  source VARCHAR(100),  -- 'email', 'portal', 'internal', 'phone'

  -- Status
  status_id INT NOT NULL,

  -- Assignment
  created_by_user_id INT NOT NULL,
  assigned_to_user_id INT,

  -- Related entities
  related_user_id INT,  -- User who submitted (if different from creator)
  related_asset_id INT,
  location_id INT,

  -- Billing
  billable BOOLEAN DEFAULT FALSE,
  time_spent_minutes INT DEFAULT 0,

  -- Scheduling
  scheduled_at TIMESTAMP,
  is_onsite BOOLEAN DEFAULT FALSE,

  -- SLA tracking
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,
  closed_by_user_id INT,

  -- External
  vendor_ticket_number VARCHAR(200),
  vendor_id INT,

  -- Feedback
  feedback_rating INT,  -- 1-5 stars
  feedback_comment TEXT,

  -- URL key for sharing
  url_key VARCHAR(200) UNIQUE,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (status_id) REFERENCES ticket_statuses(id),
  FOREIGN KEY (created_by_user_id) REFERENCES organization_users(id),
  FOREIGN KEY (assigned_to_user_id) REFERENCES organization_users(id),
  FOREIGN KEY (related_user_id) REFERENCES organization_users(id),
  FOREIGN KEY (related_asset_id) REFERENCES assets(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (closed_by_user_id) REFERENCES organization_users(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_status (status_id),
  INDEX idx_assigned (assigned_to_user_id),
  INDEX idx_created_by (created_by_user_id),
  INDEX idx_related_user (related_user_id),
  INDEX idx_related_asset (related_asset_id),
  INDEX idx_number (organization_id, number),

  UNIQUE (organization_id, number)
);
```

### Ticket Replies

```sql
ticket_replies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  ticket_id INT NOT NULL,

  -- Reply content
  reply TEXT NOT NULL,

  -- Type
  type VARCHAR(50) NOT NULL,  -- 'internal', 'public'

  -- Creator
  created_by_user_id INT NOT NULL,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,

  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES organization_users(id),

  INDEX idx_ticket (ticket_id),
  INDEX idx_created_at (created_at)
);
```

### Ticket Statuses

```sql
ticket_statuses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20),  -- Hex color code

  -- Order
  display_order INT DEFAULT 999,

  -- Flags
  is_default BOOLEAN DEFAULT FALSE,
  is_closed_status BOOLEAN DEFAULT FALSE,
  is_resolved_status BOOLEAN DEFAULT FALSE,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),

  INDEX idx_org_active (organization_id, archived_at),
  INDEX idx_order (display_order)
);
```

### Ticket Assets (Linking)

```sql
ticket_assets (
  ticket_id INT NOT NULL,
  asset_id INT NOT NULL,
  PRIMARY KEY (ticket_id, asset_id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
```

### Ticket Watchers

```sql
ticket_watchers (
  ticket_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (ticket_id, user_id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES organization_users(id) ON DELETE CASCADE
);
```

### Ticket Attachments

```sql
ticket_attachments (
  ticket_id INT NOT NULL,
  file_id INT NOT NULL,
  PRIMARY KEY (ticket_id, file_id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

---

## Supporting Tables

### Tags

```sql
tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Basic info
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50),  -- 'user', 'asset', 'ticket', 'general'
  color VARCHAR(20),

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),

  INDEX idx_org_type (organization_id, type),
  UNIQUE (organization_id, name, type)
);

-- Tag assignments
user_tags (
  user_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (user_id, tag_id),
  FOREIGN KEY (user_id) REFERENCES organization_users(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

asset_tags (
  asset_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (asset_id, tag_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

ticket_tags (
  ticket_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (ticket_id, tag_id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

### Custom Fields

```sql
custom_fields (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- Field definition
  table_name VARCHAR(100) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(200) NOT NULL,
  field_type VARCHAR(50) NOT NULL,  -- 'text', 'number', 'date', 'dropdown', 'checkbox'
  field_options JSONB,  -- For dropdown options, etc.

  -- Display
  display_order INT DEFAULT 999,

  -- Temporal
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),

  INDEX idx_org_table (organization_id, table_name),
  UNIQUE (organization_id, table_name, field_name)
);

custom_values (
  id INT PRIMARY KEY AUTO_INCREMENT,
  field_id INT NOT NULL,
  entity_id INT NOT NULL,
  value TEXT,

  FOREIGN KEY (field_id) REFERENCES custom_fields(id) ON DELETE CASCADE,

  INDEX idx_field_entity (field_id, entity_id),
  UNIQUE (field_id, entity_id)
);
```

### Audit Logs

```sql
audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- What happened
  action VARCHAR(100) NOT NULL,  -- 'create', 'update', 'delete', 'login', 'access'
  entity_type VARCHAR(100),
  entity_id INT,

  -- Details
  description TEXT,
  old_value JSONB,
  new_value JSONB,

  -- Who
  user_id INT,

  -- Where
  ip_address VARCHAR(100),
  user_agent TEXT,

  -- When
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (user_id) REFERENCES organization_users(id),

  INDEX idx_org_created (organization_id, created_at DESC),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_user (user_id, created_at DESC)
);
```

### Notifications

```sql
notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  organization_id INT NOT NULL,

  -- What
  type VARCHAR(100) NOT NULL,  -- 'ticket_assigned', 'domain_expiring', 'cert_expiring', etc.
  message TEXT NOT NULL,
  action_url VARCHAR(500),

  -- Who
  user_id INT NOT NULL,

  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  dismissed_at TIMESTAMP,

  -- Related entity
  entity_type VARCHAR(100),
  entity_id INT,

  -- When
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (user_id) REFERENCES organization_users(id),

  INDEX idx_user_unread (user_id, is_read, created_at DESC),
  INDEX idx_org_created (organization_id, created_at DESC)
);
```

---

## Migration from Existing Helios Schema

### Current Tables (Already Exist)

```
✅ organizations
✅ organization_users
✅ organization_settings
✅ modules
✅ gw_credentials
✅ gw_synced_users
✅ gw_synced_groups
```

### Tables to Add

**Phase 1 (Core Documentation):**
```
❌ assets
❌ credentials
❌ domains
❌ certificates
❌ software_licenses
❌ locations
❌ vendors
❌ documents
❌ files
❌ folders
❌ All junction tables
```

**Phase 2 (Ticketing):**
```
❌ tickets
❌ ticket_replies
❌ ticket_statuses
❌ ticket_assets
❌ ticket_watchers
❌ ticket_attachments
```

**Phase 3 (Supporting):**
```
❌ tags
❌ entity_tags tables
❌ custom_fields
❌ custom_values
❌ audit_logs (enhance existing)
❌ notifications
```

### Migration Strategy

1. **Keep existing tables** - don't break current functionality
2. **Add new tables** - via migrations
3. **Sync Google data** to new tables (assets, software_licenses)
4. **Gradually deprecate** old tables (gw_synced_users → organization_users with google_workspace_id)

---

## Example Queries

### Find all assets for a user

```sql
SELECT a.*
FROM assets a
INNER JOIN user_assets ua ON a.id = ua.asset_id
WHERE ua.user_id = 123
  AND a.archived_at IS NULL;
```

### Find all credentials for an asset

```sql
SELECT c.*
FROM credentials c
INNER JOIN asset_credentials ac ON c.id = ac.credential_id
WHERE ac.asset_id = 456
  AND c.archived_at IS NULL;
```

### Find domains expiring in 8-45 days

```sql
SELECT *
FROM domains
WHERE organization_id = 1
  AND expire_date > CURRENT_DATE
  AND expire_date < CURRENT_DATE + INTERVAL '45 days'
  AND archived_at IS NULL
ORDER BY expire_date ASC;
```

### Find all assets with expiring warranties

```sql
SELECT *
FROM assets
WHERE organization_id = 1
  AND warranty_expire_date > CURRENT_DATE
  AND warranty_expire_date < CURRENT_DATE + INTERVAL '45 days'
  AND archived_at IS NULL
ORDER BY warranty_expire_date ASC;
```

### Get user's complete profile

```sql
SELECT
  u.*,
  (SELECT COUNT(*) FROM user_assets WHERE user_id = u.id) as asset_count,
  (SELECT COUNT(*) FROM user_credentials WHERE user_id = u.id) as credential_count,
  (SELECT COUNT(*) FROM tickets WHERE related_user_id = u.id AND archived_at IS NULL) as ticket_count,
  (SELECT COUNT(*) FROM user_software_licenses WHERE user_id = u.id) as license_count
FROM organization_users u
WHERE u.id = 789;
```

---

## Next Steps

1. **Review schema** with backend team
2. **Create migrations** for new tables
3. **Update TypeScript types** for new entities
4. **Build API endpoints** for CRUD operations
5. **Build UI components** for each entity
6. **Implement linking system** (junction tables)
7. **Add expiration tracking** queries
8. **Build Google Workspace sync** for assets/licenses

This schema provides the foundation for **ITFlow-level documentation** while maintaining **Helios's Google Workspace advantage**.
