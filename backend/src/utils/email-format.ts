/**
 * The loose "something@something.something" shape check used for input
 * validation (not full RFC 5322). Equivalent to /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 * but runs in linear time, and refuses anything longer than 254 characters
 * (the maximum length of an address).
 */
export const MAX_EMAIL_LENGTH = 254;

export function isEmailFormat(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  // A dot with at least one character before and after it.
  const dot = domain.indexOf('.', 1);
  return dot !== -1 && dot < domain.length - 1;
}
