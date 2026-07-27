#!/bin/bash
echo "=== Testing Google Workspace Sync ==="

echo "1. Login..."
LOGIN_RESPONSE=$(curl -s http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jack@gridworx.io","password":"Password123!"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to get token"
  exit 1
fi

echo "Token: ${TOKEN:0:30}..."

echo ""
echo "2. Triggering manual Google Workspace sync..."
SYNC_RESPONSE=$(curl -s -X POST http://localhost:3001/api/modules/google-workspace/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$SYNC_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$SYNC_RESPONSE"

echo ""
echo "3. Checking for manager relationships after sync..."
sleep 5
