#!/bin/bash
echo "=== Testing Security Events API ==="

echo "1. Login..."
LOGIN_RESPONSE=$(curl -s http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jack@gridworx.io","password":"Password123!"}')

echo "$LOGIN_RESPONSE" | head -3

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to get token"
  exit 1
fi

echo "Token: ${TOKEN:0:30}..."

echo ""
echo "2. Testing /api/organization/security-events..."
curl -s http://localhost:3001/api/organization/security-events \
  -H "Authorization: Bearer $TOKEN" | head -10
