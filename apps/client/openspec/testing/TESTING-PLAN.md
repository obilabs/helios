# Comprehensive GUI Testing Plan

**Created:** 2025-12-02
**Status:** IMPLEMENTED - 45 tests passing
**Aligned With:** OpenSpec Testing Methodology

## Executive Summary

This plan addresses the current state of GUI testing in Helios and provides a path to comprehensive, spec-driven test coverage. The goal is to achieve 100% coverage of OpenSpec requirements through automated Playwright tests.

---

## Current State Analysis

### Issues Identified

1. **Test Account Disabled**
   - Jack's account returns "Account is disabled" (HTTP 401)
   - Tests cannot complete login flow
   - Root cause: `is_active` flag or user status in database

2. **Credential Inconsistencies**
   - `test-helpers.ts`: `jack@gridwrx.io` / `TestPassword123!`
   - `TEST-CREDENTIALS.md`: `jack@gridwrx.io` / `P@ssw0rd123!`
   - `login-jack.test.ts`: `jack@gridworx.io` / `Jack123` (different domain!)

3. **Test File Sprawl**
   - 42 test files, many are diagnostic/debug one-offs
   - No clear organization by feature area
   - Duplicated test logic across files

4. **Coverage Gaps**
   - ~25-30% of OpenSpec requirements have E2E tests
   - Missing tests for: API Keys, Bulk Operations, Org Chart, Signatures, ITSM

### What's Working Well

- Playwright infrastructure is solid (7 browser projects, reports, artifacts)
- Test helpers provide good abstractions (login, logout, navigateTo)
- OpenSpec structure is well-defined (specs, changes, framework)
- Screenshot capture and evidence collection configured

---

## Action Plan

### Phase 1: Fix Foundation (Immediate)

#### 1.1 Fix Jack's Test Account
```sql
-- Run this to enable Jack's account
UPDATE organization_users
SET is_active = true,
    status = 'active'
WHERE email = 'jack@gridwrx.io';
```

#### 1.2 Standardize Test Credentials
All test files should use:
- **Email:** `jack@gridwrx.io`
- **Password:** `P@ssw0rd123!`
- **Source:** `TEST_CONFIG` from `test-helpers.ts`

Update `test-helpers.ts`:
```typescript
export const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:3001',
  testEmail: 'jack@gridwrx.io',
  testPassword: 'P@ssw0rd123!',
};
```

#### 1.3 Remove Duplicate/Debug Tests
Move to archive:
- `debug-*.test.ts` files
- `check-*.test.ts` files
- `verify-*.test.ts` files
- `test-*.test.ts` files
- `*-diagnostic.test.ts` files

Keep and refactor:
- `login-jack.test.ts` -> `auth.test.ts`
- `users-list.test.ts` -> `users.test.ts`
- `groups.test.ts` -> keep
- `settings.test.ts` -> keep

---

### Phase 2: Restructure Test Suite

#### 2.1 New Directory Structure
```
openspec/testing/
├── tests/
│   ├── core/                    # Core app functionality
│   │   ├── auth.test.ts         # Login, logout, session
│   │   ├── dashboard.test.ts    # Dashboard widgets, stats
│   │   └── navigation.test.ts   # Sidebar, routing
│   │
│   ├── directory/               # Directory features
│   │   ├── users.test.ts        # User list, CRUD
│   │   ├── groups.test.ts       # Group management
│   │   ├── org-chart.test.ts    # Org chart views
│   │   └── user-detail.test.ts  # User slideout panel
│   │
│   ├── settings/                # Settings pages
│   │   ├── modules.test.ts      # Module enable/disable
│   │   ├── organization.test.ts # Org settings
│   │   ├── security.test.ts     # Security tab
│   │   └── integrations.test.ts # API keys
│   │
│   ├── operations/              # Operational features
│   │   ├── bulk.test.ts         # Bulk operations
│   │   ├── audit.test.ts        # Audit logs
│   │   └── signatures.test.ts   # Email signatures
│   │
│   └── generated/               # Auto-generated from specs
│       └── *.spec.test.ts
│
├── archive/                     # Old/debug tests (not run)
│   └── *.test.ts
│
└── helpers/
    ├── test-helpers.ts
    ├── auth.helper.ts
    ├── navigation.helper.ts
    └── fixtures.ts
```

#### 2.2 Test File Template
Each test file should follow this structure:
```typescript
import { test, expect, Page } from '@playwright/test';
import { login, navigateTo, takeScreenshot, TEST_CONFIG } from '../helpers/test-helpers';

test.describe('Feature: [Feature Name]', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe('Requirement: [Requirement Name]', () => {
    test('Scenario: [Scenario Name]', async ({ page }) => {
      // Given - Setup
      // When - Action
      // Then - Assertion
      await takeScreenshot(page, 'feature-scenario-step');
    });
  });
});
```

---

### Phase 3: Implement Core Test Suites

#### 3.1 Authentication Suite (`core/auth.test.ts`)
| Scenario | Priority |
|----------|----------|
| Valid login with correct credentials | P0 |
| Invalid login with wrong password | P0 |
| Session persistence after refresh | P1 |
| Logout clears session | P1 |
| Token refresh on expiry | P2 |

#### 3.2 Dashboard Suite (`core/dashboard.test.ts`)
| Scenario | Priority |
|----------|----------|
| Dashboard loads with stats | P0 |
| Widgets display correct data | P1 |
| Widget customization persists | P2 |
| Module status cards show correctly | P1 |

#### 3.3 Users Suite (`directory/users.test.ts`)
| Scenario | Priority |
|----------|----------|
| User list displays users | P0 |
| Filter by type (Staff/Guests/Contacts) | P0 |
| Filter by status (Active/Staged/Suspended) | P0 |
| Search users by name | P1 |
| User count badges accurate | P1 |
| Create new user | P1 |
| Edit user details | P1 |
| Delete user | P2 |

#### 3.4 Groups Suite (`directory/groups.test.ts`)
| Scenario | Priority |
|----------|----------|
| Group list displays groups | P0 |
| View group details | P1 |
| Add member to group | P1 |
| Remove member from group | P1 |
| Create new group | P2 |

#### 3.5 Settings Suite (`settings/modules.test.ts`)
| Scenario | Priority |
|----------|----------|
| Settings page tabs navigate correctly | P0 |
| Modules tab shows enabled modules | P1 |
| Google Workspace config visible | P1 |
| Organization info editable | P2 |

---

### Phase 4: Spec-Driven Test Generation

#### 4.1 OpenSpec Coverage Map

| Spec/Change | Requirements | Tests | Coverage |
|-------------|--------------|-------|----------|
| user-directory | 4 | 1 | 25% |
| add-url-routing | 5+ | 1 | 20% |
| add-api-key-management | 14 | 0 | 0% |
| add-bulk-operations | 8+ | 1 | 12% |
| add-org-chart-visualization | 6+ | 0 | 0% |
| add-signature-campaigns | 10+ | 0 | 0% |
| add-group-mailbox-helpdesk | 12+ | 1 | 8% |
| implement-canonical-data-model | 15+ | 1 | 7% |

#### 4.2 Priority Test Implementation Order

1. **P0 - Blocking (This Week)**
   - Fix auth tests (foundation for all other tests)
   - Users list basic functionality
   - Groups list basic functionality

2. **P1 - Critical (Next Sprint)**
   - Complete user CRUD tests
   - Complete group management tests
   - Settings modules tests
   - API key management tests

3. **P2 - Important (Following Sprint)**
   - Org chart visualization tests
   - Bulk operations tests
   - Signature campaign tests

4. **P3 - Nice to Have (Backlog)**
   - ITSM module tests
   - Helpdesk tests
   - Advanced filtering tests

---

### Phase 5: CI/CD Integration

#### 5.1 Test Run Commands
```bash
# Run all tests (CI mode)
npm run test:ci

# Run specific suite
npx playwright test tests/core/

# Run with browser visible
npm run test:headed -- tests/core/auth.test.ts

# Generate tests from specs
npm run generate
```

#### 5.2 Pre-Commit Hook (Recommended)
```bash
# Run smoke tests before commit
npx playwright test tests/core/auth.test.ts --project=chromium
```

#### 5.3 CI Pipeline Configuration
```yaml
# .github/workflows/test.yml
- Run tests on PR:
  - Chromium only (fast feedback)
  - Upload failure artifacts

- Run tests on merge to main:
  - All browser projects
  - Full report generation
```

---

## Implementation Checklist

### Immediate Actions
- [ ] Enable Jack's test account in database
- [ ] Update `test-helpers.ts` with correct password
- [ ] Update `login-jack.test.ts` with correct email domain
- [ ] Verify login works with: `npx playwright test login-jack.test.ts`

### Week 1
- [ ] Restructure test directories (create new structure)
- [ ] Archive debug/diagnostic tests
- [ ] Create `auth.test.ts` with proper scenarios
- [ ] Create `users.test.ts` with user list scenarios
- [ ] Verify all P0 tests pass

### Week 2
- [ ] Create `groups.test.ts` with group scenarios
- [ ] Create `settings/modules.test.ts`
- [ ] Create `user-detail.test.ts` (slideout panel)
- [ ] Add screenshot evidence to all tests

### Week 3+
- [ ] Generate tests from remaining OpenSpec changes
- [ ] Implement API key management tests
- [ ] Implement org chart tests
- [ ] Set up CI/CD pipeline

---

## Test Evidence Requirements

Each test should capture:
1. **Before screenshot** - Initial state
2. **Action screenshot** - During interaction
3. **After screenshot** - Result state
4. **Video** - On failure only (configured in playwright.config.ts)

Naming convention:
```
{suite}-{scenario}-{step}.png
e.g., auth-valid-login-after-submit.png
```

---

## Success Criteria

- [ ] All P0 tests passing on Chromium
- [ ] Test run completes in < 5 minutes
- [ ] 80%+ coverage of OpenSpec requirements
- [ ] Zero flaky tests
- [ ] Evidence captured for all scenarios
- [ ] CI/CD pipeline running on PRs

---

## Appendix: Test User Accounts

### Primary Test Account (Admin)
- Email: `jack@gridwrx.io`
- Password: `P@ssw0rd123!`
- Role: `admin`

### Additional Test Users (To Be Created)
| Email | Password | Role | Purpose |
|-------|----------|------|---------|
| manager@gridwrx.io | TestPass123! | manager | Manager role tests |
| user@gridwrx.io | TestPass123! | user | Basic user tests |
| disabled@gridwrx.io | TestPass123! | user | Disabled account tests |

---

## References

- [OpenSpec AGENTS.md](../AGENTS.md) - AI assistant instructions
- [TEST-CREDENTIALS.md](./TEST-CREDENTIALS.md) - Credential management
- [project.md](../project.md) - Project conventions
- [Playwright Docs](https://playwright.dev/docs/intro)
