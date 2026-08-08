import React from 'react';
import { Eye, Edit3 } from 'lucide-react';
import type { PresenceData } from '../../services/helpdesk.service';
import './PresenceIndicator.css';

interface PresenceIndicatorProps {
  presence: PresenceData;
}

const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({ presence }) => {
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    // Generate a consistent color based on the name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 60%)`;
  };

  const hasViewers = presence.viewers.length > 0;
  const hasTypers = presence.typers.length > 0;

  if (!hasViewers && !hasTypers) {
    return null;
  }

  return (
    <div className="presence-indicator">
      {hasViewers && (
        <div className="presence-group">
          <div className="presence-label">
            <Eye className="icon" />
            <span>Viewing:</span>
          </div>
          <div className="presence-avatars">
            {presence.viewers.slice(0, 5).map((viewer) => (
              <div
                key={viewer.userId}
                className="avatar"
                style={{ backgroundColor: getAvatarColor(viewer.name) }}
                title={viewer.name}
              >
                {getInitials(viewer.name)}
              </div>
            ))}
            {presence.viewers.length > 5 && (
              <div className="avatar avatar-more">
                +{presence.viewers.length - 5}
              </div>
            )}
          </div>
        </div>
      )}

      {hasTypers && (
        <div className="presence-group">
          <div className="presence-label typing">
            <Edit3 className="icon" />
            <span>
              {presence.typers.length === 1
                ? `${presence.typers[0].name} is typing...`
                : `${presence.typers.length} people are typing...`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PresenceIndicator;