-- Migration: Add actor attribution columns to activity_logs
-- Run this on your database to fix the "Failed to fetch audit logs" error

-- Add actor attribution columns
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS actor_type character varying(20) DEFAULT 'internal';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS api_key_id uuid;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS api_key_name character varying(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_name character varying(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_technician_name character varying(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS vendor_technician_email character varying(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ticket_reference character varying(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS service_name character varying(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS service_owner character varying(255);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS result character varying(20) DEFAULT 'success';

-- Add index for actor_type filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_type ON activity_logs(actor_type);

-- Add index for vendor filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_vendor ON activity_logs(vendor_name) WHERE vendor_name IS NOT NULL;

-- Add index for result filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_result ON activity_logs(result);

-- Comments
COMMENT ON COLUMN activity_logs.actor_type IS 'Type of actor: internal, service, vendor';
COMMENT ON COLUMN activity_logs.vendor_name IS 'Name of vendor if actor_type is vendor';
COMMENT ON COLUMN activity_logs.ticket_reference IS 'Support ticket reference if applicable';
COMMENT ON COLUMN activity_logs.result IS 'Result of action: success, failure, denied';
