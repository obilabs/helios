# OpenSpec Proposal: Pre-Release Infrastructure Cleanup

**ID:** pre-release-infrastructure
**Status:** Approved
**Priority:** P0 (BLOCKING RELEASE)
**Author:** Claude
**Created:** 2025-12-11

## Summary

Comprehensive infrastructure cleanup before first release. Includes API versioning, complete OpenAPI documentation, MCP server preparation, CORS fixes, request tracing, and environment validation.

## Why This Matters

1. **No release without this** - These are foundational issues that become breaking changes after release
2. **AI-Ready** - Proper OpenAPI docs enable MCP server for AI features
3. **Enterprise-Ready** - Request tracing, proper versioning, standardized responses
4. **Developer Experience** - Self-documenting API, consistent patterns

## Current State Assessment

### API Documentation
| Item | Current | Target |
|------|---------|--------|
| Route files | 38 | 38 |
| Documented routes | 0 | 38 |
| OpenAPI paths | `{}` empty | All endpoints |
| Swagger UI | Works but empty | Full documentation |

### Infrastructure
| Item | Current | Target |
|------|---------|--------|
| API prefix | `/api/...` | `/api/v1/...` |
| CORS env vars | `APPURL`, `DOMAIN` | `FRONTEND_URL` |
| WebSocket proxy | Missing | In nginx |
| Request tracing | None | `X-Request-ID` |
| Env validation | None | Startup checks |
| Response format | Inconsistent | Standardized |

## Part 1: API Versioning

### Route Changes
```typescript
// Before
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/organization/users', usersRoutes);

// After
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/organization/users', usersRoutes);

// Also support unversioned for backwards compat during transition
app.use('/api/dashboard', dashboardRoutes);  // Deprecated, remove in v2
```

### Frontend Updates
All 176 hardcoded URLs need `/v1/` added:
```typescript
// Before
fetch('/api/users')

// After
fetch('/api/v1/users')
```

### Versioning Strategy
- `v1` - Current API (stable after release)
- `v2` - Future breaking changes
- Unversioned routes deprecated but functional for 6 months

## Part 2: OpenAPI Documentation

### Documentation Standard
Every route file needs JSDoc annotations:

```typescript
/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: List all users
 *     description: Returns paginated list of users in the organization
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of users to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of users to skip
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', async (req, res) => { ... });
```

### Schema Definitions
Add to `backend/src/config/swagger.ts`:

```typescript
components: {
  schemas: {
    User: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'manager', 'user'] },
        department: { type: 'string' },
        jobTitle: { type: 'string' },
        isActive: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    },
    Group: { ... },
    PaginationMeta: {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
        hasMore: { type: 'boolean' }
      }
    },
    // ... all entities
  },
  responses: {
    Unauthorized: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    NotFound: { ... },
    ValidationError: { ... }
  }
}
```

## Part 3: MCP Server Integration

### What is MCP?
Model Context Protocol (MCP) is Anthropic's standard for AI assistants to interact with external systems. It defines "tools" that AI can call.

### OpenAPI to MCP Mapping
```
OpenAPI Endpoint          →  MCP Tool
─────────────────────────────────────────
GET /api/v1/users         →  helios_list_users
POST /api/v1/users        →  helios_create_user
GET /api/v1/users/{id}    →  helios_get_user
PUT /api/v1/users/{id}    →  helios_update_user
DELETE /api/v1/users/{id} →  helios_delete_user
GET /api/v1/groups        →  helios_list_groups
POST /api/v1/groups       →  helios_create_group
...
```

### MCP Server Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                     Helios Backend                          │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌───────────────┐   │
│  │ REST API    │    │ OpenAPI     │    │ MCP Server    │   │
│  │ /api/v1/*   │───►│ /api/v1/    │───►│ /mcp          │   │
│  │             │    │ openapi.json│    │               │   │
│  └─────────────┘    └─────────────┘    └───────────────┘   │
│         │                                      │            │
│         ▼                                      ▼            │
│  ┌─────────────┐                      ┌───────────────┐    │
│  │ Web UI      │                      │ AI Assistant  │    │
│  │ Dashboard   │                      │ Claude, etc.  │    │
│  └─────────────┘                      └───────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### MCP Endpoint
New endpoint at `/api/v1/mcp` or separate port:

```typescript
// backend/src/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server';
import { openApiToMcpTools } from './openapi-converter';

const mcpServer = new Server({
  name: 'helios',
  version: '1.0.0'
});

// Auto-generate tools from OpenAPI spec
const tools = openApiToMcpTools(swaggerSpec);
mcpServer.registerTools(tools);

// Resources (data the AI can read)
mcpServer.registerResource('users', async () => {
  return await userService.listUsers();
});

mcpServer.registerResource('groups', async () => {
  return await groupService.listGroups();
});
```

### AI Use Cases (Future)
1. **Natural Language Commands**
   - "Create a new user john@company.com in the Engineering department"
   - "Add all Marketing users to the Newsletter group"
   - "Show me users who haven't logged in for 30 days"

2. **Data Queries**
   - "How many users are in each department?"
   - "Who reports to Sarah Chen?"
   - "List all groups with more than 10 members"

3. **Automation**
   - "Offboard user X following our standard template"
   - "Set up new hire Y with Engineering onboarding"

## Part 4: Request Tracing

### X-Request-ID Middleware
```typescript
// backend/src/middleware/request-id.ts
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Add to logger context
  req.log = logger.child({ requestId });

  next();
}
```

### Usage in Routes
```typescript
router.get('/users', async (req, res) => {
  req.log.info('Fetching users');  // Includes requestId automatically
  // ...
});
```

### Benefits
- Trace requests across frontend → nginx → backend → database
- Debug production issues by searching logs for request ID
- Include in error responses for support tickets

## Part 5: CORS Cleanup

### Current (Broken)
```typescript
origin: process.env['NODE_ENV'] === 'production'
  ? [`https://${process.env['APPURL']}`, `https://${process.env['DOMAIN']}`]
  : ['http://localhost:3000', 'http://localhost:3001', ...]
```

### Fixed
```typescript
function getCorsOrigins(): string[] {
  const frontendUrl = process.env['FRONTEND_URL'];
  const publicUrl = process.env['PUBLIC_URL'];

  if (process.env['NODE_ENV'] === 'production') {
    const origins = [];
    if (frontendUrl) origins.push(frontendUrl);
    if (publicUrl && publicUrl !== frontendUrl) origins.push(publicUrl);
    return origins;
  }

  // Development - allow common local origins
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:80',
    'http://localhost',
    frontendUrl,
    publicUrl
  ].filter(Boolean);
}

const corsOptions = {
  origin: getCorsOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Actor-Name', 'X-Actor-Email']
};
```

## Part 6: Environment Validation

### Startup Validation
```typescript
// backend/src/config/env-validation.ts
import Joi from 'joi';

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),

  // Database (required)
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),

  // Security (required in production)
  JWT_SECRET: Joi.string().min(32).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.default('dev-secret-change-in-production')
  }),
  ENCRYPTION_KEY: Joi.string().min(32).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.default('dev-key-change-in-production-00000')
  }),

  // URLs (optional but recommended)
  PUBLIC_URL: Joi.string().uri().allow(''),
  FRONTEND_URL: Joi.string().uri().allow(''),

  // Redis (optional)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // S3/MinIO
  S3_ENDPOINT: Joi.string().required(),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
}).unknown(true);

export function validateEnv(): void {
  const { error, value } = envSchema.validate(process.env, { abortEarly: false });

  if (error) {
    console.error('❌ Environment validation failed:');
    error.details.forEach(detail => {
      console.error(`   - ${detail.message}`);
    });
    process.exit(1);
  }

  console.log('✅ Environment validation passed');
}
```

## Part 7: Response Standardization

### Standard Response Format
```typescript
// Success
{
  "success": true,
  "data": { ... } | [ ... ],
  "meta": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true,
    "requestId": "abc-123"
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [
      { "field": "email", "message": "Required field" }
    ]
  },
  "meta": {
    "requestId": "abc-123"
  }
}
```

### Response Helper
```typescript
// backend/src/utils/response.ts
export function successResponse(res, data, meta = {}) {
  return res.json({
    success: true,
    data,
    meta: {
      ...meta,
      requestId: res.req.requestId
    }
  });
}

export function errorResponse(res, status, code, message, details = null) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details && { details })
    },
    meta: {
      requestId: res.req.requestId
    }
  });
}

export function paginatedResponse(res, data, total, limit, offset) {
  return successResponse(res, data, {
    total,
    limit,
    offset,
    hasMore: offset + data.length < total
  });
}
```

## Part 8: WebSocket Proxy

### nginx.conf Addition
```nginx
# WebSocket for Socket.IO
location /socket.io/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket timeout
    proxy_read_timeout 86400;
}
```

## Success Criteria

1. **API Versioning**: All routes use `/api/v1/` prefix
2. **OpenAPI Complete**: All 38 route files have JSDoc annotations, `paths` is populated
3. **MCP Ready**: OpenAPI spec can generate MCP tool definitions
4. **Request Tracing**: Every request has `X-Request-ID` in logs and response
5. **CORS Fixed**: Uses `FRONTEND_URL`/`PUBLIC_URL`, includes localhost:80
6. **Env Validated**: Startup fails fast with clear error if missing required vars
7. **Responses Standard**: All endpoints use `successResponse`/`errorResponse` helpers
8. **WebSocket Works**: Socket.IO works through nginx proxy

## Dependencies

This proposal depends on:
- `frontend-api-url-refactor` (must update frontend URLs to /api/v1/)

This proposal blocks:
- First public release
- AI/MCP features

## Estimated Effort

| Part | Tasks | Effort |
|------|-------|--------|
| API Versioning | Route prefix changes | 2 hours |
| OpenAPI Docs | 38 route files | 8-10 hours |
| MCP Preparation | Schema definitions | 2 hours |
| Request Tracing | Middleware + logging | 2 hours |
| CORS Cleanup | Config fixes | 1 hour |
| Env Validation | Validation schema | 2 hours |
| Response Standard | Helpers + refactor | 4 hours |
| WebSocket Proxy | nginx config | 30 min |
| Testing | Full integration test | 4 hours |

**Total: ~25-28 hours (~3-4 days focused work)**

## Implementation Order

1. Environment validation (fail fast)
2. Request tracing (helps debug everything else)
3. Response standardization (needed before docs)
4. API versioning (breaking change, do early)
5. CORS cleanup (quick fix)
6. WebSocket proxy (quick fix)
7. OpenAPI documentation (largest task)
8. MCP preparation (depends on OpenAPI)
