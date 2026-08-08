import { UserTable } from '../components/UserTable';
import { Groups } from './Groups';
import { OrgUnits } from './OrgUnits';
import { useTabPersistence } from '../hooks/useTabPersistence';
import { Users, UsersRound, Building2, Monitor } from 'lucide-react';
import './Directory.css';

type DirectoryTab = 'users' | 'groups' | 'org-units' | 'devices';

interface DirectoryProps {
  organizationId: string;
}

export function Directory({ organizationId }: DirectoryProps) {
  const [activeTab, setActiveTab] = useTabPersistence<DirectoryTab>('helios_directory_tab', 'users');

  return (
    <div className="directory-container">
      <div className="directory-header">
        <h1>Directory</h1>
        <p>Manage users, groups, and organizational units across all connected platforms</p>
      </div>

      <div className="directory-tabs">
        <button
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} className="tab-icon" />
          Users
        </button>
        <button
          className={`tab-button ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => setActiveTab('groups')}
        >
          <UsersRound size={16} className="tab-icon" />
          Groups
        </button>
        <button
          className={`tab-button ${activeTab === 'org-units' ? 'active' : ''}`}
          onClick={() => setActiveTab('org-units')}
        >
          <Building2 size={16} className="tab-icon" />
          Organizational Units
        </button>
        <button
          className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          <Monitor size={16} className="tab-icon" />
          Devices
        </button>
      </div>

      <div className="directory-content">
        {activeTab === 'users' && (
          <UserTable organizationId={organizationId} userType="staff" />
        )}

        {activeTab === 'groups' && (
          <Groups organizationId={organizationId} />
        )}

        {activeTab === 'org-units' && (
          <OrgUnits organizationId={organizationId} />
        )}

        {activeTab === 'devices' && (
          <div className="coming-soon">
            <div className="coming-soon-icon"><Monitor size={48} /></div>
            <h2>Device Management</h2>
            <p>Manage devices enrolled in your organization's platforms.</p>
            <p className="coming-soon-label">Requires Google Workspace or Microsoft 365 integration</p>
          </div>
        )}
      </div>
    </div>
  );
}