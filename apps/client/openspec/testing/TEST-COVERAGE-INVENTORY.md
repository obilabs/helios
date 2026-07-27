# Test Coverage Inventory

**Generated:** 2025-10-31
**Purpose:** Track which features have Playwright E2E tests

## Features & Pages

### ✅ Tested Features

| Feature | Page/Component | Test File | Status |
|---------|---------------|-----------|--------|
| Login | LoginPage | login-jack.test.ts | ✅ PASSING |
| Page Persistence | App (refresh) | login-jack.test.ts | ✅ PASSING |
| API Authentication | Backend | login-jack.test.ts | ✅ PASSING |
| Navigation | App routing | changes-add-url-routing-specs-navigation-spec.test.ts | ⚠️ Unknown |
| User Directory | Users page | specs-user-directory-spec.test.ts | ⚠️ Unknown |
| Helpdesk | Helpdesk page | changes-add-group-mailbox-helpdesk-specs-helpdesk-spec.test.ts | ⚠️ Unknown |
| Bulk Operations | BulkOperations | example-bulk-operations.test.ts | ⚠️ Unknown |

### ❌ Untested Features

| Feature | Page/Component | Priority | Notes |
|---------|---------------|----------|-------|
| **Groups** | Groups.tsx | HIGH | Core directory feature |
| **Group Detail** | GroupDetail.tsx | HIGH | View/edit group details |
| **Add User** | AddUser.tsx | HIGH | Critical user management |
| **Settings** | Settings component | HIGH | System configuration |
| **Users List** | Users.tsx | HIGH | User management |
| **Directory** | Directory.tsx | MEDIUM | User directory view |
| **Org Units** | OrgUnits.tsx | MEDIUM | Organizational structure |
| **Asset Management** | AssetManagement.tsx | MEDIUM | Asset tracking |
| **Template Studio** | TemplateStudio.tsx | MEDIUM | Template management |
| **Public Assets** | PublicAssets.tsx | LOW | Public file management |
| **Password Setup** | SetupPassword.tsx | LOW | User password setup flow |

## OpenSpec Specifications

### Active Specs (Need Tests)

1. **Bulk Operations** (`openspec/changes/add-bulk-operations/`)
   - CSV Import/Export
   - Batch user operations
   - Test: example-bulk-operations.test.ts (status unknown)

2. **Helpdesk** (`openspec/changes/add-group-mailbox-helpdesk/`)
   - Ticket management
   - Group mailbox integration
   - Test: changes-add-group-mailbox-helpdesk-specs-helpdesk-spec.test.ts (status unknown)

3. **URL Routing** (`openspec/changes/add-url-routing/`)
   - Navigation persistence
   - Deep linking
   - Test: changes-add-url-routing-specs-navigation-spec.test.ts (status unknown)

4. **User Directory** (`openspec/specs/user-directory/`)
   - User listing and search
   - Google Workspace sync indicator
   - Test: specs-user-directory-spec.test.ts (status unknown)

## Test Priority Matrix

### P0 (Critical - Must Test First)
- [ ] Login flow (✅ DONE)
- [ ] Add User workflow
- [ ] Users list/directory
- [ ] Groups management
- [ ] Settings configuration

### P1 (High Priority)
- [ ] Group detail view/edit
- [ ] Navigation and routing
- [ ] Page persistence (✅ DONE)
- [ ] User search/filter
- [ ] Bulk operations

### P2 (Medium Priority)
- [ ] Org Units management
- [ ] Asset management
- [ ] Template Studio
- [ ] Helpdesk
- [ ] Directory view

### P3 (Low Priority)
- [ ] Public assets
- [ ] Password setup flow

## Next Steps

1. Run existing tests to verify status
2. Create tests for P0 features (Add User, Users, Groups, Settings)
3. Verify OpenSpec tests are working
4. Create comprehensive test suite for all features
5. Set up CI/CD to run tests automatically

## Test Standards

Each test should:
- ✅ Login as Jack (admin user)
- ✅ Navigate to the feature
- ✅ Perform key actions
- ✅ Verify expected outcomes
- ✅ Take screenshots for visual regression
- ✅ Test happy path AND error cases
- ✅ Verify page persistence (refresh stays on page)
- ✅ Clean up test data (if applicable)
