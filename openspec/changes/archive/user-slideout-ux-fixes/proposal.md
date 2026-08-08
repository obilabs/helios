# User Slideout UX Fixes + Quick Add Redesign

## Problem Statement

### User Details Slideout Issues
The User Details Slideout (`UserSlideOut.tsx`) has multiple UX issues:

1. **Settings Tab - Reset Password button does nothing** (no onClick handler)
2. **Settings Tab - Deleted users show "Active" status** (dropdown lacks "deleted" option)
3. **Settings Tab - Role Management is disabled**
4. **Account Sync Tab - Poor naming and minimal info**
5. **Groups Tab - Add to Group modal button overlap**
6. **General - Uses `alert()` instead of toast notifications**

### Quick Add User Slideout Issues
The Quick Add User Slideout (`QuickAddUserSlideOut.tsx`) has significant design problems:

1. **Width mismatch**: 480px vs UserSlideOut's 600px - creates inconsistent feel
2. **Job Title is text input**: Should be dropdown with "Add New" option (reduces typos)
3. **Department is text input**: Should be dropdown (we enforce department list management)
4. **Manager not visible**: Manager dropdown exists in code but may be in Advanced Options
5. **"Mockup" appearance**: Excessive border lines, unaligned fields, prototype feel
6. **Missing visual refinement**: Fields look raw/unstyled compared to UserSlideOut

## Scope

### In Scope
**User Slideout:**
- Fix Reset Password functionality
- Lock status dropdown for deleted users + add Restore button
- Rename "Account Sync" → "Connections" with improved layout
- Fix Add to Group modal styling
- Replace `alert()` with toast notifications

**Quick Add Slideout:**
- Match width to UserSlideOut (600px)
- Convert Job Title to searchable dropdown with "Add New" option
- Convert Department to dropdown (using existing department list API)
- Move Manager to main form (not hidden in Advanced)
- Remove excessive section borders/lines
- Align form field styling with UserSlideOut's info-grid pattern
- Add visual polish (consistent spacing, refined borders)

### Out of Scope
- Role Management implementation (deferred)
- Google Licensing API integration (separate spec)
- Activity log population (backend concern)

## Success Criteria

1. Both slideouts have identical width (600px)
2. Job Title dropdown allows selection OR creation of new title
3. Department dropdown uses master data from Settings
4. Manager dropdown visible by default (not in Advanced)
5. Form fields are cleanly aligned with minimal visual lines
6. Reset Password button triggers password reset flow
7. Deleted users show locked status
8. All feedback uses toast notifications (no `alert()` calls)
