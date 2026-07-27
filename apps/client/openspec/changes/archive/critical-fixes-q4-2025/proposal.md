# Critical Fixes & Enhancements - Q4 2025

## Overview

This proposal consolidates multiple critical issues and enhancements needed for production readiness. It addresses bugs reported by user testing on remote access (port 80 via nginx), storage strategy, and Microsoft 365 integration.

## Current Issues Summary

| Issue | Severity | Root Cause | Fix Priority |
|-------|----------|------------|--------------|
| Dashboard loading forever | High | Browser caching / token expiry | P0 |
| 500 error on page refresh | High | Nginx SPA routing issue | P0 |
| Add User not working | High | API route / frontend issue | P0 |
| Templates creation broken | High | Form submission / API issue | P0 |
| Dashboard customization not persisting | Medium | Cache / widget save issue | P1 |
| Quick actions do nothing | Medium | Missing click handlers | P1 |
| Media files strategy unclear | Medium | Architecture decision needed | P1 |

---

## Issue 1: 500 Error on Page Refresh

**Problem:** When user is on `/admin/users` and hits refresh, they get a 500 error.

**Root Cause:** Nginx returns 500 when the SPA fallback fails. Current config has fallback but may have issues with the Vite dev server proxy.

**Fix:** Update nginx.conf to properly handle SPA routing:

```nginx
# For production (static files)
location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
}

# For development (proxy to Vite)
location / {
    proxy_pass http://frontend;
    proxy_intercept_errors on;
    error_page 404 = /index.html;  # Fallback to index for SPA routes
}
```

**Also needed:** Vite must be configured to handle unknown routes:
```typescript
// vite.config.ts
server: {
  historyApiFallback: true
}
```

---

## Issue 2: Dashboard Loading Forever

**Problem:** Dashboard widgets show loading spinner indefinitely when accessed remotely.

**Likely Causes:**
1. Browser cached old code with `http://localhost:3001` URLs
2. JWT token expired but refresh token logic not triggering
3. API returning error but frontend not displaying it

**Fix:**
1. Add cache-busting headers in nginx for HTML files
2. Improve error handling in dashboard to show actual errors
3. Force hard refresh: `Ctrl+Shift+R` or clear browser cache

**Code change in App.tsx:**
```typescript
// Show actual error instead of infinite spinner
} catch (err) {
  setStatsLoading(false);
  setStatsError(err.message || 'Failed to load dashboard');
}
```

---

## Issue 3: Add User Not Working

**Problem:** Quick Add and full onboarding forms don't submit.

**Investigation needed:**
1. Check network tab for failed requests
2. Verify `/api/v1/lifecycle/onboarding/execute` endpoint
3. Check form validation errors not being shown

---

## Issue 4: Template Creation Broken

**Problem:** Cannot create onboarding/offboarding templates.

**Should be able to:** Create multiple templates for different use cases (e.g., "Sales Team Onboarding", "Engineering Onboarding", "Contractor Onboarding").

**Investigation:**
- Check POST `/api/v1/lifecycle/onboarding-templates`
- Check POST `/api/v1/lifecycle/offboarding-templates`
- Verify database table `onboarding_templates` exists

---

## Issue 5: Storage Strategy - MinIO vs Google Drive

### Recommendation: Split by Purpose

**MinIO (Internal Application Storage):**
- User profile photos
- Uploaded documents
- Signature images/logos
- Template assets
- Any file uploaded through Helios UI

**Google Drive Proxy (External Asset Management):**
- View/browse files in customer's Shared Drive
- Manage external sharing permissions
- Generate embeddable links for signatures
- Audit external sharing

### Why Split?

1. **Performance:** MinIO is local/fast, Drive API has quotas and latency
2. **Independence:** App works without Google connection
3. **Security:** Sensitive internal files don't touch Google
4. **Reliability:** No dependency on Google API availability

### Google External Sharing Pain Points (from research)

| Pain Point | Helios Solution |
|------------|-----------------|
| Limited visibility into external sharing | Dashboard showing all externally shared files |
| DLP can't prevent personal account sharing | Detect and alert on personal account shares |
| Hard to know where sensitive data is exposed | Scan and classify shared files |
| Non-Google users can't access easily | Generate direct embeddable URLs via proxy |
| Overexposed data risk | Bulk revoke external access tools |
| Human error in sharing settings | Policy enforcement and alerts |

### Proposed Feature: External Sharing Manager

```
┌─────────────────────────────────────────────────────────────┐
│  External Sharing Manager                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Overview                           Actions                 │
│  ┌─────────────────────┐           ┌──────────────────────┐│
│  │ 847 files shared    │           │ Audit All Shares     ││
│  │ externally          │           │ Bulk Revoke Access   ││
│  │                     │           │ Set Sharing Policies ││
│  │ 23 shared with      │           │ Export Report        ││
│  │ personal accounts   │           └──────────────────────┘│
│  └─────────────────────┘                                   │
│                                                             │
│  Risk Level              Shared With                        │
│  ⬤ High Risk: 12 files   ⬤ External domains: 156          │
│  ⬤ Medium: 89 files      ⬤ Personal accounts: 23          │
│  ⬤ Low: 746 files        ⬤ Anyone with link: 47           │
│                                                             │
│  Recent External Shares                                     │
│  ┌────────────────────────────────────────────────────────┐│
│  │ File                    Shared With         By    When ││
│  │ Q4_Financials.xlsx      john@gmail.com      Sarah 2h   ││
│  │ Contract_Draft.docx     external@other.com  Mike  5h   ││
│  │ Product_Roadmap.pdf     Anyone with link    Tom   1d   ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Issue 6: Microsoft 365 Integration

### Required Credentials

| Field | Description | Where to Find |
|-------|-------------|---------------|
| Tenant ID | Your Azure AD tenant identifier | Azure Portal > Azure AD > Overview |
| Client ID | Application (client) ID | Azure Portal > App Registrations > Your App |
| Client Secret | Application password | Azure Portal > App Registrations > Certificates & secrets |

**Note:** Subscription ID is NOT needed for Graph API - that's for Azure resources.

### App Registration Steps

1. **Go to Azure Portal** → Azure Active Directory → App registrations
2. **New registration:**
   - Name: "Helios Admin Portal"
   - Supported account types: "Single tenant" (your org only)
   - Redirect URI: `https://your-helios-domain.com/api/v1/microsoft/callback`
3. **API Permissions** → Add permissions:
   - Microsoft Graph (Application permissions):
     - `User.Read.All` - Read all users
     - `User.ReadWrite.All` - Create/update users
     - `Group.Read.All` - Read all groups
     - `Group.ReadWrite.All` - Create/update groups
     - `Directory.Read.All` - Read directory data
4. **Grant admin consent** for your organization
5. **Create client secret** → Copy immediately (shown only once)

### Implementation Checklist

- [ ] Create Microsoft module UI (similar to Google Workspace)
- [ ] Implement OAuth callback route
- [ ] Create Microsoft Graph API service
- [ ] Implement user sync from Entra ID
- [ ] Implement group sync
- [ ] Add license usage tracking
- [ ] Create setup wizard with validation

### Microsoft Setup Wizard UX

```
┌─────────────────────────────────────────────────────────────┐
│  Connect Microsoft 365                              Step 1/3│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Enter your Azure AD App Registration details               │
│                                                             │
│  Tenant ID                                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx                    ││
│  └─────────────────────────────────────────────────────────┘│
│  Found in: Azure Portal > Azure AD > Overview               │
│                                                             │
│  Client ID (Application ID)                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx                    ││
│  └─────────────────────────────────────────────────────────┘│
│  Found in: Azure Portal > App Registrations > Your App      │
│                                                             │
│  Client Secret                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ••••••••••••••••••••••••••••••••••••                    ││
│  └─────────────────────────────────────────────────────────┘│
│  Created in: App Registration > Certificates & secrets      │
│                                                             │
│  ⚠️ Secret expires in 6 months. Set a reminder to rotate.  │
│                                                             │
│  [Test Connection]                        [Back] [Continue] │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Critical Bug Fixes (Immediate)
**Estimated: 1-2 days**

1. Fix nginx SPA routing for page refresh
2. Fix dashboard error handling (show errors, not spinner)
3. Fix Add User form submission
4. Fix template creation
5. Add cache-busting for HTML files
6. Fix Quick Actions click handlers

### Phase 2: Dashboard & UX Polish
**Estimated: 2-3 days**

1. Fix widget persistence (verify database writes)
2. Improve loading states with timeouts
3. Add retry buttons for failed loads
4. Multiple template support verification
5. User feedback for all actions (success/error toasts)

### Phase 3: Microsoft 365 Integration
**Estimated: 5-7 days**

1. Microsoft module UI scaffolding
2. OAuth flow implementation
3. Graph API service (users, groups, licenses)
4. Sync service
5. Setup wizard
6. Documentation guide

### Phase 4: Google External Sharing Manager
**Estimated: 7-10 days**

1. Drive API integration for shared file discovery
2. External sharing audit endpoint
3. Sharing policies enforcement
4. Bulk revoke functionality
5. Risk classification
6. Reporting/export

### Phase 5: Storage Cleanup
**Estimated: 2-3 days**

1. Finalize MinIO as primary storage
2. Google Drive proxy for signature images only
3. Remove any hybrid storage confusion
4. Update documentation

---

## Success Criteria

1. ✅ Page refresh on any route works (no 500 errors)
2. ✅ Dashboard loads within 3 seconds or shows error
3. ✅ Add User creates a user successfully
4. ✅ Multiple templates can be created and used
5. ✅ Dashboard customization persists across sessions
6. ✅ Quick actions navigate to correct pages
7. ✅ Microsoft 365 can be connected via setup wizard
8. ✅ External sharing visible and manageable

---

## Sources

### Google External Sharing Research
- [Google Workspace DLP Limitations](https://www.docontrol.io/blog/pain-point-2-google-workspace-dlp-capabilities-are-limited)
- [Google Workspace Security Features 2025](https://material.security/workspace-resources/google-workspace-security-features-what-to-turn-on-first-2025)
- [Manage External Sharing - Google Help](https://support.google.com/a/answer/60781?hl=en)
- [Google Workspace Security Risks 2025](https://spin.ai/blog/google-workspace-security-top-risks/)

### Microsoft 365 Integration Research
- [Register App with Microsoft Identity Platform](https://learn.microsoft.com/en-us/graph/auth-register-app-v2)
- [Get Access Without a User - Graph API](https://learn.microsoft.com/en-us/graph/auth-v2-service)
- [Create App Registration in Entra ID](https://www.sharepointdiary.com/2023/10/create-app-registration-in-entra-id-step-by-step.html)
- [OAuth 2.0 Client Credentials for Graph API](https://aembit.io/blog/authenticate-to-microsoft-graph-api-using-oauth-2-0-client-credentials/)
