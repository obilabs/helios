-- 070_create_audit_logs_unified_view.sql
--
-- Fix: the Audit Logs UI (GET /api/v1/organization/audit-logs) reads `activity_logs`,
-- but the app's central write path (auditMiddleware + SecurityAuditService) records
-- every mutating action in `security_audit_logs`. No route ever reads
-- `security_audit_logs`, so the compliance-facing Audit Logs page showed
-- "No audit logs found" even though actions were being audited.
--
-- This is a READ-SIDE fix only: a UNION view that projects both tables into the
-- exact column shape the audit-logs route/CSV already select. It leaves the
-- immutable, hash-chained `security_audit_logs` write path and its rows untouched,
-- requires no backfill, and immediately surfaces the real audit history plus the
-- sparse `activity_logs` rows. The route's two FROM clauses point at this view.
--
-- Column mapping notes (security_audit_logs -> activity_logs shape):
--   timestamp      -> created_at        (both timestamptz)
--   target_type    -> resource_type
--   target_id uuid -> resource_id       (cast to text; activity_logs.resource_id is varchar)
--   error_message / target_identifier / action -> description (COALESCE)
--   changes_after  -> metadata (jsonb)
--   actor_ip       -> ip_address
--   actor_user_agent -> user_agent
--   actor_type user/anonymous -> internal, mtp -> vendor, else -> service
--   outcome blocked -> denied, partial -> success, else passthrough  (route filters on success/failure/denied)
-- ITSM-only columns (vendor_*, api_key_*, service_*) do not exist on
-- security_audit_logs and are projected as NULL for those rows.

CREATE OR REPLACE VIEW audit_logs_unified AS
  SELECT
    id,
    organization_id,
    user_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    description,
    metadata,
    ip_address,
    user_agent,
    created_at,
    actor_type,
    api_key_id,
    api_key_name,
    vendor_name,
    vendor_technician_name,
    vendor_technician_email,
    ticket_reference,
    service_name,
    service_owner,
    result
  FROM activity_logs
  UNION ALL
  SELECT
    id,
    organization_id,
    actor_id                                   AS user_id,
    actor_id,
    action,
    target_type                                AS resource_type,
    target_id::text                            AS resource_id,
    COALESCE(error_message, target_identifier, action) AS description,
    changes_after                              AS metadata,
    actor_ip                                   AS ip_address,
    actor_user_agent                           AS user_agent,
    "timestamp"                                AS created_at,
    CASE actor_type
      WHEN 'user'      THEN 'internal'
      WHEN 'anonymous' THEN 'internal'
      WHEN 'mtp'       THEN 'vendor'
      ELSE 'service'
    END                                        AS actor_type,
    NULL::uuid                                 AS api_key_id,
    NULL::varchar                              AS api_key_name,
    NULL::varchar                              AS vendor_name,
    NULL::varchar                              AS vendor_technician_name,
    NULL::varchar                              AS vendor_technician_email,
    ticket_reference,
    NULL::varchar                              AS service_name,
    NULL::varchar                              AS service_owner,
    CASE outcome
      WHEN 'blocked' THEN 'denied'
      WHEN 'partial' THEN 'success'
      ELSE outcome
    END                                        AS result
  FROM security_audit_logs;
