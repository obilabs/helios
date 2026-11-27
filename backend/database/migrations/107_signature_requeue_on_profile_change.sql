-- 107_signature_requeue_on_profile_change.sql
--
-- A deployed signature is rendered from the user's profile (name, job title,
-- department, phone numbers and so on). When one of those changed, nothing
-- queued the signature again, so Gmail kept showing the old value until the
-- next assignment change or a manual resync.
--
-- This queues the user's signature whenever a field a signature can show
-- changes, whichever path made the change (the Users page, a bulk operation,
-- the console, or a sync from the directory). Only a signature that is
-- currently deployed is queued; rows that are failed, skipped or already
-- waiting are left alone. The existing sync job picks the row up on its next
-- run.
--
-- Additive and re-runnable.

CREATE OR REPLACE FUNCTION requeue_signature_on_profile_change()
RETURNS trigger AS $$
BEGIN
  UPDATE user_signature_status
     SET sync_status = 'pending',
         updated_at  = NOW()
   WHERE user_id = NEW.id
     AND current_template_id IS NOT NULL
     AND sync_status = 'synced';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_requeue_signature_on_profile_change ON organization_users;

CREATE TRIGGER trg_requeue_signature_on_profile_change
AFTER UPDATE OF
  first_name, last_name, preferred_name, email, job_title, department,
  department_id, location, location_id, mobile_phone, work_phone,
  work_phone_extension, pronouns, professional_designation,
  professional_designations, linkedin_url, twitter_url, avatar_url,
  custom_fields
ON organization_users
FOR EACH ROW
WHEN (
  (OLD.first_name, OLD.last_name, OLD.preferred_name, OLD.email, OLD.job_title,
   OLD.department, OLD.department_id, OLD.location, OLD.location_id,
   OLD.mobile_phone, OLD.work_phone, OLD.work_phone_extension, OLD.pronouns,
   OLD.professional_designation, OLD.professional_designations::text,
   OLD.linkedin_url, OLD.twitter_url, OLD.avatar_url, OLD.custom_fields::text)
  IS DISTINCT FROM
  (NEW.first_name, NEW.last_name, NEW.preferred_name, NEW.email, NEW.job_title,
   NEW.department, NEW.department_id, NEW.location, NEW.location_id,
   NEW.mobile_phone, NEW.work_phone, NEW.work_phone_extension, NEW.pronouns,
   NEW.professional_designation, NEW.professional_designations::text,
   NEW.linkedin_url, NEW.twitter_url, NEW.avatar_url, NEW.custom_fields::text)
)
EXECUTE FUNCTION requeue_signature_on_profile_change();
