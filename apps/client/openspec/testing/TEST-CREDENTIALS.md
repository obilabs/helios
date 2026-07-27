# Test Credentials for GUI Testing

## Jack's Account (Admin User)

**Email:** `jack@gridworx.io`
**Password:** `password123`
**Role:** `admin`

**Database Password Hash:**
```
$2a$12$nT.ZiUxl2Fz/3Eq0weT1EOXKHZBmkFu8NXhx7MxqtN.HB/CIEPZa2
```

## IMPORTANT: Enable Jack's Account Before Testing

Jack's account may be disabled. Before running tests, enable it:

```bash
# Option 1: Quick enable command
docker exec helios_client_postgres psql -U postgres -d helios_client -c "UPDATE organization_users SET is_active = true, status = 'active', user_status = 'active' WHERE email = 'jack@gridworx.io';"

# Option 2: Run the enable script
docker exec -i helios_client_postgres psql -U postgres -d helios_client < backend/scripts/enable-jack-account.sql

# Verify account is enabled
docker exec helios_client_postgres psql -U postgres -d helios_client -c "SELECT email, is_active, status FROM organization_users WHERE email = 'jack@gridworx.io';"
```

## Resetting Jack's Password

If you need to reset Jack's password:

```bash
# Generate new hash
docker exec helios_client_backend node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('password123', 12).then(hash => console.log(hash));"

# Update using heredoc (to preserve $ signs)
cat <<'EOSQL' | docker exec -i helios_client_postgres psql -U postgres -d helios_client
UPDATE organization_users
SET password_hash = '$2a$12$nT.ZiUxl2Fz/3Eq0weT1EOXKHZBmkFu8NXhx7MxqtN.HB/CIEPZa2',
    is_active = true,
    status = 'active'
WHERE email = 'jack@gridworx.io';
EOSQL
```

## Test Users in Database

Query all test users:
```bash
docker exec helios_client_postgres psql -U postgres -d helios_client -c "SELECT email, role, first_name, last_name, is_active, status FROM organization_users;"
```

---

**Last Updated:** 2025-12-02
**Used By:** Playwright tests in `openspec/testing/tests/`
