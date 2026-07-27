# Project Context

## Purpose
Helios is the ONLY self-hosted Google Workspace management platform that gives organizations complete control over their data while providing enterprise-grade automation and security features at 70% less cost than cloud alternatives.

## Tech Stack
- **Frontend:** React 18, TypeScript, Lucide Icons
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL 14+
- **Cache:** Redis
- **Storage:** S3-compatible (MinIO)
- **Deployment:** Docker, Kubernetes
- **CLI:** Node.js based with transparent proxy
- **APIs:** Google Workspace Admin SDK, Gmail API, Drive API

## Project Conventions

### Code Style
- TypeScript strict mode enabled
- ESLint + Prettier configuration
- camelCase for variables/functions
- PascalCase for components/classes
- kebab-case for file names
- 2 space indentation
- No semicolons in TypeScript
- Functional components with hooks (React)

### Architecture Patterns
- **Frontend:** Component-based architecture with context for state
- **Backend:** Service-oriented with middleware pattern
- **API:** RESTful with consistent response format
- **Database:** Migration-based schema evolution
- **CLI:** Command pattern with transparent proxy
- **Security:** JWT authentication, RBAC authorization

### Testing Strategy
- Unit tests for services and utilities
- Integration tests for API endpoints
- E2E tests with Playwright for critical flows
- Minimum 80% code coverage target
- Test-driven development for new features

### Git Workflow
- Feature branches from `main`
- Conventional commits (feat:, fix:, docs:, etc.)
- PR reviews required before merge
- Squash merge to main
- Semantic versioning for releases

## Domain Context

### Key Concepts
- **Organization:** Single Google Workspace domain managed by Helios
- **Users:** Google Workspace users synced and managed
- **Groups:** Google Groups for collaboration
- **Org Units:** Policy containers in Google Workspace
- **Org Chart:** Visual hierarchy based on manager relationships
- **Lifecycle:** Automated onboarding/offboarding workflows
- **Transparent Proxy:** Direct Google API access with telemetry

### User Roles
- **Admin:** Full system access, can manage all settings
- **Manager:** Department-level access, limited settings
- **User:** Self-service access only

## Important Constraints

### Technical
- Must be 100% self-hosted (no cloud dependencies)
- Must work offline with cached data
- Must support air-gapped deployments
- API calls must go through transparent proxy
- All sensitive data must be encrypted at rest

### Business
- Target price: $5-10/user/year
- Time to first value: <30 minutes
- Must support 10-10,000 users
- No vendor lock-in (exportable data)

### Regulatory
- GDPR compliant
- SOC 2 ready
- HIPAA capable
- Audit logging required
- Data sovereignty guaranteed

## External Dependencies

### Google Workspace APIs
- Admin SDK Directory API (users, groups, org units)
- Gmail API (email management)
- Drive API (file management)
- Calendar API (calendar management)
- Reports API (audit logs)

### Third-party Services
- Google OAuth 2.0 (authentication)
- MinIO (S3-compatible storage)
- Redis (caching layer)
- PostgreSQL (primary database)

### Development Tools
- Docker Desktop (local development)
- Node.js 18+ (runtime)
- Git (version control)
- VS Code (recommended IDE)