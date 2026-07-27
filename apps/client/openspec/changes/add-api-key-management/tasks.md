# Implementation Tasks - API Key Management

## Phase 1: Database & Backend Foundation

### Database Schema
- [x] Create migration `035_create_api_keys_system.sql`
  - [x] Create `api_keys` table with all columns
  - [x] Create `api_key_usage_logs` table
  - [x] Add indexes for performance
  - [x] Add CHECK constraints for key type validation
  - **File:** `database/migrations/035_create_api_keys_system.sql`

### Backend - Key Generation
- [x] Create `backend/src/utils/apiKey.ts`
  - [x] Implement `generateApiKey()` function
  - [x] Implement `hashApiKey()` function
  - [x] Implement `validateApiKeyFormat()` function (fixed for base64url)
  - [x] Implement `verifyApiKey()` timing-safe comparison
  - [x] Add permission scopes (API_SCOPES, hasPermission, expandPermissions)
  - [x] Add unit tests (35 tests passing)
  - **File:** `backend/src/utils/apiKey.ts`
  - **Tests:** `backend/src/__tests__/api-key.utils.test.ts`

### Backend - Authentication Middleware
- [x] Create `backend/src/middleware/api-key-auth.ts`
  - [x] Implement `authenticateApiKey(req, res, next)` middleware
  - [x] Validate API key format
  - [x] Hash and lookup key in database
  - [x] Check expiration
  - [x] Check IP whitelist (if configured)
  - [x] Enforce actor headers for vendor keys
  - [x] Validate against pre-approved actors (if configured)
  - [x] Update `last_used_at` timestamp
  - [x] Attach key and actor context to request
- [x] Implement `requirePermission(scope)` middleware
- **File:** `backend/src/middleware/api-key-auth.ts`

### Backend - API Key Routes
- [x] Create `backend/src/routes/api-keys.routes.ts`
  - [x] POST `/api/organization/api-keys` - Create new key
  - [x] GET `/api/organization/api-keys` - List all keys (with filtering)
  - [x] GET `/api/organization/api-keys/:id` - Get key details
  - [x] PATCH `/api/organization/api-keys/:id` - Update key
  - [x] DELETE `/api/organization/api-keys/:id` - Revoke key (soft delete)
  - [x] POST `/api/organization/api-keys/:id/renew` - Renew expired key
  - [x] GET `/api/organization/api-keys/:id/usage` - Get usage history
- **File:** `backend/src/routes/api-keys.routes.ts`

### Backend - Integration with Existing Routes
- [x] Register API key routes in `backend/src/index.ts`
  - **Route:** `/api/organization/api-keys`
- [x] JWT authentication still works (backward compatible)

## Phase 2: Frontend UI

### Settings Tab Structure
- [x] Add "Integrations" tab to Settings.tsx
- [x] Create `frontend/src/components/integrations/` directory

### API Key List Component
- [x] Create `frontend/src/components/integrations/ApiKeyList.tsx`
  - [x] Fetch and display list of API keys
  - [x] Show key status badges (active/expired/revoked)
  - [x] Show key type badges (service/vendor)
  - [x] Show last used indicator
  - [x] Show expiration countdown
  - [x] Add "Create New Key" button
  - [x] Add action buttons (View, Renew, Revoke)
  - [x] Handle loading and error states
- [x] Create `frontend/src/components/integrations/ApiKeyList.css`
- **Files:** `ApiKeyList.tsx`, `ApiKeyList.css`

### API Key Create Wizard
- [x] Create `frontend/src/components/integrations/ApiKeyWizard.tsx`
  - [x] Step 1: Type Selection (Service/Vendor)
  - [x] Step 2a: Service Configuration
  - [x] Step 2b: Vendor Configuration
  - [x] Permissions checkboxes
  - [x] Expiration selector
  - [x] IP whitelist configuration
- [x] Create `frontend/src/components/integrations/ApiKeyWizard.css`
- **Files:** `ApiKeyWizard.tsx`, `ApiKeyWizard.css`

### Show Once Modal
- [x] Create `frontend/src/components/integrations/ApiKeyShowOnce.tsx`
  - [x] Display new API key prominently
  - [x] Copy to clipboard button
  - [x] Warning message
  - [x] Confirmation before close
- [x] Create `frontend/src/components/integrations/ApiKeyShowOnce.css`
- **Files:** `ApiKeyShowOnce.tsx`, `ApiKeyShowOnce.css`

## Phase 3: Testing

### Backend Tests
- [x] Unit tests for key generation - 35 tests
- [x] Unit tests for key hashing
- [x] Unit tests for validation (including base64url fix)
- [x] Unit tests for permission checking
- **File:** `backend/src/__tests__/api-key.utils.test.ts`

### Remaining Tests (Optional)
- [ ] Integration tests for authentication middleware
- [ ] Integration tests for API key CRUD routes
- [ ] E2E tests for UI workflow

## Phase 4: Documentation (Optional)

- [ ] Create API key user guide
- [ ] Create integration guide
- [ ] Create API reference

## Status Summary

| Component | Status |
|-----------|--------|
| Database Migration | ✅ Complete |
| Key Generation Utils | ✅ Complete |
| Authentication Middleware | ✅ Complete |
| API Routes | ✅ Complete |
| Frontend Integrations Tab | ✅ Complete |
| API Key List UI | ✅ Complete |
| API Key Create Wizard | ✅ Complete |
| Show Once Modal | ✅ Complete |
| Unit Tests | ✅ Complete (35 tests) |
| Integration Tests | ⏳ Optional |
| Documentation | ⏳ Optional |

## Files Created/Modified

### Backend
- `database/migrations/035_create_api_keys_system.sql` (new)
- `backend/src/utils/apiKey.ts` (enhanced)
- `backend/src/middleware/api-key-auth.ts` (existing)
- `backend/src/routes/api-keys.routes.ts` (existing)
- `backend/src/__tests__/api-key.utils.test.ts` (new)

### Frontend
- `frontend/src/components/integrations/ApiKeyList.tsx` (existing)
- `frontend/src/components/integrations/ApiKeyList.css` (existing)
- `frontend/src/components/integrations/ApiKeyWizard.tsx` (existing)
- `frontend/src/components/integrations/ApiKeyWizard.css` (existing)
- `frontend/src/components/integrations/ApiKeyShowOnce.tsx` (existing)
- `frontend/src/components/integrations/ApiKeyShowOnce.css` (existing)
- `frontend/src/components/Settings.tsx` (Integrations tab added)
