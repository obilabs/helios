# Test Transparent Proxy - PowerShell Version

$HELIOS_API = "http://localhost:3001"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🧪 TRANSPARENT PROXY TEST - FULL WORKFLOW" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login
Write-Host "Step 1: Login to get auth token" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"

$LoginEmail = "mike@gridworx.io"
Write-Host "Enter password for $LoginEmail : " -NoNewline
$LoginPassword = Read-Host -AsSecureString
$LoginPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($LoginPassword))

$LoginBody = @{
    email = $LoginEmail
    password = $LoginPasswordPlain
} | ConvertTo-Json

try {
    $LoginResponse = Invoke-RestMethod -Uri "$HELIOS_API/api/auth/login" -Method Post -Body $LoginBody -ContentType "application/json"
    $Token = $LoginResponse.token

    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "Token: $($Token.Substring(0,30))..." -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Login failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# Step 2: Test health check
Write-Host "Step 2: Test health check" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
$Health = Invoke-RestMethod -Uri "$HELIOS_API/health"
Write-Host ($Health | ConvertTo-Json)
Write-Host ""

# Step 3: Test transparent proxy - List Users
Write-Host "Step 3: Test Transparent Proxy - List Google Workspace Users" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
Write-Host "Calling: GET /api/google/admin/directory/v1/users?maxResults=5"
Write-Host ""

$Headers = @{
    Authorization = "Bearer $Token"
}

try {
    $UsersResponse = Invoke-RestMethod -Uri "$HELIOS_API/api/google/admin/directory/v1/users?maxResults=5" -Headers $Headers

    Write-Host "✅ SUCCESS - Proxy returned Google Workspace data!" -ForegroundColor Green

    if ($UsersResponse.users) {
        Write-Host "Users returned: $($UsersResponse.users.Count)" -ForegroundColor Green
        Write-Host ""
        Write-Host "First few users:" -ForegroundColor Cyan
        $UsersResponse.users | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - $($_.primaryEmail) ($($_.name.fullName))" -ForegroundColor Gray
        }
    }
    Write-Host ""
} catch {
    Write-Host "❌ Proxy request failed" -ForegroundColor Red
    Write-Host $_.Exception.Message

    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    Write-Host ""
}

# Step 4: Test proxy - Get specific user
Write-Host "Step 4: Test Proxy - Get Specific User" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
Write-Host "Calling: GET /api/google/admin/directory/v1/users/$LoginEmail"
Write-Host ""

try {
    $UserResponse = Invoke-RestMethod -Uri "$HELIOS_API/api/google/admin/directory/v1/users/$LoginEmail" -Headers $Headers

    Write-Host "✅ SUCCESS - Got user details!" -ForegroundColor Green
    Write-Host "Email: $($UserResponse.primaryEmail)" -ForegroundColor Gray
    Write-Host "Name: $($UserResponse.name.fullName)" -ForegroundColor Gray
    Write-Host "Google ID: $($UserResponse.id)" -ForegroundColor Gray
    Write-Host "Suspended: $($UserResponse.suspended)" -ForegroundColor Gray
    Write-Host "OU Path: $($UserResponse.orgUnitPath)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "⚠️  User not found in Google Workspace (may be local-only user)" -ForegroundColor Yellow
    Write-Host ""
}

# Summary
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "📊 TEST SUMMARY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Tests completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Check Swagger UI in browser:" -ForegroundColor White
Write-Host "   http://localhost:3001/api/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Check audit logs in database:" -ForegroundColor White
Write-Host '   docker exec helios_client_postgres psql -U postgres -d helios_client -c "SELECT action, actor_email, created_at FROM activity_logs WHERE action LIKE '"'"'google_api_%'"'"' ORDER BY created_at DESC LIMIT 5;"' -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Check synced users:" -ForegroundColor White
Write-Host '   docker exec helios_client_postgres psql -U postgres -d helios_client -c "SELECT email, google_workspace_id, platforms FROM organization_users WHERE google_workspace_id IS NOT NULL LIMIT 5;"' -ForegroundColor Cyan
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
