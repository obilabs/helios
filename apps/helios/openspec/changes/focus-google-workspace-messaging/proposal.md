# Focus Google Workspace Messaging

## Summary
Remove premature Microsoft 365, Slack, and other integration references from active UI areas. Focus messaging on Google Workspace as the primary (and currently only implemented) integration. Keep module framework intact for future expansion.

## Problem Statement

The current UI messaging suggests multiple integrations are available or imminent:
- Setup page mentions "Google Workspace, Microsoft 365, Slack, and more"
- Login page mentions "Microsoft 365, and other SaaS platforms"
- Dashboard shows Microsoft 365 widgets and sync status
- User list empty state mentions "Microsoft 365"
- Groups page has Microsoft 365 filter option

**Reality:**
- Google Workspace: 95% implemented, production-ready
- Microsoft 365: 0% implemented (stubs only, no backend)
- Slack/Okta: 0% implemented (icons exist, no functionality)

This creates user confusion and sets incorrect expectations.

## Business Context

Per project direction:
1. Focus on Google Workspace and do it excellently
2. M365 license management is valuable but comes after monetization
3. Other integrations are post-revenue features
4. Single-platform focus reduces support burden during initial launch

## Proposed Solution

### Phase 1: Clean Active UI (This Proposal)

Remove or modify references in these areas:
1. **AccountSetup.tsx** - Remove M365/Slack mentions from setup hints
2. **LoginPage.tsx** - Simplify to focus on Google Workspace
3. **App.tsx** - Hide M365 dashboard sections and widgets
4. **UserList.tsx** - Update empty state message
5. **Groups.tsx** - Remove M365 filter option
6. **widget configs** - Disable Microsoft widget category

### Phase 2: Keep for Roadmap Visibility (No Changes)

Preserve these to show future direction:
- **Settings.tsx** - M365 module card marked "Coming Soon" (already disabled)
- **DeveloperConsole.tsx** - M365 commands (for future development)
- **PlatformIcon.tsx** - Keep icon components (no harm, aids future)

## Success Criteria

1. New users see clear, focused Google Workspace messaging
2. No UI elements suggest M365/Slack are functional
3. Module framework remains intact for future expansion
4. Settings page still shows M365 as "Coming Soon" for transparency
5. All changes are test-driven with E2E verification

## Test-Driven Development Approach

### Before Implementation
1. Write E2E tests that verify current (incorrect) state
2. Update tests to verify desired messaging
3. Run tests - they should fail

### Implementation
4. Make UI changes to match focused messaging
5. Run tests - they should pass

### Verification
6. Manual verification of all affected pages
7. Screenshot comparison before/after

## Out of Scope

- Backend changes (none required)
- Module framework changes
- Settings page module cards
- Developer console commands
- Actually implementing M365 (separate future proposal)

## Risk Assessment

**Low Risk:**
- Frontend-only changes
- No data model changes
- No API changes
- Easy to revert if needed

## Dependencies

- None (standalone frontend cleanup)

## Estimated Effort

- **Size:** Small (8-12 files, mostly string changes)
- **Complexity:** Low (search and replace with judgment)
- **Testing:** Medium (need E2E tests for all affected pages)
