import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request ID Middleware
 *
 * Generates or extracts a unique request ID for each request.
 * This enables request tracing across logs, responses, and downstream services.
 *
 * Flow:
 * 1. Check for existing X-Request-ID header (from nginx, load balancer, or client)
 * 2. If not present, generate a new UUID v4
 * 3. Attach to req.requestId for use in application
 * 4. Set response header for client correlation
 *
 * Note: Type extensions for Request are in types/express.d.ts
 */

export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Request ID middleware
 * Adds a unique request ID to each request for tracing
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get existing request ID from header or generate new one
  const existingId = req.get(REQUEST_ID_HEADER);
  const requestId = existingId && isValidUuid(existingId) ? existingId : uuidv4();

  // Attach to request object
  req.requestId = requestId;

  // Record start time for response time tracking
  req.startTime = Date.now();

  // Set response header so client can correlate
  res.setHeader(REQUEST_ID_HEADER, requestId);

  // Add to response locals for error handlers
  res.locals.requestId = requestId;

  next();
}

/**
 * Validate UUID format
 * Accepts v4 UUIDs and similar formats
 */
function isValidUuid(id: string): boolean {
  // Accept UUID v4 format or similar ID formats (alphanumeric with hyphens)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const generalIdRegex = /^[a-zA-Z0-9-_]{8,64}$/;
  return uuidRegex.test(id) || generalIdRegex.test(id);
}

/**
 * Get current request ID from request object
 * Utility function for use in services
 */
export function getRequestId(req: Request): string {
  return req.requestId || 'unknown';
}

/**
 * Format request ID for logging (shorter version)
 * Returns first 8 characters of the UUID
 */
export function shortRequestId(requestId: string): string {
  return requestId.slice(0, 8);
}

export default requestIdMiddleware;
