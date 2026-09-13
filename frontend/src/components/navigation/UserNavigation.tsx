import React from 'react';
import { USER_NAV } from '../../config/navigation';
import { NavSections } from './NavSections';

interface UserNavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  sidebarCollapsed: boolean;
}

/**
 * Employee view navigation. The items, their order and the feature flag behind
 * each one are defined in config/navigation.ts (USER_NAV) — edit it there.
 */
export const UserNavigation: React.FC<UserNavigationProps> = ({
  currentPage,
  onNavigate,
  sidebarCollapsed: _sidebarCollapsed,
}) => <NavSections sections={USER_NAV} currentPage={currentPage} onNavigate={onNavigate} />;

export default UserNavigation;
