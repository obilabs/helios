/**
 * Central API Configuration
 *
 * IMPORTANT: All API calls should use these exports instead of hardcoding URLs.
 * This enables the app to work through nginx reverse proxy for remote access.
 *
 * When VITE_API_URL is empty/undefined, uses relative URLs (same origin via nginx).
 * When VITE_API_URL is set, uses that URL (for direct development access).
 *
 * API Versioning:
 * - All API routes use /api/v1/ prefix (recommended)
 * - Unversioned /api/ routes still work for backwards compatibility
 */

// API Version - update when new API version is released
export const API_VERSION = 'v1';

// Get the API URL from environment, defaulting to empty (relative URLs)
const envApiUrl = import.meta.env.VITE_API_URL;

// API_BASE_URL: The base URL for API calls (without /api prefix)
// - Empty string = relative URLs (works through nginx proxy)
// - Full URL = direct access (e.g., http://localhost:3001)
export const API_BASE_URL = envApiUrl !== undefined && envApiUrl !== ''
  ? envApiUrl.replace(/\/api(\/v\d+)?$/, '') // Strip any /api or /api/v1 suffix
  : '';

// API_URL: Base URL without /api suffix (for services that add it themselves)
// Alias for backwards compatibility
export const API_URL = API_BASE_URL;

/**
 * Build a versioned API path
 *
 * @param path - The API path (e.g., '/users', '/auth/login', 'organization/settings')
 * @returns Full URL path with API version prefix
 *
 * @example
 * apiPath('/users')              // returns '/api/v1/users'
 * apiPath('/auth/login')         // returns '/api/v1/auth/login'
 * apiPath('organization/users')  // returns '/api/v1/organization/users'
 */
export function apiPath(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Build versioned path
  return `${API_BASE_URL}/api/${API_VERSION}${normalizedPath}`;
}

/**
 * Build an API path without version prefix (for special routes like tracking pixels)
 *
 * @param path - The API path (e.g., '/t/pixel.gif')
 * @returns Full URL path without version prefix
 */
export function apiPathUnversioned(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}/api${normalizedPath}`;
}

/**
 * Build a WebSocket URL
 *
 * @param path - The WebSocket path (e.g., '/socket.io/')
 * @returns Full WebSocket URL
 */
export function wsUrl(path: string): string {
  if (API_BASE_URL) {
    // Convert http(s) to ws(s)
    return API_BASE_URL.replace(/^http/, 'ws') + path;
  }
  // For relative URLs, use current host with ws protocol
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

/**
 * Build a fetch URL for relative paths
 * This is the main function to use for all API calls
 *
 * @param path - The API path without /api prefix (e.g., '/users', '/auth/login')
 * @returns URL string to use with fetch()
 *
 * @example
 * fetch(api('/users'))           // fetches /api/v1/users
 * fetch(api('/auth/login'))      // fetches /api/v1/auth/login
 */
export const api = apiPath;

/**
 * Authenticated fetch wrapper
 *
 * Automatically includes credentials for session-based authentication.
 * Supports both:
 * 1. httpOnly session cookies (from better-auth login)
 * 2. JWT Bearer tokens (from setup flow auto-login)
 *
 * @param url - The URL to fetch (can use api() helper)
 * @param options - Standard fetch options
 * @returns Promise<Response>
 *
 * @example
 * // Simple GET request
 * const response = await authFetch(api('/users'));
 *
 * // POST with JSON body
 * const response = await authFetch(api('/users'), {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ name: 'John' })
 * });
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { headers = {}, ...restOptions } = options;

  // Build headers object
  const authHeaders: Record<string, string> = {};

  // Include JWT token if available (from setup flow or API keys)
  const token = localStorage.getItem('helios_token');
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...restOptions,
    credentials: 'include', // Also send session cookies
    headers: {
      ...authHeaders,
      ...headers,
    },
  });
}

/**
 * Authenticated JSON fetch wrapper
 *
 * Like authFetch but automatically sets Content-Type to application/json
 * and parses the response as JSON.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @returns Promise with parsed JSON data
 *
 * @example
 * const { success, data } = await authFetchJson(api('/users'));
 */
export async function authFetchJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const { headers = {}, ...restOptions } = options;

  // Build headers object
  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Include JWT token if available (from setup flow or API keys)
  const token = localStorage.getItem('helios_token');
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...restOptions,
    credentials: 'include',
    headers: {
      ...authHeaders,
      ...headers,
    },
  });

  return response.json();
}
