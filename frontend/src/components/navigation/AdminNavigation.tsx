import React from 'react';
import { ADMIN_NAV } from '../../config/navigation';
import { NavSections } from './NavSections';

interface AdminNavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  sidebarCollapsed: boolean;
  labelsLoading: boolean;
}

/**
 * Admin console navigation. The items, their order and the feature flag behind
 * each one are defined in config/navigation.ts (ADMIN_NAV) — edit it there.
 */
export const AdminNavigation: React.FC<AdminNavigationProps> = ({
  currentPage,
  onNavigate,
  sidebarCollapsed: _sidebarCollapsed,
  labelsLoading,
}) => (
  <NavSections sections={ADMIN_NAV} currentPage={currentPage} onNavigate={onNavigate} labelsLoading={labelsLoading} />
);

export default AdminNavigation;
