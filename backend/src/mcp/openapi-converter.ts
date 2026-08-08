/**
 * OpenAPI to MCP Tool Converter
 *
 * Converts OpenAPI specification endpoints to MCP tool definitions.
 * This enables AI assistants to discover and use Helios API endpoints.
 *
 * Naming convention:
 * - Tools are prefixed with 'helios_'
 * - Uses snake_case: helios_list_users, helios_create_group
 * - Matches OpenAPI operationId where available
 *
 * @see https://github.com/modelcontextprotocol/typescript-sdk
 */

import { z } from 'zod';

/**
 * MCP Tool definition structure
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<unknown>;
}

/**
 * OpenAPI path item structure (simplified)
 */
interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: {
      'application/json'?: {
        schema?: OpenApiSchema;
      };
    };
  };
  responses?: Record<string, OpenApiResponse>;
}

interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

interface OpenApiSchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
  $ref?: string;
}

interface OpenApiResponse {
  description?: string;
  content?: {
    'application/json'?: {
      schema?: OpenApiSchema;
    };
  };
}

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
}

/**
 * Convert HTTP method and path to tool name
 * e.g., GET /api/v1/users -> helios_list_users
 *       POST /api/v1/users -> helios_create_user
 *       GET /api/v1/users/{id} -> helios_get_user
 *       PUT /api/v1/users/{id} -> helios_update_user
 *       DELETE /api/v1/users/{id} -> helios_delete_user
 */
export function pathToToolName(method: string, path: string, operationId?: string): string {
  // Use operationId if available and valid
  if (operationId && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(operationId)) {
    return `helios_${operationId}`.toLowerCase();
  }

  // Extract resource from path
  // /api/v1/organization/users -> users
  // /api/v1/organization/users/{id} -> users
  const segments = path.split('/').filter(s => s && !s.startsWith('{') && s !== 'api' && s !== 'v1' && s !== 'organization');

  // Get the last meaningful segment (the resource)
  const resource = segments[segments.length - 1] || 'resource';

  // Determine action based on method and path pattern
  const hasIdParam = path.includes('{');

  let action: string;
  switch (method.toLowerCase()) {
    case 'get':
      action = hasIdParam ? 'get' : 'list';
      break;
    case 'post':
      action = 'create';
      break;
    case 'put':
      action = 'update';
      break;
    case 'patch':
      action = 'patch';
      break;
    case 'delete':
      action = 'delete';
      break;
    default:
      action = method.toLowerCase();
  }

  // Convert resource to singular for single-item operations
  const resourceName = hasIdParam && action !== 'list'
    ? resource.replace(/s$/, '')
    : resource;

  return `helios_${action}_${resourceName}`.toLowerCase().replace(/-/g, '_');
}

/**
 * Convert OpenAPI schema to Zod schema
 */
export function schemaToZod(schema: OpenApiSchema | undefined, components?: Record<string, OpenApiSchema>): z.ZodTypeAny {
  if (!schema) {
    return z.unknown();
  }

  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    if (refName && components && components[refName]) {
      return schemaToZod(components[refName], components);
    }
    return z.unknown();
  }

  switch (schema.type) {
    case 'string':
      let stringSchema = z.string();
      if (schema.format === 'uuid') {
        stringSchema = stringSchema.uuid();
      } else if (schema.format === 'email') {
        stringSchema = stringSchema.email();
      } else if (schema.format === 'uri') {
        stringSchema = stringSchema.url();
      }
      if (schema.minLength !== undefined) {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (schema.maxLength !== undefined) {
        stringSchema = stringSchema.max(schema.maxLength);
      }
      if (schema.enum) {
        return z.enum(schema.enum as [string, ...string[]]);
      }
      return stringSchema;

    case 'integer':
    case 'number':
      let numberSchema = z.number();
      if (schema.type === 'integer') {
        numberSchema = numberSchema.int();
      }
      if (schema.minimum !== undefined) {
        numberSchema = numberSchema.min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        numberSchema = numberSchema.max(schema.maximum);
      }
      return numberSchema;

    case 'boolean':
      return z.boolean();

    case 'array':
      if (schema.items) {
        return z.array(schemaToZod(schema.items, components));
      }
      return z.array(z.unknown());

    case 'object':
      if (schema.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        const requiredFields = schema.required || [];

        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const propZod = schemaToZod(propSchema, components);
          shape[key] = requiredFields.includes(key) ? propZod : propZod.optional();
        }
        return z.object(shape);
      }
      return z.record(z.string(), z.unknown());

    default:
      return z.unknown();
  }
}

/**
 * Build input schema for a tool from OpenAPI operation
 */
export function buildToolInputSchema(
  operation: OpenApiOperation,
  pathParams: string[],
  components?: Record<string, OpenApiSchema>
): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};

  // Add path parameters
  for (const param of pathParams) {
    shape[param] = z.string().describe(`Path parameter: ${param}`);
  }

  // Add query/header parameters
  if (operation.parameters) {
    for (const param of operation.parameters) {
      if (param.in === 'query' || param.in === 'header') {
        const paramSchema = schemaToZod(param.schema, components);
        shape[param.name] = param.required
          ? paramSchema.describe(param.description || param.name)
          : paramSchema.optional().describe(param.description || param.name);
      }
    }
  }

  // Add request body properties
  if (operation.requestBody?.content?.['application/json']?.schema) {
    const bodySchema = operation.requestBody.content['application/json'].schema;
    if (bodySchema.properties) {
      const requiredFields = bodySchema.required || [];
      for (const [key, propSchema] of Object.entries(bodySchema.properties)) {
        const propZod = schemaToZod(propSchema, components);
        shape[key] = requiredFields.includes(key) ? propZod : propZod.optional();
      }
    }
  }

  return Object.keys(shape).length > 0 ? z.object(shape) : z.object({});
}

/**
 * Extract path parameters from URL pattern
 * e.g., /api/v1/users/{id}/groups/{groupId} -> ['id', 'groupId']
 */
export function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1));
}

/**
 * Convert OpenAPI spec to MCP tool definitions
 *
 * @param spec - The OpenAPI specification object
 * @param baseUrl - Base URL for API calls (e.g., 'http://localhost:3001')
 * @param authToken - Bearer token for authentication
 * @returns Array of MCP tool definitions
 */
export function openApiToMcpTools(
  spec: OpenApiSpec,
  baseUrl: string,
  getAuthToken: () => string | null
): McpToolDefinition[] {
  const tools: McpToolDefinition[] = [];
  const components = spec.components?.schemas;

  // Tags/endpoints to exclude from MCP (internal only)
  const excludeTags = new Set(['Setup', 'Tracking']);
  const excludePaths = new Set([
    '/health',
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/setup/organization',
  ]);

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    // Skip excluded paths
    if (excludePaths.has(path)) continue;

    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Skip excluded tags
      if (operation.tags?.some(tag => excludeTags.has(tag))) continue;

      const pathParams = extractPathParams(path);
      const toolName = pathToToolName(method, path, operation.operationId);
      const inputSchema = buildToolInputSchema(operation, pathParams, components);

      // Build description from summary and description
      let description = operation.summary || '';
      if (operation.description && operation.description !== operation.summary) {
        description += description ? '\n\n' : '';
        description += operation.description;
      }
      if (operation.tags?.length) {
        description += `\n\nTags: ${operation.tags.join(', ')}`;
      }

      const tool: McpToolDefinition = {
        name: toolName,
        description: description || `${method.toUpperCase()} ${path}`,
        inputSchema,
        handler: async (input: unknown) => {
          const params = input as Record<string, unknown>;
          const authToken = getAuthToken();

          if (!authToken) {
            throw new Error('Authentication required. Please provide a valid API key or token.');
          }

          // Build URL with path parameters
          let url = `${baseUrl}${path}`;
          for (const param of pathParams) {
            const value = params[param];
            if (value === undefined) {
              throw new Error(`Missing required path parameter: ${param}`);
            }
            url = url.replace(`{${param}}`, encodeURIComponent(String(value)));
          }

          // Build query string
          const queryParams = new URLSearchParams();
          if (operation.parameters) {
            for (const param of operation.parameters) {
              if (param.in === 'query' && params[param.name] !== undefined) {
                queryParams.set(param.name, String(params[param.name]));
              }
            }
          }
          if (queryParams.toString()) {
            url += `?${queryParams.toString()}`;
          }

          // Build request body
          let body: string | undefined;
          if (operation.requestBody && ['post', 'put', 'patch'].includes(method)) {
            const bodyData: Record<string, unknown> = {};
            // Exclude path and query params from body
            const excludeKeys = new Set([
              ...pathParams,
              ...(operation.parameters?.filter(p => p.in === 'query').map(p => p.name) || [])
            ]);
            for (const [key, value] of Object.entries(params)) {
              if (!excludeKeys.has(key)) {
                bodyData[key] = value;
              }
            }
            if (Object.keys(bodyData).length > 0) {
              body = JSON.stringify(bodyData);
            }
          }

          // Make the request
          const response = await fetch(url, {
            method: method.toUpperCase(),
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body,
          });

          const result = await response.json() as { error?: { message?: string }; [key: string]: unknown };

          if (!response.ok) {
            throw new Error(result.error?.message || `API error: ${response.status}`);
          }

          return result;
        },
      };

      tools.push(tool);
    }
  }

  return tools;
}

/**
 * Get tool definitions metadata without handlers (for listing available tools)
 */
export function getToolDefinitions(spec: OpenApiSpec): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> = [];

  const excludeTags = new Set(['Setup', 'Tracking']);
  const excludePaths = new Set([
    '/health',
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/setup/organization',
  ]);

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (excludePaths.has(path)) continue;

    const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      if (operation.tags?.some(tag => excludeTags.has(tag))) continue;

      const pathParams = extractPathParams(path);
      const toolName = pathToToolName(method, path, operation.operationId);
      const inputSchema = buildToolInputSchema(operation, pathParams, spec.components?.schemas);

      let description = operation.summary || '';
      if (operation.description && operation.description !== operation.summary) {
        description += description ? '\n\n' : '';
        description += operation.description;
      }

      tools.push({
        name: toolName,
        description: description || `${method.toUpperCase()} ${path}`,
        inputSchema: JSON.parse(JSON.stringify(inputSchema._def || {})),
      });
    }
  }

  return tools;
}

export default {
  openApiToMcpTools,
  getToolDefinitions,
  pathToToolName,
  schemaToZod,
  buildToolInputSchema,
  extractPathParams,
};
