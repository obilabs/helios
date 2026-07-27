#!/bin/bash
# ============================================================================
# Helios Client - Docker Migration Runner
# ============================================================================
# Runs migrations inside the Docker container.
# Usage: ./docker-migrate.sh [options]
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Running migrations via Docker...${NC}"
echo ""

# Copy migrations to container and run
docker exec -i helios_client_postgres psql -U postgres -d helios_client << 'EOF'
-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum VARCHAR(64)
);
EOF

# Run each migration file
for MIGRATION_FILE in "$SCRIPT_DIR"/migrations/*.sql; do
    if [ -f "$MIGRATION_FILE" ]; then
        FILENAME=$(basename "$MIGRATION_FILE")

        # Check if already applied
        APPLIED=$(docker exec helios_client_postgres psql -U postgres -d helios_client -t -c \
            "SELECT COUNT(*) FROM _migrations WHERE filename = '$FILENAME';" 2>/dev/null | tr -d ' ')

        if [ "$APPLIED" = "1" ]; then
            echo -e "${GREEN}[APPLIED]${NC} $FILENAME"
        else
            echo -n "[PENDING] $FILENAME - Running... "
            if docker exec -i helios_client_postgres psql -U postgres -d helios_client < "$MIGRATION_FILE" > /dev/null 2>&1; then
                # Record migration
                docker exec helios_client_postgres psql -U postgres -d helios_client -c \
                    "INSERT INTO _migrations (filename) VALUES ('$FILENAME') ON CONFLICT DO NOTHING;" > /dev/null 2>&1
                echo -e "${GREEN}OK${NC}"
            else
                echo "FAILED"
                echo "Error running $FILENAME"
                exit 1
            fi
        fi
    fi
done

echo ""
echo -e "${GREEN}Migrations complete!${NC}"
