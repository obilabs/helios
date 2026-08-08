import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  User,
  ChevronUp,
  ChevronDown,
  Loader2,
  Mail,
  AlertCircle,
} from 'lucide-react';
import { profileService, type TeamData } from '../services/profile.service';
import './MyTeam.css';

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  avatarUrl: string | null;
}

interface MyTeamProps {
  organizationId: string;
  onViewPerson?: (personId: string) => void;
}

export function MyTeam({ organizationId: _organizationId, onViewPerson }: MyTeamProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<TeamData | null>(null);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileService.getTeam();
      if (data) {
        setTeamData(data);
      } else {
        setError('Failed to load team data');
      }
    } catch (err) {
      setError('An error occurred while loading team data');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handlePersonClick = (personId: string) => {
    if (onViewPerson) {
      onViewPerson(personId);
    }
  };

  const renderTeamMember = (member: TeamMember, role?: string) => {
    const initials = `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`.toUpperCase();
    const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();

    return (
      <div
        key={member.id}
        className="team-member-card"
        onClick={() => handlePersonClick(member.id)}
      >
        <div className="member-avatar-wrapper">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt={fullName} className="member-avatar" />
          ) : (
            <div className="member-avatar-placeholder">
              {initials || <User size={20} />}
            </div>
          )}
          {role && <span className={`member-role-badge ${role}`}>{role}</span>}
        </div>
        <div className="member-info">
          <h3 className="member-name">{fullName}</h3>
          {member.jobTitle && <p className="member-title">{member.jobTitle}</p>}
          {member.department && (
            <span className="member-department">{member.department}</span>
          )}
        </div>
        <div className="member-actions">
          <a
            href={`mailto:${member.email}`}
            className="member-action-btn"
            onClick={(e) => e.stopPropagation()}
            title={`Email ${fullName}`}
          >
            <Mail size={16} />
          </a>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="my-team-page">
        <div className="page-header">
          <h1>My Team</h1>
          <p className="page-subtitle">Your organizational relationships</p>
        </div>
        <div className="loading-state">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading team...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-team-page">
        <div className="page-header">
          <h1>My Team</h1>
          <p className="page-subtitle">Your organizational relationships</p>
        </div>
        <div className="error-state">
          <AlertCircle size={24} />
          <span>{error}</span>
          <button onClick={loadTeam} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasManager = teamData?.manager;
  const hasPeers = teamData?.peers && teamData.peers.length > 0;
  const hasReports = teamData?.directReports && teamData.directReports.length > 0;
  const hasNoTeam = !hasManager && !hasPeers && !hasReports;

  return (
    <div className="my-team-page">
      <div className="page-header">
        <h1>My Team</h1>
        <p className="page-subtitle">Your organizational relationships</p>
      </div>

      {hasNoTeam ? (
        <div className="empty-team-state">
          <Users size={48} />
          <h3>No team relationships found</h3>
          <p>
            Your manager and team relationships will appear here once they are
            configured in your organization.
          </p>
        </div>
      ) : (
        <div className="team-sections">
          {/* Manager Section */}
          <div className="team-section">
            <div className="section-header">
              <div className="section-icon manager">
                <ChevronUp size={16} />
              </div>
              <h2>Manager</h2>
              <span className="section-count">
                {hasManager ? '1' : '0'}
              </span>
            </div>
            <div className="section-content">
              {hasManager ? (
                renderTeamMember(teamData.manager as TeamMember)
              ) : (
                <div className="empty-section">
                  <p>No manager assigned</p>
                </div>
              )}
            </div>
          </div>

          {/* Peers Section */}
          <div className="team-section">
            <div className="section-header">
              <div className="section-icon peers">
                <Users size={16} />
              </div>
              <h2>Peers</h2>
              <span className="section-count">
                {teamData?.peers?.length || 0}
              </span>
            </div>
            <div className="section-content">
              {hasPeers ? (
                <div className="members-grid">
                  {teamData.peers.map((peer) =>
                    renderTeamMember(peer as TeamMember)
                  )}
                </div>
              ) : (
                <div className="empty-section">
                  <p>No peers with the same manager</p>
                </div>
              )}
            </div>
          </div>

          {/* Direct Reports Section */}
          <div className="team-section">
            <div className="section-header">
              <div className="section-icon reports">
                <ChevronDown size={16} />
              </div>
              <h2>Direct Reports</h2>
              <span className="section-count">
                {teamData?.directReports?.length || 0}
              </span>
            </div>
            <div className="section-content">
              {hasReports ? (
                <div className="members-grid">
                  {teamData.directReports.map((report) =>
                    renderTeamMember(report as TeamMember)
                  )}
                </div>
              ) : (
                <div className="empty-section">
                  <p>No direct reports</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
