-- 102_bulk_operations_schema.sql
--
-- Bulk Operations could not run on a fresh install. The service writes
-- operation_name, input_data, success_count, failure_count and error_message on
-- bulk_operations, and reads and writes bulk_operation_templates and
-- bulk_operation_audit. The seed carries an older shape of bulk_operations
-- without those columns, and the two tables existed only in an archived
-- migration that is never applied.
--
-- Additive only: no column is dropped and no row is changed. The older seed
-- columns (failed_items, parameters, error_log) are left in place; nothing
-- reads them.

ALTER TABLE bulk_operations
  ADD COLUMN IF NOT EXISTS operation_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS input_data JSONB,
  ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE TABLE IF NOT EXISTS bulk_operation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  operation_type VARCHAR(50) NOT NULL,
  template_data JSONB NOT NULL,
  is_shared BOOLEAN DEFAULT false,
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT bulk_operation_templates_org_name_key UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS bulk_operation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_operation_id UUID NOT NULL REFERENCES bulk_operations(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  details JSONB,
  performed_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_operations_created_at
  ON bulk_operations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_operation_templates_org
  ON bulk_operation_templates (organization_id);
CREATE INDEX IF NOT EXISTS idx_bulk_operation_audit_operation
  ON bulk_operation_audit (bulk_operation_id);

COMMENT ON TABLE bulk_operation_templates IS 'Reusable templates for bulk operations';
COMMENT ON TABLE bulk_operation_audit IS 'Lifecycle events for a bulk operation';
