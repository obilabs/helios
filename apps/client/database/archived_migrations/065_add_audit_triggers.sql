-- Migration: 065_add_audit_triggers.sql
-- Purpose: Automatic audit logging via database triggers for critical tables
-- This provides a safety net - even if application code forgets to log,
-- the database will capture critical changes.

-- =============================================================================
-- Generic Audit Trigger Function
-- =============================================================================
-- This function is called by triggers on sensitive tables.
-- It logs changes to security_audit_logs automatically.

CREATE OR REPLACE FUNCTION audit_trigger_func() RETURNS TRIGGER AS $$
DECLARE
  v_action VARCHAR(100);
  v_action_category VARCHAR(50);
  v_target_type VARCHAR(50);
  v_target_id UUID;
  v_target_identifier VARCHAR(255);
  v_organization_id UUID;
  v_changes_before JSONB;
  v_changes_after JSONB;
  v_actor_type VARCHAR(20);
BEGIN
  -- Determine action based on operation
  v_action_category := 'admin';
  v_actor_type := 'system'; -- Triggers don't know the actor, marked as system

  CASE TG_OP
    WHEN 'INSERT' THEN
      v_action := TG_TABLE_NAME || '.create';
      v_changes_after := to_jsonb(NEW);
      v_target_id := NEW.id;
    WHEN 'UPDATE' THEN
      v_action := TG_TABLE_NAME || '.update';
      v_changes_before := to_jsonb(OLD);
      v_changes_after := to_jsonb(NEW);
      v_target_id := NEW.id;
    WHEN 'DELETE' THEN
      v_action := TG_TABLE_NAME || '.delete';
      v_changes_before := to_jsonb(OLD);
      v_target_id := OLD.id;
  END CASE;

  -- Set target type from table name
  v_target_type := TG_TABLE_NAME;

  -- Extract organization_id if available
  IF TG_TABLE_NAME = 'organizations' THEN
    v_organization_id := COALESCE(NEW.id, OLD.id);
    v_target_identifier := COALESCE(NEW.name, OLD.name);
  ELSIF TG_TABLE_NAME = 'organization_users' THEN
    v_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
    v_target_identifier := COALESCE(NEW.email, OLD.email);
    v_target_type := 'user';
    -- More specific action names for users
    CASE TG_OP
      WHEN 'INSERT' THEN v_action := 'user.create';
      WHEN 'UPDATE' THEN
        -- Check what changed
        IF OLD.is_active = true AND NEW.is_active = false THEN
          v_action := 'user.suspend';
        ELSIF OLD.is_active = false AND NEW.is_active = true THEN
          v_action := 'user.activate';
        ELSIF OLD.role != NEW.role THEN
          v_action := 'user.role.change';
        ELSIF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
          v_action := 'user.password.change';
          v_action_category := 'auth';
          -- Don't log password hashes
          v_changes_before := v_changes_before - 'password_hash';
          v_changes_after := v_changes_after - 'password_hash';
        ELSE
          v_action := 'user.update';
        END IF;
      WHEN 'DELETE' THEN v_action := 'user.delete';
    END CASE;
  ELSIF TG_TABLE_NAME = 'api_keys' THEN
    v_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
    v_target_identifier := COALESCE(NEW.name, OLD.name);
    v_action_category := 'api';
    CASE TG_OP
      WHEN 'INSERT' THEN v_action := 'api.key.create';
      WHEN 'UPDATE' THEN
        IF OLD.is_active = true AND NEW.is_active = false THEN
          v_action := 'api.key.revoke';
        ELSE
          v_action := 'api.key.update';
        END IF;
      WHEN 'DELETE' THEN v_action := 'api.key.delete';
    END CASE;
    -- Don't log the actual key
    v_changes_before := COALESCE(v_changes_before, '{}'::jsonb) - 'key_hash' - 'key_preview';
    v_changes_after := COALESCE(v_changes_after, '{}'::jsonb) - 'key_hash' - 'key_preview';
  ELSIF TG_TABLE_NAME = 'gw_credentials' THEN
    v_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
    v_target_identifier := 'google_workspace';
    v_action_category := 'security';
    CASE TG_OP
      WHEN 'INSERT' THEN v_action := 'service.account.configure';
      WHEN 'UPDATE' THEN v_action := 'service.account.update';
      WHEN 'DELETE' THEN v_action := 'service.account.remove';
    END CASE;
    -- NEVER log service account keys
    v_changes_before := COALESCE(v_changes_before, '{}'::jsonb) - 'service_account_key' - 'encrypted_key';
    v_changes_after := COALESCE(v_changes_after, '{}'::jsonb) - 'service_account_key' - 'encrypted_key';
  ELSIF TG_TABLE_NAME = 'modules' THEN
    -- Modules don't have org_id, use first org (single-tenant)
    SELECT id INTO v_organization_id FROM organizations LIMIT 1;
    v_target_identifier := COALESCE(NEW.name, OLD.name);
    CASE TG_OP
      WHEN 'INSERT' THEN v_action := 'module.create';
      WHEN 'UPDATE' THEN
        IF OLD.is_enabled IS DISTINCT FROM NEW.is_enabled THEN
          v_action := CASE WHEN NEW.is_enabled THEN 'module.enable' ELSE 'module.disable' END;
        ELSE
          v_action := 'module.update';
        END IF;
      WHEN 'DELETE' THEN v_action := 'module.delete';
    END CASE;
  ELSE
    -- Generic handling for other tables
    v_organization_id := COALESCE(
      (NEW).organization_id,
      (OLD).organization_id,
      (SELECT id FROM organizations LIMIT 1)
    );
  END IF;

  -- Skip if no organization (shouldn't happen in single-tenant)
  IF v_organization_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Insert audit log (bypass immutability rule by using a direct insert)
  INSERT INTO security_audit_logs (
    actor_type,
    action,
    action_category,
    target_type,
    target_id,
    target_identifier,
    organization_id,
    outcome,
    changes_before,
    changes_after
  ) VALUES (
    v_actor_type,
    v_action,
    v_action_category,
    v_target_type,
    v_target_id,
    v_target_identifier,
    v_organization_id,
    'success',
    v_changes_before,
    v_changes_after
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    -- Never let audit logging break the actual operation
    RAISE WARNING 'Audit trigger failed: %', SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Create Triggers on Critical Tables
-- =============================================================================

-- Organization Users (user management)
DROP TRIGGER IF EXISTS audit_organization_users ON organization_users;
CREATE TRIGGER audit_organization_users
  AFTER INSERT OR UPDATE OR DELETE ON organization_users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Organizations (should rarely change after setup)
DROP TRIGGER IF EXISTS audit_organizations ON organizations;
CREATE TRIGGER audit_organizations
  AFTER INSERT OR UPDATE OR DELETE ON organizations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- API Keys (security sensitive)
DROP TRIGGER IF EXISTS audit_api_keys ON api_keys;
CREATE TRIGGER audit_api_keys
  AFTER INSERT OR UPDATE OR DELETE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Google Workspace Credentials (highly sensitive)
DROP TRIGGER IF EXISTS audit_gw_credentials ON gw_credentials;
CREATE TRIGGER audit_gw_credentials
  AFTER INSERT OR UPDATE OR DELETE ON gw_credentials
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Modules (configuration changes)
DROP TRIGGER IF EXISTS audit_modules ON modules;
CREATE TRIGGER audit_modules
  AFTER INSERT OR UPDATE OR DELETE ON modules
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON FUNCTION audit_trigger_func() IS 'Automatic audit logging for critical table changes. Logs to security_audit_logs with actor_type=system since database triggers cannot determine the actual user.';
