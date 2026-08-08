# Tasks: Add User UX Improvements

## Phase 3: Slideout Refinements
- [x] **TASK-UX-001**: Convert "Job Title" input to Select (fetch from Master Data)
- [x] **TASK-UX-002**: Convert "Manager" input to Select (fetch active users)
- [x] **TASK-UX-003**: Ensure validation and typing for new dropdowns

## Phase 3.5: Add User Page Alignment
- [x] **TASK-UX-004**: Refactor `AddUser.tsx` to use CSS Grid/Flex for proper alignment
- [x] **TASK-UX-005**: Add "Create in Google/Microsoft" checkboxes to `AddUser.tsx`
- [x] **TASK-UX-006**: Ensure feature parity with Slideout (Job Title/Manager dropdowns)

## Phase 4: License Management
- [x] **TASK-API-001**: Implement `GET /api/v1/licenses` endpoint (Backend)
- [x] **TASK-API-002**: Update `POST /api/v1/organization/users` to handle license assignment
- [x] **TASK-UX-007**: Add License selection dropdown to `QuickAddUserSlideOut`
- [x] **TASK-UX-008**: Add License selection dropdown to `AddUser.tsx`

## Verification
- [x] **TASK-TEST-001**: Write E2E tests for add user forms
- [x] **TASK-TEST-002**: Verify API license endpoints

## Implementation Notes

### New Files Created:
- `database/migrations/060_create_job_titles_table.sql` - Job titles master data table
- `backend/src/routes/job-titles.routes.ts` - Job titles API endpoints
- `backend/src/routes/licenses.routes.ts` - Unified licenses API endpoint

### Files Modified:
- `backend/src/index.ts` - Added job-titles and licenses routes
- `backend/src/routes/organization.routes.ts` - Added createInGoogle, createInMicrosoft, licenseId to user creation
- `frontend/src/components/QuickAddUserSlideOut.tsx` - Added dropdowns for job title, department, manager, and license
- `frontend/src/pages/AddUser.tsx` - Added dropdowns, provider checkboxes, and license selection

### E2E Tests:
- `openspec/testing/tests/add-user-ux.test.ts` - Comprehensive test suite with 8 tests:
  - TASK-TEST-001: Users page Add User dropdown works
  - TASK-TEST-001: Add user page route is accessible
  - TASK-TEST-002: API GET /api/v1/organization/licenses returns correct structure
  - TASK-TEST-002: API License objects have required properties
  - TASK-TEST-002: API Licenses endpoint requires authentication
  - TASK-TEST-002: API Job Titles endpoint returns array structure
  - TASK-TEST-002: API Departments endpoint returns dropdown data
  - TASK-TEST-002: API Users endpoint supports status filter for managers dropdown
