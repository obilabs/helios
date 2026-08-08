# OpenSpec Proposal: Admin/User UI Separation

**ID:** admin-user-separation
**Status:** Draft
**Priority:** High (P0)
**Author:** Claude (Autonomous Agent)
**Created:** 2025-12-08

## Summary

Separate the Admin UI (user management, system configuration) from the User UI (people directory, my team, my profile) to support different user personas and follow UX best practices.

## Problem Statement

Currently, admin-facing features (Users, Groups, Settings) are mixed with user-facing features (People, My Team, My Profile) in the same navigation. This creates problems:

1. **External admins** (MSPs, IT consultants) see "People" and "My Team" features they can't use
2. **Navigation confusion** - unclear what's for managing vs. browsing
3. **Permission complexity** - hard to control who sees what
4. **UX inconsistency** - admin tools mixed with employee self-service

## User Personas

| Persona | Description | Admin Access | User Access |
|---------|-------------|--------------|-------------|
| **External Admin** | MSP tech, IT consultant managing client's Helios | Full admin | None (not an employee) |
| **Internal Admin** | Employee with admin rights (HR, IT staff) | Full admin | Full user (also employee) |
| **Regular User** | Employee without admin rights | None | Full user |

## Proposed Solution

### 1. Route Separation

```
ADMIN ROUTES (/admin/...)           USER ROUTES (/...)
─────────────────────────           ──────────────────
/admin/dashboard                    /dashboard (or /home)
/admin/users                        /people
/admin/groups                       /my-team
/admin/devices                      /my-groups
/admin/settings                     /my-profile
/admin/settings/modules             /settings (personal prefs)
/admin/settings/master-data
/admin/settings/security
/admin/audit-logs
```

### 2. Role-Based Access Control

```typescript
// User context determines available UIs
interface UserSession {
  userId: string;
  email: string;

  // Admin capabilities
  isAdmin: boolean;
  adminRole?: 'super_admin' | 'admin' | 'helpdesk';

  // Employee capabilities
  isEmployee: boolean;           // Has employee profile
  employeeProfileId?: string;    // Link to organization_users

  // Derived access
  canAccessAdminUI: boolean;     // isAdmin === true
  canAccessUserUI: boolean;      // isEmployee === true
}
```

### 3. Navigation Structure

#### Admin Navigation (when in Admin Console)
```
┌─ Admin Console ─────────────────────────────────────┐
│                                                      │
│  [Dashboard]                                         │
│                                                      │
│  Directory                                           │
│    ├─ Users                                          │
│    ├─ Groups                                         │
│    └─ Devices                                        │
│                                                      │
│  Security                                            │
│    ├─ Audit Logs                                     │
│    └─ Policies                                       │
│                                                      │
│  Settings                                            │
│    ├─ Modules                                        │
│    ├─ Master Data                                    │
│    ├─ Organization                                   │
│    └─ Integrations                                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

#### User Navigation (when in Employee View)
```
┌─ Helios ─────────────────────────────────────────────┐
│                                                       │
│  [Home]                                               │
│                                                       │
│  [People]          Browse coworker directory          │
│                                                       │
│  [My Team]         Manager, peers, direct reports     │
│                                                       │
│  [My Groups]       Groups I belong to                 │
│                                                       │
│  [My Profile]      Edit my profile                    │
│                                                       │
│  [Settings]        Personal preferences               │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 4. View Switcher (Internal Admins Only)

Internal admins who are also employees can switch between views:

```
┌─────────────────────────────────────────────────────────────┐
│ [Helios]                              [View: Admin ▼] [👤]  │
│                                        ├─ Admin Console     │
│                                        └─ Employee View     │
└─────────────────────────────────────────────────────────────┘
```

- **External admins**: No switcher, always Admin Console
- **Internal admins**: Switcher visible, can toggle
- **Regular users**: No switcher, always Employee View

### 5. Default View Logic

```typescript
function getDefaultView(user: UserSession): 'admin' | 'user' {
  // External admin - always admin
  if (user.isAdmin && !user.isEmployee) {
    return 'admin';
  }

  // Internal admin - default to admin, can switch
  if (user.isAdmin && user.isEmployee) {
    return 'admin'; // Or remember last choice
  }

  // Regular employee - always user
  return 'user';
}
```

## Database Changes

### Add admin_type to distinguish admin personas

```sql
-- Add to organization_users or separate admin_users table
ALTER TABLE organization_users
  ADD COLUMN is_external_admin BOOLEAN DEFAULT false,
  ADD COLUMN admin_source VARCHAR(50); -- 'employee', 'msp', 'consultant'
```

### Or: Separate admin_accounts table

```sql
CREATE TABLE admin_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  admin_role VARCHAR(50) DEFAULT 'admin',
  admin_source VARCHAR(50) DEFAULT 'internal', -- 'internal', 'msp', 'consultant'
  linked_employee_id UUID REFERENCES organization_users(id), -- NULL for external
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  UNIQUE(organization_id, email)
);
```

## UI Changes Required

### 1. Move User Features to User Routes

| Current Location | New Location | Access |
|------------------|--------------|--------|
| `/people` (in admin nav) | `/people` (user nav only) | Employees only |
| `/my-team` (in admin nav) | `/my-team` (user nav only) | Employees only |
| `/my-profile` (in admin nav) | `/my-profile` (user nav only) | Employees only |

### 2. Create Admin-Only Routes

| Route | Purpose | Access |
|-------|---------|--------|
| `/admin/dashboard` | Admin stats, system health | Admins only |
| `/admin/users` | Manage all users | Admins only |
| `/admin/groups` | Manage all groups | Admins only |
| `/admin/settings/*` | System configuration | Admins only |

### 3. Update Navigation Component

```typescript
// Sidebar.tsx
function Sidebar({ currentView }: { currentView: 'admin' | 'user' }) {
  const { user } = useAuth();

  if (currentView === 'admin') {
    return <AdminNavigation />;
  }

  return <UserNavigation />;
}
```

### 4. Add View Switcher

```typescript
// ViewSwitcher.tsx
function ViewSwitcher() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useViewContext();

  // Only show for internal admins
  if (!user.isAdmin || !user.isEmployee) {
    return null;
  }

  return (
    <Dropdown
      value={currentView}
      options={[
        { value: 'admin', label: 'Admin Console' },
        { value: 'user', label: 'Employee View' }
      ]}
      onChange={setCurrentView}
    />
  );
}
```

### 5. Route Guards

```typescript
// AdminRoute.tsx - Only admins can access
function AdminRoute({ children }) {
  const { user } = useAuth();

  if (!user.isAdmin) {
    return <Navigate to="/" />;
  }

  return children;
}

// EmployeeRoute.tsx - Only employees can access
function EmployeeRoute({ children }) {
  const { user } = useAuth();

  if (!user.isEmployee) {
    return <Navigate to="/admin" />;
  }

  return children;
}
```

## Migration Plan

### Phase 1: Route Restructuring
1. Create `/admin/*` route prefix for admin pages
2. Move existing admin pages under `/admin/`
3. Keep user pages at root (`/people`, `/my-team`, etc.)
4. Add redirects for old URLs

### Phase 2: Navigation Separation
1. Create `AdminNavigation` component
2. Create `UserNavigation` component
3. Add view context to track current view
4. Implement route guards

### Phase 3: View Switcher
1. Add `is_external_admin` flag to users
2. Create `ViewSwitcher` component
3. Persist view preference
4. Update header to show switcher

### Phase 4: Access Control
1. Backend middleware for admin routes
2. Backend middleware for employee routes
3. API-level permission checks
4. Audit logging for view switches

## Success Criteria

1. External admins only see Admin Console, no People/My Team
2. Internal admins can switch between Admin and Employee views
3. Regular employees only see Employee view
4. All routes properly protected
5. No broken links or navigation issues
6. View preference persisted across sessions

## Files to Modify

### Frontend
- `frontend/src/App.tsx` - Route restructuring
- `frontend/src/components/Sidebar.tsx` - Navigation separation
- `frontend/src/components/Header.tsx` - View switcher
- `frontend/src/contexts/ViewContext.tsx` - New context
- `frontend/src/components/routes/AdminRoute.tsx` - New guard
- `frontend/src/components/routes/EmployeeRoute.tsx` - New guard

### Backend
- `backend/src/middleware/auth.ts` - Add isEmployee check
- `backend/src/routes/*.ts` - Add route-level guards
- `database/migrations/034_admin_user_separation.sql` - Schema changes

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing URLs | High | Add redirects, update all links |
| Permission gaps | High | Comprehensive testing, audit logs |
| Confusion during rollout | Medium | Clear documentation, UI hints |
