import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Helios API Gateway',
      version: '1.0.0',
      description: `
# Helios API Gateway

Helios provides two types of APIs:

## 1. Helios-Specific Endpoints
Portal management, authentication, settings, and organization features.
These are documented below with full request/response schemas.

## 2. Transparent Proxy to Cloud Platforms
Access Google Workspace and Microsoft 365 APIs through Helios with full audit trail.

### Google Workspace Proxy

Any request to \`/api/v1/google/*\` is proxied to Google Workspace APIs:

**Example:**
\`\`\`bash
# Instead of calling Google directly:
POST https://admin.googleapis.com/admin/directory/v1/users

# Call through Helios (recommended - versioned):
POST https://helios.company.com/api/v1/google/admin/directory/v1/users

# Also works (deprecated - unversioned):
POST https://helios.company.com/api/google/admin/directory/v1/users
\`\`\`

**Benefits:**
- ✅ Full audit trail with actor attribution
- ✅ Automatic sync to Helios database
- ✅ Same request/response format as Google
- ✅ Works with ANY Google Workspace API endpoint

**Full API Reference:** [Google Workspace Admin SDK](https://developers.google.com/admin-sdk/directory/reference/rest)

### Microsoft 365 Proxy (Coming Soon)

\`/api/microsoft/*\` → Microsoft Graph API

---

## Authentication

All API requests require authentication using one of these methods:

### 1. User Token (JWT)
Login to Helios UI and get token from browser localStorage:
\`\`\`javascript
const token = localStorage.getItem('helios_token');
\`\`\`

### 2. Service API Key
For automation (Terraform, Ansible, CI/CD):
- Create in Settings > API Keys
- Type: Service
- Format: \`helios_service_<random>\`

### 3. Vendor API Key
For MSP/partner access with human attribution:
- Create in Settings > API Keys
- Type: Vendor
- Requires headers: \`X-Actor-Name\`, \`X-Actor-Email\`
- Format: \`helios_vendor_<random>\`

---

## Rate Limits

- Default: 100 requests per 15 minutes per IP
- Can be customized per API key
- Google/Microsoft rate limits still apply to proxied requests

---

## Support

- GitHub Issues: https://github.com/helios/helios-client/issues
- Documentation: https://docs.helios.io
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
        url: 'http://localhost:3001/api/v1',
        description: 'Development server (versioned API)'
      },
      {
        url: 'http://localhost:80/api/v1',
        description: 'Development server (via nginx proxy)'
      },
      {
        url: 'https://{domain}/api/v1',
        description: 'Production server',
        variables: {
          domain: {
            default: 'helios.example.com',
            description: 'Your Helios instance domain'
          }
        }
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'Login, token refresh, and session management'
      },
      {
        name: 'Organization',
        description: 'Organization setup, users, groups, and settings'
      },
      {
        name: 'Google Workspace',
        description: 'Google Workspace module configuration and sync'
      },
      {
        name: 'API Keys',
        description: 'Manage service and vendor API keys'
      },
      {
        name: 'Google Workspace Proxy',
        description: 'Transparent proxy to Google Workspace APIs with audit trail',
        externalDocs: {
          description: 'Google Workspace Admin SDK Documentation',
          url: 'https://developers.google.com/admin-sdk/directory/reference/rest'
        }
      },
      {
        name: 'Labels & Customization',
        description: 'Customize entity labels (Users, Groups, etc.)'
      },
      {
        name: 'Signatures',
        description: 'Email signature templates, assignments, and campaigns'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/v1/auth/login'
        },
        ServiceApiKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Service API key for automation: "Bearer helios_service_..."'
        },
        VendorApiKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Vendor API key for MSP access: "Bearer helios_vendor_..." (requires X-Actor-Name and X-Actor-Email headers)'
        }
      },
      schemas: {
        // Standard response formats
        Error: {
          type: 'object',
          required: ['success', 'error', 'meta'],
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR',
                  description: 'Machine-readable error code'
                },
                message: {
                  type: 'string',
                  example: 'Validation failed',
                  description: 'Human-readable error message'
                },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' }
                    }
                  },
                  description: 'Detailed field-level errors'
                }
              }
            },
            meta: {
              type: 'object',
              properties: {
                requestId: {
                  type: 'string',
                  format: 'uuid',
                  description: 'Unique request identifier for tracing'
                }
              }
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              description: 'Response payload'
            },
            meta: {
              $ref: '#/components/schemas/ResponseMeta'
            }
          }
        },
        ResponseMeta: {
          type: 'object',
          properties: {
            requestId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique request identifier for tracing'
            },
            total: {
              type: 'integer',
              description: 'Total count of items (for paginated responses)'
            },
            limit: {
              type: 'integer',
              description: 'Maximum items per page'
            },
            offset: {
              type: 'integer',
              description: 'Number of items skipped'
            },
            hasMore: {
              type: 'boolean',
              description: 'Whether more items exist beyond this page'
            }
          }
        },
        PaginationParams: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              default: 50,
              minimum: 1,
              maximum: 100,
              description: 'Maximum items to return'
            },
            offset: {
              type: 'integer',
              default: 0,
              minimum: 0,
              description: 'Number of items to skip'
            },
            search: {
              type: 'string',
              description: 'Search term to filter results'
            }
          }
        },
        // User entity
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            displayName: { type: 'string' },
            jobTitle: { type: 'string' },
            department: { type: 'string' },
            departmentId: { type: 'string', format: 'uuid' },
            role: {
              type: 'string',
              enum: ['admin', 'manager', 'user'],
              description: 'User role within the organization'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'suspended', 'pending'],
              description: 'User account status'
            },
            photoUrl: { type: 'string', format: 'uri' },
            phone: { type: 'string' },
            location: { type: 'string' },
            reportingManagerId: { type: 'string', format: 'uuid' },
            lastLoginAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        UserInput: {
          type: 'object',
          required: ['email', 'firstName', 'lastName'],
          properties: {
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            jobTitle: { type: 'string' },
            department: { type: 'string' },
            departmentId: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['admin', 'manager', 'user'] },
            phone: { type: 'string' },
            location: { type: 'string' },
            reportingManagerId: { type: 'string', format: 'uuid' }
          }
        },
        // Group/Access Group entity
        Group: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            email: { type: 'string', format: 'email' },
            type: {
              type: 'string',
              enum: ['static', 'dynamic'],
              description: 'Static groups have manual membership, dynamic groups auto-populate based on rules'
            },
            memberCount: { type: 'integer' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        GroupInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            email: { type: 'string', format: 'email' },
            type: { type: 'string', enum: ['static', 'dynamic'] }
          }
        },
        // Department entity
        Department: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            managerId: { type: 'string', format: 'uuid' },
            parentId: { type: 'string', format: 'uuid' },
            memberCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        // Organization entity
        Organization: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            domain: { type: 'string' },
            logoUrl: { type: 'string', format: 'uri' },
            settings: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        // Dashboard stats
        DashboardStats: {
          type: 'object',
          properties: {
            totalUsers: { type: 'integer' },
            activeUsers: { type: 'integer' },
            totalGroups: { type: 'integer' },
            totalDepartments: { type: 'integer' },
            pendingActions: { type: 'integer' },
            recentActivity: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  action: { type: 'string' },
                  actor: { type: 'string' },
                  target: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        // Auth types
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT access token' },
            refreshToken: { type: 'string', description: 'Refresh token for obtaining new access tokens' },
            user: { $ref: '#/components/schemas/User' },
            expiresIn: { type: 'integer', description: 'Token expiry time in seconds' }
          }
        },
        // Signature entities
        SignatureTemplate: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            organization_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            html_content: { type: 'string', description: 'HTML content with merge fields' },
            mobile_html_content: { type: 'string', description: 'Mobile-optimized HTML' },
            plain_text_content: { type: 'string', description: 'Plain text fallback' },
            thumbnail_url: { type: 'string', format: 'uri' },
            category: { type: 'string' },
            variables_used: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of merge fields used in template'
            },
            is_active: { type: 'boolean' },
            is_default: { type: 'boolean' },
            assignment_count: { type: 'integer', description: 'Number of active assignments' },
            usage_count: { type: 'integer', description: 'Number of users with this signature' },
            created_by: { type: 'string', format: 'uuid' },
            created_by_email: { type: 'string', format: 'email' },
            created_by_name: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        SignatureAssignment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            organization_id: { type: 'string', format: 'uuid' },
            template_id: { type: 'string', format: 'uuid' },
            template_name: { type: 'string' },
            template_type: { type: 'string' },
            target_type: {
              type: 'string',
              enum: ['organization', 'user', 'department', 'google_group', 'org_unit', 'microsoft_group'],
              description: 'Type of target for this assignment'
            },
            target_display: { type: 'string', description: 'Human-readable target name' },
            target_user_id: { type: 'string', format: 'uuid' },
            target_department_id: { type: 'string', format: 'uuid' },
            target_group_email: { type: 'string' },
            target_org_unit_path: { type: 'string' },
            priority: {
              type: 'integer',
              description: 'Priority level (lower = higher priority)'
            },
            is_active: { type: 'boolean' },
            activation_date: { type: 'string', format: 'date-time' },
            expiration_date: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        SignatureCampaign: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            organization_id: { type: 'string', format: 'uuid' },
            template_id: { type: 'string', format: 'uuid' },
            template_name: { type: 'string' },
            template_category: { type: 'string' },
            campaign_name: { type: 'string' },
            campaign_description: { type: 'string' },
            target_type: {
              type: 'string',
              enum: ['organization', 'user', 'department', 'google_group', 'org_unit', 'microsoft_group']
            },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
            timezone: { type: 'string', default: 'UTC' },
            status: {
              type: 'string',
              enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
              description: 'Current campaign status'
            },
            revert_to_previous: {
              type: 'boolean',
              description: 'Whether to restore previous signatures when campaign ends'
            },
            requires_approval: { type: 'boolean' },
            created_by: { type: 'string', format: 'uuid' },
            created_by_email: { type: 'string', format: 'email' },
            created_by_name: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', description: 'Current page number' },
            per_page: { type: 'integer', description: 'Items per page' },
            total: { type: 'integer', description: 'Total number of items' },
            total_pages: { type: 'integer', description: 'Total number of pages' }
          }
        }
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required or invalid credentials',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
                meta: { requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }
              }
            }
          }
        },
        Forbidden: {
          description: 'Access denied - insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: { code: 'FORBIDDEN', message: 'Access denied' },
                meta: { requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }
              }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: { code: 'NOT_FOUND', message: 'Resource not found' },
                meta: { requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Validation failed',
                  details: [
                    { field: 'email', message: 'Invalid email format' }
                  ]
                },
                meta: { requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }
              }
            }
          }
        },
        InternalError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
                meta: { requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }
              }
            }
          }
        }
      }
    },
    security: [
      { BearerAuth: [] },
      { ServiceApiKey: [] },
      { VendorApiKey: [] }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/middleware/transparent-proxy.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
