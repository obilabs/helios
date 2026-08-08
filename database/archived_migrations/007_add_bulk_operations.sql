-- Migration: Add Bulk Operations Framework
-- Description: Tables for tracking bulk operations and templates
-- Date: 2025-10-27

-- Bulk operations tracking table
CREATE TABLE IF NOT EXISTS bulk_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operation_type VARCHAR(50) NOT NULL, -- 'user_update', 'group_membership', 'user_create', 'user_delete', etc.
  operation_name VARCHAR(255), -- Optional friendly name
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  input_data JSONB, -- Original CSV/selection data
  results JSONB, -- Per-item results with success/failure details
  error_message TEXT, -- Overall error if operation failed
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT valid_counts CHECK (
    processed_items >= 0 AND
    processed_items <= total_items AND
    success_count >= 0 AND
    failure_count >= 0 AND
    success_count + failure_count <= processed_items
  )
);

-- Bulk operation templates for reuse
CREATE TABLE IF NOT EXISTS bulk_operation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  operation_type VARCHAR(50) NOT NULL,
  template_data JSONB NOT NULL, -- Column mappings, default values, etc.
  is_shared BOOLEAN DEFAULT false, -- Allow sharing across organization
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_template_name UNIQUE (organization_id, name)
);

-- Bulk operation audit log
CREATE TABLE IF NOT EXISTS bulk_operation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_operation_id UUID NOT NULL REFERENCES bulk_operations(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'created', 'started', 'paused', 'resumed', 'cancelled', 'completed', 'failed'
  details JSONB,
  performed_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulk_operations_org_id ON bulk_operations(organization_id);
CREATE INDEX IF NOT EXISTS idx_bulk_operations_status ON bulk_operations(status);
CREATE INDEX IF NOT EXISTS idx_bulk_operations_created_at ON bulk_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_operations_created_by ON bulk_operations(created_by);
CREATE INDEX IF NOT EXISTS idx_bulk_operation_templates_org_id ON bulk_operation_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_bulk_operation_audit_bulk_op_id ON bulk_operation_audit(bulk_operation_id);

-- Comments for documentation
COMMENT ON TABLE bulk_operations IS 'Tracks bulk operations performed on users, groups, and other resources';
COMMENT ON TABLE bulk_operation_templates IS 'Reusable templates for common bulk operations';
COMMENT ON TABLE bulk_operation_audit IS 'Audit trail for bulk operation lifecycle events';

COMMENT ON COLUMN bulk_operations.operation_type IS 'Type of bulk operation: user_update, user_create, user_delete, user_suspend, group_membership_add, group_membership_remove, org_unit_move';
COMMENT ON COLUMN bulk_operations.status IS 'Current status: pending (queued), processing (running), completed (finished successfully), failed (error occurred), cancelled (manually stopped)';
COMMENT ON COLUMN bulk_operations.input_data IS 'Original input data including CSV content, filters, or selection criteria';
COMMENT ON COLUMN bulk_operations.results IS 'Per-item results array with success/failure status and error messages';
