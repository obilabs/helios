# Helios API Proxy Documentation

**Version:** 1.0.0
**Last Updated:** November 1, 2025

---

## 🎯 Overview

Helios provides transparent proxy access to Google Workspace and Microsoft 365 APIs with:
- ✅ Full audit trail for every request
- ✅ Actor attribution (user/service/vendor)
- ✅ Intelligent sync to Helios database
- ✅ Rate limiting and security

---

## 🔑 Authentication

All proxy requests require Helios authentication:

```bash
curl https://helios.company.com/api/google/admin/directory/v1/users \
  -H "Authorization: Bearer YOUR_HELIOS_TOKEN"
```

### Get Your Token:

**Option 1: User Token (From UI)**
1. Login to Helios UI
2. Open browser console
3. Run: `localStorage.getItem('helios_token')`

**Option 2: Service API Key (For Automation)**
1. Go to Settings > API Keys
2. Create "Service" key
3. Use returned key: `helios_service_abc123...`

**Option 3: Vendor API Key (For MSPs)**
1. Create "Vendor" key in Settings > API Keys
2. Must include actor headers:
   ```bash
   -H "X-Actor-Name: John Smith" \
   -H "X-Actor-Email: john.smith@msp.com"
   ```

---

## 🌐 Google Workspace APIs

### URL Format:
```
https://helios.company.com/api/google/{google-api-path}
```

### Examples:

#### List Users
```bash
curl https://helios.company.com/api/google/admin/directory/v1/users?maxResults=100 \
  -H "Authorization: Bearer $HELIOS_TOKEN"
```

#### Create User
```bash
curl -X POST https://helios.company.com/api/google/admin/directory/v1/users \
  -H "Authorization: Bearer $HELIOS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "primaryEmail": "newuser@company.com",
    "name": {
      "givenName": "New",
      "familyName": "User"
    },
    "password": "TempPassword123!",
    "orgUnitPath": "/Engineering"
  }'
```

#### Delete User (Permanently)
```bash
curl -X DELETE https://helios.company.com/api/google/admin/directory/v1/users/user@company.com \
  -H "Authorization: Bearer $HELIOS_TOKEN"
```

#### Suspend User
```bash
curl -X PATCH https://helios.company.com/api/google/admin/directory/v1/users/user@company.com \
  -H "Authorization: Bearer $HELIOS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "suspended": true }'
```

#### Add Email Delegate
```bash
curl -X POST https://helios.company.com/api/google/gmail/v1/users/user@company.com/settings/delegates \
  -H "Authorization: Bearer $HELIOS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "delegateEmail": "assistant@company.com" }'
```

#### List Groups
```bash
curl https://helios.company.com/api/google/admin/directory/v1/groups?domain=company.com \
  -H "Authorization: Bearer $HELIOS_TOKEN"
```

#### Add Member to Group
```bash
curl -X POST https://helios.company.com/api/google/admin/directory/v1/groups/group@company.com/members \
  -H "Authorization: Bearer $HELIOS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "email": "user@company.com", "role": "MEMBER" }'
```

### Full API Reference:
- [Google Admin SDK Directory API](https://developers.google.com/admin-sdk/directory/reference/rest)
- [Gmail API](https://developers.google.com/gmail/api/reference/rest)
- [Calendar API](https://developers.google.com/calendar/api/v3/reference)

---

## 📊 Audit Trail

Every proxied request creates an audit log entry:

```sql
SELECT
  actor_email,
  action,
  details->>'path' as api_path,
  details->>'method' as http_method,
  details->>'statusCode' as status_code,
  details->>'durationMs' as duration_ms,
  created_at
FROM activity_logs
WHERE action LIKE 'google_api_%'
ORDER BY created_at DESC;
```

---

## 🔐 Actor Attribution

### User Requests:
```
Actor Type: user
Actor Email: jane.doe@company.com
Actor Name: Jane Doe
```

### Service API Key Requests:
```
Actor Type: service
Service Name: Terraform Automation
Service Owner: devops@company.com
```

### Vendor API Key Requests:
```
Actor Type: vendor
Vendor Name: Acme IT Services
Actor Name: John Smith (from X-Actor-Name header)
Actor Email: john.smith@acmeit.com (from X-Actor-Email header)
```

---

## 🧠 Intelligent Sync

Helios automatically syncs relevant API responses to its database:

### Synced Resources:
- **Users:** Synced to `organization_users`
- **Groups:** Synced to `access_groups`
- **Org Units:** Synced to internal cache

### Not Synced (Log Only):
- Calendar events
- Drive files
- Email messages

---

## 🚫 Limitations

### Cannot Proxy:
- OAuth consent flows (use Google's OAuth directly)
- File uploads to Drive (use Google's resumable upload)
- Real-time APIs (Cloud Pub/Sub)

### Rate Limits:
Helios inherits Google's rate limits:
- Admin SDK: 1,500 queries per 100 seconds
- Gmail API: 250 quota units per user per second

---

## 💡 Best Practices

### 1. Use the UI for Common Operations
If Helios has a UI for it, use the UI:
- Creating users
- Managing groups
- Setting delegates

UI provides:
- Validation
- Better error messages
- Guided workflows

### 2. Use the API for Advanced/Automated Operations
If UI doesn't exist or you're scripting:
- Use the proxy API
- Follow Google's API documentation
- Test with small batches first

### 3. Use Service Keys for Automation
For Terraform, Ansible, scripts:
- Create service API key
- Store securely
- Rotate regularly

### 4. Use Vendor Keys for MSP Access
When MSPs manage your Helios:
- Create vendor API key
- Require actor attribution
- Review audit logs regularly

---

## 📞 Support

- **API Issues:** Check audit logs for detailed error messages
- **Google API Questions:** Refer to Google's documentation
- **Helios-Specific Questions:** See `/api/docs` (Swagger UI)

---

## 🔗 Additional Resources

- [Google Workspace Admin SDK](https://developers.google.com/admin-sdk)
- [Microsoft Graph API](https://docs.microsoft.com/graph)
- [Helios OpenAPI Spec](http://localhost:3001/api/docs)

---

**Questions? Feature requests? Open an issue on GitHub.**
