# Helios Client Portal - Documentation Index

Welcome to the Helios documentation! This index helps you find what you need quickly.

## 🚀 Quick Start

**New to the project?** Start here:
1. Read main [README.md](../README.md) - Project overview
2. Read [CLAUDE.md](../CLAUDE.md) - Development guidelines
3. Check [docs/guides/DOCKER-TESTING-GUIDE.md](guides/DOCKER-TESTING-GUIDE.md) - Get running locally
4. Review [ARCHITECTURE.md](../ARCHITECTURE.md) - Understand the system

## 📚 Documentation Structure

### Core Documentation (Root Directory)

| File | Purpose |
|------|---------|
| [README.md](../README.md) | Project overview and quick start |
| [CLAUDE.md](../CLAUDE.md) | AI development instructions and guidelines |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | System architecture and technical design |
| [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md) | UI/UX design system and components |
| [PROJECT-TRACKER.md](../PROJECT-TRACKER.md) | Project progress and feature status |
| [AGENTS.md](../AGENTS.md) | OpenSpec agent instructions |

### Setup & User Guides (`docs/guides/`)

Setup and configuration documentation:

| Guide | Description |
|-------|-------------|
| [DOCKER-TESTING-GUIDE.md](guides/DOCKER-TESTING-GUIDE.md) | Local development with Docker |
| [GOOGLE-WORKSPACE-SETUP-GUIDE.md](guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md) | Configure Google Workspace integration |
| [PROVIDER-SETUP-GUIDE.md](guides/PROVIDER-SETUP-GUIDE.md) | MSP/consultant setup guide |
| [SECURITY-SERVICE-ACCOUNTS.md](guides/SECURITY-SERVICE-ACCOUNTS.md) | Service account security requirements |
| [TESTING-QUICK-START.md](guides/TESTING-QUICK-START.md) | Quick testing guide |
| [MANUAL-TEST-CHECKLIST-V1.0.md](guides/MANUAL-TEST-CHECKLIST-V1.0.md) | Manual testing checklist |
| [GET-JWT-TOKEN.md](guides/GET-JWT-TOKEN.md) | API authentication guide |

### Developer Console & CLI (`docs/`)

Command-line interface and API documentation:

| Guide | Description |
|-------|-------------|
| [CLI-COMMANDS.md](CLI-COMMANDS.md) | Complete CLI command reference |
| [TRANSPARENT-PROXY-GUIDE.md](TRANSPARENT-PROXY-GUIDE.md) | Transparent proxy usage and architecture |
| [GAM-PARITY-ANALYSIS.md](GAM-PARITY-ANALYSIS.md) | GAM command parity comparison |
| [DEVELOPER-CONSOLE-COMPLETE.md](DEVELOPER-CONSOLE-COMPLETE.md) | Implementation summary and status |

### Research & Implementation Planning (`docs/`)

Comprehensive user research and implementation guides:

| Guide | Description |
|-------|-------------|
| [ADMIN-TOOLS-RESEARCH-REPORT.md](ADMIN-TOOLS-RESEARCH-REPORT.md) | 8-hour research analysis of GAM, BetterCloud, CloudM (60 commands, UI/UX priorities, feature gaps) |
| [EXECUTIVE-SUMMARY-ADMIN-TOOLS.md](EXECUTIVE-SUMMARY-ADMIN-TOOLS.md) | Quick reference: Top 10 commands, Top 5 UI priorities, 4-phase roadmap |
| [COMMAND-IMPLEMENTATION-GUIDE.md](COMMAND-IMPLEMENTATION-GUIDE.md) | Developer guide: API specs, service methods, UI components, testing |
| [UI-WIREFRAMES-SPEC.md](UI-WIREFRAMES-SPEC.md) | Detailed wireframes, component specs, responsive design requirements |

### Technical Architecture (`docs/architecture/`)

Deep-dive technical documentation:

| Document | Topic |
|----------|-------|
| [TRANSPARENT-PROXY-ARCHITECTURE.md](architecture/TRANSPARENT-PROXY-ARCHITECTURE.md) | Google Workspace API proxy design |
| [SYNC-ARCHITECTURE-DECISION.md](architecture/SYNC-ARCHITECTURE-DECISION.md) | User sync system decisions |
| [API-DOCUMENTATION-STRATEGY.md](architecture/API-DOCUMENTATION-STRATEGY.md) | OpenAPI/Swagger strategy |
| [REDIS-USAGE.md](architecture/REDIS-USAGE.md) | Redis caching and sessions |
| [TENANT-CLEANUP-ANALYSIS.md](architecture/TENANT-CLEANUP-ANALYSIS.md) | Multi-tenant removal analysis |
| [EMAIL-FORWARDING-VIA-HIDDEN-GROUPS.md](architecture/EMAIL-FORWARDING-VIA-HIDDEN-GROUPS.md) | Email forwarding implementation |
| [schema-actual-2025-11-06.sql](architecture/schema-actual-2025-11-06.sql) | Current database schema export |

### Feature Documentation (`docs/features/`)

Feature-specific documentation:

| Feature | Description |
|---------|-------------|
| [BULK-OPERATIONS-README.md](features/BULK-OPERATIONS-README.md) | Bulk user operations |
| [TEMPLATE-STUDIO-UX.md](features/TEMPLATE-STUDIO-UX.md) | Template studio feature |
| [GROUP-MAILBOX-FEASIBILITY.md](features/GROUP-MAILBOX-FEASIBILITY.md) | Group mailbox feature analysis |
| [USER-PROFILE-PERMISSIONS.md](features/USER-PROFILE-PERMISSIONS.md) | Permission system |
| [SECURITY-EVENTS-AUDIT-LOGS-IMPLEMENTATION.md](features/SECURITY-EVENTS-AUDIT-LOGS-IMPLEMENTATION.md) | Security and audit logging |

### Historical Archive (`docs/archive/`)

Session notes, status reports, and historical documentation from development.

## 🗂️ Documentation by Topic

### Getting Started
- [README.md](../README.md) - Start here!
- [DOCKER-TESTING-GUIDE.md](guides/DOCKER-TESTING-GUIDE.md) - Local setup
- [CLAUDE.md](../CLAUDE.md) - Development guidelines

### Architecture & Design
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System overview
- [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md) - UI components
- [TRANSPARENT-PROXY-ARCHITECTURE.md](architecture/TRANSPARENT-PROXY-ARCHITECTURE.md) - API proxy

### Database
- [database/README.md](../database/README.md) - Database documentation
- [schema-actual-2025-11-06.sql](architecture/schema-actual-2025-11-06.sql) - Current schema
- [database/migrations/](../database/migrations/) - Migration files

### Google Workspace Integration
- [GOOGLE-WORKSPACE-SETUP-GUIDE.md](guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md) - Setup guide
- [SECURITY-SERVICE-ACCOUNTS.md](guides/SECURITY-SERVICE-ACCOUNTS.md) - Security requirements
- [TRANSPARENT-PROXY-ARCHITECTURE.md](architecture/TRANSPARENT-PROXY-ARCHITECTURE.md) - API integration
- [TRANSPARENT-PROXY-GUIDE.md](TRANSPARENT-PROXY-GUIDE.md) - Transparent proxy usage guide
- [CLI-COMMANDS.md](CLI-COMMANDS.md) - Developer Console CLI commands

### Testing
- [TESTING-QUICK-START.md](guides/TESTING-QUICK-START.md) - Quick start
- [MANUAL-TEST-CHECKLIST-V1.0.md](guides/MANUAL-TEST-CHECKLIST-V1.0.md) - Manual tests
- [DOCKER-TESTING-GUIDE.md](guides/DOCKER-TESTING-GUIDE.md) - Docker testing

### Features
- [BULK-OPERATIONS-README.md](features/BULK-OPERATIONS-README.md) - Bulk operations
- All feature docs in [docs/features/](features/)

## 🔍 Finding What You Need

### By Role

**New Developer:**
1. [README.md](../README.md)
2. [CLAUDE.md](../CLAUDE.md)
3. [DOCKER-TESTING-GUIDE.md](guides/DOCKER-TESTING-GUIDE.md)
4. [ARCHITECTURE.md](../ARCHITECTURE.md)

**Frontend Developer:**
1. [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md)
2. Frontend code: `frontend/src/`
3. [CLAUDE.md](../CLAUDE.md) - UI/UX requirements

**Backend Developer:**
1. [ARCHITECTURE.md](../ARCHITECTURE.md)
2. [database/README.md](../database/README.md)
3. Backend code: `backend/src/`
4. [TRANSPARENT-PROXY-ARCHITECTURE.md](architecture/TRANSPARENT-PROXY-ARCHITECTURE.md)
5. [TRANSPARENT-PROXY-GUIDE.md](TRANSPARENT-PROXY-GUIDE.md) - API usage guide

**System Administrator:**
1. [GOOGLE-WORKSPACE-SETUP-GUIDE.md](guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md)
2. [SECURITY-SERVICE-ACCOUNTS.md](guides/SECURITY-SERVICE-ACCOUNTS.md)
3. [DOCKER-TESTING-GUIDE.md](guides/DOCKER-TESTING-GUIDE.md)

**MSP/Consultant:**
1. [PROVIDER-SETUP-GUIDE.md](guides/PROVIDER-SETUP-GUIDE.md)
2. [GOOGLE-WORKSPACE-SETUP-GUIDE.md](guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md)
3. [SECURITY-SERVICE-ACCOUNTS.md](guides/SECURITY-SERVICE-ACCOUNTS.md)

### By Task

**Setting up locally:**
- [DOCKER-TESTING-GUIDE.md](guides/DOCKER-TESTING-GUIDE.md)

**Configuring Google Workspace:**
- [GOOGLE-WORKSPACE-SETUP-GUIDE.md](guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md)
- [SECURITY-SERVICE-ACCOUNTS.md](guides/SECURITY-SERVICE-ACCOUNTS.md)

**Understanding the database:**
- [database/README.md](../database/README.md)
- [schema-actual-2025-11-06.sql](architecture/schema-actual-2025-11-06.sql)

**Working on UI:**
- [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md)
- `frontend/src/components/`

**Adding a new feature:**
1. Read [CLAUDE.md](../CLAUDE.md) - Guidelines
2. Check [PROJECT-TRACKER.md](../PROJECT-TRACKER.md) - Current status
3. Review [ARCHITECTURE.md](../ARCHITECTURE.md) - System design
4. Create feature docs in `docs/features/`

**Testing:**
- [TESTING-QUICK-START.md](guides/TESTING-QUICK-START.md)
- [MANUAL-TEST-CHECKLIST-V1.0.md](guides/MANUAL-TEST-CHECKLIST-V1.0.md)

## 📝 Documentation Standards

### When to Create New Docs

**DO create documentation for:**
- New features (in `docs/features/`)
- Architecture decisions (in `docs/architecture/`)
- Setup/configuration guides (in `docs/guides/`)

**DON'T create documentation for:**
- Session notes (add to `docs/archive/` if you must)
- Temporary status reports (they become outdated)
- Duplicate information (update existing docs instead)

### Where to Put Documentation

| Type | Location |
|------|----------|
| Project overview | `README.md` (root) |
| Development guidelines | `CLAUDE.md` (root) |
| Architecture decisions | `docs/architecture/` |
| User/setup guides | `docs/guides/` |
| Feature documentation | `docs/features/` |
| Session notes (if needed) | `docs/archive/` |
| Database documentation | `database/README.md` |

## 🔄 Keeping Documentation Updated

### Update These Regularly
- [PROJECT-TRACKER.md](../PROJECT-TRACKER.md) - As features are completed
- [database/README.md](../database/README.md) - When schema changes
- This index - When adding major new docs

### Archive When Done
- Session notes → `docs/archive/`
- Status reports → `docs/archive/`
- Implementation summaries → `docs/archive/`

### Delete When Obsolete
- Temporary debugging notes
- Outdated duplicate information
- Incorrect documentation

## 🆘 Need Help?

1. **Search this index** for relevant docs
2. **Check [CLAUDE.md](../CLAUDE.md)** for development guidelines
3. **Review [ARCHITECTURE.md](../ARCHITECTURE.md)** for system understanding
4. **Look at code comments** - well-documented
5. **Ask in project discussions** - if applicable

## 🎯 Documentation Checklist

Before considering documentation complete:

- [ ] README.md has quick start
- [ ] CLAUDE.md has development guidelines
- [ ] ARCHITECTURE.md explains system design
- [ ] DESIGN-SYSTEM.md defines UI standards
- [ ] docs/guides/ has setup instructions
- [ ] docs/architecture/ has technical decisions
- [ ] docs/features/ explains major features
- [ ] database/README.md explains schema
- [ ] This index is up to date

---

**Last Updated:** 2025-11-07
**Documentation Structure:** Reorganized and consolidated. Added CLI and Transparent Proxy documentation.
