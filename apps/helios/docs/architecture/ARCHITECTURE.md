# Helios Client Portal - Architecture Documentation

## 📚 Documentation Index

This is the **single organization management portal** for Helios. Each installation manages one organization.

### Core Documentation

1. **[CLAUDE.md](CLAUDE.md)** - AI Development Instructions
   - Project overview and structure
   - Development commands
   - Critical rules and constraints
   - Security requirements

2. **[PROJECT-TRACKER.md](PROJECT-TRACKER.md)** - Progress Tracking
   - Feature completion status
   - Sprint planning
   - Known issues and blockers

### Architecture Documents

3. **[ARCHITECTURE.md](ARCHITECTURE.md)** (This file)
   - Overall system architecture
   - Technology stack
   - Data flow diagrams
   - Integration points

4. **[TEMPLATE-STUDIO-UX.md](TEMPLATE-STUDIO-UX.md)** - Template Management System
   - Template library architecture
   - Assignment and campaign system
   - Module-aware template types
   - Complete UX flows and wireframes

5. **[USER-PROFILE-PERMISSIONS.md](USER-PROFILE-PERMISSIONS.md)** - Profile Field Management
   - Field permission system
   - User self-service capabilities
   - Helios-only vs synced groups
   - Approval workflows

### Security & Setup Guides

6. **[SECURITY-SERVICE-ACCOUNTS.md](SECURITY-SERVICE-ACCOUNTS.md)** - Service Account Security
   - Google Workspace service account requirements
   - Security best practices
   - Compliance considerations

7. **[GOOGLE-WORKSPACE-SETUP-GUIDE.md](GOOGLE-WORKSPACE-SETUP-GUIDE.md)** - Client Setup
   - Step-by-step Google Workspace integration
   - Domain-wide delegation configuration
   - Troubleshooting guide

---

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Helios Client Portal                  │
│               (Single Organization Instance)             │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼────┐      ┌───────▼──────┐    ┌──────▼──────┐
    │Frontend│      │   Backend    │    │  PostgreSQL │
    │ React  │◄────►│  Node.js     │◄──►│  Database   │
    │  SPA   │      │   Express    │    │             │
    └────────┘      └───────┬──────┘    └─────────────┘
                            │
                    ┌───────┴────────┐
                    │                │
            ┌───────▼────┐   ┌───────▼─────────┐
            │  Google    │   │   Microsoft     │
            │ Workspace  │   │      365        │
            │    API     │   │      API        │
            └────────────┘   └─────────────────┘
```

---

## 📦 Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 7
- **Admin UI**: React-Admin (for rapid CRUD)
- **UI Components**: Material-UI (MUI)
- **Rich Text Editor**: Tiptap (for templates)
- **State Management**: React Context + Local State
- **Routing**: React Router v6
- **Form Handling**: React Hook Form (via React-Admin)

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **Authentication**: JWT (access + refresh tokens)
- **Session Store**: Redis
- **API Client**: Axios (for Google/Microsoft APIs)
- **Validation**: Express Validator
- **Logging**: Winston

### Database
- **Primary Database**: PostgreSQL 15+
- **ORM**: pg (native driver, no ORM)
- **Migrations**: Custom SQL migrations
- **Backup**: pg_dump automated daily

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Development**: Hot reload (Vite + nodemon)
- **Production**: PM2 process manager
- **Reverse Proxy**: Nginx (production)

---

## 🗄️ Database Architecture

### Core Tables

```sql
-- Organization (single record)
organizations
├── id (UUID, primary key)
├── name
├── domain
├── settings (JSONB)
└── created_at

-- Users
organization_users
├── id (UUID)
├── organization_id → organizations(id)
├── email (unique)
├── password_hash
├── first_name, last_name
├── role (admin | manager | user)
├── is_active
└── profile fields (job_title, department, etc.)

-- Groups (Helios-only or synced)
groups
├── id (UUID)
├── organization_id
├── name
├── group_type (helios_only | google_synced | microsoft_synced)
├── email (required for synced)
├── google_group_id
├── microsoft_group_id
├── sync_direction
└── last_sync_at

-- Module System
available_modules (catalog of all possible modules)
├── id (UUID)
├── module_key (google_workspace, microsoft_365, etc.)
├── module_name
├── module_type (infrastructure | integration | feature)
├── is_core (boolean)
└── requires_modules (JSONB array)

organization_modules (which modules this org has enabled)
├── organization_id → organizations(id)
├── module_id → available_modules(id)
├── is_enabled
├── config (JSONB)
└── last_sync_at
```

### Template Studio Tables

```sql
-- Template types (dynamic based on enabled modules)
template_types
├── type_key (gmail_signature, outlook_signature, etc.)
├── type_label
├── module_key → available_modules(module_key)
├── category (email_signatures, web_content, etc.)
└── supported_variables (JSONB)

-- Templates (the content library)
signature_templates (will be renamed to 'templates')
├── id (UUID)
├── organization_id
├── name
├── template_type → template_types(type_key)
├── html_content
├── module_scope (JSONB array of module keys)
├── variables_used (JSONB)
└── is_active

-- Assignments (permanent rules)
signature_assignments
├── template_id → signature_templates(id)
├── assignment_type (user | department | group | org_unit | default)
├── assignment_value (specific user/group/dept ID)
├── priority (1 = highest)
└── is_active

-- Campaigns (time-based deployments)
signature_campaigns
├── template_id → signature_templates(id)
├── name, description
├── start_date, end_date
├── target_type (group | department | everyone)
├── target_value (JSONB)
├── status (draft | scheduled | active | completed | reverted)
└── approval tracking
```

### Profile Permissions Tables

```sql
-- Field-level permissions
field_permissions
├── field_name (job_title, work_phone, etc.)
├── scope_type (global | group | user)
├── scope_id (group_id or user_id if applicable)
├── can_edit (boolean)
├── requires_approval (boolean)
├── syncs_to_platforms (JSONB array)
└── created_by

-- Audit trail for all field edits
user_field_edits
├── user_id
├── field_name
├── old_value, new_value
├── edited_by (may differ from user_id)
├── edit_source (self_service | admin | sync | api)
├── approval_status (pending | approved | rejected)
├── approved_by, approved_at
└── synced_to_platforms (JSONB)
```

---

## 🔌 Module System

### Architecture

Helios uses a **plugin-like module system** where features can be enabled/disabled per organization.

```typescript
interface Module {
  key: string;              // Unique identifier
  name: string;             // Display name
  type: 'infrastructure' | 'integration' | 'feature';
  isCore: boolean;          // Cannot be disabled
  requiresModules: string[]; // Dependencies

  // What this module provides
  templateTypes?: TemplateType[];
  assignmentTargets?: TargetType[];
  profileFields?: ProfileField[];
  navigationItems?: NavItem[];
}
```

### Module Types

**Infrastructure Modules** (Core - Always Enabled):
- `audit_logging` - System audit trail
- `email_signatures` → `template_studio` - Template management
- `public_assets` - Public file hosting

**Integration Modules** (Optional):
- `google_workspace` - Google Workspace sync
- `microsoft_365` - Microsoft 365 sync

**Feature Modules** (Optional):
- `email_forwarding` - Email forwarding rules
- `email_delegation` - Shared mailbox delegation
- `ooo_management` - Out-of-office automation

### Module Activation Flow

```
1. Admin navigates to Modules page
2. Clicks "Enable" on a module
3. If module has dependencies → Check if enabled
4. If module requires config → Show config wizard
5. Module enabled → UI updates dynamically
   - New navigation items appear
   - New template types available
   - New assignment targets appear
```

---

## 🎨 Frontend Architecture

### Component Structure

```
src/
├── App.tsx                    # Main app component
├── theme.ts                   # MUI theme customization
├── dataProvider.ts            # React-Admin data layer
├── authProvider.ts            # React-Admin auth layer
│
├── components/
│   ├── TemplateEditor.tsx     # Tiptap rich text editor
│   ├── TemplateInput.tsx      # React-Admin wrapper
│   └── GoogleWorkspaceConfig.tsx  # Google Workspace wizard
│
├── pages/
│   ├── Dashboard.tsx          # Main dashboard
│   ├── Settings.tsx           # Organization settings
│   ├── CustomLogin.tsx        # Login page
│   └── TemplateStudio/        # Template management
│       ├── TemplateLibrary.tsx
│       ├── Assignments.tsx
│       └── Campaigns.tsx
│
├── resources/                 # React-Admin resources
│   ├── users.tsx              # User CRUD
│   ├── groups.tsx             # Groups (Helios + synced)
│   ├── departments.tsx        # Departments
│   ├── modules.tsx            # Module management
│   ├── orgunits.tsx           # Google Workspace org units
│   ├── public-files.tsx       # Public assets
│   └── signatures.tsx         # Templates
│
└── services/
    ├── api.ts                 # API client
    └── moduleConfig.ts        # Module definitions
```

### State Management Strategy

- **React-Admin** manages CRUD state automatically
- **React Context** for global settings (org, user, modules)
- **Local State** for UI interactions (modals, forms)
- **No Redux** - keeping it simple

### Dynamic UI Based on Modules

```typescript
// App.tsx
const [modules, setModules] = useState<Record<string, boolean>>({});

useEffect(() => {
  fetchModules().then(data => {
    const enabled = {};
    data.forEach(m => enabled[m.slug] = m.isEnabled);
    setModules(enabled);
  });
}, []);

// Conditionally render resources
{modules.google_workspace && (
  <Resource name="groups" list={GroupList} />
)}
```

---

## 🔐 Authentication & Authorization

### JWT-Based Authentication

```typescript
interface AccessToken {
  type: 'access';
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  exp: number;  // 8 hours
}

interface RefreshToken {
  type: 'refresh';
  userId: string;
  exp: number;  // 7 days
}
```

**Flow**:
1. User logs in with email/password
2. Backend issues access token (8h) + refresh token (7d)
3. Frontend stores both in localStorage
4. Every API request includes `Authorization: Bearer {accessToken}`
5. When access token expires, use refresh token to get new one
6. If refresh fails → redirect to login

### Role-Based Access Control (RBAC)

```typescript
enum UserRole {
  ADMIN = 'admin',      // Full access
  MANAGER = 'manager',  // Department management
  USER = 'user'         // Self-service only
}

// Middleware
requirePermission('admin')  // Only admins
requireAuth               // Any authenticated user
```

### Permission Matrix

| Action | Admin | Manager | User |
|--------|-------|---------|------|
| View own profile | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ✅ (limited fields) |
| View all users | ✅ | ✅ (dept only) | ❌ |
| Create users | ✅ | ✅ (dept only) | ❌ |
| Enable modules | ✅ | ❌ | ❌ |
| Manage templates | ✅ | ✅ (can create) | ❌ |
| Approve field edits | ✅ | ✅ (if manager) | ❌ |

---

## 🔄 Data Synchronization

### Google Workspace Sync

**Direction**: Bidirectional (configurable)

```
Helios Database ←→ Google Workspace API
      ↓                     ↓
  gw_synced_users      Directory Users
  gw_groups            Groups
  gw_org_units         Org Units
```

**Sync Triggers**:
- **Manual**: Admin clicks "Sync Now"
- **Scheduled**: Cron job every 15 minutes (configurable)
- **Webhook**: Google pushes changes (future)

**Conflict Resolution**:
- Helios as Source of Truth: Helios → Google (overwrite)
- Google as Source of Truth: Google → Helios (overwrite)
- Manual Review: Show diff, let admin decide

**Sync Safety**:
```typescript
// Prevent sync loops
const recentSyncs = new Map();

if (recentSyncs.has(key) && timeDiff < 60000) {
  logger.warn('Potential sync loop');
  return false;  // Skip this sync
}
```

### Microsoft 365 Sync

Similar architecture to Google Workspace, but:
- Uses Microsoft Graph API
- Different field mappings
- OAuth 2.0 app registration required

---

## 📊 Data Flow Examples

### Example 1: User Edits Profile Field

```
1. User changes "job_title" from "Engineer" to "Senior Engineer"
   ↓
2. Frontend: Calls PUT /api/users/{id}
   ↓
3. Backend: Check field_permissions
   - Is job_title editable by this user? YES (group exception)
   - Requires approval? YES
   ↓
4. Backend: Create user_field_edits record
   - status: 'pending'
   - requires_approval: true
   ↓
5. Backend: Notify manager via email
   ↓
6. Manager: Approves change
   ↓
7. Backend: Update organization_users.job_title
   ↓
8. Backend: Sync to Google Workspace (if module enabled)
   ↓
9. Google Workspace: User's title updated
   ↓
10. Backend: Update user_field_edits
    - status: 'approved'
    - synced_to_platforms: ['google_workspace']
```

---

### Example 2: Create Template Campaign

```
1. Admin creates "Holiday 2025" campaign
   - Template: Holiday signature
   - Dates: Dec 15 - Jan 5
   - Target: Everyone
   ↓
2. Backend: Create signature_campaigns record
   - status: 'scheduled'
   ↓
3. Scheduler: Checks campaigns every hour
   ↓
4. Dec 15, 9:00 AM: Campaign activates
   ↓
5. Backend: For each user:
   - Check if user in target
   - Create temporary assignment
   - Priority 0 (campaigns always win)
   ↓
6. User's email client: Pulls signature
   ↓
7. Jan 5, 11:59 PM: Campaign ends
   ↓
8. Backend: Remove temporary assignments
   - Revert to previous signature
   ↓
9. Campaign: status = 'completed'
```

---

## 🚀 Deployment Architecture

### Development Environment

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    ports: ["3001:3001"]
    depends_on: [postgres, redis]

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
```

### Production Architecture

```
Internet
    ↓
Nginx (Reverse Proxy + SSL)
    ↓
┌───────────────────────┐
│   Frontend (Static)   │
│   Served by Nginx     │
└───────────────────────┘
    ↓
┌───────────────────────┐
│   Backend (PM2)       │
│   Node.js Cluster     │
│   4 workers           │
└───────────────────────┘
    ↓
┌───────────────────────┐
│   PostgreSQL          │
│   Master + Replica    │
└───────────────────────┘
```

---

## 📈 Scalability Considerations

### Current Scale Target
- **Users**: 10,000 per organization
- **Templates**: 1,000 per organization
- **Campaigns**: 50 concurrent
- **Sync Frequency**: Every 15 minutes
- **API Requests**: 1000 req/min

### Optimization Strategies

**Database**:
- Indexed foreign keys
- Materialized views for dashboards
- Connection pooling (pg pool)

**Caching**:
- Redis for session storage
- In-memory cache for module configs
- CDN for public assets

**API**:
- Rate limiting per IP
- Pagination on all list endpoints
- GraphQL for complex queries (future)

---

## 🔒 Security Architecture

### Defense in Depth

**Layer 1: Network**
- HTTPS only (TLS 1.3)
- CORS configured
- Rate limiting

**Layer 2: Authentication**
- Bcrypt password hashing (cost 12)
- JWT with short expiry
- Refresh token rotation

**Layer 3: Authorization**
- Role-based access control
- Resource-level permissions
- Field-level permissions

**Layer 4: Data**
- Service account keys encrypted (AES-256)
- Sensitive fields encrypted at rest
- Database backup encryption

**Layer 5: Audit**
- All admin actions logged
- Failed login attempts tracked
- Sync operations audited

### Security Best Practices

```typescript
// ✅ DO: Validate all inputs
const schema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'user'])
});

// ✅ DO: Sanitize outputs
const safe = DOMPurify.sanitize(userInput);

// ✅ DO: Use parameterized queries
db.query('SELECT * FROM users WHERE email = $1', [email]);

// ❌ DON'T: Concatenate SQL
db.query(`SELECT * FROM users WHERE email = '${email}'`);  // SQL injection!
```

---

## 🧪 Testing Strategy

### Unit Tests
- Business logic functions
- Data validators
- Permission checkers

### Integration Tests
- API endpoints
- Database operations
- Google/Microsoft API mocks

### E2E Tests
- User workflows (Playwright)
- Admin workflows
- Sync operations

---

## 📚 API Documentation

### REST API Structure

```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/verify

GET    /api/organization/users
POST   /api/organization/users
PUT    /api/organization/users/:id
DELETE /api/organization/users/:id

GET    /api/modules
POST   /api/modules/:slug/enable
POST   /api/modules/:slug/disable

GET    /api/templates
POST   /api/templates
PUT    /api/templates/:id
DELETE /api/templates/:id

GET    /api/assignments
POST   /api/assignments
DELETE /api/assignments/:id

GET    /api/campaigns
POST   /api/campaigns
PUT    /api/campaigns/:id
POST   /api/campaigns/:id/deploy
POST   /api/campaigns/:id/revert
```

---

## 🔄 Migration Path

### From Current to New Architecture

**Phase 1**: Template Studio
1. Create `template_types` table
2. Update `signature_templates` with `template_type`
3. Build Template Library UI
4. Migrate existing templates

**Phase 2**: Profile Permissions
1. Create `field_permissions` table
2. Create `user_field_edits` table
3. Build permissions UI
4. Add self-service profile editing

**Phase 3**: Group Sync
1. Update `groups` table with sync fields
2. Build group sync service
3. Add conversion UI
4. Migrate existing groups

---

## 🎯 Success Metrics

### Technical Metrics
- **Uptime**: 99.9%
- **API Response Time**: p95 < 200ms
- **Sync Accuracy**: 99.99%
- **Security Incidents**: 0

### Business Metrics
- **Setup Time**: < 15 minutes
- **Self-Service Adoption**: > 80%
- **Admin Time Saved**: 10 hours/week
- **User Satisfaction**: > 4.5/5

---

## 🚧 Future Enhancements

### Planned Features
- GraphQL API for complex queries
- Real-time sync via webhooks
- Mobile app (React Native)
- Advanced analytics dashboard
- Custom workflow builder
- Slack/Teams integration
- SSO (SAML, OIDC)

### Scalability Improvements
- Multi-region deployment
- PostgreSQL sharding
- Elasticsearch for search
- Redis cluster for sessions
- Kafka for event streaming

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue**: Module shows as disabled but is configured
**Fix**: Check `organization_modules` table, run sync

**Issue**: Template not appearing in assignment dropdown
**Fix**: Check `template.module_scope` matches enabled modules

**Issue**: Field edits not syncing to Google
**Fix**: Check `field_permissions.syncs_to_platforms` configuration

### Debug Commands

```bash
# Check module status
docker exec helios_postgres psql -U postgres -d helios \
  -c "SELECT * FROM organization_modules WHERE organization_id = '{id}';"

# View recent sync errors
docker exec helios_postgres psql -U postgres -d helios \
  -c "SELECT * FROM sync_logs WHERE error IS NOT NULL ORDER BY created_at DESC LIMIT 10;"

# Check field permission conflicts
docker exec helios_postgres psql -U postgres -d helios \
  -c "SELECT * FROM field_permissions WHERE field_name = 'job_title';"
```

---

This architecture document provides the technical foundation for the Helios Client Portal. For specific feature implementation details, refer to the specialized documentation linked at the top of this file.
