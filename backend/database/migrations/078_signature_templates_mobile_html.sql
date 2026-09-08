-- 078_signature_templates_mobile_html.sql
--
-- Signatures -> Templates -> Create Template failed on a fresh install with
--   column "mobile_html_content" of relation "signature_templates" does not exist
-- (found 2026-09-08 in the Google Workspace end-to-end UI run). The route
-- (signatures.routes.ts) inserts and updates the column; the seed never had it.
-- Additive, idempotent.

ALTER TABLE signature_templates
  ADD COLUMN IF NOT EXISTS mobile_html_content TEXT;

COMMENT ON COLUMN signature_templates.mobile_html_content IS 'Optional mobile-optimised variant of html_content';
