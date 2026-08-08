# 🔌 Port Tracker - Helios Client Portal

**Important**: Multiple applications run on this server. Only manage ports for Helios services.

## 🟢 Currently Running Services

### Helios Services (Our Responsibility)
| Service | Port | Process | Status | Command to Start |
|---------|------|---------|--------|------------------|
| **Backend API** | 3001 | nodemon/ts-node | ✅ Running | `cd backend && npm run dev` |
| **React-Admin POC** | 5173 | Vite | ✅ Running | `cd experiment/react-admin-poc && npm run dev` |
| **Original Frontend** | 3000 | React Scripts | ❌ Not Running | `cd frontend && npm start` |
| **PostgreSQL** | 5432 | postgres | ✅ Running | Docker/System Service |

### Other Services (DO NOT TOUCH)
| Service | Port | Owner | Note |
|---------|------|-------|------|
| Other Apps | Various | External | Do not kill processes on unknown ports |

## 🔍 How to Check Running Services

### Check Helios Services Only
```bash
# Windows
netstat -ano | findstr :3001
netstat -ano | findstr :5173
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3001
lsof -i :5173
lsof -i :3000
```

### View Our Background Processes
```bash
# In Claude CLI
/bashes
```

## ⚠️ Safe Shutdown Commands

### Stop React-Admin POC (port 5173)
- Process ID: `aa0c0a`
- Safe shutdown: Use Ctrl+C in the terminal or `/kill aa0c0a`

### Stop Backend (port 3001)
- Process ID: `e12f81`
- Safe shutdown: Use Ctrl+C in the terminal or `/kill e12f81`

### Never Kill These
- PostgreSQL (port 5432) - Shared database
- Any process not started by us
- System services

## 📝 Port Allocation Plan

| Port Range | Purpose |
|------------|---------|
| 3000-3010 | Frontend applications |
| 3001 | Backend API (fixed) |
| 5173-5180 | Vite development servers |
| 5432 | PostgreSQL (system) |

## 🚀 Recommended Action

Since we're moving to the original frontend:
1. Keep backend running on **3001**
2. Stop React-Admin POC on **5173** (when ready)
3. Start original frontend on **3000**

## 🛑 Before Killing Any Process

Ask yourself:
1. Did I start this process?
2. Is it a Helios service?
3. Do I know what port it's on?
4. Will it affect other developers?

If ANY answer is "no" or "unsure" - DON'T KILL IT!