# Upgrading Helios

This page is for anyone running Helios, and for anyone (person or coding agent)
changing it. It says which upgrades are supported, how to do one, and what a
change to Helios must not break.

## Where Helios is today

**Helios has no versioned release yet.** The `edge` image is the tip of `main`.
It is for testing.

- There is **no supported upgrade route between `edge` builds**, and none from
  any pre-1.0 build to v1.0.0. Schema changes before 1.0.0 are our development
  path and are folded into the 1.0.0 baseline.
- **v1.0.0 is a clean install.** If you are trying Helios now, expect to
  reinstall at 1.0.0.

Everything below describes how upgrades work from v1.0.0 onward.

## What a version number promises

| Release | Example | Contains | Schema | Safe for production |
|---------|---------|----------|--------|---------------------|
| Patch | 1.2.**3** | Fixes and dependency security updates | Additive only | Yes. Take these promptly. |
| Minor | 1.**3**.0 | New features | Additive only | Yes |
| Major | **2**.0.0 | May remove or rename things | Flattened baseline plus one upgrade step | Yes, one major at a time |

"Additive" means new tables and new nullable columns. Within a major, nothing is
renamed, dropped or narrowed.

Every release ships only finished features. See [RELEASING.md](RELEASING.md).

## Supported upgrade paths

- **Within a major: any earlier release to any later release.** 1.0.0 straight
  to 1.4.2 is supported. You do not need to stop at each version in between.
- **To the next major: from the last minor of your current major.** Upgrade to
  the latest 1.x first, then to 2.0.0.
- **Skipping a major is not supported.** 1.x to 3.0.0 goes through 2.x. The
  upgrade stops with a message naming the version to install first; it does not
  guess.
- **Downgrading** is supported one release back within a major, because the
  schema only ever gains things. It is not supported across a major. Restore
  your backup instead.

## How to upgrade

Pin the version you run. Do not run production on `edge` or `latest`.

1. **Read the notes** for every version between yours and the target, in
   [Upgrade notes](#upgrade-notes) below.
2. **Back up the database.**
   ```bash
   docker compose exec -T postgres pg_dump -U "${DB_USER:-postgres}" "${DB_NAME:-helios}" > helios-backup-$(date +%F).sql
   ```
   Keep the file somewhere other than the server.
3. **Set the version** in `.env`:
   ```bash
   HELIOS_VERSION=1.4.2
   ```
4. **Pull and restart.**
   ```bash
   docker compose pull
   docker compose up -d
   ```
5. **Check it.** The backend applies any new migrations when it starts. If one
   fails, the backend stops and says which. It does not start half-migrated.
   ```bash
   docker compose logs backend | tail -50
   ```
   Then sign in and open Users and Settings.

   If the browser shows **502 Bad Gateway** for more than a minute after the
   restart, the proxy is still pointing at the old containers. Restart it:
   ```bash
   docker compose restart nginx
   ```
   Installs that use the proxy configuration shipped from this release on
   follow the new containers by themselves, within about half a minute.

If the upgrade fails: set `HELIOS_VERSION` back, `docker compose up -d`, and if
the database was changed by a major upgrade, restore the backup.

## What we test before a release is tagged

The release gate is in [RELEASING.md](RELEASING.md#the-release-gate). In short, a
version is not tagged until the candidate image has shown that:

1. a fresh install and an upgraded install end up with the same schema, and
   existing data survives;
2. an account created on the old version can still sign in after the upgrade,
   and the core flows work on the upgraded database;
3. the calls between Helios and other ObiLabs products still work;
4. the whole test suite passes on the exact commit being tagged.

RELEASING.md says which of these run automatically today and which are still
done by hand.

## Rules for changes to Helios

These apply to every pull request, including ones written by a coding agent.

**Database**

- Every schema change is a new numbered file in `backend/database/migrations/`.
  Never edit a migration that has merged.
- Migrations are additive and safe to run twice (`IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`). No renames, drops or type narrowing inside a
  major.
- SQL in `backend/src` must match the schema a fresh install produces. CI checks
  this (`backend/database/tests/check-sql-against-schema.mjs`).
- A change that rewrites existing rows says so at the top of the migration, and
  the pull request says how it was tested against rows in the old form.

**Dependencies**

- A dependency major that touches sign-in, sessions, stored data or the
  database driver is a migration. Test it against a database created by the
  previous build, with an existing account, before merging. Passing unit tests
  is not enough: they run against a fresh schema.
- Keep `better-auth` and `@better-auth/passkey` on the same version.
- Record a pin and the reason for it in `CLAUDE.md` under version requirements.
- The Node version is set in five places that must agree: `backend/package.json`
  (`engines`), the four Dockerfiles, and the CI workflows.

**Between products**

- Do not change the shape of a call another ObiLabs product makes to Helios, or
  one Helios makes to it, inside a major. Add a field; do not rename or remove
  one.

**Every user-visible upgrade effect gets a line in the notes below**, in the same
pull request.

## Upgrade notes

Newest first. Before 1.0.0 these are for people testing `edge` builds.

### Unreleased (will be part of 1.0.0)

- **Node.js 22.** Images and CI moved from Node 20. Only matters if you build
  from source or run the backend outside Docker.
- **Sign-in library updated** to its 1.7 line. Migration
  `103_auth_library_schema.sql` adds the tables and columns it needs and
  re-keys existing password records. It runs on start-up. An `edge` install
  from before this change keeps its users.
- **Proxy follows recreated containers.** `nginx/nginx.conf` and
  `nginx/nginx.prod.conf` now re-resolve the backend and frontend, so an image
  upgrade no longer leaves the proxy answering 502 until it is restarted. If
  you keep your own copy of the proxy configuration, copy the `resolver` line
  and the two `upstream` blocks. Needs nginx 1.27.3 or later (the compose file
  uses 1.30). The proxy reads this file when it
  starts, so restart it once after the upgrade that brings the change in:
  `docker compose restart nginx`.
- **Audit log hash, version 3.** Migration `105_security_audit_hash_v3.sql`
  changes how new audit rows are hashed so that any text can be recorded.
  Existing rows are kept as they are and still verify. It runs on start-up.
  `GET /health` gains `auditWriteFailures`, which should read 0. See
  `docs/features/AUDIT-LOG-INTEGRITY.md`.
- **A command for each row of a CSV file.** The Developer Console has `csv load`,
  `csv preview` and `csv run`. The file is read in the browser and is not
  uploaded or stored. See `docs/guides/console-csv.md`.
- **The user list and Home counts follow Google again.** Four fixes. A person
  deleted in Google from the Developer Console stayed listed as active in
  Helios. Looking up deleted accounts (as `gw users undelete` does) copied
  Google's deleted accounts into Helios as active people. A call to the Google
  route that asked for only some fields of each user cleared the stored link
  between each person and their Google account, which made the Home counts
  wrong. And an install that connected Google after it started (every new
  install) synced once and then not again until its next restart. After
  upgrading, run `gw sync users` once in the Developer Console, or wait for the
  next scheduled sync: it restores the links and marks people who are no longer
  in Google as deleted.
- **Accounts an admin creates can sign in.** An account created by an admin with
  a password, or one whose owner set a password from an emailed link, was
  refused by the sign-in form with "Invalid email or password". Migration 108
  repairs the accounts already affected and keeps new ones right. No action
  needed.
- **One address setting, and the visitor's real address.** `PUBLIC_URL` is now
  the single setting for the address people use; `FRONTEND_URL`, `APP_URL` and
  the passkey settings follow it when empty. Several settings in `.env` were
  never passed to the backend (`APP_URL`, `TRUSTED_ORIGINS`, `PASSKEY_RP_ID`,
  `PASSKEY_ORIGIN`, `SMTP_*`); they are now. **Before upgrading, open `.env`:**
  if `APP_URL`, `PASSKEY_RP_ID` or `PASSKEY_ORIGIN` still hold the old example
  values (`http://localhost:80`, `localhost`), empty them, and set `PUBLIC_URL`
  if people reach Helios at anything other than `localhost`. Also new:
  `TRUST_PROXY` (default `1`). With your own proxy or tunnel in front, set it to
  `2`, or the audit log, the rate limit and API-key address rules see the
  proxy's address and not the visitor's. An install reached over plain http at
  an IP address could accept a password and then show the sign-in form again;
  it now signs in, and logs a warning that the connection is not encrypted.
  See `docs/guides/domain-and-https.md`.
- **Image links and uploads.** Three fixes. A public image link that ends in a
  file name (the form Helios gives out) returned the application page, not the
  image; this is a proxy change, so restart the proxy once after upgrading:
  `docker compose restart nginx`. If you keep your own copy of the proxy
  configuration, change `location /a/` to `location ^~ /a/`. Uploads were
  refused when no list of allowed file types had been saved; the default image
  types now apply. Saving one asset setting no longer resets the others to
  their defaults: if you chose built-in storage and later changed another asset
  setting, check Settings to confirm the storage choice is still the one you want.
- **Signatures follow profile changes.** Migration
  `107_signature_requeue_on_profile_change.sql` queues a user's deployed
  signature again when their name, job title, department or contact details
  change. It runs on start-up; the regular signature sync does the rest.
- **Assistant prompt.** Settings shows the built-in prompt as the starting point
  for a custom one and has a "Reset to default" button. A custom prompt saved
  before this change is used as written; add the line `{{commands}}` to it if
  you want the current console command list filled in.
- **One audit entry per request.** A change made through `/api/v1` was
  recorded twice in the audit log. It is now recorded once. Existing entries are
  left as they are.
- **Google client libraries updated** to their current majors.
- **Upload handling, mail sending and routing libraries updated** to their
  current majors. No configuration change.
