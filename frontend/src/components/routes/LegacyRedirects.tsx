import { Navigate, useLocation } from 'react-router-dom';

/**
 * LegacyRedirects - Handle redirects from old URLs to new /admin prefixed routes
 *
 * This component checks the current URL and redirects legacy routes
 * to their new locations. It should be used as a fallback route.
 *
 * Legacy Routes -> New Routes:
 * /users -> /admin/users
 * /groups -> /admin/groups
 * /settings -> /admin/settings
 * /assets -> /admin/assets
 * /workspaces -> /admin/workspaces
 * etc.
 */
export const LegacyRedirects: React.FC = () => {
  const location = useLocation();
  const { pathname, search } = location;

  // Map of legacy routes to their new admin-prefixed routes
  const legacyAdminRoutes: Record<string, string> = {
    '/users': '/admin/users',
    '/groups': '/admin/groups',
    '/settings': '/admin/settings',
    '/assets': '/admin/assets',
    '/workspaces': '/admin/workspaces',
    '/org-chart': '/admin/org-chart',
    '/email-security': '/admin/email-security',
    '/signatures': '/admin/signatures',
    '/security-events': '/admin/security-events',
    '/audit-logs': '/admin/audit-logs',
    '/administrators': '/admin/administrators',
    '/console': '/admin/console',
  };

  // Check if current path is a legacy route
  for (const [legacy, newPath] of Object.entries(legacyAdminRoutes)) {
    if (pathname === legacy || pathname.startsWith(`${legacy}/`)) {
      // Preserve the rest of the path after the legacy prefix
      const remainingPath = pathname.substring(legacy.length);
      const newFullPath = newPath + remainingPath + search;
      return <Navigate to={newFullPath} replace />;
    }
  }

  // If no legacy route matched, redirect to home
  return <Navigate to="/" replace />;
};

export default LegacyRedirects;
