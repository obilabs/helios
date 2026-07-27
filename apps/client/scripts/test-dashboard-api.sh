#!/bin/bash
# Test the dashboard API endpoints

echo "=== Testing Dashboard API ==="
echo ""

echo "1. Login to get token..."
LOGIN_RESPONSE=$(curl -s http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jack@gridworx.io","password":"Password123!"}')

echo "$LOGIN_RESPONSE" | head -3

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to get token"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "Token obtained: ${TOKEN:0:30}..."
echo ""

echo "2. Testing /api/dashboard/widgets endpoint..."
WIDGETS_RESPONSE=$(curl -s http://localhost:3001/api/dashboard/widgets \
  -H "Authorization: Bearer $TOKEN")

echo "$WIDGETS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$WIDGETS_RESPONSE"
echo ""

echo "3. Testing /api/dashboard/stats endpoint..."
STATS_RESPONSE=$(curl -s http://localhost:3001/api/dashboard/stats \
  -H "Authorization: Bearer $TOKEN")

echo "$STATS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATS_RESPONSE"
