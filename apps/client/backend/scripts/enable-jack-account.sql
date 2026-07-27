-- Script to enable Jack's test account for GUI testing
-- Run with: docker exec -i helios_client_postgres psql -U postgres -d helios_client < backend/scripts/enable-jack-account.sql

-- First, check current status
SELECT email, is_active, status, user_status, first_name, last_name, role
FROM organization_users
WHERE email = 'jack@gridwrx.io';

-- Enable the account
UPDATE organization_users
SET is_active = true,
    status = 'active',
    user_status = 'active'
WHERE email = 'jack@gridwrx.io';

-- Verify the update
SELECT email, is_active, status, user_status, first_name, last_name, role
FROM organization_users
WHERE email = 'jack@gridwrx.io';
