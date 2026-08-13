# ⚠️ Deprecated — NOT auto-applied

The **active** forward-migration directory is
[`backend/database/migrations/`](../../backend/database/migrations/).

The boot-time migration runner (`backend/src/database/migrate.ts`) and
`npm run db:migrate` read **only** that directory and record applied files in the
`schema_migrations` table. Nothing runs the `.sql` files in *this* directory.

## Why this exists

These `001–007` files predate the `database/schema_organization.sql` seed dump and
belong to an older lineage. They were the target of the old (never-wired-to-boot)
runner, which is the drift that let post-dump schema changes — the typed `api_keys`
columns and `security_audit_logs` — silently never apply. The runner now points at
`backend/database/migrations/`, so these are retained for history only.

**Do not add new migrations here.** Add them to `backend/database/migrations/`.

## Known follow-up (separate from the MTP drift fix)

Some effects of `001–007` are **not** present in `schema_organization.sql`
(e.g. `contacts`, `organization_domains`, `assets.thumbnail_asset_id`). If any
current code depends on those, they need to be folded into
`backend/database/migrations/` (as idempotent migrations) or into the seed. That
reconciliation was intentionally left out of the api_keys/audit-log fix to keep
its blast radius small.

See also `database/archived_migrations/` for the broader historical set.
