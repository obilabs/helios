# OpenSpec Proposal: Frontend API URL Refactor

**ID:** frontend-api-url-refactor
**Status:** Approved
**Priority:** P0.1 (BLOCKING - Prevents remote access)
**Author:** Claude
**Created:** 2025-12-11

## Summary

Refactor all hardcoded `localhost:3001` URLs in the frontend to use a centralized configuration that reads from environment variables. This enables remote access, custom domains, and production deployment.

## Problem Statement

### Current Issues
1. **176 hardcoded `localhost:3001` URLs** across 49 frontend files
2. **Remote access broken** - When accessing from another machine (e.g., `http://192.168.1.100:80`), the frontend JS still calls `localhost:3001`, which points to the user's local machine, not the server
3. **No easy domain configuration** - Cannot easily deploy with a custom domain
4. **Anti-pattern** - Hardcoded URLs violate 12-factor app principles

### User Expectation
> "Anyone should be able to clone the repo -> update the .env -> setup their DNS -> Profit!"

## Solution Architecture

### 1. Single Source of Truth: Environment Variables

```bash
# .env (root level - for docker-compose)
APP_URL=http://localhost        # Or https://helios.example.com for production
API_URL=http://localhost/api    # Or https://helios.example.com/api

# frontend/.env (build-time for Vite)
VITE_API_URL=                   # Empty = relative URLs (recommended for nginx proxy)
# OR
VITE_API_URL=https://api.helios.example.com  # For separate API domain
```

### 2. Centralized Frontend Config

```typescript
// frontend/src/config/api.ts (ALREADY CREATED)
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
export const API_URL = API_BASE_URL.replace(/\/api$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`;
}
```

### 3. Deployment Scenarios

| Scenario | VITE_API_URL | Access URL | How it works |
|----------|--------------|------------|--------------|
| Local dev (direct) | `http://localhost:3001` | `localhost:3000` | Direct to Vite dev server |
| Local dev (nginx) | `` (empty) | `localhost:80` | Nginx proxies /api to backend |
| Remote access | `` (empty) | `192.168.x.x:80` | Nginx proxies, relative URLs work |
| Production | `` (empty) | `helios.example.com` | Nginx/Traefik proxies |
| Separate API domain | `https://api.helios.com` | `helios.com` | Cross-origin API calls |

### 4. Recommended Default: Relative URLs

When `VITE_API_URL` is empty, all API calls use relative URLs:
- `fetch('/api/users')` instead of `fetch('http://localhost:3001/api/users')`
- Works through any proxy (nginx, Traefik, Cloudflare, etc.)
- No CORS issues
- Domain-agnostic

## Files Requiring Changes

### High-Priority Files (Core App)
```
frontend/src/App.tsx                           - 8 occurrences
frontend/src/pages/LoginPage.tsx               - 1 occurrence
frontend/src/pages/Users.tsx                   - 3 occurrences
frontend/src/pages/Groups.tsx                  - 2 occurrences
frontend/src/components/Settings.tsx           - 5 occurrences
frontend/src/components/UserList.tsx           - 9 occurrences
frontend/src/components/UserSlideOut.tsx       - 11 occurrences
frontend/src/components/GroupSlideOut.tsx      - 13 occurrences
```

### Service Files
```
frontend/src/services/profile.service.ts       - 1 occurrence
frontend/src/services/people.service.ts        - 1 occurrence
frontend/src/services/api-keys.service.ts      - 1 occurrence
frontend/src/services/audit-logs.service.ts    - 1 occurrence
frontend/src/services/helpdesk.service.ts      - 1 occurrence
frontend/src/services/security-events.service.ts - 1 occurrence
frontend/src/services/google-workspace.service.ts - 1 occurrence
frontend/src/services/bulk-operations.service.ts - 1 occurrence
frontend/src/services/bulk-operations-socket.service.ts - 1 occurrence
```

### Page Files
```
frontend/src/pages/SetupPassword.tsx           - 2 occurrences
frontend/src/pages/OnboardingTemplates.tsx     - 6 occurrences
frontend/src/pages/OffboardingTemplates.tsx    - 5 occurrences
frontend/src/pages/UserOffboarding.tsx         - 3 occurrences
frontend/src/pages/NewUserOnboarding.tsx       - 5 occurrences
frontend/src/pages/admin/ScheduledActions.tsx  - 5 occurrences
frontend/src/pages/AddUser.tsx                 - 4 occurrences
frontend/src/pages/OrgChart.tsx                - 1 occurrence
frontend/src/pages/GroupDetail.tsx             - 5 occurrences
frontend/src/pages/EmailSecurity.tsx           - 2 occurrences
frontend/src/pages/FilesAssets.tsx             - 8 occurrences
frontend/src/pages/PublicAssets.tsx            - 8 occurrences
frontend/src/pages/TemplateStudio.tsx          - 7 occurrences
frontend/src/pages/Workspaces.tsx              - 1 occurrence
frontend/src/pages/UserSettings.tsx            - 1 occurrence
frontend/src/pages/DeveloperConsole.tsx        - 1 occurrence
```

### Component Files
```
frontend/src/components/Administrators.tsx     - 4 occurrences
frontend/src/components/RolesManagement.tsx    - 1 occurrence
frontend/src/components/AccountSetup.tsx       - 1 occurrence
frontend/src/components/ClientUserMenu.tsx     - 1 occurrence
frontend/src/components/AssetPickerModal.tsx   - 1 occurrence
frontend/src/components/settings/MasterDataSection.tsx - 11 occurrences
frontend/src/components/integrations/ApiKeyWizard.tsx - 1 occurrence
frontend/src/components/integrations/ApiKeyList.tsx - 2 occurrences
frontend/src/components/lifecycle/OnboardingTemplateEditor.tsx - 5 occurrences
frontend/src/components/lifecycle/OffboardingTemplateEditor.tsx - 4 occurrences
frontend/src/components/modules/GoogleWorkspaceWizard.tsx - 3 occurrences
```

### Context Files
```
frontend/src/contexts/LabelsContext.tsx        - 1 occurrence
frontend/src/contexts/ViewContext.tsx          - 1 occurrence
```

## Refactoring Patterns

### Pattern 1: Direct fetch calls
```typescript
// BEFORE
const response = await fetch('http://localhost:3001/api/users');

// AFTER
const response = await fetch('/api/users');
```

### Pattern 2: Service files with API_URL constant
```typescript
// BEFORE
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const response = await fetch(`${API_URL}/api/users`);

// AFTER
import { API_URL } from '@/config/api';
const response = await fetch(`${API_URL}/api/users`);
// OR simply:
const response = await fetch('/api/users');
```

### Pattern 3: WebSocket connections
```typescript
// BEFORE
const ws = new WebSocket('ws://localhost:3001/ws/bulk-operations');

// AFTER
import { wsUrl } from '@/config/api';
const ws = new WebSocket(wsUrl('/ws/bulk-operations'));
```

### Pattern 4: Components with inline URLs
```typescript
// BEFORE
useEffect(() => {
  fetch('http://localhost:3001/api/dashboard/stats')
    .then(res => res.json())
    .then(setStats);
}, []);

// AFTER
useEffect(() => {
  fetch('/api/dashboard/stats')
    .then(res => res.json())
    .then(setStats);
}, []);
```

## Public File/Asset URLs

### Current Problem
Public assets (profile photos, uploaded files, signature images) use hardcoded URLs:

```typescript
// backend/src/routes/assets.routes.ts
const baseUrl = process.env['PUBLIC_URL'] || process.env['BACKEND_URL'] || 'http://localhost:3001';
return `${baseUrl}/a/${accessToken}/${filename}`;

// backend/src/services/s3.service.ts
publicUrl: process.env.S3_PUBLIC_URL || 'http://localhost:9000',

// backend/src/services/photo.service.ts
private publicUrl = process.env.PUBLIC_ASSET_URL || 'http://localhost:3001/assets';
```

### Solution: Environment-Based URL Configuration

Assets are served through the backend at `/a/{token}/{filename}`, which goes through nginx.
MinIO doesn't need public exposure - the backend proxies all asset requests.

```bash
# For production with custom domain:
PUBLIC_URL=https://helios.example.com
# OR leave empty to use relative URLs (backend will detect request host)
```

### Asset URL Flow
```
Browser -> nginx:80 -> /a/{token} -> backend:3001 -> MinIO:9000 -> Response
                                  -> Redis cache (if cached)
```

The backend should generate relative URLs (`/a/{token}`) when `PUBLIC_URL` is empty,
allowing the browser to use the current origin.

## Container Exposure Strategy

### Development (docker-compose.yml)
All ports exposed for debugging:
| Service | Port | Purpose |
|---------|------|---------|
| nginx | 80 | Main entry point |
| frontend | 3000 | Direct Vite access |
| backend | 3001 | Direct API access |
| postgres | 5432 | Database tools |
| redis | 6379 | Redis CLI |
| minio | 9000, 9001 | MinIO console |

### Production (docker-compose.prod.yml)
Only nginx exposed:
| Service | Port | Purpose |
|---------|------|---------|
| nginx | 80, 443 | Only public entry point |

All other services communicate via internal docker network only.

## Environment Configuration

### Root .env.example (for docker-compose)
```bash
# Application URLs
# For local development with nginx proxy:
APP_URL=http://localhost
# For production with custom domain:
# APP_URL=https://helios.yourdomain.com

# Backend URL (used by docker-compose for CORS)
FRONTEND_URL=http://localhost:3000
# For production:
# FRONTEND_URL=https://helios.yourdomain.com
```

### frontend/.env.example
```bash
# API URL Configuration
# ====================
# RECOMMENDED: Leave empty for relative URLs (works with nginx proxy)
VITE_API_URL=

# Alternative configurations:
# Local dev without proxy:  VITE_API_URL=http://localhost:3001
# Production same domain:   VITE_API_URL=  (empty, use nginx proxy)
# Production separate API:  VITE_API_URL=https://api.helios.yourdomain.com
```

## Success Criteria

1. **Remote access works** - Access `http://<server-ip>:80` from another machine, login works
2. **No hardcoded localhost** - `grep -r "localhost:3001" frontend/src` returns 0 results
3. **Domain-agnostic** - Can deploy to any domain by updating nginx config only
4. **Backwards compatible** - Local development still works with `VITE_API_URL=http://localhost:3001`
5. **WebSockets work** - Bulk operations and real-time features function correctly

## Testing Plan

1. **Local direct access**: `VITE_API_URL=http://localhost:3001`, access `localhost:3000`
2. **Local nginx proxy**: `VITE_API_URL=`, access `localhost:80`
3. **Remote nginx proxy**: `VITE_API_URL=`, access `<server-ip>:80` from another machine
4. **All features work**: Login, dashboard, users, groups, settings, lifecycle, etc.

## Implementation Notes

### Why Relative URLs are Best
- No CORS configuration needed
- Works through any reverse proxy
- Domain changes require zero code changes
- Simpler nginx/Traefik configuration
- Standard practice for single-origin deployments

### Vite Path Alias
The `@/` alias is already configured in `vite.config.ts`:
```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
},
```

So imports like `import { API_URL } from '@/config/api'` will work.

### Backend CORS
The backend already supports CORS configuration via `FRONTEND_URL` env var. For production with nginx proxy on same origin, CORS isn't needed.
