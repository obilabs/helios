import React, { useState, useEffect } from 'react';
import { authFetch } from '../../config/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import './UserProfile.css';

interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  role: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

interface UserProfileProps {
  userId?: string;
}

const UserProfile: React.FC<UserProfileProps> = ({ userId: _userId }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions'>('profile');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    department: ''
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [twoFactorData, setTwoFactorData] = useState({
    qrCode: '',
    secret: '',
    verificationCode: '',
    backupCodes: [] as string[]
  });

  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false);

  useEffect(() => {
    fetchUserData();
    if (activeTab === 'sessions') {
      fetchSessions();
    }
  }, [activeTab]);

  const fetchUserData = async () => {
    setIsLoading(true);
    try {
      const response = await authFetch('/api/user/me');

      if (response.ok) {
        const data = await response.json();
        setUserData(data.user);
        setFormData({
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          department: data.user.department || ''
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load profile' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await authFetch('/api/user/sessions');

      if (response.ok) {
        const data = await response.json();
        setActiveSessions(data.sessions);
      }
    } catch (error) {
      console.error('Failed to fetch sessions');
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await authFetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully' });
        setUserData(result.user);
        setIsEditing(false);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update profile' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await authFetch('/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully' });
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to change password' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to change password' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnable2FA = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await authFetch('/api/user/2fa/setup', {
        method: 'POST'
      });

      const result = await response.json();

      if (response.ok) {
        setTwoFactorData({
          ...twoFactorData,
          qrCode: result.qrCode,
          secret: result.secret,
          backupCodes: result.backupCodes
        });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to setup 2FA' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to setup 2FA' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await authFetch('/api/user/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: twoFactorData.verificationCode
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: '2FA enabled successfully' });
        setUserData(prev => prev ? { ...prev, twoFactorEnabled: true } : null);
        setTwoFactorData({
          qrCode: '',
          secret: '',
          verificationCode: '',
          backupCodes: result.backupCodes
        });
      } else {
        setMessage({ type: 'error', text: result.error || 'Invalid verification code' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to verify 2FA' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable2FA = () => {
    setShowDisable2FAConfirm(true);
  };

  const confirmDisable2FA = async () => {
    setShowDisable2FAConfirm(false);
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await authFetch('/api/user/2fa/disable', {
        method: 'POST'
      });

      if (response.ok) {
        setMessage({ type: 'success', text: '2FA disabled successfully' });
        setUserData(prev => prev ? { ...prev, twoFactorEnabled: false } : null);
      } else {
        setMessage({ type: 'error', text: 'Failed to disable 2FA' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to disable 2FA' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const response = await authFetch(`/api/user/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
        setMessage({ type: 'success', text: 'Session terminated' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to terminate session' });
    }
  };

  if (isLoading && !userData) {
    return <div className="user-profile-loading">Loading profile...</div>;
  }

  if (!userData) {
    return <div className="user-profile-error">Failed to load profile</div>;
  }

  return (
    <div className="user-profile">
      <div className="user-profile-header">
        <h2>My Profile</h2>
        <p>Manage your account settings and security</p>
      </div>

      <div className="user-profile-tabs">
        <button
          className={`profile-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button
          className={`profile-tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Security
        </button>
        <button
          className={`profile-tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions
        </button>
      </div>

      {message && (
        <div className={`profile-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="user-profile-content">
        {activeTab === 'profile' && (
          <div className="profile-tab-content">
            <form onSubmit={handleProfileUpdate}>
              <div className="profile-section">
                <h3>Personal Information</h3>

                <div className="profile-field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={userData.email}
                    disabled
                    className="disabled"
                  />
                  {!userData.emailVerified && (
                    <span className="field-note warning">Email not verified</span>
                  )}
                </div>

                <div className="profile-field">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    disabled={!isEditing}
                    required
                  />
                </div>

                <div className="profile-field">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    disabled={!isEditing}
                    required
                  />
                </div>

                <div className="profile-field">
                  <label>Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    disabled={!isEditing}
                    placeholder="Optional"
                  />
                </div>

                <div className="profile-field">
                  <label>Role</label>
                  <input
                    type="text"
                    value={userData.role}
                    disabled
                    className="disabled"
                  />
                </div>

                <div className="profile-actions">
                  {!isEditing ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit Profile
                    </button>
                  ) : (
                    <>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={isLoading}
                      >
                        {isLoading ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setIsEditing(false);
                          setFormData({
                            firstName: userData.firstName,
                            lastName: userData.lastName,
                            department: userData.department || ''
                          });
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="security-tab-content">
            <div className="security-section">
              <h3>Change Password</h3>
              <form onSubmit={handlePasswordChange}>
                <div className="profile-field">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    required
                  />
                </div>

                <div className="profile-field">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    required
                    minLength={8}
                  />
                  <span className="field-note">Minimum 8 characters</span>
                </div>

                <div className="profile-field">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            </div>

            <div className="security-section">
              <h3>Two-Factor Authentication</h3>

              {userData.twoFactorEnabled ? (
                <div className="tfa-enabled">
                  <p className="tfa-status success">
                    ✅ Two-factor authentication is enabled
                  </p>
                  <button
                    className="btn-danger"
                    onClick={handleDisable2FA}
                    disabled={isLoading}
                  >
                    Disable 2FA
                  </button>
                </div>
              ) : (
                <div className="tfa-setup">
                  {!twoFactorData.qrCode ? (
                    <>
                      <p>Add an extra layer of security to your account</p>
                      <button
                        className="btn-primary"
                        onClick={handleEnable2FA}
                        disabled={isLoading}
                      >
                        Enable 2FA
                      </button>
                    </>
                  ) : (
                    <div className="tfa-setup-steps">
                      <h4>Setup Two-Factor Authentication</h4>

                      <div className="tfa-step">
                        <p>1. Scan this QR code with your authenticator app:</p>
                        <div className="qr-code-container">
                          <img src={twoFactorData.qrCode} alt="2FA QR Code" />
                        </div>
                      </div>

                      <div className="tfa-step">
                        <p>2. Or enter this key manually:</p>
                        <code className="tfa-secret">{twoFactorData.secret}</code>
                      </div>

                      <div className="tfa-step">
                        <p>3. Enter the verification code from your app:</p>
                        <input
                          type="text"
                          placeholder="000000"
                          value={twoFactorData.verificationCode}
                          onChange={(e) => setTwoFactorData({
                            ...twoFactorData,
                            verificationCode: e.target.value
                          })}
                          maxLength={6}
                        />
                        <button
                          className="btn-primary"
                          onClick={handleVerify2FA}
                          disabled={isLoading || twoFactorData.verificationCode.length !== 6}
                        >
                          Verify and Enable
                        </button>
                      </div>

                      {twoFactorData.backupCodes.length > 0 && (
                        <div className="tfa-backup-codes">
                          <h4>Backup Codes</h4>
                          <p>Save these codes in a safe place. You can use them to access your account if you lose your authenticator device.</p>
                          <div className="backup-codes-grid">
                            {twoFactorData.backupCodes.map((code, index) => (
                              <code key={index}>{code}</code>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="sessions-tab-content">
            <h3>Active Sessions</h3>
            <p>These are the devices currently logged into your account.</p>

            <div className="sessions-list">
              {activeSessions.map(session => (
                <div key={session.id} className="session-item">
                  <div className="session-info">
                    <div className="session-device">
                      {session.userAgent.includes('Mobile') ? '📱' : '💻'}
                      <div>
                        <strong>{session.userAgent.split('(')[0]}</strong>
                        <p>{session.ipAddress}</p>
                      </div>
                    </div>
                    <div className="session-time">
                      <p>Last active: {new Date(session.lastUsed).toLocaleString()}</p>
                      <p>Created: {new Date(session.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  {session.isCurrent ? (
                    <span className="session-current">Current</span>
                  ) : (
                    <button
                      className="btn-danger-small"
                      onClick={() => handleTerminateSession(session.id)}
                    >
                      Terminate
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDisable2FAConfirm}
        title="Disable Two-Factor Authentication"
        message="Are you sure you want to disable two-factor authentication? This will reduce the security of your account."
        variant="warning"
        confirmText="Disable 2FA"
        onConfirm={confirmDisable2FA}
        onCancel={() => setShowDisable2FAConfirm(false)}
      />
    </div>
  );
};

export default UserProfile;