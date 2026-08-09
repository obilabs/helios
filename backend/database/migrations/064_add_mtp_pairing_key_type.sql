-- Migration 064: MTP pairing key type (OpenSpec: mtp-integration)
-- Purpose: add the `helios-mtp-pairing` API-key type with single-use,
-- time-bounded pairing semantics (design D1/D2):
--   * pairing_window_expires_at — issuance opens a 15-minute pairing window
--   * paired_at / paired_from_ip / paired_user_agent — set exactly once by the
--     first successful handshake via an atomic conditional UPDATE
--     (`... AND paired_at IS NULL AND pairing_window_expires_at > NOW()`)
--   * revoked_at / revoked_by — authoritative revocation (design D6); a
--     revoked pairing returns an explicit "revoked" signal, not a bare 401
--
-- NOTE: the migration runner re-executes every file on boot, so everything in
-- here must be idempotent (IF NOT EXISTS / DROP ... IF EXISTS then re-ADD).

-- Defensive: some very old installs were initialized from a schema dump that
-- predates the typed key system (018). The code requires `type`, so guard it.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'service';

-- Pairing lifecycle columns (NULL for service/vendor keys).
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS pairing_window_expires_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS paired_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS paired_from_ip INET;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS paired_user_agent TEXT;

-- Authoritative revocation (applies to pairing keys; harmless for others).
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES organization_users(id) ON DELETE SET NULL;

-- Relax the key-type CHECK to admit the new type. 018 created the inline
-- column check, which Postgres auto-names api_keys_type_check. Drop + re-add
-- keeps this idempotent under the re-run-everything migration runner.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_type_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_type_check
  CHECK (type IN ('service', 'vendor', 'helios-mtp-pairing'));

-- Fast lookup of an org's pairing keys (pairings list / revocation UI).
CREATE INDEX IF NOT EXISTS idx_api_keys_mtp_pairing
  ON api_keys(organization_id, created_at DESC)
  WHERE type = 'helios-mtp-pairing';

COMMENT ON COLUMN api_keys.pairing_window_expires_at IS 'helios-mtp-pairing only: handshake must complete before this instant (15-minute window from issuance)';
COMMENT ON COLUMN api_keys.paired_at IS 'helios-mtp-pairing only: set exactly once by the first successful handshake (atomic single-use bind)';
COMMENT ON COLUMN api_keys.paired_from_ip IS 'helios-mtp-pairing only: IP that completed the handshake (customer-visible for leak detection)';
COMMENT ON COLUMN api_keys.paired_user_agent IS 'helios-mtp-pairing only: User-Agent that completed the handshake';
COMMENT ON COLUMN api_keys.revoked_at IS 'Authoritative revocation timestamp; /api/v1/mtp/* on a revoked pairing returns an explicit revoked signal';
