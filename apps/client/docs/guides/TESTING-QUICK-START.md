# 🧪 Testing Quick Start Guide

**Status:** All features implemented, ready for your testing
**Goal:** Validate everything works, then reset and test onboarding, then launch v1.0!

---

## 🚀 Quick Start

### **1. Verify Docker is Running**
```bash
cd D:/personal-projects/helios/helios-client
docker-compose ps

# Expected: All 4 containers healthy
```

### **2. Access Services**
- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:3001
- **Swagger UI:** http://localhost:3001/api/docs

### **3. Login**
- Email: `testproxy@gridwrx.io`
- Password: `password123`

---

## ✅ 10-Minute Smoke Test

**Quick validation of critical features:**

1. **Users Page** (2 min)
   - [ ] Navigate to Users
   - [ ] Verify users display
   - [ ] Click ellipsis (⋮) - verify menu appears
   - [ ] Click Deleted tab - verify works

2. **Delete User** (2 min)
   - [ ] Click user row → Opens slide-out
   - [ ] Go to Danger Zone tab
   - [ ] Click Delete User
   - [ ] **Verify modal shows (NOT browser confirm)**
   - [ ] **Verify three options: Keep, Suspend, Delete**
   - [ ] Cancel (don't actually delete yet)

3. **Transparent Proxy** (2 min)
   - [ ] Open http://localhost:3001/api/docs
   - [ ] Find "Google Workspace Proxy" section
   - [ ] Read documentation
   - [ ] Try "Try it out" on any endpoint

4. **Security Events** (2 min)
   - [ ] Settings → Security → Security Events
   - [ ] Verify page loads
   - [ ] Check if any events exist

5. **Audit Logs** (2 min)
   - [ ] Settings → Security → Audit Logs
   - [ ] Verify page loads
   - [ ] Verify shows your login action
   - [ ] Test search box

**If all 5 pass:** ✅ Core features working!

---

## 🔍 Full Testing (30-60 minutes)

**Follow:** `FINAL-HANDOFF-BEFORE-TESTING-2025-11-02.md`
**Section:** "COMPREHENSIVE TESTING CHECKLIST"

---

## 🔄 Database Reset (For Clean Onboarding Test)

**When ready to test fresh onboarding:**

```bash
cd D:/personal-projects/helios/helios-client

# Stop
docker-compose down

# Remove database volume (DELETES ALL DATA!)
docker volume rm helios_client_postgres_data

# Restart
docker-compose up -d

# Watch backend initialize
docker-compose logs -f backend

# Expected: Database created, migrations run, ready for setup
```

**Then:**
- Open http://localhost:3000
- Should see setup wizard
- Complete onboarding flow
- Test everything from fresh state

---

## ⚠️ CRITICAL - DO NOT DELETE

**In Google Workspace:**
- **DO NOT delete:** `mike@gridworx.io` (only admin)

**For Testing Delete:**
- Use: `anthony@gridworx.io`, `coriander@gridworx.io`, or `indigo@gridwrx.io`
- Can restore from Google if needed (within 28 days)

---

## 📊 What to Report

**After testing, report:**

1. **What works perfectly** ✅
2. **What has bugs** 🐛 (with steps to reproduce)
3. **What's confusing** 🤔 (UX issues)
4. **What's missing** ❌ (blocking features)

**Then we:**
- Fix critical bugs
- Polish UX
- Launch v1.0!

---

## 🎯 Success = All These Work

**Core:**
- ✅ Login/logout
- ✅ Users list and search
- ✅ User detail slide-out
- ✅ Delete user (3 options modal)
- ✅ Deleted tab and restore
- ✅ Ellipsis menu quick actions

**Google:**
- ✅ Transparent proxy works
- ✅ Google Workspace sync works
- ✅ Can call any Google API

**Monitoring:**
- ✅ Security events page loads
- ✅ Audit logs page loads
- ✅ Filters work

**Docs:**
- ✅ Swagger UI loads
- ✅ Can test endpoints

**If all pass:** 🚀 **SHIP IT!**

---

**Ready to test! Let me know what you find.** 🧪
