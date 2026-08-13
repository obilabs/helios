-- Migration 065: reconcile api_keys with the full typed-key contract
-- Purpose: the seed dump (database/schema_organization.sql) ships a pre-typed
-- `api_keys` table (scopes text[], no config columns). 064 added everything a
-- helios-mtp-pairing key needs; this migration adds the remaining columns the
-- generic service/vendor create + renew paths write, so a fresh install can
-- issue ANY typed API key — not just pairing keys.
--
-- Columns below are written by:
--   * POST/RENEW in src/routes/api-keys.routes.ts (service_config, vendor_config,
--     ip_whitelist, rate_limit_config)
--   * the list/get endpoints SELECT service_config / vendor_config
-- and match the canonical typed-key design (see the historical
-- 035_create_api_keys_system.sql).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Runs once (tracked in schema_migrations)
-- but stays safe on a database that already has some of these columns.

-- Service-key config: { systemName, automationRules? }
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS service_config JSONB;

-- Vendor-key config: { vendorName, vendorContact, requiresActor, ... }
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS vendor_config JSONB;

-- Optional IP allow-list (array of IPs/CIDRs; NULL = no restriction).
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS ip_whitelist JSONB;

-- Optional per-key rate-limit override: { requestsPerHour, requestsPerDay? }
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit_config JSONB;

COMMENT ON COLUMN api_keys.service_config     IS 'service keys: { systemName, automationRules? }';
COMMENT ON COLUMN api_keys.vendor_config      IS 'vendor keys: { vendorName, vendorContact, requiresActor, allowedActors?, requiresClientReference? }';
COMMENT ON COLUMN api_keys.ip_whitelist       IS 'array of IPs/CIDR ranges; NULL means no restriction';
COMMENT ON COLUMN api_keys.rate_limit_config  IS 'per-key rate limit override: { requestsPerHour, requestsPerDay? }';
