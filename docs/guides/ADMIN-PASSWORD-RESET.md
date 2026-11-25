# Resetting an admin password

Use this when an admin cannot sign in and there is no other admin who can help.

Helios has no "forgot password" link on a default install, because a default
install sends no mail. Recovery is done from the server instead: whoever can
run commands on the machine Helios is installed on can set a new admin
password. That is the same authority the first-run setup token relies on.

## Steps

1. Connect to the server Helios runs on and go to the folder that holds
   `docker-compose.yml`.
2. Run:

   ```bash
   docker compose exec backend node dist/scripts/reset-admin-password.js
   ```

3. Type the new password when asked, then type it again. Nothing appears on
   screen while you type. It must be at least 12 characters.
4. Sign in to Helios with the new password.

If the install has more than one active admin, say which one:

```bash
docker compose exec backend node dist/scripts/reset-admin-password.js admin@example.com
```

## What it does

- Stores only a hash of the new password. The password is never written to a
  log, the shell history or the command line.
- Signs that admin out everywhere, so an old session cannot carry on.
- Records the reset in the security audit log as
  `auth.password.reset.operator`. The password change and the audit row are one
  transaction; if either fails, nothing changes.

## What it does not do

- It does not create an admin, and it will not reset an account that is not an
  active admin.
- It does not change the Google Workspace password of anyone. It only changes
  how that person signs in to Helios.
- It does not work without an interactive terminal. Do not pass `-T` to
  `docker compose exec`.

## If it fails

| Message | Meaning |
|---|---|
| `Run this from an interactive terminal` | The command was run without a terminal attached (for example from a script, or with `-T`). |
| `There are N active admins` | Add the email address of the admin to reset. |
| `... is not an active admin` | The address is misspelled, or that account is not an admin or is disabled. |
| `expected one password record` | The account has no password sign-in record. Nothing was changed; open an issue with this message. |
