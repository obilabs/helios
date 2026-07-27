# Guardrails to Prevent Regressions

**Created:** 2025-10-31
**Purpose:** Prevent regression issues and ensure consistent development environment

---

## 🚨 CRITICAL: The Regression Problem

### What Happened
During testing, Playwright tests started local development servers (`npm run dev`) in background processes. These local services continued running even after tests completed, causing:

1. **Port conflicts** - Local Node processes occupied ports 3000 and 3001
2. **Docker interference** - Browser connected to local services instead of Docker containers
3. **Broken features** - Local services lacked database connection, showing "Get Started" page
4. **Persistent processes** - Background bash shells kept services running indefinitely
5. **Hard to diagnose** - Multiple Node processes made it unclear what was running

### Root Cause
- Playwright tests spawned background processes
- These started frontend/backend dev servers locally
- Docker was running but browsers connected to local services first
- Local services had no database, triggering setup flow instead of login

---

## ✅ MANDATORY RULES

### Rule #1: NEVER Run Services Locally
```bash
# ❌ NEVER DO THIS:
cd backend && npm run dev
cd frontend && npm run dev
node backend/src/index.ts
npm start

# ✅ ALWAYS DO THIS INSTEAD:
docker-compose up -d
docker-compose ps
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Rule #2: ALWAYS Verify Docker First
**Before starting any work:**
```bash
# 1. Check Docker Desktop is running
docker --version

# 2. Verify containers are running
docker-compose ps

# Expected output (all "Up" and "healthy"):
# helios_client_backend    Up (healthy)
# helios_client_frontend   Up (healthy)
# helios_client_postgres   Up (healthy)
# helios_client_redis      Up (healthy)
```

### Rule #3: Check for Port Conflicts
```bash
# Check what's using ports 3000 and 3001
netstat -ano | findstr ":3000 :3001"

# Should ONLY show Docker process IDs (usually same PID like 12216)
# If you see multiple different PIDs, local processes are interfering
```

### Rule #4: Kill Local Processes Immediately
```bash
# If you accidentally started local services:
taskkill //F //IM node.exe

# Then restart Docker:
docker-compose restart
```

### Rule #5: NEVER Use Background Processes for Services
```bash
# ❌ NEVER:
npm run dev &  # Background process
run_in_background: true  # In Bash tool

# ✅ Use Docker for services
docker-compose up -d

# Background processes are ONLY for:
# - Short-lived test commands
# - One-off scripts
# - NOT for long-running servers
```

---

## 🔍 Pre-Flight Checklist

**Run this before EVERY session:**

### 1. Environment Check
```bash
# Check Docker is running
docker ps

# Check for local Node processes (should be NONE or very few)
tasklist | findstr "node.exe"

# If you see many node.exe processes:
taskkill //F //IM node.exe

# Check ports (should only show Docker PIDs)
netstat -ano | findstr ":3000 :3001"
```

### 2. Start Services
```bash
# Start Docker services
docker-compose up -d

# Verify all containers started
docker-compose ps

# Check backend logs for errors
docker-compose logs backend --tail 20

# Check frontend logs for errors
docker-compose logs frontend --tail 20
```

### 3. Verify Application
```bash
# Test backend health
curl http://localhost:3001/health

# Test setup status
curl http://localhost:3001/api/organization/setup/status

# Expected: {"success":true,"data":{"isSetupComplete":true,...}}

# Open browser
start http://localhost:3000

# Expected: Login page (NOT "Get Started" page)
```

---

## 🧪 Testing Guidelines

### Playwright Testing
**CRITICAL:** Playwright tests should NEVER start services

```typescript
// ❌ WRONG: Starting services in tests
test.beforeAll(async () => {
  await exec('npm run dev'); // DON'T DO THIS
});

// ✅ CORRECT: Assume services are already running in Docker
test.beforeAll(async () => {
  // Verify services are available
  const response = await fetch('http://localhost:3001/health');
  expect(response.ok).toBe(true);
});
```

### Test Execution Flow
1. **Ensure Docker is running** - Manual check before tests
2. **Run tests** - `npx playwright test`
3. **NO service startup** - Tests assume services exist
4. **Clean state** - Each test should clean up its own data
5. **Screenshots only** - No server restarts

### Environment Assumptions
- Database is populated with test data (jack@gridwrx.io)
- Backend is running and healthy
- Frontend is serving latest code
- Redis is available for sessions

---

## 🛡️ Regression Prevention Checklist

### Before Making Changes
- [ ] Docker containers are running (`docker-compose ps`)
- [ ] No local Node processes (`tasklist | findstr node.exe`)
- [ ] Ports 3000/3001 only show Docker PIDs
- [ ] Application loads correctly in browser
- [ ] Test account can log in (jack@gridwrx.io)

### After Making Changes
- [ ] Changes reflected in Docker (may need `docker-compose restart`)
- [ ] No errors in Docker logs
- [ ] Application still loads correctly
- [ ] Existing tests still pass
- [ ] No new Node processes spawned

### Before Committing
- [ ] Code changes tested in Docker (not locally)
- [ ] No hardcoded localhost references
- [ ] Environment variables used for config
- [ ] Tests pass with Docker services
- [ ] No background processes left running

---

## 🔧 Troubleshooting Guide

### "Get Started" Page Appears
**Symptom:** Browser shows welcome/setup page instead of login

**Diagnosis:**
```bash
# 1. Check setup status API
curl http://localhost:3001/api/organization/setup/status

# Should return: "isSetupComplete": true

# 2. Check database has organization
docker exec helios_client_postgres psql -U postgres -d helios_client -c "SELECT id, name FROM organizations;"

# Should show: Gridworx organization

# 3. Check which service is responding
curl -v http://localhost:3000 2>&1 | findstr "Docker"
```

**Solutions:**
```bash
# If database is empty: restore from backup or run migrations
docker-compose exec backend node src/database/migrate.ts

# If local service responding: kill local processes
taskkill //F //IM node.exe
docker-compose restart

# If Docker not running: start Docker Desktop
docker-compose up -d
```

### Port Already in Use
**Symptom:** Docker containers fail to start with port conflict

**Diagnosis:**
```bash
# Find what's using the ports
netstat -ano | findstr ":3000 :3001"
```

**Solutions:**
```bash
# Kill local Node processes
taskkill //F //IM node.exe

# Or kill specific PID
taskkill //F //PID 14620

# Then restart Docker
docker-compose up -d
```

### Changes Not Appearing
**Symptom:** Code changes don't show in browser

**Diagnosis:**
```bash
# Check if volumes are mounted correctly
docker-compose ps
docker inspect helios_client_frontend | findstr "Mounts"
```

**Solutions:**
```bash
# Restart specific container
docker-compose restart frontend

# Or rebuild if needed
docker-compose up -d --build frontend

# Clear browser cache (Ctrl+Shift+R)
```

### Tests Failing Unexpectedly
**Symptom:** Previously passing tests now fail

**Diagnosis:**
```bash
# 1. Check services are healthy
docker-compose ps

# 2. Check backend logs for errors
docker-compose logs backend --tail 50

# 3. Verify database state
docker exec helios_client_postgres psql -U postgres -d helios_client -c "SELECT email FROM organization_users WHERE email='jack@gridwrx.io';"

# 4. Check for background processes
tasklist | findstr "node.exe"
```

**Solutions:**
```bash
# Reset environment
docker-compose down
taskkill //F //IM node.exe  # If needed
docker-compose up -d

# Wait for healthy status
docker-compose ps

# Run tests again
npx playwright test
```

---

## 📋 Quick Reference Commands

### Daily Startup
```bash
# 1. Start Docker Desktop (manual)
# 2. Start containers
docker-compose up -d
# 3. Verify health
docker-compose ps
# 4. Check logs if needed
docker-compose logs -f
```

### Development Workflow
```bash
# Make code changes in editor
# Changes auto-reload in Docker (volume mounted)
# View logs for errors
docker-compose logs -f backend
# Test in browser
start http://localhost:3000
```

### Running Tests
```bash
# Ensure Docker is running
docker-compose ps
# Run all tests
npx playwright test
# Run specific test
npx playwright test tests/login-jack.test.ts
# View report
npx playwright show-report
```

### Cleanup
```bash
# Stop containers (keeps data)
docker-compose down

# Stop and remove volumes (DESTRUCTIVE)
docker-compose down -v

# Kill any stray processes
taskkill //F //IM node.exe
```

### Emergency Reset
```bash
# Nuclear option - complete reset
docker-compose down -v
docker system prune -a
taskkill //F //IM node.exe
# Then rebuild
docker-compose up -d --build
```

---

## 🎯 Success Indicators

### Healthy System
- Docker Desktop shows all containers running (green)
- `docker-compose ps` shows all services "Up (healthy)"
- `netstat -ano | findstr ":3000 :3001"` shows ONE PID (Docker)
- `tasklist | findstr node.exe` shows few or no processes
- Browser loads login page at http://localhost:3000
- Test account can log in (jack@gridwrx.io / TestPassword123!)
- All Playwright tests pass

### Red Flags
- Multiple Node.exe processes (indicates local services)
- Different PIDs for ports 3000/3001 (port conflict)
- "Get Started" page appears (wrong service responding)
- Docker shows "Unhealthy" status (service crashed)
- Tests intermittently fail (environment inconsistency)
- Changes don't appear (wrong service running)

---

## 📝 For AI Assistants

### When Asked to Run Tests
```typescript
// ❌ NEVER do this:
await bash('cd frontend && npm run dev', { run_in_background: true });
await bash('cd backend && npm run dev', { run_in_background: true });
await bash('npx playwright test');

// ✅ ALWAYS do this:
// 1. Verify Docker is running
await bash('docker-compose ps');
// 2. Run tests (assuming services exist)
await bash('npx playwright test');
```

### When Making Code Changes
```typescript
// ❌ NEVER do this:
await bash('cd backend && npm run dev'); // Start local server
await edit('backend/src/routes/foo.ts', ...); // Edit
await bash('curl http://localhost:3001/api/foo'); // Test

// ✅ ALWAYS do this:
await edit('backend/src/routes/foo.ts', ...); // Edit
await bash('docker-compose restart backend'); // Restart Docker service
await bash('docker-compose logs backend --tail 20'); // Check for errors
await bash('curl http://localhost:3001/api/foo'); // Test
```

### When Debugging Issues
```typescript
// ✅ Diagnostic flow:
1. Check Docker status: docker-compose ps
2. Check port conflicts: netstat -ano | findstr ":3000 :3001"
3. Check local processes: tasklist | findstr "node.exe"
4. Check backend logs: docker-compose logs backend --tail 50
5. Test API: curl http://localhost:3001/health
6. Only then make changes
```

---

## 🎓 Key Learnings

### Why This Matters
1. **Consistency** - Everyone uses same environment (Docker)
2. **Reproducibility** - Issues happen same way for everyone
3. **Isolation** - No system dependencies, only Docker
4. **CI/CD Ready** - Same containers in dev and production
5. **Clean State** - Easy to reset and rebuild

### What We Learned
1. Background processes are dangerous for long-running services
2. Port conflicts are hard to diagnose
3. Local services can mask Docker issues
4. Tests should NEVER start services
5. Always verify Docker before working

### Best Practices
1. Use Docker for ALL services
2. Check environment BEFORE working
3. Kill processes immediately if started accidentally
4. Test in Docker, not locally
5. Document commands for consistency

---

## 📚 Related Documentation

- `SESSION-HANDOFF-2025-10-31.md` - Detailed session notes about regression
- `AUTOMATED-TESTING-STRATEGY.md` - Testing approach and framework
- `docker-compose.yml` - Container configuration
- `.env.example` - Environment variable template
- `CLAUDE.md` - General project instructions

---

**Remember:** Docker is the single source of truth for this project. ALL services run in Docker. NO local development servers.
