-- 081_offboarding_templates_auto_reply_and_delegate_flags.sql
--
-- The email action was a single choice (forward OR auto-reply), so a real
-- departure could not do both, and delegation was implied by forwarding with
-- no way to opt out. Two additive flags (2026-09-08). Idempotent.

ALTER TABLE offboarding_templates
  ADD COLUMN IF NOT EXISTS email_auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_delegate_enabled BOOLEAN NOT NULL DEFAULT true;
