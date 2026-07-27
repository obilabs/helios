# Quick Test Guide - Transparent Proxy

## 🚀 Fast 2-Minute Test

### Step 1: Get Token from UI

1. Open browser: http://localhost:3000
2. Login with: `mike@obilabs.dev` (your password)
3. Press F12 to open browser console
4. Run this command in console:
   ```javascript
   localStorage.getItem('helios_token')
   ```
5. Copy the token (starts with `eyJ...`)

### Step 2: Test Proxy (Windows PowerShell)

Open PowerShell and run:

```powershell
# Set your token
$TOKEN = "PASTE_YOUR_TOKEN_HERE"

# Test 1: List users via proxy
$Headers = @{ Authorization = "Bearer $TOKEN" }
Invoke-RestMethod -Uri "http://localhost:3001/api/google/admin/directory/v1/users?maxResults=5" -Headers $Headers

# If that works, you'll see Google Workspace users!
```

### Step 3: Check Results

**If Google Workspace is configured:**
- You'll see a list of users with emails, names, Google IDs
- This proves the transparent proxy works!

**If NOT configured:**
- You'll see: "Google Workspace not configured for this organization"
- That's OK - the proxy is working, just need to configure Google

---

## ✅ What Success Looks Like

```powershell
PS> Invoke-RestMethod -Uri "http://localhost:3001/api/google/admin/directory/v1/users?maxResults=5" -Headers $Headers

kind  : admin#directory#users
users : {@{id=123456789; primaryEmail=mike@obilabs.dev; name=...}, ...}
```

---

## 🎯 Quick Yes/No Questions

After testing, can you answer:

1. **Did Swagger UI load at http://localhost:3001/api/docs?**
   - YES → ✅ OpenAPI working
   - NO → Need to debug

2. **Did you get a token from the UI successfully?**
   - YES → ✅ Auth working
   - NO → Need to login first

3. **Did the proxy request return Google Workspace data?**
   - YES → ✅ Transparent proxy working!
   - NO → Check error message

4. **Did you see audit logs in database?**
   - YES → ✅ Audit trail working!
   - NO → Check SQL query

---

Let me know the results and we'll proceed from there!
