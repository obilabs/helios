#!/bin/bash

# Login and get token
echo "Logging in..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "testproxy@gridwrx.io", "password": "password123"}')

TOKEN=$(echo $RESPONSE | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

echo "Token: ${TOKEN:0:50}..."

# Test API call with status=all, userType=staff
echo ""
echo "=== Test 1: status=all, userType=staff ==="
curl -s -X GET "http://localhost:3001/api/organization/users?status=all&userType=staff" \
  -H "Authorization: Bearer $TOKEN" | head -100

echo ""
echo ""
echo "=== Test 2: status=active, userType=staff ==="
curl -s -X GET "http://localhost:3001/api/organization/users?status=active&userType=staff" \
  -H "Authorization: Bearer $TOKEN" | head -100
