import { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Calendar,
  Clock,
  Mic,
  Video,
  Play,
  Pause,
  Star,
  Tag,
  Sparkles,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { peopleService, type PersonProfile } from '../services/people.service';
import './PersonSlideOut.css';

interface PersonSlideOutProps {
  personId: string;
  onClose: () => void;
  onViewProfile?: (personId: string) => void;
  onSearchSkill?: (skill: string, type: 'expertise' | 'interest') => void;
}

export function PersonSlideOut({ personId, onClose, onViewProfile, onSearchSkill }: PersonSlideOutProps) {
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'about'>('overview');

  // Audio playback state
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      const data = await peopleService.getPersonProfile(personId);
      setProfile(data);
      setLoading(false);
    }
    loadProfile();
  }, [personId]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }
    };
  }, [audioElement]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handlePlayMedia = async (type: 'voice_intro' | 'name_pronunciation') => {
    if (playingAudio === type && audioElement) {
      audioElement.pause();
      setPlayingAudio(null);
      return;
    }

    const mediaData = await peopleService.getPersonMedia(personId, type);
    if (mediaData?.presignedUrl) {
      const audio = new Audio(mediaData.presignedUrl);
      audio.onended = () => setPlayingAudio(null);
      audio.play();
      setAudioElement(audio);
      setPlayingAudio(type);
    }
  };

  const initials = profile
    ? `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`.toUpperCase()
    : '';

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="person-slideout-overlay" onClick={onClose}>
      <div className="person-slideout" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="slideout-header">
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="slideout-loading">
            <Loader2 size={32} className="spinner" />
            <p>Loading profile...</p>
          </div>
        ) : profile ? (
          <>
            {/* Profile Header */}
            <div className="profile-header">
              <div className="avatar-section">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.fullName}
                    className="profile-avatar"
                  />
                ) : (
                  <div className="profile-avatar-placeholder">
                    {initials || <User size={40} />}
                  </div>
                )}
                {profile.isNewJoiner && (
                  <span className="new-joiner-badge">
                    <Sparkles size={12} />
                    New
                  </span>
                )}
              </div>

              <div className="profile-info">
                <h2>{profile.fullName}</h2>
                {profile.pronouns && (
                  <span className="pronouns">({profile.pronouns})</span>
                )}
                {profile.jobTitle && <p className="job-title">{profile.jobTitle}</p>}
                {profile.currentStatus && (
                  <p className="current-status">{profile.currentStatus}</p>
                )}
              </div>

              {/* Media Buttons */}
              <div className="media-buttons">
                {profile.media?.hasNamePronunciation && (
                  <button
                    className={`media-btn ${playingAudio === 'name_pronunciation' ? 'playing' : ''}`}
                    onClick={() => handlePlayMedia('name_pronunciation')}
                    title="Hear name pronunciation"
                  >
                    {playingAudio === 'name_pronunciation' ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                    Name
                  </button>
                )}
                {profile.media?.hasVoiceIntro && (
                  <button
                    className={`media-btn voice ${playingAudio === 'voice_intro' ? 'playing' : ''}`}
                    onClick={() => handlePlayMedia('voice_intro')}
                    title="Listen to voice intro"
                  >
                    {playingAudio === 'voice_intro' ? (
                      <Pause size={14} />
                    ) : (
                      <Mic size={14} />
                    )}
                    Intro
                  </button>
                )}
                {profile.media?.hasVideoIntro && (
                  <button
                    className="media-btn video"
                    onClick={() => onViewProfile?.(personId)}
                    title="Watch video intro"
                  >
                    <Video size={14} />
                    Video
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="profile-tabs">
              <button
                className={activeTab === 'overview' ? 'active' : ''}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                className={activeTab === 'about' ? 'active' : ''}
                onClick={() => setActiveTab('about')}
              >
                About
              </button>
            </div>

            {/* Tab Content */}
            <div className="profile-content">
              {activeTab === 'overview' && (
                <div className="overview-tab">
                  {/* Contact Info */}
                  <div className="info-section">
                    <h3>Contact</h3>
                    <div className="info-grid">
                      <div className="info-item">
                        <Mail size={14} />
                        <a href={`mailto:${profile.email}`}>{profile.email}</a>
                      </div>
                      {profile.workPhone && (
                        <div className="info-item">
                          <Phone size={14} />
                          <span>{profile.workPhone}</span>
                        </div>
                      )}
                      {profile.mobilePhone && (
                        <div className="info-item">
                          <Phone size={14} />
                          <span>{profile.mobilePhone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Work Info */}
                  <div className="info-section">
                    <h3>Work</h3>
                    <div className="info-grid">
                      {profile.department && (
                        <div className="info-item">
                          <Building2 size={14} />
                          <span>{profile.department}</span>
                        </div>
                      )}
                      {profile.location && (
                        <div className="info-item">
                          <MapPin size={14} />
                          <span>{profile.location}</span>
                        </div>
                      )}
                      {profile.startDate && (
                        <div className="info-item">
                          <Calendar size={14} />
                          <span>Joined {formatDate(profile.startDate)}</span>
                        </div>
                      )}
                      {profile.timezone && (
                        <div className="info-item">
                          <Clock size={14} />
                          <span>{profile.timezone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manager */}
                  {profile.manager && (
                    <div className="info-section">
                      <h3>Reports To</h3>
                      <div
                        className="manager-card"
                        onClick={() => onClose()}
                      >
                        <div className="manager-avatar">
                          {profile.manager.firstName?.[0]}
                          {profile.manager.lastName?.[0]}
                        </div>
                        <div className="manager-info">
                          <span className="manager-name">
                            {profile.manager.firstName} {profile.manager.lastName}
                          </span>
                          {profile.manager.jobTitle && (
                            <span className="manager-title">{profile.manager.jobTitle}</span>
                          )}
                        </div>
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  )}

                  {/* Expertise Topics */}
                  {profile.expertiseTopics && profile.expertiseTopics.length > 0 && (
                    <div className="info-section">
                      <h3>
                        <Star size={14} />
                        Ask Me About
                      </h3>
                      <div className="tag-list">
                        {profile.expertiseTopics.map((topic) => (
                          <span
                            key={topic.id}
                            className={`expertise-tag ${onSearchSkill ? 'clickable' : ''}`}
                            onClick={() => onSearchSkill?.(topic.topic, 'expertise')}
                            title={onSearchSkill ? `Find others with this skill` : undefined}
                          >
                            {topic.topic}
                            {topic.skillLevel && (
                              <span className="skill-level">{topic.skillLevel}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interests */}
                  {profile.interests && profile.interests.length > 0 && (
                    <div className="info-section">
                      <h3>
                        <Tag size={14} />
                        Interests
                      </h3>
                      <div className="tag-list">
                        {profile.interests.map((interest) => (
                          <span
                            key={interest.id}
                            className={`interest-tag ${onSearchSkill ? 'clickable' : ''}`}
                            onClick={() => onSearchSkill?.(interest.interest, 'interest')}
                            title={onSearchSkill ? `Find others with this interest` : undefined}
                          >
                            {interest.interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'about' && (
                <div className="about-tab">
                  {/* Bio */}
                  {profile.bio ? (
                    <div className="bio-section">
                      <h3>Bio</h3>
                      <p>{profile.bio}</p>
                    </div>
                  ) : null}

                  {/* Fun Facts */}
                  {profile.funFacts && profile.funFacts.length > 0 && (
                    <div className="fun-facts-section">
                      <h3>Fun Facts</h3>
                      <ul className="fun-facts-list">
                        {profile.funFacts.map((fact) => (
                          <li key={fact.id}>
                            {fact.emoji && <span className="fact-emoji">{fact.emoji}</span>}
                            <span>{fact.content}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!profile.bio &&
                    (!profile.funFacts || profile.funFacts.length === 0) && (
                      <div className="empty-about">
                        <User size={32} />
                        <p>No additional information available</p>
                      </div>
                    )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="slideout-error">
            <User size={48} />
            <p>Profile not found</p>
          </div>
        )}
      </div>
    </div>
  );
}
