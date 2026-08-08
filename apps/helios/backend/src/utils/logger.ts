import winston from 'winston';
import path from 'path';

const logLevel = process.env['LOG_LEVEL'] || 'info';
const logFile = process.env['LOG_FILE'] || 'logs/helios.log';

// Ensure logs directory exists
const logDir = path.dirname(logFile);

/**
 * Custom format that handles requestId properly
 */
const requestIdFormat = winston.format((info) => {
  // If requestId is provided, include it in the log (short form)
  if (info.requestId && typeof info.requestId === 'string') {
    info.requestId = info.requestId.slice(0, 8);
  }
  return info;
});

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    requestIdFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'helios-backend' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs with importance level of `info` or less to combined log
    new winston.transports.File({
      filename: logFile,
      maxsize: 5242880, // 5MB
      maxFiles: 10
    }),
  ],
});

// If we're not in production, add console transport
if (process.env['NODE_ENV'] !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, requestId, ...meta }) => {
        const rid = requestId ? `[${requestId}] ` : '';
        let msg = `${timestamp} ${rid}[${level}]: ${message}`;
        // Filter out service from meta for cleaner console output
        const { service, ...restMeta } = meta;
        if (Object.keys(restMeta).length > 0) {
          msg += ` ${JSON.stringify(restMeta)}`;
        }
        return msg;
      })
    )
  }));
}

// Create a stream object with 'write' function that will be used by morgan
const logStream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

/**
 * Create a child logger with request context
 * Use this in route handlers to include requestId in all logs
 *
 * @example
 * const log = createRequestLogger(req.requestId);
 * log.info('Processing request', { userId: user.id });
 */
export function createRequestLogger(requestId: string): winston.Logger {
  return logger.child({ requestId });
}

/**
 * Log with request context
 * Convenience function for one-off logs
 *
 * @example
 * logWithRequest(req.requestId, 'info', 'User logged in', { userId: user.id });
 */
export function logWithRequest(
  requestId: string,
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  meta?: Record<string, unknown>
): void {
  logger.log(level, message, { requestId, ...meta });
}

export { logger, logStream };
