import { User, Mic, Video, Sparkles, Tag, Star } from 'lucide-react';
import type { PersonCard as PersonCardType } from '../services/people.service';
import './PersonCard.css';

interface PersonCardProps {
  person: PersonCardType;
  onClick: (personId: string) => void;
  viewMode?: 'grid' | 'list';
}

export function PersonCard({ person, onClick, viewMode = 'grid' }: PersonCardProps) {
  const initials = `${person.firstName?.[0] || ''}${person.lastName?.[0] || ''}`.toUpperCase();

  if (viewMode === 'list') {
    return (
      <div className="person-card-list" onClick={() => onClick(person.id)}>
        <div className="person-avatar-wrapper">
          {person.avatarUrl ? (
            <img src={person.avatarUrl} alt={person.fullName} className="person-avatar" />
          ) : (
            <div className="person-avatar-placeholder">
              {initials || <User size={20} />}
            </div>
          )}
          {person.isNewJoiner && (
            <span className="new-badge" title="New Joiner">
              <Sparkles size={10} />
            </span>
          )}
        </div>

        <div className="person-info">
          <div className="person-name">{person.fullName}</div>
          {person.jobTitle && <div className="person-title">{person.jobTitle}</div>}
        </div>

        <div className="person-department">{person.department || '-'}</div>
        <div className="person-location">{person.location || '-'}</div>

        <div className="person-media-indicators">
          {person.hasVoiceIntro && (
            <span className="media-indicator" title="Has voice intro">
              <Mic size={14} />
            </span>
          )}
          {person.hasVideoIntro && (
            <span className="media-indicator" title="Has video intro">
              <Video size={14} />
            </span>
          )}
          {person.expertiseCount > 0 && (
            <span className="media-indicator expertise" title={`${person.expertiseCount} expertise topics`}>
              <Star size={14} />
              <span className="count">{person.expertiseCount}</span>
            </span>
          )}
          {person.interestCount > 0 && (
            <span className="media-indicator interests" title={`${person.interestCount} interests`}>
              <Tag size={14} />
              <span className="count">{person.interestCount}</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div className="person-card" onClick={() => onClick(person.id)}>
      <div className="person-card-header">
        <div className="person-avatar-large-wrapper">
          {person.avatarUrl ? (
            <img src={person.avatarUrl} alt={person.fullName} className="person-avatar-large" />
          ) : (
            <div className="person-avatar-large-placeholder">
              {initials || <User size={32} />}
            </div>
          )}
          {person.isNewJoiner && (
            <span className="new-badge-large" title="New Joiner">
              <Sparkles size={12} />
              New
            </span>
          )}
        </div>

        <div className="person-media-badges">
          {person.hasVoiceIntro && (
            <span className="media-badge voice" title="Voice intro available">
              <Mic size={14} />
            </span>
          )}
          {person.hasVideoIntro && (
            <span className="media-badge video" title="Video intro available">
              <Video size={14} />
            </span>
          )}
        </div>
      </div>

      <div className="person-card-body">
        <h3 className="person-name">{person.fullName}</h3>
        {person.jobTitle && <p className="person-title">{person.jobTitle}</p>}

        <div className="person-meta">
          {person.department && (
            <span className="meta-item department">{person.department}</span>
          )}
          {person.location && (
            <span className="meta-item location">{person.location}</span>
          )}
        </div>
      </div>

      <div className="person-card-footer">
        {person.expertiseCount > 0 && (
          <span className="tag-count expertise" title="Ask me about">
            <Star size={12} />
            {person.expertiseCount}
          </span>
        )}
        {person.interestCount > 0 && (
          <span className="tag-count interests" title="Interests">
            <Tag size={12} />
            {person.interestCount}
          </span>
        )}
      </div>
    </div>
  );
}
