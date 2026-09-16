/**
 * Make a request-derived value safe to put in a log line: line breaks are
 * removed so one request cannot start a forged log entry, and long values
 * are cut off.
 */
export const MAX_LOG_VALUE_LENGTH = 500;

export function logSafe(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  const flat = text.replace(/\n/g, '').replace(/\r/g, '');
  return flat.length > MAX_LOG_VALUE_LENGTH ? `${flat.slice(0, MAX_LOG_VALUE_LENGTH)}...` : flat;
}

/**
 * For failures while loading or decrypting stored credentials: only the error
 * type is logged. Parser and decryption messages can quote part of their input.
 */
export function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
