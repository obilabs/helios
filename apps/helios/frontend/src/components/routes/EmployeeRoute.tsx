import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useView } from '../../contexts/ViewContext';

interface EmployeeRouteProps {
  children: React.ReactNode;
}

/**
 * EmployeeRoute - Route guard for employee-only pages
 *
 * Protects routes that require employee access:
 * - Redirects external admins to the admin dashboard
 * - Shows appropriate message via state
 *
 * Usage:
 * ```tsx
 * <Route path="/people" element={
 *   <EmployeeRoute>
 *     <People />
 *   </EmployeeRoute>
 * } />
 * ```
 */
export const EmployeeRoute: React.FC<EmployeeRouteProps> = ({ children }) => {
  const { canAccessUserView } = useView();
  const location = useLocation();

  if (!canAccessUserView) {
    // Redirect to admin dashboard with a message
    return (
      <Navigate
        to="/admin"
        replace
        state={{
          from: location.pathname,
          message: 'This feature is for employees only',
          type: 'info'
        }}
      />
    );
  }

  return <>{children}</>;
};

export default EmployeeRoute;
