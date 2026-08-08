-- Authentication Test Seed Data
-- Creates organization and test users for authentication testing

-- Create test organization
INSERT INTO organizations (id, name, domain, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test Organization',
  'test.helios.local',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create test users with different roles
INSERT INTO organization_users (
  id,
  organization_id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  is_active,
  created_at,
  updated_at
) VALUES
  -- Admin user (password: AdminTest123!)
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'admin@test.helios.local',
    '$2b$12$YTw5wH.tVfQK.mCFLHYcH.9rg7hFhIhqg2RM4nYmJD3oNCjmVqFxm',
    'Admin',
    'User',
    'admin',
    true,
    NOW(),
    NOW()
  ),
  -- Regular user (password: UserTest123!)
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'user@test.helios.local',
    '$2b$12$7JKx8hFnZ3QrV5mCLHYcH.8sg6gGjJkrh3SM5oZnKE4pODknWrGym',
    'Regular',
    'User',
    'user',
    true,
    NOW(),
    NOW()
  ),
  -- Manager user (password: ManagerTest123!)
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'manager@test.helios.local',
    '$2b$12$8MZy9jGoZ4RsW6nDMIZdI.7th7hHkKlsi4TN6paoLF5qPEloXsHzn',
    'Manager',
    'User',
    'manager',
    true,
    NOW(),
    NOW()
  ),
  -- Inactive user (password: InactiveTest123!)
  (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'inactive@test.helios.local',
    '$2b$12$9OAz0kHpA5StX7oENJaeJ.8ui8iIlLmtj5UO7qbpMG6rQFmpYtIao',
    'Inactive',
    'User',
    'user',
    false,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Create some organization settings
INSERT INTO organization_settings (
  id,
  organization_id,
  google_workspace_enabled,
  microsoft_365_enabled,
  settings,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  false,
  false,
  '{"passwordMinLength": 8, "passwordRequireSymbols": true, "sessionTimeout": 28800}',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;