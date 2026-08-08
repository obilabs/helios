-- Migration: Add actor attribution fields to activity_logs
-- Purpose: Track who performed actions, supporting internal users, API keys, and vendors
-- Date: 2025-12-14

-- Add actor_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'actor_type') THEN
    CREATE TYPE actor_type AS ENUM ('internal', 'service', 'vendor');
  END IF;
END $$;

-- Add actor attribution columns
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS actor_type VARCHAR(20) DEFAULT 'internal';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS api_key_id UUID;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS api_key_name VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_technician_name VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_technician_email VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ticket_reference VARCHAR(100);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS service_name VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS service_owner VARCHAR(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS result VARCHAR(20) DEFAULT 'success';

-- Add indexes for filtering by actor type and vendor
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_type ON activity_logs(actor_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_vendor ON activity_logs(vendor_name) WHERE vendor_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_api_key ON activity_logs(api_key_id) WHERE api_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_result ON activity_logs(result);

-- Add comment describing the actor attribution fields
COMMENT ON COLUMN activity_logs.actor_type IS 'Type of actor: internal (org user), service (API/script), vendor (MSP/consultant)';
COMMENT ON COLUMN activity_logs.api_key_id IS 'API key used for this action (if applicable)';
COMMENT ON COLUMN activity_logs.api_key_name IS 'Name of the API key used';
COMMENT ON COLUMN activity_logs.vendor_name IS 'Name of vendor organization (for vendor access)';
COMMENT ON COLUMN activity_logs.vendor_technician_name IS 'Name of vendor technician who performed action';
COMMENT ON COLUMN activity_logs.vendor_technician_email IS 'Email of vendor technician';
COMMENT ON COLUMN activity_logs.ticket_reference IS 'Support ticket reference for vendor actions';
COMMENT ON COLUMN activity_logs.service_name IS 'Name of automated service/application';
COMMENT ON COLUMN activity_logs.service_owner IS 'Owner of the service application';
COMMENT ON COLUMN activity_logs.result IS 'Result of action: success, failure, or denied';
