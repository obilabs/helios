import React from 'react';
import {
  Home,
  UsersRound,
  UserCheck,
  User,
  Settings as SettingsIcon,
  Users as UsersIcon,
  Network,
  GraduationCap,
} from 'lucide-react';

interface UserNavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  sidebarCollapsed: boolean;
}

/**
 * User/Employee Navigation
 *
 * Shows user-facing features:
 * - Home (personal dashboard)
 * - People (coworker directory)
 * - My Team (manager, peers, reports)
 * - My Groups (groups user belongs to)
 * - My Profile (edit own profile)
 * - Settings (personal preferences)
 */
export const UserNavigation: React.FC<UserNavigationProps> = ({
  currentPage,
  onNavigate,
  sidebarCollapsed: _sidebarCollapsed,
}) => {
  return (
    <nav className="nav">
      <button
        className={`nav-item ${currentPage === 'home' || currentPage === 'dashboard' ? 'active' : ''}`}
        onClick={() => onNavigate('home')}
        data-testid="nav-user-home"
      >
        <Home size={16} className="nav-icon" />
        <span>Home</span>
      </button>

      <div className="nav-section">
        <div className="nav-section-title">Directory</div>

        {/* People Directory - Browse coworkers */}
        <button
          className={`nav-item ${currentPage === 'people' ? 'active' : ''}`}
          onClick={() => onNavigate('people')}
          data-testid="nav-people"
        >
          <UsersRound size={16} className="nav-icon" />
          <span>People</span>
        </button>

        {/* My Team - Personal team view */}
        <button
          className={`nav-item ${currentPage === 'my-team' ? 'active' : ''}`}
          onClick={() => onNavigate('my-team')}
          data-testid="nav-my-team"
        >
          <UserCheck size={16} className="nav-icon" />
          <span>My Team</span>
        </button>

        {/* My Groups - Groups user belongs to */}
        <button
          className={`nav-item ${currentPage === 'my-groups' ? 'active' : ''}`}
          onClick={() => onNavigate('my-groups')}
          data-testid="nav-my-groups"
        >
          <UsersIcon size={16} className="nav-icon" />
          <span>My Groups</span>
        </button>

        {/* Org Chart - View organization structure */}
        <button
          className={`nav-item ${currentPage === 'orgChart' ? 'active' : ''}`}
          onClick={() => onNavigate('orgChart')}
          data-testid="nav-org-chart"
        >
          <Network size={16} className="nav-icon" />
          <span>Org Chart</span>
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Profile</div>

        {/* My Profile - Edit own profile */}
        <button
          className={`nav-item ${currentPage === 'my-profile' ? 'active' : ''}`}
          onClick={() => onNavigate('my-profile')}
          data-testid="nav-my-profile"
        >
          <User size={16} className="nav-icon" />
          <span>My Profile</span>
        </button>

        {/* My Onboarding - Onboarding tasks and training */}
        <button
          className={`nav-item ${currentPage === 'my-onboarding' ? 'active' : ''}`}
          onClick={() => onNavigate('my-onboarding')}
          data-testid="nav-my-onboarding"
        >
          <GraduationCap size={16} className="nav-icon" />
          <span>My Onboarding</span>
        </button>
      </div>

      {/* Personal Settings */}
      <button
        className={`nav-item ${currentPage === 'user-settings' ? 'active' : ''}`}
        onClick={() => onNavigate('user-settings')}
        data-testid="nav-user-settings"
      >
        <SettingsIcon size={16} className="nav-icon" />
        <span>Settings</span>
      </button>
    </nav>
  );
};

export default UserNavigation;
