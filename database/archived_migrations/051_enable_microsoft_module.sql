-- Migration 051: Enable Microsoft 365 Module
-- Date: 2025-12-14
-- Description: Set Microsoft 365 module as available now that integration is implemented

-- Enable Microsoft 365 module
UPDATE modules
SET is_available = true,
    description = 'Sync and manage Microsoft 365 users, groups, and licenses'
WHERE slug = 'microsoft_365';

-- Verify
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'microsoft_365' AND is_available = true) THEN
    RAISE EXCEPTION 'Microsoft 365 module not enabled properly';
  END IF;

  RAISE NOTICE 'Microsoft 365 module enabled successfully';
END $$;
