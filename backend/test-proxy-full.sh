#!/bin/bash

# Test Transparent Proxy - Full Workflow
# This script logs in, gets a token, and tests the transparent proxy

HELIOS_API="http://localhost:3001"

echo "============================================================"
echo "🧪 TRANSPARENT PROXY TEST - FULL WORKFLOW"
echo "============================================================"
echo ""

# Step 1: Login and get token
echo "Step 1: Login to get auth token"
echo "------------------------------------------------------------"

# Use test credentials - update these if needed
LOGIN_EMAIL="mike@gridworx.io"
LOGIN_PASSWORD="your_password_here"

echo "Attempting login as: $LOGIN_EMAIL"

LOGIN_RESPONSE=$(curl -s -X POST "$HELIOS_API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}")

# Extract token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | sed 's/"token":"//')

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  echo ""
  echo "Please update LOGIN_PASSWORD in this script with the correct password"
  exit 1
fi

echo "✅ Login successful!"
echo "Token: ${TOKEN:0:30}..."
echo ""

# Step 2: Test health check
echo "Step 2: Test health check"
echo "------------------------------------------------------------"
curl -s "$HELIOS_API/health"
echo ""
echo ""

# Step 3: Test transparent proxy - List Users
echo "Step 3: Test Transparent Proxy - List Google Workspace Users"
echo "------------------------------------------------------------"
echo "Calling: GET /api/google/admin/directory/v1/users?maxResults=5"
echo ""

USERS_RESPONSE=$(curl -s "$HELIOS_API/api/google/admin/directory/v1/users?maxResults=5" \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$USERS_RESPONSE" | head -50
echo ""
echo ""

# Step 4: Test proxy - Get specific user
echo "Step 4: Test Proxy - Get Specific User"
echo "------------------------------------------------------------"
echo "Calling: GET /api/google/admin/directory/v1/users/$LOGIN_EMAIL"
echo ""

USER_RESPONSE=$(curl -s "$HELIOS_API/api/google/admin/directory/v1/users/$LOGIN_EMAIL" \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$USER_RESPONSE" | head -30
echo ""
echo ""

# Step 5: Test proxy - Unknown endpoint (Gmail)
echo "Step 5: Test Proxy - Unknown Endpoint (Gmail Settings)"
echo "------------------------------------------------------------"
echo "Calling: GET /api/google/gmail/v1/users/me/settings/sendAs"
echo ""

GMAIL_RESPONSE=$(curl -s "$HELIOS_API/api/google/gmail/v1/users/me/settings/sendAs" \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$GMAIL_RESPONSE" | head -30
echo ""
echo ""

# Summary
echo "============================================================"
echo "📊 TEST SUMMARY"
echo "============================================================"
echo ""
echo "✅ If you see user data above:"
echo "   - Transparent proxy is working"
echo "   - Requests are proxied to Google Workspace"
echo "   - Responses are returned correctly"
echo ""
echo "📋 Next: Check database for audit logs and synced data"
echo ""
echo "Run these SQL queries:"
echo ""
echo "1. Check audit logs:"
echo "   SELECT action, actor_email, details->>'path', created_at"
echo "   FROM activity_logs WHERE action LIKE 'google_api_%'"
echo "   ORDER BY created_at DESC LIMIT 5;"
echo ""
echo "2. Check synced users:"
echo "   SELECT email, google_workspace_id, updated_at"
echo "   FROM organization_users"
echo "   WHERE updated_at > NOW() - INTERVAL '5 minutes';"
echo ""
echo "============================================================"
