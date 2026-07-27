# Transparent Proxy Guide - Helios Developer Console

## Overview

Helios provides **two ways** to interact with Google Workspace APIs:

### 1. **Transparent Proxy** (Recommended) ⭐
Direct access to ANY Google Workspace API through Helios proxy.

**Benefits:**
- ✅ Full audit trail (activity logs)
- ✅ Actor attribution (who made the change)
- ✅ Automatic database sync (changes reflected in Helios)
- ✅ Access to ALL Google APIs (not just what Helios wraps)
- ✅ Future-proof (new Google APIs work immediately)

**Path Pattern:** `/api/google/<google-api-path>`

**Example:**
```bash
# Call Google Admin Directory API directly
helios api POST /api/google/admin/directory/v1/users '{"primaryEmail":"user@company.com","name":{"givenName":"John","familyName":"Doe"},"password":"TempPass123!"}'

# Get user details
helios api GET /api/google/admin/directory/v1/users/user@company.com

# Update group
helios api PATCH /api/google/admin/directory/v1/groups/group@company.com '{"name":"New Group Name"}'
```

### 2. **Helios Helper Endpoints** (Convenience)
Pre-built endpoints for common operations.

**Benefits:**
- ✅ Simplified syntax (no JSON required)
- ✅ Validation and error handling
- ✅ Cached data (faster for list operations)

**Path Pattern:** `/api/google-workspace/<resource>`

**Example:**
```bash
# List cached users (fast, from Helios DB)
helios gw users list

# Sync and cache users from Google
helios gw sync users

# Get organization stats
helios api GET /api/google-workspace/organization-stats/{organizationId}
```

---

## When to Use Which?

### Use Transparent Proxy When:
- ✅ You need audit logging for compliance
- ✅ You want changes to automatically sync to Helios DB
- ✅ You're accessing APIs not wrapped by Helios
- ✅ You need access to ALL Google API features
- ✅ You're building integrations or scripts

### Use Helper Endpoints When:
- ✅ You want to list cached data quickly
- ✅ You're triggering manual syncs
- ✅ You're checking Helios-specific stats

---

## Transparent Proxy Examples

### User Management

```bash
# List all users (direct from Google)
helios api GET /api/google/admin/directory/v1/users?customer=my_customer&maxResults=500

# Get specific user
helios api GET /api/google/admin/directory/v1/users/john.doe@company.com

# Create user
helios api POST /api/google/admin/directory/v1/users '{
  "primaryEmail": "john.doe@company.com",
  "name": {
    "givenName": "John",
    "familyName": "Doe"
  },
  "password": "TempPass123!",
  "orgUnitPath": "/Staff",
  "changePasswordAtNextLogin": true
}'

# Update user
helios api PATCH /api/google/admin/directory/v1/users/john.doe@company.com '{
  "name": {
    "givenName": "Jonathan"
  }
}'

# Suspend user
helios api PATCH /api/google/admin/directory/v1/users/john.doe@company.com '{
  "suspended": true
}'

# Delete user
helios api DELETE /api/google/admin/directory/v1/users/john.doe@company.com
```

### Group Management

```bash
# List all groups
helios api GET /api/google/admin/directory/v1/groups?customer=my_customer

# Get group details
helios api GET /api/google/admin/directory/v1/groups/sales@company.com

# Create group
helios api POST /api/google/admin/directory/v1/groups '{
  "email": "sales@company.com",
  "name": "Sales Team",
  "description": "Sales department group"
}'

# Update group
helios api PATCH /api/google/admin/directory/v1/groups/sales@company.com '{
  "name": "Sales Team - Updated",
  "description": "New description"
}'

# Delete group
helios api DELETE /api/google/admin/directory/v1/groups/sales@company.com

# List group members
helios api GET /api/google/admin/directory/v1/groups/sales@company.com/members

# Add member to group
helios api POST /api/google/admin/directory/v1/groups/sales@company.com/members '{
  "email": "john.doe@company.com",
  "role": "MEMBER"
}'

# Remove member from group
helios api DELETE /api/google/admin/directory/v1/groups/sales@company.com/members/john.doe@company.com
```

### Organizational Units

```bash
# List all OUs
helios api GET /api/google/admin/directory/v1/customer/my_customer/orgunits?type=all

# Get specific OU
helios api GET /api/google/admin/directory/v1/customer/my_customer/orgunits/Staff/Sales

# Create OU
helios api POST /api/google/admin/directory/v1/customer/my_customer/orgunits '{
  "name": "Engineering",
  "parentOrgUnitPath": "/Staff",
  "description": "Engineering team"
}'

# Update OU
helios api PUT /api/google/admin/directory/v1/customer/my_customer/orgunits/Staff/Engineering '{
  "name": "Engineering Department"
}'

# Delete OU
helios api DELETE /api/google/admin/directory/v1/customer/my_customer/orgunits/Staff/Engineering
```

### Email Delegation (Gmail API)

```bash
# List delegates for user
helios api GET /api/google/gmail/v1/users/manager@company.com/settings/delegates

# Add delegate
helios api POST /api/google/gmail/v1/users/manager@company.com/settings/delegates '{
  "delegateEmail": "assistant@company.com"
}'

# Remove delegate
helios api DELETE /api/google/gmail/v1/users/manager@company.com/settings/delegates/assistant@company.com
```

### Calendar Resources

```bash
# List calendar resources
helios api GET /api/google/admin/directory/v1/customer/my_customer/resources/calendars

# Create calendar resource
helios api POST /api/google/admin/directory/v1/customer/my_customer/resources/calendars '{
  "resourceId": "conference-room-1",
  "resourceName": "Conference Room 1",
  "resourceType": "Conference Room",
  "capacity": 10
}'
```

### Chrome OS Devices

```bash
# List Chrome devices
helios api GET /api/google/admin/directory/v1/customer/my_customer/devices/chromeos

# Get specific device
helios api GET /api/google/admin/directory/v1/customer/my_customer/devices/chromeos/{deviceId}
```

### Mobile Devices

```bash
# List mobile devices
helios api GET /api/google/admin/directory/v1/customer/my_customer/devices/mobile

# Get specific device
helios api GET /api/google/admin/directory/v1/customer/my_customer/devices/mobile/{resourceId}
```

---

## Architecture: How It Works

### Transparent Proxy Flow

```
┌──────────────┐
│ Developer    │
│ Console CLI  │
└──────┬───────┘
       │ helios api POST /api/google/admin/directory/v1/users
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Helios Backend                                           │
│                                                          │
│  1. ✅ Authenticate user (JWT or API key)                │
│  2. ✅ Extract actor info (user/service/vendor)          │
│  3. ✅ Create audit log entry (START)                    │
│  4. ✅ Get Google credentials from database              │
│  5. ✅ Proxy request to Google API                       │
│  6. ✅ Intelligent sync to Helios DB (if applicable)     │
│  7. ✅ Update audit log entry (SUCCESS/FAILURE)          │
│  8. ✅ Return Google's response to client                │
│                                                          │
└───────────────────┬──────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Google Workspace API │
         │ (googleapis.com)     │
         └──────────────────────┘
```

### What Gets Synced Automatically?

The transparent proxy includes **intelligent sync**:

| Resource | Action | Sync Behavior |
|----------|--------|---------------|
| **Users** | CREATE | Insert into `organization_users` |
| **Users** | UPDATE | Update `organization_users` |
| **Users** | DELETE | Mark as deleted in `organization_users` |
| **Users** | LIST | Upsert all users in `organization_users` |
| **Groups** | CREATE | Insert into `access_groups` |
| **Groups** | DELETE | Remove from `access_groups` |
| **OrgUnits** | (any) | Not yet synced (future) |

**Location in code:** `backend/src/middleware/transparent-proxy.ts:464-750`

---

## Audit Trail

Every transparent proxy call creates an audit log entry:

```sql
SELECT
  action,
  description,
  metadata->>'method' as method,
  metadata->>'path' as path,
  metadata->>'actor'->>'type' as actor_type,
  metadata->>'actor'->>'name' as actor_name,
  metadata->>'status' as status,
  metadata->>'statusCode' as status_code,
  created_at
FROM activity_logs
WHERE resource_type = 'google_api'
ORDER BY created_at DESC;
```

**Example log entry:**
```json
{
  "action": "google_api_post",
  "resource_type": "google_api",
  "resource_id": "admin/directory/v1/users",
  "description": "POST admin/directory/v1/users via user (John Doe)",
  "metadata": {
    "method": "POST",
    "path": "admin/directory/v1/users",
    "body": { ... },
    "actor": {
      "type": "user",
      "name": "John Doe",
      "email": "john@company.com"
    },
    "status": "success",
    "statusCode": 200,
    "durationMs": 342
  }
}
```

---

## Helper Endpoints Reference

These are convenience wrappers around common operations:

### User Operations
```
GET    /api/google-workspace/users?organizationId={id}&domain={domain}
GET    /api/google-workspace/cached-users/{organizationId}
POST   /api/google-workspace/sync-now
```

### Group Operations
```
GET    /api/google-workspace/groups/{organizationId}
POST   /api/google-workspace/groups
PATCH  /api/google-workspace/groups/{groupId}
GET    /api/google-workspace/groups/{groupId}/members
POST   /api/google-workspace/groups/{groupId}/members
DELETE /api/google-workspace/groups/{groupId}/members/{email}
POST   /api/google-workspace/sync-groups
```

### Organizational Units
```
GET    /api/google-workspace/org-units/{organizationId}
POST   /api/google-workspace/sync-org-units
```

### Module Management
```
POST   /api/google-workspace/setup
POST   /api/google-workspace/test-connection
GET    /api/google-workspace/module-status/{organizationId}
POST   /api/google-workspace/disable/{organizationId}
```

---

## Best Practices

### ✅ DO:
- Use transparent proxy for all write operations (audit trail)
- Use helper endpoints for cached list operations (performance)
- Use transparent proxy for accessing new Google APIs
- Review audit logs regularly for compliance

### ❌ DON'T:
- Don't bypass the proxy for Google API calls (loses audit trail)
- Don't use helper endpoints for operations requiring audit logs
- Don't forget to URL-encode email addresses with special characters

---

## Complete Google Workspace API Reference

The transparent proxy gives you access to **ALL Google Workspace Admin APIs**:

- **Admin Directory API**: Users, Groups, OrgUnits, Domains, Roles, Schemas
- **Gmail API**: Settings, Delegates, Filters, Forwarding, Vacation
- **Calendar API**: Calendar resources, Events, ACLs
- **Drive API**: Drives, Files, Permissions
- **Reports API**: Usage reports, Admin activity
- **Chrome API**: Chrome devices, Browser settings
- **Mobile API**: Mobile device management
- **Licensing API**: License assignments
- **Data Transfer API**: Data ownership transfer

**Full documentation:** https://developers.google.com/workspace/products

---

## Authentication

All transparent proxy calls use:
1. **Your JWT token** from localStorage (for user attribution)
2. **Organization's service account** (from `gw_credentials` table)
3. **Domain-Wide Delegation** (impersonating admin user)

This means:
- ✅ You don't need to manage Google credentials
- ✅ Calls are attributed to your user account
- ✅ Audit logs show who made each change
- ✅ API keys (Service/Vendor) also supported

---

## Error Handling

The proxy returns Google's error messages directly:

```bash
# Example error
Error: {
  "error": {
    "code": 409,
    "message": "Entity already exists.",
    "errors": [{
      "message": "Entity already exists.",
      "domain": "global",
      "reason": "duplicate"
    }]
  }
}
```

Common error codes:
- `400` - Invalid request (check JSON syntax)
- `403` - Insufficient permissions (check service account scopes)
- `404` - Resource not found (check email/ID)
- `409` - Conflict (resource already exists)
- `429` - Rate limit exceeded (automatic retry)
- `500` - Google API error (retry later)

---

## Performance Considerations

### Transparent Proxy
- **Latency**: ~200-500ms (proxy overhead + Google API)
- **Rate Limits**: Google's standard limits apply
- **Caching**: No caching (always fresh data)
- **Best for**: Write operations, real-time data

### Helper Endpoints (Cached)
- **Latency**: ~50-100ms (database query)
- **Rate Limits**: No limits (local database)
- **Caching**: Updated during sync operations
- **Best for**: List operations, dashboards

---

## Future Enhancements

### Planned Features:
- [ ] Batch operations (multiple API calls in one request)
- [ ] Dry-run mode (preview changes without executing)
- [ ] Rate limit management (automatic throttling)
- [ ] Response caching (configurable TTL)
- [ ] Webhook notifications (for important changes)
- [ ] Change rollback (undo operations)

---

## Support

For Google Workspace API documentation:
- https://developers.google.com/workspace/products

For Helios transparent proxy issues:
- Check audit logs: Settings > Audit Logs
- Review backend logs: `docker logs helios_client_backend`
- Test connection: `helios api GET /api/google-workspace/module-status/{orgId}`
