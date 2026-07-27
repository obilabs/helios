import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Save,
  X,
  Plus,
  Trash2,
  Video,
  Loader2,
  Camera,
} from 'lucide-react';
import { profileService } from '../services/profile.service';
import type { ProfileData } from '../services/profile.service';
import { MediaRecorderComponent } from '../components/MediaRecorder';
import { AssetPickerModal } from '../components/AssetPickerModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import './MyProfile.css';

interface MyProfileProps {
  organizationId: string; // Reserved for future org-specific settings
}

export function MyProfile({ organizationId: _organizationId }: MyProfileProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [activeTab, setActiveTab] = useState<'about' | 'funfacts' | 'media' | 'privacy'>('about');

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    bio: '',
    pronouns: '',
    currentStatus: '',
    mobilePhone: '',
    workPhone: '',
    timezone: '',
    preferredLanguage: '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [funFactToDelete, setFunFactToDelete] = useState<string | null>(null);

  // Fun facts state
  const [newFunFact, setNewFunFact] = useState({ emoji: '', content: '' });
  const [addingFunFact, setAddingFunFact] = useState(false);

  // Interests state
  const [newInterest, setNewInterest] = useState('');
  const [addingInterest, setAddingInterest] = useState(false);

  // Expertise state
  const [newExpertise, setNewExpertise] = useState('');
  const [addingExpertise, setAddingExpertise] = useState(false);

  // Photo picker state
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);

  // Load profile data
  const loadProfile = useCallback(async () => {
    setLoading(true);
    const data = await profileService.getProfile();
    if (data) {
      setProfileData(data);
      setFormData({
        firstName: data.profile.firstName || '',
        lastName: data.profile.lastName || '',
        bio: data.profile.bio || '',
        pronouns: data.profile.pronouns || '',
        currentStatus: data.profile.currentStatus || '',
        mobilePhone: data.profile.mobilePhone || '',
        workPhone: data.profile.workPhone || '',
        timezone: data.profile.timezone || '',
        preferredLanguage: data.profile.preferredLanguage || '',
      });
      setHasChanges(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Track form changes
  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!hasChanges) return;
    setSaving(true);
    const success = await profileService.updateProfile(formData);
    if (success) {
      setHasChanges(false);
      loadProfile();
    }
    setSaving(false);
  };

  // Handle profile photo selection from asset picker
  const handlePhotoSelect = async (asset: { publicUrl?: string }) => {
    if (!asset.publicUrl) {
      setShowPhotoPicker(false);
      return;
    }

    setUpdatingPhoto(true);
    try {
      const success = await profileService.updateProfile({
        avatarUrl: asset.publicUrl,
      });
      if (success) {
        loadProfile();
      }
    } catch (err) {
      console.error('Failed to update profile photo:', err);
    } finally {
      setUpdatingPhoto(false);
      setShowPhotoPicker(false);
    }
  };

  // Fun Facts handlers
  const handleAddFunFact = async () => {
    if (!newFunFact.content.trim()) return;
    setAddingFunFact(true);
    const fact = await profileService.addFunFact(newFunFact.emoji || null, newFunFact.content);
    if (fact) {
      setNewFunFact({ emoji: '', content: '' });
      loadProfile();
    }
    setAddingFunFact(false);
  };

  const handleDeleteFunFact = (id: string) => {
    setFunFactToDelete(id);
  };

  const confirmDeleteFunFact = async () => {
    if (!funFactToDelete) return;
    await profileService.deleteFunFact(funFactToDelete);
    loadProfile();
    setFunFactToDelete(null);
  };

  // Interest handlers
  const handleAddInterest = async () => {
    if (!newInterest.trim()) return;
    setAddingInterest(true);
    const interest = await profileService.addInterest(newInterest);
    if (interest) {
      setNewInterest('');
      loadProfile();
    }
    setAddingInterest(false);
  };

  const handleDeleteInterest = async (id: string) => {
    await profileService.deleteInterest(id);
    loadProfile();
  };

  // Expertise handlers
  const handleAddExpertise = async () => {
    if (!newExpertise.trim()) return;
    setAddingExpertise(true);
    const topic = await profileService.addExpertise(newExpertise);
    if (topic) {
      setNewExpertise('');
      loadProfile();
    }
    setAddingExpertise(false);
  };

  const handleDeleteExpertise = async (id: string) => {
    await profileService.deleteExpertise(id);
    loadProfile();
  };

  if (loading) {
    return (
      <div className="my-profile-page">
        <div className="loading-state">
          <Loader2 className="spin" size={32} />
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="my-profile-page">
        <div className="error-state">
          <p>Failed to load profile. Please try again.</p>
          <button onClick={loadProfile} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { profile, funFacts, interests, expertiseTopics, media } = profileData;

  return (
    <div className="my-profile-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>My Profile</h1>
          <div className="completeness-badge">
            <div
              className="completeness-ring"
              style={{ '--progress': `${profile.profileCompleteness}%` } as React.CSSProperties}
            >
              <span>{profile.profileCompleteness}%</span>
            </div>
            <span className="completeness-label">Complete</span>
          </div>
        </div>
        {hasChanges && (
          <div className="save-bar">
            <span>You have unsaved changes</span>
            <div className="save-actions">
              <button className="btn-secondary" onClick={() => loadProfile()}>
                <X size={16} /> Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveProfile} disabled={saving}>
                {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile Card */}
      <div className="profile-card">
        <div className="avatar-section">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="Profile" className="avatar-large" />
          ) : (
            <div className="avatar-placeholder">
              <User size={48} />
            </div>
          )}
          <button
            className="btn-text change-photo"
            onClick={() => setShowPhotoPicker(true)}
            disabled={updatingPhoto}
          >
            {updatingPhoto ? <Loader2 className="spin" size={14} /> : <Camera size={14} />}
            {updatingPhoto ? 'Updating...' : 'Change Photo'}
          </button>
        </div>
        <div className="profile-info">
          <h2>
            {profile.firstName} {profile.lastName}
          </h2>
          <p className="job-title">{profile.jobTitle || 'No title set'}</p>
          <p className="department">{profile.department || 'No department'}</p>
          <p className="email">{profile.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        <button
          className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          About Me
        </button>
        <button
          className={`tab-btn ${activeTab === 'funfacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('funfacts')}
        >
          Fun Facts & Interests
        </button>
        <button
          className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveTab('media')}
        >
          Voice & Video
        </button>
        <button
          className={`tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
          onClick={() => setActiveTab('privacy')}
        >
          Privacy
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* About Me Tab */}
        {activeTab === 'about' && (
          <div className="about-section">
            <div className="form-section">
              <h3>Basic Information</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    placeholder="Enter first name"
                  />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    placeholder="Enter last name"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Pronouns</label>
                <select
                  value={formData.pronouns}
                  onChange={(e) => handleInputChange('pronouns', e.target.value)}
                >
                  <option value="">Select pronouns</option>
                  <option value="He/Him">He/Him</option>
                  <option value="She/Her">She/Her</option>
                  <option value="They/Them">They/Them</option>
                  <option value="He/They">He/They</option>
                  <option value="She/They">She/They</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-section">
              <h3>About Me</h3>
              <div className="form-group">
                <label>Bio</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  placeholder="Tell your coworkers about yourself..."
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label>Currently Working On</label>
                <input
                  type="text"
                  value={formData.currentStatus}
                  onChange={(e) => handleInputChange('currentStatus', e.target.value)}
                  placeholder="What project or initiative are you working on?"
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Contact Information</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Mobile Phone</label>
                  <input
                    type="tel"
                    value={formData.mobilePhone}
                    onChange={(e) => handleInputChange('mobilePhone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div className="form-group">
                  <label>Work Phone</label>
                  <input
                    type="tel"
                    value={formData.workPhone}
                    onChange={(e) => handleInputChange('workPhone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Timezone</label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => handleInputChange('timezone', e.target.value)}
                  >
                    <option value="">Select timezone</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="America/Edmonton">Mountain Time - Edmonton</option>
                    <option value="America/Vancouver">Pacific Time - Vancouver</option>
                    <option value="Europe/London">London (GMT)</option>
                    <option value="Europe/Paris">Paris (CET)</option>
                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                    <option value="Australia/Sydney">Sydney (AEST)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Preferred Language</label>
                  <select
                    value={formData.preferredLanguage}
                    onChange={(e) => handleInputChange('preferredLanguage', e.target.value)}
                  >
                    <option value="">Select language</option>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                    <option value="zh">Chinese</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fun Facts Tab */}
        {activeTab === 'funfacts' && (
          <div className="funfacts-section">
            {/* Fun Facts */}
            <div className="form-section">
              <h3>Fun Facts</h3>
              <p className="section-description">Share interesting facts about yourself!</p>

              <div className="funfacts-list">
                {funFacts.map((fact) => (
                  <div key={fact.id} className="funfact-item">
                    <span className="funfact-emoji">{fact.emoji || '>'}</span>
                    <span className="funfact-content">{fact.content}</span>
                    <button
                      className="btn-icon delete"
                      onClick={() => handleDeleteFunFact(fact.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="add-funfact">
                <input
                  type="text"
                  placeholder="Emoji (optional)"
                  value={newFunFact.emoji}
                  onChange={(e) => setNewFunFact((prev) => ({ ...prev, emoji: e.target.value }))}
                  className="emoji-input"
                  maxLength={4}
                />
                <input
                  type="text"
                  placeholder="Add a fun fact about yourself..."
                  value={newFunFact.content}
                  onChange={(e) => setNewFunFact((prev) => ({ ...prev, content: e.target.value }))}
                  className="content-input"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddFunFact()}
                />
                <button
                  className="btn-primary"
                  onClick={handleAddFunFact}
                  disabled={addingFunFact || !newFunFact.content.trim()}
                >
                  {addingFunFact ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  Add
                </button>
              </div>
            </div>

            {/* Interests */}
            <div className="form-section">
              <h3>Interests & Hobbies</h3>
              <p className="section-description">
                Help coworkers find common ground with you.
              </p>

              <div className="tags-list">
                {interests.map((interest) => (
                  <span key={interest.id} className="tag">
                    {interest.interest}
                    <button
                      className="tag-remove"
                      onClick={() => handleDeleteInterest(interest.id)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              <div className="add-tag">
                <input
                  type="text"
                  placeholder="Add an interest (e.g., Photography, Hiking)"
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddInterest()}
                />
                <button
                  className="btn-primary"
                  onClick={handleAddInterest}
                  disabled={addingInterest || !newInterest.trim()}
                >
                  {addingInterest ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  Add
                </button>
              </div>
            </div>

            {/* Ask Me About */}
            <div className="form-section">
              <h3>Ask Me About</h3>
              <p className="section-description">
                Topics you are happy to help others with.
              </p>

              <div className="tags-list expertise">
                {expertiseTopics.map((topic) => (
                  <span key={topic.id} className="tag">
                    {topic.topic}
                    <button
                      className="tag-remove"
                      onClick={() => handleDeleteExpertise(topic.id)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              <div className="add-tag">
                <input
                  type="text"
                  placeholder="Add a topic (e.g., React, TypeScript)"
                  value={newExpertise}
                  onChange={(e) => setNewExpertise(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddExpertise()}
                />
                <button
                  className="btn-primary"
                  onClick={handleAddExpertise}
                  disabled={addingExpertise || !newExpertise.trim()}
                >
                  {addingExpertise ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Media Tab */}
        {activeTab === 'media' && (
          <div className="media-section">
            <div className="form-section">
              <MediaRecorderComponent
                type="name_pronunciation"
                maxDuration={10}
                onUploadSuccess={loadProfile}
                onDelete={loadProfile}
                existingMediaUrl={media.name_pronunciation?.presignedUrl}
                existingDuration={media.name_pronunciation?.durationSeconds || undefined}
              />
            </div>

            <div className="form-section">
              <MediaRecorderComponent
                type="voice_intro"
                maxDuration={60}
                onUploadSuccess={loadProfile}
                onDelete={loadProfile}
                existingMediaUrl={media.voice_intro?.presignedUrl}
                existingDuration={media.voice_intro?.durationSeconds || undefined}
              />
            </div>

            <div className="form-section">
              <h3>Video Introduction</h3>
              <p className="section-description">
                Upload a short video introduction (up to 2 minutes).
              </p>
              <div className="media-card">
                {media.video_intro ? (
                  <div className="media-preview">
                    <video controls src={media.video_intro.presignedUrl} />
                    <span className="duration">
                      {media.video_intro.durationSeconds}s
                    </span>
                    <button className="btn-text delete" onClick={() => {
                      profileService.deleteMedia('video_intro').then(() => loadProfile());
                    }}>Delete Video</button>
                  </div>
                ) : (
                  <div className="media-placeholder">
                    <Video size={32} />
                    <p>No video intro uploaded</p>
                    <label className="btn-primary" style={{ cursor: 'pointer' }}>
                      <Video size={16} /> Upload Video
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const result = await profileService.uploadMedia('video_intro', file);
                            if (result) loadProfile();
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div className="privacy-section">
            <div className="form-section">
              <h3>Field Visibility</h3>
              <p className="section-description">
                Control who can see your personal information in the People Directory.
              </p>

              {/* Contact Information */}
              <div className="privacy-group">
                <h4 className="privacy-group-title">Contact Information</h4>
                <div className="privacy-settings">
                  {[
                    { field: 'email', label: 'Work Email' },
                    { field: 'personal_email', label: 'Personal Email' },
                    { field: 'phone', label: 'Phone Number' },
                    { field: 'work_phone', label: 'Work Phone' },
                    { field: 'mobile_phone', label: 'Mobile Phone' },
                  ].map((item) => (
                    <div key={item.field} className="privacy-row">
                      <span className="field-label">{item.label}</span>
                      <select
                        value={profileData.visibility[item.field] || 'everyone'}
                        onChange={async (e) => {
                          await profileService.updatePrivacySettings({
                            [item.field]: e.target.value,
                          });
                          loadProfile();
                        }}
                      >
                        <option value="everyone">Everyone</option>
                        <option value="team">My Team Only</option>
                        <option value="manager">Manager Only</option>
                        <option value="none">Only Me</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Professional Information */}
              <div className="privacy-group">
                <h4 className="privacy-group-title">Professional Information</h4>
                <div className="privacy-settings">
                  {[
                    { field: 'job_title', label: 'Job Title' },
                    { field: 'location', label: 'Location' },
                    { field: 'timezone', label: 'Timezone' },
                  ].map((item) => (
                    <div key={item.field} className="privacy-row">
                      <span className="field-label">{item.label}</span>
                      <select
                        value={profileData.visibility[item.field] || 'everyone'}
                        onChange={async (e) => {
                          await profileService.updatePrivacySettings({
                            [item.field]: e.target.value,
                          });
                          loadProfile();
                        }}
                      >
                        <option value="everyone">Everyone</option>
                        <option value="team">My Team Only</option>
                        <option value="manager">Manager Only</option>
                        <option value="none">Only Me</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Personal Information */}
              <div className="privacy-group">
                <h4 className="privacy-group-title">Personal Information</h4>
                <div className="privacy-settings">
                  {[
                    { field: 'pronouns', label: 'Pronouns' },
                    { field: 'bio', label: 'Bio' },
                    { field: 'fun_facts', label: 'Fun Facts' },
                    { field: 'interests', label: 'Interests' },
                  ].map((item) => (
                    <div key={item.field} className="privacy-row">
                      <span className="field-label">{item.label}</span>
                      <select
                        value={profileData.visibility[item.field] || 'everyone'}
                        onChange={async (e) => {
                          await profileService.updatePrivacySettings({
                            [item.field]: e.target.value,
                          });
                          loadProfile();
                        }}
                      >
                        <option value="everyone">Everyone</option>
                        <option value="team">My Team Only</option>
                        <option value="manager">Manager Only</option>
                        <option value="none">Only Me</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Media */}
              <div className="privacy-group">
                <h4 className="privacy-group-title">Media</h4>
                <div className="privacy-settings">
                  {[
                    { field: 'voice_intro', label: 'Voice Introduction' },
                    { field: 'video_intro', label: 'Video Introduction' },
                  ].map((item) => (
                    <div key={item.field} className="privacy-row">
                      <span className="field-label">{item.label}</span>
                      <select
                        value={profileData.visibility[item.field] || 'everyone'}
                        onChange={async (e) => {
                          await profileService.updatePrivacySettings({
                            [item.field]: e.target.value,
                          });
                          loadProfile();
                        }}
                      >
                        <option value="everyone">Everyone</option>
                        <option value="team">My Team Only</option>
                        <option value="manager">Manager Only</option>
                        <option value="none">Only Me</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profile Photo Picker Modal */}
      <AssetPickerModal
        isOpen={showPhotoPicker}
        onClose={() => setShowPhotoPicker(false)}
        onSelect={handlePhotoSelect}
        title="Choose Profile Photo"
        acceptedTypes={['image/*']}
        category="profiles"
      />

      {/* Delete Fun Fact Confirmation */}
      <ConfirmDialog
        isOpen={funFactToDelete !== null}
        title="Delete Fun Fact"
        message="Are you sure you want to delete this fun fact?"
        variant="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteFunFact}
        onCancel={() => setFunFactToDelete(null)}
      />
    </div>
  );
}
