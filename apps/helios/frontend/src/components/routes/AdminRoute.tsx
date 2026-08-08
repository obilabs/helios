import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useView } from '../../contexts/ViewContext';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * AdminRoute - Route guard for admin-only pages
 *
 * Protects routes that require admin access:
 * - Redirects non-admins to the user home page
 * - Shows appropriate message via state
 *
 * Usage:
 * ```tsx
 * <Route path="/admin/users" element={
 *   <AdminRoute>
 *     <Users />
 *   </AdminRoute>
 * } />
 * ```
 */
export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { canAccessAdminView } = useView();
  const location = useLocation();

  if (!canAccessAdminView) {
    // Redirect to user home with a message
    return (
      <Navigate
        to="/"
        replace
        state={{
          from: location.pathname,
          message: 'Admin access required',
          type: 'warning'
        }}
      />
    );
  }

  return <>{children}</>;
};

export default AdminRoute;
