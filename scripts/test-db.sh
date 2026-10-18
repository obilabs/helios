#!/usr/bin/env bash
# Run SQL integration tests against the running Helios Postgres container.
#
# Each test file lives in backend/database/tests/ and is wrapped in
# BEGIN/ROLLBACK so the database is left untouched. PL/pgSQL ASSERT statements
# fail fast with a clear message; psql -v ON_ERROR_STOP=1 propagates the
# failure to a non-zero exit code.
#
# These cover guarantees that no typecheck and no Jest test can exercise:
# triggers, table ACLs and a hash chain only exist inside a real Postgres.
#
# Usage:
#   scripts/test-db.sh                      # run all test files
#   scripts/test-db.sh audit-immutability   # run one by name
#
# Override the container, user or database with HELIOS_DB_CONTAINER,
# HELIOS_DB_USER, HELIOS_DB_NAME.

set -euo pipefail

CONTAINER="${HELIOS_DB_CONTAINER:-helios_postgres}"
DB_USER="${HELIOS_DB_USER:-postgres}"
DB_NAME="${HELIOS_DB_NAME:-helios}"
TEST_DIR="$(cd "$(dirname "$0")/../backend/database/tests" && pwd)"
PATTERN="${1:-*}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Error: container '${CONTAINER}' is not running. Start the stack first." >&2
  exit 1
fi

shopt -s nullglob
files=( "${TEST_DIR}"/${PATTERN}.integration.test.sql )
if [ ${#files[@]} -eq 0 ]; then
  echo "No test files matching '${PATTERN}.integration.test.sql' in ${TEST_DIR}" >&2
  exit 1
fi

failures=0
for f in "${files[@]}"; do
  name="$(basename "$f")"
  echo "── ${name}"
  if docker exec -i "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -q < "$f" 2>&1; then
    echo "   PASS"
  else
    echo "   FAIL"
    failures=$((failures + 1))
  fi
done

if [ "${failures}" -gt 0 ]; then
  echo ""
  echo "${failures} test file(s) failed."
  exit 1
fi

echo ""
echo "All test files passed."
