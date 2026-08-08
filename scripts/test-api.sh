#!/bin/bash

# Login and get token
echo "Logging in..."
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jack@gridwrx.io","password":"P@ssw0rd123!"}' \
  | jq -r '.data.token')

echo "Token: ${TOKEN:0:20}..."

# Test user preferences endpoint
echo -e "\n\nTesting GET /api/user-preferences..."
curl -v http://localhost:3001/api/user-preferences \
  -H "Authorization: Bearer $TOKEN" \
  2>&1

echo -e "\n\nTesting PATCH /api/user-preferences/dashboard-widgets..."
curl -v -X PATCH http://localhost:3001/api/user-preferences/dashboard-widgets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"widgets":["google-total-users","google-admins","helios-total-users"]}' \
  2>&1
