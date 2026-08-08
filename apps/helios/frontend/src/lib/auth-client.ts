/**
 * Better Auth Client - ACTIVE
 *
 * This file provides the better-auth client for session-based authentication.
 * Uses httpOnly cookies for XSS-resistant session management.
 *
 * Features:
 * - Email/password sign-in via signInWithEmail()
 * - Session management with automatic cookie handling
 * - Sign out via signOutUser()
 * - Future: SSO providers (Azure AD, Google, Okta)
 *
 * Migration (2025-12-26):
 * Passwords migrated from organization_users to auth_accounts table.
 * better-auth now handles authentication with httpOnly session cookies.
 */

import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import { API_BASE_URL } from '../config/api';

/**
 * Create the auth client connected to our backend
 *
 * The baseURL points to the backend's auth handler.
 * Since better-auth uses httpOnly cookies, credentials are automatically included.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE_URL || window.location.origin,
  plugins: [twoFactorClient(), passkeyClient()],
});

/**
 * Export individual methods for convenience
 */
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  twoFactor,
  passkey,
} = authClient;

/**
 * Extended user type with Helios-specific fields
 */
export interface HeliosUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  organizationId: string;
  isExternalAdmin?: boolean;
  defaultView?: 'admin' | 'user';
  isActive?: boolean;
  department?: string;
}

/**
 * Session with user info
 */
export interface HeliosSession {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: HeliosUser;
}

/**
 * Get the current session with full user details
 * Returns null if not authenticated
 */
export async function getSession(): Promise<HeliosSession | null> {
  try {
    const session = await authClient.getSession();

    if (!session?.data?.session || !session?.data?.user) {
      return null;
    }

    // Map to our extended user type
    const user = session.data.user as any;

    return {
      session: {
        id: session.data.session.id,
        userId: session.data.session.userId,
        expiresAt: new Date(session.data.session.expiresAt),
        ipAddress: session.data.session.ipAddress,
        userAgent: session.data.session.userAgent,
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        isExternalAdmin: user.isExternalAdmin,
        defaultView: user.defaultView,
        isActive: user.isActive,
        department: user.department,
      },
    };
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}

/**
 * Check if the user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Email/password sign in
 *
 * @param email - User's email address
 * @param password - User's password
 * @returns Success status, error message if failed, or twoFactorRequired flag
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{
  success: boolean;
  error?: string;
  user?: HeliosUser;
  twoFactorRequired?: boolean;
}> {
  try {
    const result = await signIn.email({
      email,
      password,
    });

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Sign in failed',
      };
    }

    // Check if 2FA is required
    if ((result.data as any)?.twoFactorRedirect) {
      return {
        success: false,
        twoFactorRequired: true,
      };
    }

    // Get the full session with user details
    const session = await getSession();

    return {
      success: true,
      user: session?.user,
    };
  } catch (error: any) {
    console.error('Sign in error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
}

/**
 * Verify 2FA TOTP code during login
 *
 * @param code - 6-digit TOTP code from authenticator app
 * @returns Success status and user if verified
 */
export async function verify2FACode(
  code: string
): Promise<{
  success: boolean;
  error?: string;
  user?: HeliosUser;
}> {
  try {
    const result = await twoFactor.verifyTotp({
      code,
    });

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Invalid verification code',
      };
    }

    // Get the full session with user details
    const session = await getSession();

    return {
      success: true,
      user: session?.user,
    };
  } catch (error: any) {
    console.error('2FA verification error:', error);
    return {
      success: false,
      error: error.message || 'Verification failed',
    };
  }
}

/**
 * Enable 2FA for the current user
 * Returns a TOTP URI for QR code generation
 * @param password - User's current password (required by better-auth)
 */
export async function enable2FA(password?: string): Promise<{
  success: boolean;
  error?: string;
  totpUri?: string;
  backupCodes?: string[];
}> {
  try {
    // better-auth requires password to enable 2FA
    // If not provided, try with empty string (may fail depending on backend config)
    const result = await twoFactor.enable({ password: password || '' });

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Failed to enable 2FA',
      };
    }

    return {
      success: true,
      totpUri: result.data?.totpURI,
      backupCodes: result.data?.backupCodes,
    };
  } catch (error: any) {
    console.error('Enable 2FA error:', error);
    return {
      success: false,
      error: error.message || 'Failed to enable 2FA',
    };
  }
}

/**
 * Verify and finalize 2FA setup
 *
 * @param code - 6-digit TOTP code to verify setup
 */
export async function verify2FASetup(
  code: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const result = await twoFactor.verifyTotp({
      code,
    });

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Invalid code',
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Verify 2FA setup error:', error);
    return {
      success: false,
      error: error.message || 'Verification failed',
    };
  }
}

/**
 * Disable 2FA for the current user
 *
 * @param password - User's password for confirmation
 */
export async function disable2FA(
  password: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const result = await twoFactor.disable({
      password,
    });

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Failed to disable 2FA',
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Disable 2FA error:', error);
    return {
      success: false,
      error: error.message || 'Failed to disable 2FA',
    };
  }
}

/**
 * Sign out the current user
 */
export async function signOutUser(): Promise<{ success: boolean }> {
  try {
    await signOut();
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return { success: false };
  }
}

// =============================================================================
// Passkey (WebAuthn) Functions
// =============================================================================

/**
 * Register a new passkey for the current user
 *
 * @param name - User-friendly name for the passkey (e.g., "MacBook Touch ID")
 * @returns Success status and passkey info
 */
export async function registerPasskey(
  name: string
): Promise<{
  success: boolean;
  error?: string;
  passkey?: { id: string; name: string };
}> {
  try {
    if (!isPasskeySupported()) {
      return {
        success: false,
        error: 'WebAuthn is not supported in this browser',
      };
    }

    const result = await passkey.addPasskey({
      name,
    });

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Failed to register passkey',
      };
    }

    return {
      success: true,
      passkey: result.data ? {
        id: result.data.id,
        name: result.data.name || name,
      } : undefined,
    };
  } catch (error: any) {
    console.error('Register passkey error:', error);
    return {
      success: false,
      error: error.message || 'Failed to register passkey',
    };
  }
}

/**
 * Sign in with a passkey (passwordless)
 *
 * @returns Success status and user if authenticated
 */
export async function signInWithPasskey(): Promise<{
  success: boolean;
  error?: string;
  user?: HeliosUser;
}> {
  try {
    if (!isPasskeySupported()) {
      return {
        success: false,
        error: 'WebAuthn is not supported in this browser',
      };
    }

    // passkey plugin adds signIn.passkey() method
    const result = await signIn.passkey();

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Passkey sign in failed',
      };
    }

    // Get the full session with user details
    const session = await getSession();

    return {
      success: true,
      user: session?.user,
    };
  } catch (error: any) {
    console.error('Passkey sign in error:', error);
    return {
      success: false,
      error: error.message || 'Passkey sign in failed',
    };
  }
}

/**
 * List all passkeys for the current user
 *
 * @returns List of registered passkeys
 */
export async function listPasskeys(): Promise<{
  success: boolean;
  error?: string;
  passkeys?: Array<{
    id: string;
    name: string | null;
    createdAt: Date;
    deviceType?: string;
  }>;
}> {
  try {
    // Use direct API call since listPasskeys is exposed as a reactive atom
    const baseURL = API_BASE_URL || window.location.origin;
    const response = await fetch(`${baseURL}/api/auth/passkey/list-user-passkeys`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        success: false,
        error: error.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      passkeys: (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        createdAt: new Date(p.createdAt),
        deviceType: p.deviceType,
      })),
    };
  } catch (error: any) {
    console.error('List passkeys error:', error);
    return {
      success: false,
      error: error.message || 'Failed to list passkeys',
    };
  }
}

/**
 * Delete a passkey
 *
 * @param id - Passkey ID to delete
 * @returns Success status
 */
export async function deletePasskey(
  id: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Use direct API call
    const baseURL = API_BASE_URL || window.location.origin;
    const response = await fetch(`${baseURL}/api/auth/passkey/delete-passkey`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        success: false,
        error: error.message || `HTTP ${response.status}`,
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Delete passkey error:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete passkey',
    };
  }
}

/**
 * Check if WebAuthn is supported in this browser
 */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === 'function'
  );
}

/**
 * Export the full client for advanced use cases
 */
export default authClient;
