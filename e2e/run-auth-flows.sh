#!/usr/bin/env bash
# =============================================================================
# Run the first-run auth-flow E2E suite (setup wizard + login form) against a
# fresh, isolated, disposable Helios stack.
#
#   1. Bring up an isolated stack (helios_e2e_* containers, own volumes) with a
#      clean DB and NO DEFAULT_ADMIN_* -> the setup wizard is served.
#   2. Wait for nginx/backend health.
#   3. Run the Playwright auth-flows config (global-setup resets the DB and
#      confirms a fresh install, then the specs drive the two screens).
#   4. Always tear the stack down with `down -v` (disposable state).
#
# CI and local use the SAME path, so we test what we ship.
#
# Env knobs:
#   E2E_KEEP_UP=1     leave the stack running after the tests (for debugging)
#   E2E_ENV_FILE=...  compose env file (default e2e/e2e-stack.env). Point this at
#                     a copy with a different HTTP_PORT to run on a free port.
#   BASE_URL=...      override the app URL (default derived from the env file)
# =============================================================================
set -euo pipefail

# repo root = parent of this script's dir
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT="helios-e2e"
ENV_FILE="${E2E_ENV_FILE:-e2e/e2e-stack.env}"
COMPOSE=(docker compose -f docker-compose.yml -f e2e/docker-compose.e2e.yml -p "$PROJECT" --env-file "$ENV_FILE")

# Derive the app URL from the env file (HTTP_PORT) unless BASE_URL is set.
HTTP_PORT="$(grep -E '^HTTP_PORT=' "$ENV_FILE" | cut -d= -f2)"
export BASE_URL="${BASE_URL:-http://localhost:${HTTP_PORT}}"

teardown() {
  if [[ "${E2E_KEEP_UP:-0}" == "1" ]]; then
    echo "E2E_KEEP_UP=1 -> leaving stack '$PROJECT' running at $BASE_URL"
  else
    echo "Tearing down E2E stack '$PROJECT' (down -v)..."
    "${COMPOSE[@]}" down -v --remove-orphans || true
  fi
}
trap teardown EXIT

echo "==> Starting isolated E2E stack at $BASE_URL"
"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --build --wait

echo "==> Waiting for $BASE_URL/health ..."
for i in $(seq 1 60); do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    echo "    healthy after ${i}s"
    break
  fi
  if [[ "$i" == "60" ]]; then
    echo "!! $BASE_URL/health never became healthy" >&2
    "${COMPOSE[@]}" logs --tail=80 backend nginx || true
    exit 1
  fi
  sleep 1
done

echo "==> Installing e2e deps + Chromium (idempotent)"
# `--with-deps` installs OS libraries via apt and only applies on Linux/CI;
# on macOS/Windows it errors, so install just the browser there.
if [[ "$(uname -s)" == Linux* ]]; then
  ( cd e2e && npm ci && npx playwright install --with-deps chromium )
else
  ( cd e2e && npm ci && npx playwright install chromium )
fi

echo "==> Running auth-flows Playwright suite"
( cd e2e && npx playwright test --config=playwright.auth-flows.config.ts )
