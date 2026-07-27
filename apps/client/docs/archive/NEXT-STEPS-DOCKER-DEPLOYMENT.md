# Next Steps - Docker Deployment & Testing

**Date:** November 2, 2025
**Status:** Code ready, Docker deployment needed

---

## ✅ What's Complete

### Code:
- ✅ Transparent proxy middleware (500+ lines)
- ✅ OpenAPI/Swagger configuration
- ✅ Swagger UI integration
- ✅ TypeScript compilation successful
- ✅ Dependencies installed locally

### Docker Config:
- ✅ Dockerfile exists and looks correct
- ✅ docker-compose.yml properly configured
- ✅ Volume mounts for hot reload
- ✅ Environment variables set

---

## 🚀 Deploy to Docker (The Right Way)

### Prerequisites:
1. **Start Docker Desktop** (Windows application)
2. **Kill any local Node processes:**
   ```bash
   taskkill //IM node.exe //F
   ```

### Step-by-Step Deployment:

#### 1. Stop Everything
```bash
cd D:/personal-projects/helios/helios-client

# Stop all containers
docker-compose down

# Clean up (optional - if you want fresh start)
docker-compose down -v  # Removes volumes too
```

#### 2. Rebuild Backend Container
```bash
# Rebuild backend image with new dependencies
docker-compose build backend --no-cache

# This will:
# - Copy package.json (with new swagger packages)
# - Run npm install (installs swagger packages)
# - Copy source code (transparent-proxy.ts, swagger.ts, etc.)
# - Build the image
```

#### 3. Start All Services
```bash
# Start everything
docker-compose up -d

# Expected output:
# [+] Running 4/4
#  ✔ Container helios_client_postgres   Started
#  ✔ Container helios_client_redis      Started
#  ✔ Container helios_client_backend    Started
#  ✔ Container helios_client_frontend   Started
```

#### 4. Watch Logs
```bash
# Watch backend logs in real-time
docker-compose logs -f backend

# Expected to see:
# ✅ "Database client connected"
# ✅ "Database health check passed"
# ✅ "Rate limiting enabled"
# ✅ "Helios Platform Backend listening on port 3001"

# Should NOT see:
# ❌ "address already in use"
# ❌ "Cannot find module 'swagger-jsdoc'"
# ❌ App crashed
```

---

## 🧪 Testing in Docker

### Test 1: Health Check
```bash
curl http://localhost:3001/health

# Expected:
# {"status":"healthy","database":"connected","platformSetup":"complete",...}
```

### Test 2: Swagger UI
```bash
# Open in browser
http://localhost:3001/api/docs

# Expected:
# - Swagger UI loads
# - Shows "Helios API Gateway" title
# - Lists endpoints
# - Can expand and test endpoints
```

### Test 3: OpenAPI Spec
```bash
curl http://localhost:3001/api/openapi.json | jq .info

# Expected:
# {
#   "title": "Helios API Gateway",
#   "version": "1.0.0",
#   "description": "..."
# }
```

### Test 4: Transparent Proxy
```bash
# 1. Login to Helios UI
http://localhost:3000

# 2. Get token from browser console
localStorage.getItem('helios_token')

# 3. Test proxy
curl http://localhost:3001/api/google/admin/directory/v1/users?maxResults=5 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Expected (if Google Workspace configured):
# {
#   "users": [...],
#   "kind": "admin#directory#users",
#   ...
# }

# Expected (if Google Workspace NOT configured):
# {
#   "success": false,
#   "error": "Google Workspace not configured for this organization"
# }
```

---

## 🐛 Troubleshooting Docker Issues

### Issue: "Cannot find module 'swagger-jsdoc'"

**Cause:** npm install didn't run in container

**Fix:**
```bash
# Option 1: Rebuild with --no-cache
docker-compose build backend --no-cache

# Option 2: Install in running container
docker exec helios_client_backend npm install
docker-compose restart backend
```

---

### Issue: "Module not found: transparent-proxy"

**Cause:** Source files not copied to container

**Fix:**
```bash
# Check if files exist in container
docker exec helios_client_backend ls -la /app/src/middleware/

# Should see:
# transparent-proxy.ts

# If missing, rebuild
docker-compose build backend --no-cache
```

---

### Issue: "app crashed - waiting for file changes"

**Cause:** Usually a runtime error in the code

**Fix:**
```bash
# Check logs for error details
docker-compose logs backend | tail -50

# Common errors:
# - Missing environment variables
# - Database connection failed
# - Syntax errors
```

---

### Issue: "Port 3001 already in use"

**Cause:** Another process (likely local npm run dev) using port

**Fix:**
```bash
# Kill all Node processes
taskkill //IM node.exe //F

# Restart Docker
docker-compose restart backend
```

---

## 🎯 Production-Ready Checklist

After Docker deployment, verify:

- [ ] All 4 containers running (`docker-compose ps`)
- [ ] Backend health check passing (`curl http://localhost:3001/health`)
- [ ] Frontend loads (`http://localhost:3000`)
- [ ] Database accessible
- [ ] Swagger UI works (`http://localhost:3001/api/docs`)
- [ ] Transparent proxy works (test with token)
- [ ] Logs show no errors (`docker-compose logs`)

---

## 📊 Your Docker Environment

### Current Setup (from docker-compose.yml):
```yaml
backend:
  - Uses Node 18 Alpine
  - Runs npm run dev (hot reload with nodemon)
  - Mounts source code as volume
  - Port 3001 exposed
  - Health check configured
  - Depends on postgres + redis
```

**This is correct for development!**

For production, you'd change:
- `NODE_ENV: production`
- Build TypeScript to dist/
- Run `node dist/index.js` instead of `npm run dev`

---

## 🚀 Recommended Next Steps

### Right Now:
1. **Start Docker Desktop**
2. **Kill local Node processes:** `taskkill //IM node.exe //F`
3. **Rebuild backend:** `docker-compose build backend`
4. **Start services:** `docker-compose up -d`
5. **Test Swagger UI:** http://localhost:3001/api/docs

### After Docker is Running:
6. **Test transparent proxy** with real Google Workspace calls
7. **Verify audit logs** in database
8. **Verify intelligent sync** works
9. **Fix delete user bug** (critical)
10. **Build OU selector UI**

---

## 💡 Pro Tips

### Development Workflow with Docker:

**For code changes (hot reload):**
```bash
# Edit files in backend/src/
# Nodemon auto-restarts in container
# No rebuild needed!
```

**For dependency changes:**
```bash
# Edit package.json
# Must rebuild container
docker-compose build backend
docker-compose up -d backend
```

**For config changes:**
```bash
# Edit docker-compose.yml or .env
# Restart services
docker-compose up -d
```

### Best Practice:
```
Make code changes → Test in Docker → Fix bugs → Commit
(Don't switch between local and Docker during testing)
```

---

## ✅ Summary

**Your Question:** "Do we need to stop docker container to run locally?"

**Answer:** YES - same port. But you're RIGHT to want to test in Docker.

**What to do:**
1. Kill local Node processes
2. Start Docker Desktop
3. Rebuild backend container (`docker-compose build backend`)
4. Start services (`docker-compose up -d`)
5. Test everything in Docker
6. Fix bugs
7. Deploy confidently

**This way you find ALL issues (code + Docker) at once.**

---

Ready to deploy to Docker?

**Manual steps:**
1. Start Docker Desktop
2. Run: `docker-compose build backend && docker-compose up -d`
3. Test: http://localhost:3001/api/docs

Let me know when Docker is running and I can help you test!
