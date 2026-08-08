import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let { statusCode = 500, message } = err;

  // Get requestId (may not exist if error happens early in middleware chain)
  const requestId = req.requestId || res.locals.requestId || 'unknown';

  // Log error with requestId for tracing
  logger.error('Error occurred', {
    requestId,
    error: message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Don't expose internal errors in production
  if (process.env['NODE_ENV'] === 'production' && statusCode === 500) {
    message = 'Internal Server Error';
  }

  // Send error response with requestId for client correlation
  res.status(statusCode).json({
    success: false,
    error: message,
    requestId,
    ...(process.env['NODE_ENV'] === 'development' && { stack: err.stack }),
  });
}

export function createError(message: string, statusCode: number = 500): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}