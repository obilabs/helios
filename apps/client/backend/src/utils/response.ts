/**
 * Standardized API Response Helpers
 *
 * These helpers ensure consistent response formats across all API endpoints.
 * Every response includes requestId for tracing and follows the standard format.
 *
 * Success Response Format:
 * {
 *   success: true,
 *   data: { ... } | [ ... ],
 *   meta: { requestId, total?, limit?, offset?, hasMore? }
 * }
 *
 * Error Response Format:
 * {
 *   success: false,
 *   error: { code, message, details? },
 *   meta: { requestId }
 * }
 */

import { Response } from 'express';
import { ErrorCode, ErrorStatusMap } from '../types/error-codes.js';

/**
 * Interface for pagination metadata
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Interface for standard response metadata
 */
export interface ResponseMeta extends Partial<PaginationMeta> {
  requestId?: string;
  [key: string]: unknown;
}

/**
 * Interface for error details
 */
export interface ErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

/**
 * Send a standardized success response
 *
 * @param res - Express response object
 * @param data - Response payload (object or array)
 * @param meta - Optional metadata (requestId auto-included)
 * @param status - HTTP status code (default: 200)
 *
 * @example
 * successResponse(res, { user: { id: '123', name: 'John' } });
 * successResponse(res, users, { total: 100 });
 */
export function successResponse<T>(
  res: Response,
  data: T,
  meta: Omit<ResponseMeta, 'requestId'> = {},
  status = 200
): Response {
  return res.status(status).json({
    success: true,
    data,
    meta: {
      ...meta,
      requestId: (res.req as any)?.requestId,
    },
  });
}

/**
 * Send a standardized error response
 *
 * @param res - Express response object
 * @param code - Error code from ErrorCode enum
 * @param message - Human-readable error message
 * @param details - Optional error details (validation errors, etc.)
 * @param status - HTTP status code (auto-determined from code if not provided)
 *
 * @example
 * errorResponse(res, ErrorCode.NOT_FOUND, 'User not found');
 * errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Invalid input', [
 *   { field: 'email', message: 'Invalid email format' }
 * ]);
 */
export function errorResponse(
  res: Response,
  code: ErrorCode | string,
  message: string,
  details?: ErrorDetail[] | null,
  status?: number
): Response {
  const httpStatus = status || (code in ErrorStatusMap
    ? ErrorStatusMap[code as ErrorCode]
    : 500);

  return res.status(httpStatus).json({
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    meta: {
      requestId: (res.req as any)?.requestId,
    },
  });
}

/**
 * Send a paginated response with metadata
 *
 * @param res - Express response object
 * @param data - Array of items
 * @param total - Total count of items (for pagination)
 * @param limit - Number of items per page
 * @param offset - Number of items to skip
 *
 * @example
 * paginatedResponse(res, users, totalCount, 50, 0);
 */
export function paginatedResponse<T>(
  res: Response,
  data: T[],
  total: number,
  limit: number,
  offset: number
): Response {
  return successResponse(res, data, {
    total,
    limit,
    offset,
    hasMore: offset + data.length < total,
  });
}

/**
 * Send a created response (201)
 *
 * @param res - Express response object
 * @param data - Created resource
 *
 * @example
 * createdResponse(res, newUser);
 */
export function createdResponse<T>(res: Response, data: T): Response {
  return successResponse(res, data, {}, 201);
}

/**
 * Send a no content response (204)
 *
 * @param res - Express response object
 *
 * @example
 * noContentResponse(res);
 */
export function noContentResponse(res: Response): Response {
  return res.status(204).send();
}

/**
 * Send a not found error response
 *
 * @param res - Express response object
 * @param resource - Name of the resource (e.g., 'User', 'Group')
 *
 * @example
 * notFoundResponse(res, 'User');
 */
export function notFoundResponse(res: Response, resource: string): Response {
  return errorResponse(
    res,
    ErrorCode.NOT_FOUND,
    `${resource} not found`
  );
}

/**
 * Send a validation error response
 *
 * @param res - Express response object
 * @param errors - Array of validation error details
 *
 * @example
 * validationErrorResponse(res, [
 *   { field: 'email', message: 'Required field' },
 *   { field: 'password', message: 'Must be at least 8 characters' }
 * ]);
 */
export function validationErrorResponse(
  res: Response,
  errors: ErrorDetail[]
): Response {
  return errorResponse(
    res,
    ErrorCode.VALIDATION_ERROR,
    'Validation failed',
    errors
  );
}

/**
 * Send an unauthorized error response
 *
 * @param res - Express response object
 * @param message - Optional custom message
 *
 * @example
 * unauthorizedResponse(res);
 * unauthorizedResponse(res, 'Token has expired');
 */
export function unauthorizedResponse(
  res: Response,
  message = 'Authentication required'
): Response {
  return errorResponse(res, ErrorCode.UNAUTHORIZED, message);
}

/**
 * Send a forbidden error response
 *
 * @param res - Express response object
 * @param message - Optional custom message
 *
 * @example
 * forbiddenResponse(res);
 * forbiddenResponse(res, 'Admin access required');
 */
export function forbiddenResponse(
  res: Response,
  message = 'Access denied'
): Response {
  return errorResponse(res, ErrorCode.FORBIDDEN, message);
}
