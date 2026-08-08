-- Bulk Operations Test Seed Data
-- Creates organization, admin user, and sample bulk operations

-- Create test organization
INSERT INTO organizations (id, name, domain, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test Organization',
  'test.helios.local',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create admin user for testing
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
) VALUES (
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
) ON CONFLICT (id) DO NOTHING;

-- Create some existing users to test updates/deletes
INSERT INTO organization_users (
  id,
  organization_id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  department,
  job_title,
  is_active,
  created_at,
  updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'john.doe@test.helios.local',
    '$2b$12$7JKx8hFnZ3QrV5mCLHYcH.8sg6gGjJkrh3SM5oZnKE4pODknWrGym',
    'John',
    'Doe',
    'user',
    'Engineering',
    'Software Engineer',
    true,
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'jane.smith@test.helios.local',
    '$2b$12$7JKx8hFnZ3QrV5mCLHYcH.8sg6gGjJkrh3SM5oZnKE4pODknWrGym',
    'Jane',
    'Smith',
    'user',
    'Marketing',
    'Marketing Manager',
    true,
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    'bob.wilson@test.helios.local',
    '$2b$12$7JKx8hFnZ3QrV5mCLHYcH.8sg6gGjJkrh3SM5oZnKE4pODknWrGym',
    'Bob',
    'Wilson',
    'user',
    'Sales',
    'Sales Representative',
    true,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Create sample bulk operation history
INSERT INTO bulk_operations (
  id,
  organization_id,
  initiated_by,
  operation_type,
  status,
  total_records,
  processed_records,
  successful_records,
  failed_records,
  error_details,
  created_at,
  updated_at,
  completed_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'user_create',
    'completed',
    50,
    50,
    48,
    2,
    '[{"row": 15, "error": "Duplicate email address"}, {"row": 32, "error": "Invalid email format"}]',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days' + INTERVAL '5 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'user_update',
    'completed',
    25,
    25,
    25,
    0,
    NULL,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'user_delete',
    'cancelled',
    100,
    35,
    35,
    0,
    NULL,
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '12 hours',
    NULL
  )
ON CONFLICT (id) DO NOTHING;

-- Create sample bulk operation results
INSERT INTO bulk_operation_results (
  id,
  bulk_operation_id,
  record_index,
  status,
  input_data,
  result_data,
  error_message,
  created_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000020',
    1,
    'success',
    '{"email": "user1@test.helios.local", "firstName": "User", "lastName": "One"}',
    '{"userId": "00000000-0000-0000-0000-000000000031"}',
    NULL,
    NOW() - INTERVAL '2 days'
  ),
  (
    '00000000-0000-0000-0000-000000000032',
    '00000000-0000-0000-0000-000000000020',
    15,
    'failed',
    '{"email": "john.doe@test.helios.local", "firstName": "John", "lastName": "Doe"}',
    NULL,
    'Duplicate email address',
    NOW() - INTERVAL '2 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Create some groups for group operations testing
INSERT INTO organization_groups (
  id,
  organization_id,
  name,
  description,
  email,
  group_type,
  created_at,
  updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000040',
    '00000000-0000-0000-0000-000000000001',
    'Engineering Team',
    'All engineering staff',
    'engineering@test.helios.local',
    'native',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000041',
    '00000000-0000-0000-0000-000000000001',
    'Marketing Team',
    'Marketing department',
    'marketing@test.helios.local',
    'native',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;