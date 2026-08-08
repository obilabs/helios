# Docker Testing Guide - Production-Like Environment

**Your Insight:** "We don't want to complete testing only to start troubleshooting Docker issues."

**You're 100% correct!** Test in Docker from the start.

---

## 🎯 Why Test in Docker

### Testing Locally:
```
✅ Fast iteration
✅ Easy debugging
❌ Doesn't catch Docker-specific issues
❌ Doesn't catch environment variable issues
❌ Doesn't catch volume mount issues
❌ Doesn't test what customers will actually run
```

### Testing in Docker:
```
✅ Tests production-like environment
✅ Tests customer experience
✅ Catches Docker-specific issues early
✅ Catches env var issues
✅ Validates docker-compose.yml
⚠️ Slower iteration (rebuild required)
```

**For final testing: ALWAYS use Docker**

---

## 🚀 How to Test New Code in Docker

### Step 1: Start Docker Desktop
```
Windows: Start Docker Desktop application
```

### Step 2: Rebuild Backend Container
```bash
cd D:/personal-projects/helios/helios

# Stop everything
docker-compose down

# Rebuild backend with new dependencies
docker-compose build backend

# Start everything
docker-compose up -d

# Watch logs
docker-compose logs -f backend
```

### Step 3: Verify Services Started
```bash
# Check all containers running
docker-compose ps

# Expected output:
# NAME                      STATUS
# helios_backend     Up 30 seconds
# helios_postgres    Up 30 seconds
# helios_redis       Up 30 seconds
# helios_frontend    Up 30 seconds
```

### Step 4: Test Swagger UI
```bash
# Open browser
http://localhost:3001/api/docs

# Or curl
curl http://localhost:3001/api/docs
```

### Step 5: Test Transparent Proxy
```bash
# Get Helios token from UI
# Login → Browser console → localStorage.getItem('helios_token')

# Test proxy
curl http://localhost:3001/api/google/admin/directory/v1/users?maxResults=5 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🐛 Common Docker Issues

### Issue 1: "Container exited immediately"
```bash
# Check logs
docker-compose logs backend

# Common causes:
# - npm install failed
# - Missing environment variables
# - TypeScript build error
```

### Issue 2: "Changes not reflected"
```bash
# Rebuild container
docker-compose build backend --no-cache
docker-compose up -d backend
```

### Issue 3: "Port already in use"
```bash
# Stop everything
docker-compose down

# Kill local processes
taskkill //IM node.exe //F

# Restart
docker-compose up -d
```

### Issue 4: "Dependencies not installed"
```bash
# Check if node_modules exists in container
docker exec helios_backend ls -la /app/node_modules | head

# If missing, rebuild
docker-compose build backend
```

---

## 📋 Dockerfile Check

Let me verify your backend Dockerfile is correct:

<function_calls>
<invoke name="Read">
<parameter name="file_path">D:/personal-projects/helios/helios/backend/Dockerfile