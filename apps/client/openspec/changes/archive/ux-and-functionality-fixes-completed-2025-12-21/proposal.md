# UX & Functionality Fixes - Critical Issues

## Problem Statement

Multiple UX issues and broken functionality discovered across the Users page, User Slideout, and Scheduled Actions page. These issues significantly impact usability and data integrity.

## Issues Identified

### A. Users Page Issues

#### A1. Deleted Count Mismatch
- **Bug**: Header shows "Deleted (7)" but table displays 11 deleted users
- **Impact**: Confusing/misleading statistics
- **Root Cause**: Count query vs actual filtered results mismatch

#### A2. Header Layout Issues
- Stats cards look squished/cramped
- "INTEGRATIONS" and "STATUS" columns visually blending together
- Search box is chunky and not aligned with filter buttons
- Overall header not tidy

#### A3. Filter Buttons Non-Functional
- 3 horizontal lines icon (hamburger) - does nothing on click
- 2 vertical lines icon (columns) - does nothing on click
- **Expected**: Sophisticated filter panel for:
  - Recently created
  - Date created range
  - Last login date
  - Department
  - Role
  - Integration status

### B. User Slideout Issues

#### B1. Poor Layout - Single Column Stack
- All fields stacked vertically in single column
- Wastes horizontal space on 600px panel
- Should use 2-column grid for related fields

#### B2. Add to Group Not Working
- Added "David Kim" to "All Users" group - no effect
- No success/error toast shown
- Group membership not persisted

#### B3. Create in Google Workspace Not Working
- Clicked "Create in Google Workspace" - nothing happens
- User not created in Helios either
- No error feedback shown

#### B4. Activity Log Empty
- Shows nothing even after actions attempted
- Should log: group additions, GW sync attempts, status changes

#### B5. Department Shows Google OU Path
- Some deleted users show "/Staff/Sales" instead of "Sales"
- Mixing Google OU path with department field
- Data normalization issue

### C. Scheduled Actions Page Issues

#### C1. Weird Layout
- Small column showing "No scheduled actions"
- Appears to expect items to fill rest of page when selected
- Should be full-width empty state OR proper split-panel design

### D. User Creation Flow

#### D1. Create User + Google Workspace Broken
- Created user with "Create in Google Workspace" checked
- User not created in Helios at all
- No error message shown
- Silent failure

## Scope

### In Scope
1. Fix deleted users count mismatch
2. Redesign Users page header layout (stats, search, filters alignment)
3. Implement working filter panel with date/property filters
4. Redesign User Slideout to 2-column layout
5. Fix Add to Group functionality
6. Fix Create in Google Workspace functionality
7. Populate Activity Log with real events
8. Normalize department field (strip OU paths)
9. Fix Scheduled Actions page layout
10. Add proper error handling with toast notifications

### Out of Scope
- New features not related to fixing existing broken functionality
- Performance optimization
- Mobile responsive design

## Success Criteria

1. Deleted count matches actual deleted users displayed
2. Users page header is clean, aligned, professional
3. Filter panel opens and filters work (date created, last login, department, role)
4. User Slideout uses 2-column layout for profile fields
5. Add to Group persists and shows success toast
6. Create in Google Workspace creates user OR shows clear error
7. Activity Log shows all user actions
8. Department field shows clean department name (not OU path)
9. Scheduled Actions has proper full-width or split-panel layout
10. All actions show success/error feedback via toast

## Priority

**P-1 (CRITICAL)** - These are user-facing bugs that break core functionality

## Estimated Effort

3-4 days for complete implementation with tests

## Status

**COMPLETE** (2025-12-21)

All 23 tasks verified complete with 86+ E2E tests passing:
- Phase 1: Data Integrity (2/2)
- Phase 2: Users Page Header (3/3)
- Phase 3: Filter Panel (4/4)
- Phase 4: User Slideout Layout (2/2)
- Phase 5: Add to Group (3/3)
- Phase 6: Create in Google Workspace (3/3)
- Phase 7: Activity Log (4/4)
- Phase 8: Scheduled Actions Layout (2/2)
