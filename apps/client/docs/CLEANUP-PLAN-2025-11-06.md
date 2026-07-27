# Comprehensive Cleanup Plan - November 6, 2025

## Problem Statement

The root directory has become cluttered with **120 markdown files**, mostly session notes, status reports, and temporary documentation. This creates:

1. **Difficulty finding current documentation** - Which file has the truth?
2. **Confusion about what's current** - 15 different "FINAL" and "SESSION-HANDOFF" files
3. **Maintenance burden** - Outdated info contradicts reality
4. **Poor developer experience** - Can't quickly understand the project

## Cleanup Strategy

### Phase 1: Create Organized Documentation Structure ✅

```
helios-client/
├── README.md                    ← Keep (main entry point)
├── CLAUDE.md                    ← Keep (AI instructions)
├── docs/                        ← Create organized structure
│   ├── architecture/           ← Architecture decisions
│   ├── features/               ← Feature documentation
│   ├── guides/                 ← User/admin guides
│   ├── testing/                ← Testing documentation
│   └── archive/                ← Historical session notes
```

### Phase 2: Categorize All 120 Files

#### A. KEEP IN ROOT (Critical, Current, Referenced)
```
✅ README.md                    - Main entry point
✅ CLAUDE.md                    - AI development instructions
✅ DESIGN-SYSTEM.md             - Active design system
✅ ARCHITECTURE.md              - Current architecture
✅ PROJECT-TRACKER.md           - Project progress
✅ docker-compose.yml           - Infrastructure
✅ .env.example                 - Configuration
✅ package.json                 - Project config
```

#### B. MOVE TO docs/guides/ (User/Setup Documentation)
```
→ GOOGLE-WORKSPACE-SETUP-GUIDE.md
→ PROVIDER-SETUP-GUIDE.md
→ SECURITY-SERVICE-ACCOUNTS.md
→ DOCKER-TESTING-GUIDE.md
→ TESTING-QUICK-START.md
→ MANUAL-TEST-CHECKLIST-V1.0.md
→ GAM-TESTING-GUIDE.md
→ GET-JWT-TOKEN.md
```

#### C. MOVE TO docs/architecture/ (Technical Architecture)
```
→ TRANSPARENT-PROXY-ARCHITECTURE.md
→ SYNC-ARCHITECTURE-DECISION.md
→ API-DOCUMENTATION-STRATEGY.md
→ OPENAPI-IMPLEMENTATION-PLAN.md
→ REDIS-USAGE.md
→ TENANT-CLEANUP-ANALYSIS.md
→ EMAIL-FORWARDING-VIA-HIDDEN-GROUPS.md
→ EMAIL-SUFFIX-WORKFLOW.md
```

#### D. MOVE TO docs/features/ (Feature Documentation)
```
→ BULK-OPERATIONS-README.md
→ TEMPLATE-STUDIO-UX.md
→ GROUP-MAILBOX-FEASIBILITY.md
→ USER-PROFILE-PERMISSIONS.md
→ SECURITY-EVENTS-AUDIT-LOGS-IMPLEMENTATION.md
→ GUARDRAILS.md
```

#### E. MOVE TO docs/archive/ (Historical Session Notes)
```
All SESSION-* files (20+ files)
All FINAL-* files (10+ files)
All *-COMPLETE.md files (15+ files)
All *-STATUS.md files (10+ files)
All V1-* files (5+ files)
All dated summaries
```

#### F. DELETE (Obsolete, Duplicate, Temporary)
```
❌ NEXT-SESSION-START-HERE.md (multiple versions - outdated)
❌ APP-NOW-READY-FOR-TESTING.md (superseded)
❌ APP-WORKING-NOW.md (superseded)
❌ ALL-ISSUES-FOUND.md (temporary debugging)
❌ FIX-FRONTEND-ERROR.md (temporary)
❌ CLEANUP-TODO.md (superseded by this plan)
❌ READY-FOR-YOUR-TESTING.md (temporary)
❌ START-HERE-TESTING-PHASE.md (superseded)
❌ TEST-TRANSPARENT-PROXY-NOW.md (temporary)
❌ CRITICAL-ISSUES-ROUND-2.md (temporary)
❌ DELETE-USER-BUG-FIXED.md (temporary)
❌ ROOT-CAUSE-ANALYSIS.md (temporary)
❌ PREVENTION-STRATEGIES.md (temporary)
```

### Phase 3: Delete Dead Code Files

#### Backend Routes (Multi-Tenant Artifacts)
```bash
rm backend/src/routes/tenant-setup.routes.ts
rm backend/src/routes/tenant-auth.routes.ts
rm backend/src/routes/platform.routes.ts
rm backend/src/middleware/auth.ts.bak
rm backend/src/routes/auth.routes.ts.bak
```

#### Backend Services
```bash
rm backend/src/core/plugins/PluginManager.ts  # Multi-tenant plugin system
```

### Phase 4: Fix Database Documentation

```bash
# Export actual schema
docker exec helios_client_postgres pg_dump -U postgres -d helios_client --schema-only > docs/architecture/schema-actual.sql

# Archive old incorrect schema
mv database/schema.sql docs/archive/schema-OLD-MULTITENANT.sql

# Create README explaining migration system
```

### Phase 5: Update Core Documentation

#### Update CLAUDE.md
Add warnings about:
- Tenant vs organization terminology
- Dead route files removed
- New docs structure

#### Create docs/README.md
Navigation guide for all documentation

#### Update root README.md
- Quick start instructions
- Link to organized docs
- Remove outdated info

### Phase 6: Consolidate Information

Create definitive reference documents:

#### docs/FEATURES.md
- Current feature list
- What works, what doesn't
- Known limitations

#### docs/TESTING.md
- How to run tests
- Test coverage
- Manual testing checklist

#### docs/DEPLOYMENT.md
- Docker setup
- Environment variables
- Production considerations

## Execution Order

1. ✅ **Create directory structure** (docs/guides, docs/architecture, docs/features, docs/archive)
2. **Move files to organized locations** (automated script)
3. **Delete obsolete files** (after confirming no references)
4. **Delete dead backend code** (safe, already commented out)
5. **Update database documentation** (export actual schema)
6. **Create consolidated reference docs** (FEATURES.md, TESTING.md, etc.)
7. **Update CLAUDE.md** (new structure, warnings)
8. **Update README.md** (point to new structure)
9. **Test that everything works** (all imports still valid)

## Success Criteria

- ✅ Root directory has <15 files
- ✅ All documentation findable in logical locations
- ✅ No references to deleted files
- ✅ Clear "start here" path for new developers
- ✅ No multi-tenant confusion artifacts
- ✅ All tests still pass

## Timeline

- **Phase 1-2:** 10 minutes (directory creation + categorization)
- **Phase 3:** 5 minutes (delete dead code)
- **Phase 4:** 5 minutes (database docs)
- **Phase 5:** 10 minutes (update core docs)
- **Phase 6:** 15 minutes (consolidate info)
- **Testing:** 10 minutes

**Total:** ~1 hour for thorough cleanup
