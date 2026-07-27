/**
 * Better Auth Express Handler
 *
 * Provides the Express middleware for mounting better-auth routes.
 * Handles all /api/v1/auth/* requests using better-auth's session-based
 * authentication with httpOnly cookies.
 *
 * Mounted routes include:
 * - POST /api/v1/auth/sign-in/email - Email/password sign in
 * - POST /api/v1/auth/sign-up/email - Email/password sign up
 * - POST /api/v1/auth/sign-out - Sign out (invalidate session)
 * - GET /api/v1/auth/session - Get current session
 */

import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';

// Export the Node.js handler for Express
export const authHandler = toNodeHandler(auth);

// Re-export auth for direct access
export { auth };
