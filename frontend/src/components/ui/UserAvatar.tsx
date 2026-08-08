import { useState, useEffect } from 'react';
import md5 from 'blueimp-md5';

interface UserAvatarProps {
  email: string;
  firstName: string;
  lastName: string;
  size?: number;
  className?: string;
  avatarUrl?: string;
}

/**
 * UserAvatar component with Gravatar support and initials fallback
 *
 * Priority:
 * 1. Custom avatar URL (if provided)
 * 2. Gravatar (if user has one registered)
 * 3. Initials with consistent background color
 */
export function UserAvatar({
  email,
  firstName,
  lastName,
  size = 32,
  className = '',
  avatarUrl
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [gravatarLoaded, setGravatarLoaded] = useState(false);

  // Reset error state when email changes
  useEffect(() => {
    setImgError(false);
    setGravatarLoaded(false);
  }, [email, avatarUrl]);

  // Generate initials
  const getInitials = () => {
    const first = firstName?.[0] || '';
    const last = lastName?.[0] || '';
    return (first + last).toUpperCase() || email?.[0]?.toUpperCase() || '?';
  };

  // Generate consistent color based on email
  const getBackgroundColor = () => {
    const colors = [
      '#6366f1', // indigo
      '#8b5cf6', // violet
      '#a855f7', // purple
      '#d946ef', // fuchsia
      '#ec4899', // pink
      '#f43f5e', // rose
      '#ef4444', // red
      '#f97316', // orange
      '#f59e0b', // amber
      '#eab308', // yellow
      '#84cc16', // lime
      '#22c55e', // green
      '#10b981', // emerald
      '#14b8a6', // teal
      '#06b6d4', // cyan
      '#0ea5e9', // sky
      '#3b82f6', // blue
    ];

    // Simple hash of email to pick a color
    let hash = 0;
    const str = email?.toLowerCase() || 'default';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Generate Gravatar URL
  // Using 404 as default so we can detect if user has no Gravatar
  const getGravatarUrl = () => {
    const hash = md5(email?.toLowerCase().trim() || '');
    return `https://www.gravatar.com/avatar/${hash}?s=${size * 2}&d=404`;
  };

  // If we have a custom avatar URL, use it
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={`${firstName} ${lastName}`}
        className={`user-avatar ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
        }}
        onError={() => setImgError(true)}
      />
    );
  }

  // Try Gravatar if we haven't errored on it
  if (!imgError && !gravatarLoaded) {
    return (
      <>
        {/* Hidden img to test if Gravatar exists */}
        <img
          src={getGravatarUrl()}
          alt=""
          style={{ display: 'none' }}
          onLoad={() => setGravatarLoaded(true)}
          onError={() => setImgError(true)}
        />
        {/* Show initials while loading */}
        <div
          className={`user-avatar user-avatar-initials ${className}`}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: getBackgroundColor(),
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.4,
            fontWeight: 600,
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {getInitials()}
        </div>
      </>
    );
  }

  // If Gravatar loaded successfully, show it
  if (gravatarLoaded) {
    return (
      <img
        src={getGravatarUrl()}
        alt={`${firstName} ${lastName}`}
        className={`user-avatar ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
        }}
      />
    );
  }

  // Fallback to initials
  return (
    <div
      className={`user-avatar user-avatar-initials ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: getBackgroundColor(),
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 600,
        textTransform: 'uppercase',
        flexShrink: 0,
      }}
    >
      {getInitials()}
    </div>
  );
}

export default UserAvatar;
