# User Type Tab System - Implementation Status

## Overview
Implementing a tab-based user management system that separates Staff, Guests, and Contacts into distinct views with type-specific columns and filters.

## ✅ Completed Tasks

### 1. Database Migration (DONE)
- **File**: `database/migrations/014_add_user_type_system.sql`
- **Status**: ✅ Created and executed successfully
- **Changes**:
  - Added `user_type_enum` enum type ('staff', 'guest', 'contact')
  - Added `user_type` column to `organization_users` table
  - Added contact-specific columns: `company`, `contact_tags`, `added_by`, `added_at`
  - Created validation constraints for each user type
  - Created helper views: `active_staff`, `active_guests`, `contacts`
  - Added indexes for performance
  - Migrated existing `is_guest` users to `user_type = 'guest'`

### 2. Users Page Component (DONE)
- **File**: `frontend/src/pages/Users.tsx`
- **Status**: ✅ Completely rewritten
- **Features**:
  - Tab navigation for Staff/Guests/Contacts
  - Dynamic user counts for each tab
  - Tab-specific descriptions
  - Clean, modern UI with purple gradient tabs
  - Passes `userType` prop to UserList component

### 3. Users Page Styles (DONE)
- **File**: `frontend/src/pages/Users.css`
- **Status**: ✅ Created
- **Features**:
  - Professional tab styling with hover effects
  - Active tab highlighting with purple gradient
  - Count badges on tabs
  - Responsive design for mobile/tablet
  - Smooth animations

## 🔄 In Progress

### 4. Backend API Updates (NEEDED)
- **File**: `backend/src/routes/organization.routes.ts`
- **Current State**: API exists but doesn't support `userType` filtering
- **Required Changes**:
  ```typescript
  // Line ~220: Add userType parameter
  const userType = req.query.userType as string; // 'staff', 'guest', or 'contact'

  // Line ~268: Add user type filter
  if (userType) {
    statusCondition += ` AND ou.user_type = '${userType}'`;
  }

  // Add GET /users/count endpoint:
  router.get('/users/count', authenticateToken, async (req, res) => {
    const userType = req.query.userType;
    const count = await db.query(
      `SELECT COUNT(*) FROM organization_users
       WHERE organization_id = $1 AND user_type = $2 AND deleted_at IS NULL`,
      [organizationId, userType]
    );
    res.json({ success: true, data: { count: parseInt(count.rows[0].count) } });
  });
  ```

### 5. UserList Component Updates (NEEDED)
- **File**: `frontend/src/components/UserList.tsx`
- **Current State**: Works but doesn't accept userType prop
- **Required Changes**:
  1. Update `UserListProps` interface:
     ```typescript
     interface UserListProps {
       organizationId: string;
       userType: 'staff' | 'guests' | 'contacts';  // NEW
       onCountChange?: () => void;                  // NEW
     }
     ```

  2. Update User interface to include contact-specific fields:
     ```typescript
     interface User {
       // ... existing fields ...
       userType?: 'staff' | 'guest' | 'contact';
       company?: string;                 // For contacts/guests
       contactTags?: string[];          // For contacts
       guestExpiresAt?: string;         // For guests
     }
     ```

  3. Update `fetchUsers` to pass userType:
     ```typescript
     const queryParams = new URLSearchParams({
       userType: userType === 'guests' ? 'guest' : userType === 'contacts' ? 'contact' : 'staff'
     });
     const response = await fetch(`http://localhost:3001/api/organization/users?${queryParams}`, ...)
     ```

  4. Create type-specific column configurations:
     ```typescript
     const getColumnsForType = (type: string) => {
       if (type === 'staff') {
         return ['checkbox', 'user', 'email', 'department', 'role', 'platforms', 'status', 'lastLogin'];
       } else if (type === 'guests') {
         return ['checkbox', 'user', 'email', 'company', 'accessLevel', 'expires', 'status', 'lastLogin'];
       } else { // contacts
         return ['checkbox', 'user', 'email', 'company', 'phone', 'title', 'addedDate'];
       }
     };
     ```

## 📋 Remaining Tasks

### High Priority

1. **Update backend API** (30 minutes)
   - Add userType filtering to GET /users
   - Create GET /users/count endpoint
   - Test with Postman/curl

2. **Update UserList component** (1-2 hours)
   - Accept userType prop
   - Render different columns per type
   - Update API calls to pass userType
   - Remove old status/guest filters

3. **Add prominent search bar** (1 hour)
   - Search by name or email
   - Clear button (X)
   - Real-time filtering
   - Position above table

4. **Add filter chips** (2 hours)
   - Multi-select Status filter chips (Active, Pending, etc.)
   - Multi-select Role filter chips (Admin, Manager, User)
   - Multi-select Platform filter chips (Google, Microsoft, Local)
   - Show active filters as removable badges
   - "Clear all" button

5. **Advanced filters modal** (2-3 hours)
   - "All filters" button with count badge
   - Modal with searchable field selection
   - Type-specific filter options
   - Apply/Cancel buttons

### Medium Priority

6. **Column management** (2 hours)
   - "Manage columns" button
   - Modal to show/hide columns
   - Drag to reorder
   - Save preferences to localStorage

7. **Fix column widths** (30 minutes)
   - Set fixed widths for each column
   - Prevent shifting when content changes
   - Update CSS grid-template-columns

8. **Slide-out edit mode** (1-2 hours)
   - Add "Edit User" button to slide-out header
   - Toggle between view/edit modes
   - Form validation
   - Save changes API call

### Low Priority

9. **Polish and refinement**
   - Better spacing throughout UI
   - Loading states
   - Empty states per user type
   - Error handling
   - Mobile responsiveness

## 🎯 Implementation Order

**Phase 1: Core Functionality** (Today - 4 hours)
1. ✅ Database migration
2. ✅ Users page with tabs
3. ⏳ Backend API updates
4. ⏳ UserList component updates
5. ⏳ Test end-to-end flow

**Phase 2: Enhanced Filtering** (Tomorrow - 4 hours)
6. Search bar
7. Filter chips
8. Advanced filters modal

**Phase 3: Polish** (Day 3 - 3 hours)
9. Column management
10. Fixed widths
11. Slide-out edit mode
12. Final testing and bug fixes

## 📝 Notes

- Current implementation already has slide-out panel working correctly
- All user actions (edit, delete, restore) should remain in slide-out
- No action buttons in the table - keep it clean
- Each user type should feel like a distinct entity, not just a filter

## 🐛 Known Issues

1. Backend doesn't support userType filtering yet
2. UserList doesn't accept userType prop yet
3. Need to handle contacts (no login, no password)
4. Guest expiry dates need special handling

## 🔗 Related Files

- Database: `database/migrations/014_add_user_type_system.sql`
- Frontend Pages: `frontend/src/pages/Users.tsx`, `Users.css`
- Frontend Components: `frontend/src/components/UserList.tsx`, `UserList.css`
- Backend: `backend/src/routes/organization.routes.ts`
- Slide-out: `frontend/src/components/UserSlideOut.tsx`, `UserSlideOut.css`
