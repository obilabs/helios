#!/bin/bash
# ============================================================================
# Helios Client - Database Migration Runner
# ============================================================================
# This script runs all pending migrations in order.
# Usage: ./run-migrations.sh [options]
#
# Options:
#   --dry-run     Show which migrations would run without executing
#   --force       Run all migrations even if already applied
#   --help        Show this help message
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration (can be overridden by environment variables)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-helios_client}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

# Parse arguments
DRY_RUN=false
FORCE=false

for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            ;;
        --force)
            FORCE=true
            ;;
        --help)
            echo "Helios Client - Database Migration Runner"
            echo ""
            echo "Usage: ./run-migrations.sh [options]"
            echo ""
            echo "Options:"
            echo "  --dry-run     Show which migrations would run without executing"
            echo "  --force       Run all migrations even if already applied"
            echo "  --help        Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  DB_HOST       Database host (default: localhost)"
            echo "  DB_PORT       Database port (default: 5432)"
            echo "  DB_NAME       Database name (default: helios_client)"
            echo "  DB_USER       Database user (default: postgres)"
            echo "  DB_PASSWORD   Database password (default: postgres)"
            exit 0
            ;;
    esac
done

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql command not found. Please install PostgreSQL client.${NC}"
    echo ""
    echo "For Docker deployments, run this script inside the container:"
    echo "  docker exec -it helios_client_postgres /bin/bash"
    echo "  cd /path/to/migrations && ./run-migrations.sh"
    exit 1
fi

# Connection string
export PGPASSWORD="$DB_PASSWORD"
PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Helios Client - Database Migration Runner${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "Database: ${YELLOW}$DB_NAME${NC} @ ${YELLOW}$DB_HOST:$DB_PORT${NC}"
echo ""

# Check database connection
echo -n "Checking database connection... "
if ! $PSQL_CMD -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}FAILED${NC}"
    echo -e "${RED}Could not connect to database. Please check your connection settings.${NC}"
    exit 1
fi
echo -e "${GREEN}OK${NC}"

# Create migrations tracking table if it doesn't exist
echo -n "Checking migrations table... "
$PSQL_CMD -c "
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum VARCHAR(64)
);
" > /dev/null 2>&1
echo -e "${GREEN}OK${NC}"
echo ""

# Get list of applied migrations
APPLIED_MIGRATIONS=$($PSQL_CMD -t -c "SELECT filename FROM _migrations ORDER BY filename;" 2>/dev/null | tr -d ' ')

# Get list of migration files
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo -e "${YELLOW}No migrations directory found at $MIGRATIONS_DIR${NC}"
    exit 0
fi

MIGRATION_FILES=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)

if [ -z "$MIGRATION_FILES" ]; then
    echo -e "${YELLOW}No migration files found in $MIGRATIONS_DIR${NC}"
    exit 0
fi

# Count migrations
TOTAL_MIGRATIONS=$(echo "$MIGRATION_FILES" | wc -l)
PENDING_COUNT=0
APPLIED_COUNT=0

echo -e "${BLUE}Found $TOTAL_MIGRATIONS migration file(s)${NC}"
echo ""

# Process each migration
for MIGRATION_FILE in $MIGRATION_FILES; do
    FILENAME=$(basename "$MIGRATION_FILE")

    # Check if already applied
    if echo "$APPLIED_MIGRATIONS" | grep -q "^$FILENAME$"; then
        if [ "$FORCE" = true ]; then
            echo -e "${YELLOW}[FORCE] $FILENAME${NC}"
        else
            echo -e "${GREEN}[APPLIED] $FILENAME${NC}"
            ((APPLIED_COUNT++))
            continue
        fi
    else
        echo -e "${YELLOW}[PENDING] $FILENAME${NC}"
    fi

    ((PENDING_COUNT++))

    if [ "$DRY_RUN" = true ]; then
        continue
    fi

    # Run the migration
    echo -n "  Running... "

    # Calculate checksum
    CHECKSUM=$(sha256sum "$MIGRATION_FILE" | cut -d' ' -f1)

    # Execute migration
    if $PSQL_CMD -f "$MIGRATION_FILE" > /dev/null 2>&1; then
        # Record migration
        $PSQL_CMD -c "
            INSERT INTO _migrations (filename, checksum)
            VALUES ('$FILENAME', '$CHECKSUM')
            ON CONFLICT (filename) DO UPDATE SET applied_at = NOW(), checksum = '$CHECKSUM';
        " > /dev/null 2>&1
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        echo -e "${RED}Migration $FILENAME failed. Please check the SQL file for errors.${NC}"
        exit 1
    fi
done

echo ""
echo -e "${BLUE}============================================${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "Dry run complete: ${YELLOW}$PENDING_COUNT${NC} migration(s) would be applied"
else
    echo -e "Migrations complete: ${GREEN}$PENDING_COUNT${NC} applied, ${BLUE}$APPLIED_COUNT${NC} already up to date"
fi
echo -e "${BLUE}============================================${NC}"
