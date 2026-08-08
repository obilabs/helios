# OpenAPI Implementation Plan for Helios

**Recommendation:** **Use OpenAPI 3.0 with swagger-jsdoc + swagger-ui-express**

---

## ✅ Why This Approach?

### **For Helios-Specific Endpoints:**
- Auto-generate OpenAPI spec from JSDoc comments in code
- Interactive Swagger UI at `/api/docs`
- No separate YAML files to maintain
- Code and docs stay in sync

### **For Proxy Endpoints:**
- Link to platform documentation (Google, Microsoft)
- Document the wrapper behavior (auth, audit, sync)
- Don't duplicate 1000+ platform endpoints

---

## 🏗️ Implementation Plan

### Step 1: Install Dependencies

```bash
cd backend
npm install --save swagger-jsdoc swagger-ui-express
npm install --save-dev @types/swagger-jsdoc @types/swagger-ui-express
```

### Step 2: Configure OpenAPI

**File:** `backend/src/config/swagger.ts`

```typescript
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Helios API',
      version: '1.0.0',
      description: `
        Helios API Gateway provides:

        1. **Helios-Specific Endpoints** - Portal management, authentication, settings
        2. **Transparent Proxy** - Pass-through to Google Workspace & Microsoft 365 APIs

        ## Authentication
        All requests require authentication:
        - User tokens: JWT from login
        - Service API keys: For automation
        - Vendor API keys: For MSP access (requires X-Actor headers)

        ## Transparent Proxy

        ### Google Workspace
        Any request to \`/api/google/*\` is proxied to Google Workspace APIs:

        \`\`\`
        POST /api/google/admin/directory/v1/users
        → Proxied to: https://admin.googleapis.com/admin/directory/v1/users
        → Returns: Google's real response
        → Logs: Full audit trail
        → Syncs: User data to Helios DB
        \`\`\`

        For Google Workspace API documentation, see:
        https://developers.google.com/admin-sdk

        ### Microsoft 365
        Any request to \`/api/microsoft/*\` is proxied to Microsoft Graph API:

        \`\`\`
        GET /api/microsoft/v1.0/users
        → Proxied to: https://graph.microsoft.com/v1.0/users
        \`\`\`

        For Microsoft Graph API documentation, see:
        https://docs.microsoft.com/graph
      `,
      contact: {
        name: 'Helios Support',
        email: 'support@helios.io'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server'
      },
      {
        url: 'https://api.helios.company.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Service or Vendor API key: "Bearer helios_service_..." or "Bearer helios_vendor_..."'
        }
      }
    },
    security: [
      { BearerAuth: [] },
      { ApiKeyAuth: [] }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/middleware/transparent-proxy.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
```

### Step 3: Add Swagger UI Route

**File:** `backend/src/index.ts` (add these lines)

```typescript
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

// API Documentation - Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Helios API Documentation'
}));

// Serve OpenAPI spec as JSON
app.get('/api/openapi.json', (req, res) => {
  res.json(swaggerSpec);
});
```

### Step 4: Document Endpoints with JSDoc

**Example:** `backend/src/routes/auth.routes.ts`

```typescript
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Login to Helios
 *     description: Authenticate with email and password to receive JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@company.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePassword123!
 *     responses:
 *       200:
 *         description: Successful login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   type: object
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req: Request, res: Response) => {
  // ... existing code
});
```

### Step 5: Document Transparent Proxy

**File:** `backend/src/middleware/transparent-proxy.ts`

```typescript
/**
 * @openapi
 * /api/google/{path}:
 *   all:
 *     tags:
 *       - Google Workspace Proxy
 *     summary: Transparent proxy to Google Workspace APIs
 *     description: |
 *       Proxies any Google Workspace API request through Helios with:
 *       - Full audit trail
 *       - Actor attribution
 *       - Intelligent sync to Helios database
 *
 *       ## How to Use
 *
 *       1. Find the Google API endpoint you need:
 *          https://developers.google.com/admin-sdk
 *
 *       2. Replace Google's base URL with Helios:
 *          - FROM: https://admin.googleapis.com/admin/directory/v1/users
 *          - TO:   https://helios.company.com/api/google/admin/directory/v1/users
 *
 *       3. Use your Helios token instead of Google token
 *
 *       4. Request/response format is IDENTICAL to Google's API
 *
 *       ## Examples
 *
 *       See Google's API documentation for full reference:
 *       - Admin SDK: https://developers.google.com/admin-sdk/directory/reference/rest
 *       - Gmail API: https://developers.google.com/gmail/api/reference/rest
 *       - Calendar API: https://developers.google.com/calendar/api/v3/reference
 *
 *     parameters:
 *       - in: path
 *         name: path
 *         schema:
 *           type: string
 *         required: true
 *         description: Google API path (e.g., admin/directory/v1/users)
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Successful proxy (returns Google's response)
 *       400:
 *         description: Google Workspace not configured
 *       401:
 *         description: Authentication failed
 *       404:
 *         description: Resource not found (from Google)
 */
transparentProxyRouter.all('/api/google/*', authenticateToken, async (req, res) => {
  // ... existing code
});
```

---

## 🎨 Swagger UI Customization

### Access Documentation:
```
http://localhost:3001/api/docs
```

### Features:
- ✅ Try endpoints directly from browser
- ✅ See request/response examples
- ✅ Auto-generate curl commands
- ✅ Grouped by tag (Authentication, Users, Groups, Proxy)
- ✅ Shows security requirements

---

## 📚 Documentation Structure

```
Helios API Docs
│
├── 1. Getting Started
│   ├── Authentication
│   ├── API Keys
│   └── Rate Limits
│
├── 2. Helios-Specific Endpoints (~30 endpoints)
│   ├── Authentication
│   │   ├── POST /api/auth/login
│   │   └── POST /api/auth/refresh
│   ├── Organization
│   │   ├── GET  /api/organization/dashboard
│   │   ├── POST /api/organization/setup
│   │   └── GET  /api/organization/users
│   ├── Settings
│   │   └── PATCH /api/organization/settings
│   └── API Keys
│       ├── POST /api/organization/api-keys
│       └── GET  /api/organization/api-keys
│
├── 3. Google Workspace Proxy (~1000+ endpoints)
│   ├── Overview (how proxy works)
│   ├── Examples (common operations)
│   └── Full Reference → Link to Google's docs
│
└── 4. Microsoft 365 Proxy (~1000+ endpoints)
    ├── Overview
    ├── Examples
    └── Full Reference → Link to Microsoft's docs
```

---

## 🚀 Implementation Timeline

### Day 1: Install & Configure (2 hours)
- Install swagger-jsdoc, swagger-ui-express
- Create swagger.ts config
- Add routes to index.ts
- Test that /api/docs loads

### Day 2-3: Document Core Endpoints (6 hours)
- Add JSDoc comments to auth routes
- Add JSDoc comments to organization routes
- Add JSDoc comments to setup routes
- Test Swagger UI shows all endpoints

### Day 4: Document Proxy Endpoints (2 hours)
- Add overview documentation for proxy behavior
- Add common examples
- Link to Google/Microsoft docs
- Explain audit trail & actor attribution

### Day 5: Polish & Test (2 hours)
- Customize Swagger UI theme
- Add code examples
- Test all documented endpoints
- Generate static HTML version

---

## 🎯 Success Criteria

### ✅ Complete When:
- Developer can visit /api/docs
- See all Helios-specific endpoints with examples
- See proxy endpoints with usage guide
- Test endpoints directly from Swagger UI
- Download OpenAPI spec JSON
- Generate client code (if needed)

---

## 📦 Deliverables

1. **Interactive Swagger UI** at `/api/docs`
2. **OpenAPI 3.0 spec** at `/api/openapi.json`
3. **API guide** (markdown)
4. **Code examples** (curl, JavaScript, Python)
5. **Postman collection** (exported from OpenAPI)

---

## 💡 Alternative: Auto-Generate from Types

For even better sync, use TypeScript decorators:

```typescript
import { ApiProperty } from '@nestjs/swagger'; // If we migrate to NestJS

class CreateUserDto {
  @ApiProperty({ example: 'user@company.com' })
  email: string;

  @ApiProperty({ example: 'John' })
  firstName: string;
}

// OpenAPI generated automatically from types
```

**When to consider:** If we hit maintenance burden with JSDoc comments

---

## 🎯 My Recommendation

**Start with swagger-jsdoc approach:**

1. **Quick to implement** (2-3 days)
2. **Minimal maintenance** (comments in code)
3. **Auto-synced** (code changes = doc changes)
4. **Good enough** for v1.0

**Later, if needed:**
- Migrate to NestJS (has better built-in OpenAPI)
- Or build custom API explorer UI
- Or generate from TypeScript types

---

**Want me to implement this now?** It's a 2-hour task to get basic Swagger UI working.
