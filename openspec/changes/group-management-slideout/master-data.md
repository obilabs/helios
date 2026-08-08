# Master Data Management

## Overview

Before dynamic groups can be reliable, we need clean, managed data. This document outlines the Master Data system that provides dropdown values and detects data quality issues.

## Master Data Entities

### 1. Departments

```typescript
interface Department {
  id: string;
  name: string;
  code?: string;              // Short code like "ENG", "MKT"
  parentId?: string;          // For hierarchical departments
  managerId?: string;         // Department head
  costCenterId?: string;      // Link to cost center
  googleOrgUnitPath?: string; // Map to Google Workspace OU
  userCount: number;          // Computed
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Hierarchy Example:**
```
Technology
├── Engineering
│   ├── Frontend
│   ├── Backend
│   └── DevOps
├── Product
└── Design
```

### 2. Locations

```typescript
interface Location {
  id: string;
  name: string;
  type: 'headquarters' | 'office' | 'remote' | 'region';
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  parentId?: string;          // For regions > offices
  userCount: number;
  isActive: boolean;
}
```

**Hierarchy Example:**
```
North America (region)
├── San Francisco HQ (headquarters)
├── New York Office (office)
└── Remote - US (remote)
EMEA (region)
├── London Office (office)
└── Remote - EMEA (remote)
```

### 3. Cost Centers

```typescript
interface CostCenter {
  id: string;
  code: string;               // "CC-1001"
  name: string;
  departmentId?: string;      // Optional link to department
  budget?: number;
  userCount: number;
  isActive: boolean;
}
```

### 4. Job Title Catalog (Optional)

Some organizations want standardized titles, others prefer free text.

```typescript
interface JobTitleCatalog {
  id: string;
  title: string;
  level?: number;             // 1=IC, 2=Senior, 3=Lead, 4=Manager, etc.
  family?: string;            // "Engineering", "Design", "Sales"
  userCount: number;
  isActive: boolean;
}

// Organization setting
interface MasterDataSettings {
  enforceJobTitles: boolean;  // If true, must use catalog
  enforceDepartments: boolean;
  enforceLocations: boolean;
  enforceCostCenters: boolean;
}
```

## Data Quality Dashboard

### Orphan Detection

Orphans are values used by users that don't exist in master data:

```typescript
interface DataQualityReport {
  departments: {
    managed: number;          // In master data
    orphaned: OrphanedValue[];
    unmapped: number;         // Users with no department
  };
  locations: {
    managed: number;
    orphaned: OrphanedValue[];
    unmapped: number;
  };
  managers: {
    valid: number;            // Reports to existing user
    orphaned: number;         // Reports to non-existent user
    circular: number;         // A reports to B reports to A
  };
}

interface OrphanedValue {
  value: string;              // The orphaned value
  userCount: number;          // How many users have this
  suggestedMatch?: string;    // Fuzzy match suggestion
  users: string[];            // Sample user emails
}
```

### Visual Data Quality View

```
+------------------------------------------+
| Data Quality Overview                    |
+------------------------------------------+
| Departments                              |
| ████████████░░ 85% clean                |
|                                          |
| ! 3 orphaned values found:               |
|   "Engneering" (2 users) → Engineering? |
|   "Mktg" (1 user) → Marketing?          |
|   "R&D" (5 users) → [Create New]        |
|                                          |
| 12 users have no department assigned     |
| [View Users] [Bulk Assign]               |
+------------------------------------------+
| Locations                                |
| ████████████████ 100% clean             |
+------------------------------------------+
| Managers                                 |
| ██████████████░░ 92% clean              |
|                                          |
| ! 3 users report to deleted user         |
| ! 1 circular reporting chain detected    |
| [View Issues]                            |
+------------------------------------------+
```

## UI Components

### Department Manager

```
+------------------------------------------+
| Departments                    [+ Add]   |
+------------------------------------------+
| Search departments...                    |
+------------------------------------------+
| ▼ Technology (156 users)                 |
|   ├── ▼ Engineering (89 users)           |
|   │   ├── Frontend (23 users)            |
|   │   ├── Backend (45 users)             |
|   │   └── DevOps (21 users)              |
|   ├── Product (34 users)                 |
|   └── Design (33 users)                  |
| ▼ Business (89 users)                    |
|   ├── Sales (45 users)                   |
|   ├── Marketing (28 users)               |
|   └── Finance (16 users)                 |
+------------------------------------------+
| ⚠ Orphaned Values (3)            [Fix]  |
| "Engneering" - 2 users                   |
| "Mktg" - 1 user                          |
| "R&D" - 5 users                          |
+------------------------------------------+
```

### Orphan Resolution Modal

```
+------------------------------------------+
| Fix Orphaned Department: "Engneering"    |
+------------------------------------------+
| This value is used by 2 users:           |
| • john@company.com                       |
| • jane@company.com                       |
+------------------------------------------+
| Action:                                  |
| (x) Map to existing: [Engineering    ▼]  |
| ( ) Create new department                |
| ( ) Leave as-is (ignore)                 |
+------------------------------------------+
| [Cancel]                    [Apply Fix]  |
+------------------------------------------+
```

## Integration with Dynamic Groups

### Dropdown-Based Rule Builder

When departments are managed, the rule builder uses dropdowns:

**Before (free text - error prone):**
```
[Department ▼] [contains ▼] [Engineerin___]
```

**After (managed dropdown):**
```
[Department ▼] [is ▼] [▼ Select Department    ]
                      ├── Technology
                      │   ├── Engineering
                      │   │   ├── Frontend
                      │   │   ├── Backend
                      │   │   └── DevOps
                      │   ├── Product
                      │   └── Design
                      └── Business
                          ├── Sales
                          └── Marketing
```

### Operator Changes for Managed Fields

| Field | Managed | Operators Available |
|-------|---------|---------------------|
| Department | Yes | is, is not, is under (hierarchical), is not under |
| Location | Yes | is, is not, is under, is not under |
| Cost Center | Yes | is, is not |
| Reports To | Yes (users) | is, is under (include nested) |
| Job Title | Optional | If managed: is, is not. If free: contains, etc. |
| Org Unit | Synced | is, is under |

### "Is Under" Operator

For hierarchical data, "is under" includes all children:

```
Rule: Department is under "Technology"
Matches:
  ✓ Technology
  ✓ Engineering (child of Technology)
  ✓ Frontend (grandchild of Technology)
  ✓ Product (child of Technology)
```

## Org Chart Integration

The Org Chart view becomes a visualization of master data:

```
+------------------------------------------+
| Org Chart                    [View: ▼]   |
|                         Department / Team |
+------------------------------------------+
|                                          |
|              [CEO]                       |
|                │                         |
|    ┌───────────┼───────────┐             |
|    │           │           │             |
| [CTO]       [CFO]       [CMO]            |
|    │                       │             |
| ┌──┴──┐                 [Marketing]      |
| │     │                    │             |
|[Eng] [Product]          ┌──┴──┐          |
|                        [Mktg] [Brand]    |
|                                          |
+------------------------------------------+
| ⚠ Data Issues:                           |
| • 3 users have no manager               |
| • 2 orphaned departments                 |
| [Show Issues]                            |
+------------------------------------------+
```

### Org Chart Modes

1. **By Reporting Structure** - Traditional org chart by manager
2. **By Department** - Group by department hierarchy
3. **Data Quality Mode** - Highlight orphans, missing managers, issues

## Database Schema

### New Tables

```sql
-- Departments (hierarchical)
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20),
  parent_id UUID REFERENCES departments(id),
  manager_id UUID REFERENCES organization_users(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  google_org_unit_path VARCHAR(255),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name, parent_id)
);

-- Materialized path for efficient hierarchy queries
CREATE INDEX idx_departments_path ON departments USING gist (
  (SELECT string_agg(d.id::text, '/')
   FROM departments d
   WHERE d.id = departments.id OR d.id IN (
     WITH RECURSIVE parents AS (
       SELECT id, parent_id FROM departments WHERE id = departments.id
       UNION ALL
       SELECT d.id, d.parent_id FROM departments d
       JOIN parents p ON d.id = p.parent_id
     ) SELECT id FROM parents
   ))
);

-- Locations
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) DEFAULT 'office',
  parent_id UUID REFERENCES locations(id),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  timezone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost Centers
CREATE TABLE cost_centers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

-- Job Title Catalog (optional)
CREATE TABLE job_title_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  title VARCHAR(100) NOT NULL,
  level INTEGER,
  family VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, title)
);

-- Master Data Settings
CREATE TABLE master_data_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id),
  enforce_departments BOOLEAN DEFAULT false,
  enforce_locations BOOLEAN DEFAULT false,
  enforce_cost_centers BOOLEAN DEFAULT false,
  enforce_job_titles BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Update organization_users

```sql
-- Add foreign keys to master data (optional, can keep free text for migration)
ALTER TABLE organization_users
  ADD COLUMN department_id UUID REFERENCES departments(id),
  ADD COLUMN location_id UUID REFERENCES locations(id),
  ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id),
  ADD COLUMN job_title_id UUID REFERENCES job_title_catalog(id);

-- Keep existing text fields for backward compatibility during migration
-- department, location, cost_center, job_title (text) still exist
```

## Migration Strategy

1. **Phase 1: Create tables, don't enforce**
   - Create master data tables
   - Users can still use free text
   - Run orphan detection in background

2. **Phase 2: Import existing values**
   - Auto-create departments/locations from existing user data
   - Present orphan resolution UI
   - Admin reviews and merges duplicates

3. **Phase 3: Link users to master data**
   - Map users to master data IDs
   - Keep text fields as fallback
   - Show data quality dashboard

4. **Phase 4: Optional enforcement**
   - Organization can enable "enforce" flags
   - New users must use dropdowns
   - Existing users prompted to update

## API Endpoints

```
# Departments
GET    /api/organization/departments
POST   /api/organization/departments
GET    /api/organization/departments/:id
PUT    /api/organization/departments/:id
DELETE /api/organization/departments/:id
GET    /api/organization/departments/:id/users

# Locations
GET    /api/organization/locations
POST   /api/organization/locations
...

# Cost Centers
GET    /api/organization/cost-centers
...

# Data Quality
GET    /api/organization/data-quality/report
GET    /api/organization/data-quality/orphans
POST   /api/organization/data-quality/resolve-orphan
```

## Implementation Priority

Given that this is foundational for dynamic groups:

1. **Departments** - Most commonly used for grouping
2. **Locations** - Second most common
3. **Cost Centers** - Finance-focused orgs need this
4. **Job Titles** - Optional, many orgs prefer free text

Recommend: Start with Departments only, expand later.
