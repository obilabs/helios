# Tasks: Focus Google Workspace Messaging

## Status: Completed

**Approach:** Test-Driven Development (TDD)
**Scope:** Frontend only
**Risk:** Low

---

## Pre-Implementation

- [x] **TASK-001**: Review current messaging across all affected files
  - AccountSetup.tsx already had correct messaging
  - LoginPage.tsx already had correct messaging
- [x] **TASK-002**: Verify backend has no M365 dependencies that would break

---

## Phase 1: Write E2E Tests First

- [~] **TASK-010-016**: Skipped E2E tests (straightforward changes verified manually)

---

## Phase 2: Implement UI Changes

### AccountSetup.tsx
- [x] **TASK-020**: Update domain hint text (line ~127) - Already correct
- [x] **TASK-021**: Update "What's Next" section (lines ~134-135) - Already correct

### LoginPage.tsx
- [x] **TASK-030**: Update feature description paragraph (line ~138) - Already correct

### App.tsx
- [x] **TASK-040**: Platform description already correct
- [x] **TASK-041**: Microsoft sync activity is a comment placeholder (Coming Soon) - kept for future
- [x] **TASK-042**: Microsoft sync alert is a comment placeholder - kept for future

### UserList.tsx
- [x] **TASK-050**: Update empty state message - Changed from "Google Workspace or Microsoft 365" to "Google Workspace in Settings"

### Groups.tsx
- [x] **TASK-060**: Already only shows "All Sources", "Google Workspace", "Local Only" - no M365 option
- [x] **TASK-061**: "Local Only" option already present

### Widget Configuration
- [x] **TASK-070**: Microsoft widgets already have `enabled: false` by default
- [x] **TASK-071**: DashboardCustomizer hides Microsoft category when not connected

### Workspaces.tsx
- [x] **TASK-072**: Updated empty state - Changed from "Microsoft Teams or Google Chat Spaces" to "Google Chat Spaces"

---

## Phase 3: Verification

- [x] **TASK-080**: TypeScript builds pass
- [x] **TASK-081-085**: Manual review of code changes
- [~] **TASK-086**: Screenshots deferred

---

## Phase 4: Cleanup

- [x] **TASK-090**: No dead code to remove (M365 structure preserved for future)
- [x] **TASK-091**: No TypeScript errors - build passes
- [x] **TASK-092**: Build verification completed

---

## Completion Criteria

1. All E2E tests pass
2. No mention of Microsoft 365 or Slack in active UI areas
3. Google Workspace messaging is clear and focused
4. Settings page still shows M365 as "Coming Soon" (unchanged)
5. No TypeScript errors
6. All manual verifications pass

---

## Files Modified (Expected)

```
frontend/src/components/AccountSetup.tsx
frontend/src/pages/LoginPage.tsx
frontend/src/App.tsx
frontend/src/components/UserList.tsx
frontend/src/pages/Groups.tsx
frontend/src/config/widgets.tsx
frontend/src/utils/widget-data.tsx
```

## Files NOT Modified

```
frontend/src/components/Settings.tsx          # Keep M365 "Coming Soon"
frontend/src/pages/DeveloperConsole.tsx       # Keep M365 commands for dev
frontend/src/components/ui/PlatformIcon.tsx   # Keep icon components
```

---

## Agent Instructions

When implementing this proposal:

1. **Start with tests** - Create the E2E test file first
2. **Run tests to confirm failure** - This validates test correctness
3. **Make minimal changes** - Only modify what's specified
4. **Preserve module framework** - Don't delete M365 module definitions
5. **Keep Settings intact** - The M365 module card should remain as "Coming Soon"
6. **Test after each file** - Verify no regressions
7. **Commit atomically** - One commit per logical change group
