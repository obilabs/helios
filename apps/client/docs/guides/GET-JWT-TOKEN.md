# Get JWT Token for Testing

## Quick Method: Login via API

Run this in PowerShell (update password):

```powershell
$LoginBody = @{
    email = "mike@gridworx.io"
    password = "YOUR_PASSWORD_HERE"
} | ConvertTo-Json

$Response = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $LoginBody -ContentType "application/json"

# Show token
$Response.token

# Save to variable
$TOKEN = $Response.token

# Test proxy
$Headers = @{ Authorization = "Bearer $TOKEN" }
Invoke-RestMethod -Uri "http://localhost:3001/api/google/admin/directory/v1/users?maxResults=5" -Headers $Headers
```

Or use curl (bash):

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"mike@gridworx.io","password":"YOUR_PASSWORD"}'

# Copy the "token" value from response

# Test proxy (replace YOUR_TOKEN)
curl http://localhost:3001/api/google/admin/directory/v1/users?maxResults=5 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Why Not API Key?

The transparent proxy currently uses JWT authentication only.

API keys work with X-API-Key header, but the proxy route is configured for JWT Bearer tokens.

We can fix this later to support both, but for now, use JWT token from login.
