/**
 * Express Request type extensions
 *
 * This file augments the Express Request interface with custom properties
 * used throughout the application. All middleware that adds properties to
 * the request should be documented here.
 */

declare global {
  namespace Express {
    interface Request {
      /** Unique request ID for tracing (added by request-id middleware) */
      requestId: string;

      /** Request start time in milliseconds (added by request-id middleware) */
      startTime: number;

      /** Authenticated user context (added by auth middleware) */
      user?: {
        userId: string;
        email: string;
        role: string;
        organizationId: string;
        firstName?: string;
        lastName?: string;
        // Access control flags (added by auth middleware)
        isAdmin: boolean;       // Can access admin UI
        isEmployee: boolean;    // Can access employee/user UI
        // Authentication method (added by session-auth middleware)
        authMethod?: 'session' | 'jwt' | 'api-key';
        // API Key context
        keyType?: 'service' | 'vendor';
        apiKeyId?: string;
        apiKeyName?: string;
        serviceName?: string;
        serviceEmail?: string;
        serviceOwner?: string;
        vendorName?: string;
      };
    }
  }
}

export {};
