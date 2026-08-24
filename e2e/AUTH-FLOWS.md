# First-run auth-flow E2E (setup wizard + login)

Browser coverage for the two screens the headless/autonomous runs deliberately
bypass:

- **Setup wizard** — org + admin creation from a fresh DB
  (`frontend/src/components/AccountSetup.tsx`).
- **Login form** — email/password sign-in via better-auth
  (`frontend/src/pages/LoginPage.tsx`).

Autonomous runs seed the admin from `DEFAULT_ADMIN_*` (backend `seedDefaultAdmin`)
and authenticate over the API, so neither screen is otherwise exercised.

## Files

| File | Purpose |
| --- | --- |
| `tests/setup-and-login.spec.ts` | The suite: wizard → login → wrong-password (serial). |
| `playwright.auth-flows.config.ts` | Dedicated config (own `globalSetup`, no retries). |
| `global-setup.auth-flows.ts` | Resets DB to a fresh install + asserts setup is incomplete. |
| `tests/utils/db-reset.ts` | TRUNCATEs org/admin/auth via `docker exec` (postgres isn't host-exposed). |
| `e2e-stack.env` | **Non-secret** throwaway env for the disposable stack. |
| `docker-compose.e2e.yml` | Isolation override — `helios_e2e_*` containers, never touches a dev stack. |
| `run-auth-flows.sh` | Up (fresh) → wait → test → `down -v`. Used locally **and** in CI. |

## Run it

One command brings up a fresh, isolated, disposable stack and runs the suite:

```bash
cd e2e && npm run e2e:auth-flows
```

Debugging: keep the stack up afterwards, then re-run just the specs:

```bash
E2E_KEEP_UP=1 bash e2e/run-auth-flows.sh          # leaves the stack running
cd e2e && npm run test:auth-flows                 # re-run against the live stack
```

The suite is **destructive** (it resets the DB), so it is `testIgnore`d from the
default `playwright.config.ts` and lives behind its own config.

### Against an already-running stack

Point `BASE_URL` at it and make sure the DB-reset helper targets that stack's
postgres container:

```bash
BASE_URL=http://localhost:8083 \
HELIOS_E2E_PG_CONTAINER=helios_postgres \
npm run test:auth-flows
```

> ⚠️ This TRUNCATEs organization/admin/auth data in whatever container you name.
> The default (`helios_e2e_postgres`) only ever hits the disposable stack.

## CI

`.github/workflows/e2e-auth-flows.yml` runs the same `run-auth-flows.sh`. It is
path-gated to the auth/first-run surface (+ manual `workflow_dispatch`) to keep
the heavier docker-stack + browser job off unrelated PRs. Widen the `paths:` list
to run it more broadly.
