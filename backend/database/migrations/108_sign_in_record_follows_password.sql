-- 108: every account with a password gets the record the sign-in form reads.
--
-- The sign-in form checks a password against auth_accounts (provider
-- 'credential'), not against organization_users.password_hash. Only first-run
-- setup wrote that record. An account created by an admin, or one whose owner
-- set a password from an emailed link, had a password in organization_users
-- and nothing in auth_accounts, so the form answered "Invalid email or
-- password" to the right password.
--
-- A trigger keeps the two together from now on, whichever code path writes the
-- password, and the statement at the end fills in the accounts that are
-- already missing the record.
--
-- Additive and re-runnable.

CREATE OR REPLACE FUNCTION sync_sign_in_record() RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash THEN
    RETURN NEW;
  END IF;

  UPDATE auth_accounts
     SET password = NEW.password_hash,
         account_id = NEW.id::text,
         updated_at = NOW()
   WHERE user_id = NEW.id
     AND provider_id = 'credential';

  IF NOT FOUND THEN
    INSERT INTO auth_accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
    VALUES (gen_random_uuid()::text, NEW.id, NEW.id::text, 'credential', NEW.password_hash, NOW(), NOW())
    ON CONFLICT (provider_id, account_id) DO UPDATE
      SET password = EXCLUDED.password, updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_sign_in_record ON organization_users;
CREATE TRIGGER trg_sync_sign_in_record
  AFTER INSERT OR UPDATE OF password_hash ON organization_users
  FOR EACH ROW
  EXECUTE FUNCTION sync_sign_in_record();

-- Accounts that already have a password and no record.
INSERT INTO auth_accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
SELECT gen_random_uuid()::text, u.id, u.id::text, 'credential', u.password_hash, NOW(), NOW()
  FROM organization_users u
 WHERE u.password_hash IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM auth_accounts a
      WHERE a.user_id = u.id AND a.provider_id = 'credential'
   )
ON CONFLICT (provider_id, account_id) DO NOTHING;
