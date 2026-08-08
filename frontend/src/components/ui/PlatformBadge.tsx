import React from 'react';
import { Database, Grid2X2, Cloud, MessageSquare } from 'lucide-react';

export type PlatformType = 'google' | 'microsoft' | 'helios' | 'slack' | 'okta' | 'local' | 'unknown';

interface PlatformBadgeProps {
  platform: PlatformType | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  variant?: 'icon' | 'badge';
  className?: string;
}

interface PlatformConfig {
  label: string;
  bgColor: string;
  iconColor?: string;
}

// Platform configuration with colors and labels
const platformConfig: Record<string, PlatformConfig> = {
  google: {
    label: 'Google Workspace',
    bgColor: '#4285F4',
  },
  microsoft: {
    label: 'Microsoft 365',
    bgColor: '#00A4EF',
  },
  helios: {
    label: 'Helios',
    bgColor: 'var(--theme-primary, #8b5cf6)',
  },
  slack: {
    label: 'Slack',
    bgColor: '#611f69',
  },
  okta: {
    label: 'Okta',
    bgColor: '#007dc1',
  },
  local: {
    label: 'Local',
    bgColor: '#6b7280',
  },
  unknown: {
    label: 'Unknown',
    bgColor: '#9ca3af',
  },
};

// Size configurations
const sizeConfig = {
  sm: { badge: 24, icon: 14, fontSize: 10 },
  md: { badge: 28, icon: 16, fontSize: 12 },
  lg: { badge: 36, icon: 20, fontSize: 14 },
};

// Google icon with brand colors
const GoogleIcon: React.FC<{ size: number; inBadge?: boolean }> = ({ size, inBadge }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    {inBadge ? (
      // White version for badge background
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white"/>
    ) : (
      // Color version for standalone icon
      <>
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </>
    )}
  </svg>
);

// Microsoft icon with brand colors
const MicrosoftIcon: React.FC<{ size: number; inBadge?: boolean }> = ({ size, inBadge }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    {inBadge ? (
      // White version for badge background
      <>
        <path d="M1 1h10v10H1V1z" fill="white" fillOpacity="0.9"/>
        <path d="M13 1h10v10H13V1z" fill="white" fillOpacity="0.7"/>
        <path d="M1 13h10v10H1V13z" fill="white" fillOpacity="0.7"/>
        <path d="M13 13h10v10H13V13z" fill="white" fillOpacity="0.5"/>
      </>
    ) : (
      // Color version for standalone icon
      <>
        <path d="M1 1h10v10H1V1z" fill="#F25022"/>
        <path d="M13 1h10v10H13V1z" fill="#7FBA00"/>
        <path d="M1 13h10v10H1V13z" fill="#00A4EF"/>
        <path d="M13 13h10v10H13V13z" fill="#FFB900"/>
      </>
    )}
  </svg>
);

// Helios icon
const HeliosIcon: React.FC<{ size: number; inBadge?: boolean }> = ({ size, inBadge }) => (
  <Database size={size} strokeWidth={1.5} color={inBadge ? 'white' : 'var(--theme-primary, #8b5cf6)'} />
);

// Slack icon
const SlackIcon: React.FC<{ size: number; inBadge?: boolean }> = ({ size, inBadge }) => (
  <MessageSquare size={size} strokeWidth={1.5} color={inBadge ? 'white' : '#611f69'} />
);

// Okta icon
const OktaIcon: React.FC<{ size: number; inBadge?: boolean }> = ({ size, inBadge }) => (
  <Cloud size={size} strokeWidth={1.5} color={inBadge ? 'white' : '#007dc1'} />
);

// Local/Unknown icon
const DefaultIcon: React.FC<{ size: number; inBadge?: boolean }> = ({ size, inBadge }) => (
  <Grid2X2 size={size} strokeWidth={1.5} color={inBadge ? 'white' : '#6b7280'} />
);

export function PlatformBadge({
  platform,
  size = 'md',
  showLabel = false,
  variant = 'badge',
  className = ''
}: PlatformBadgeProps) {
  const normalizedPlatform = platform?.toLowerCase() || 'unknown';
  const config = platformConfig[normalizedPlatform] || platformConfig.unknown;
  const sizeValues = sizeConfig[size];
  const inBadge = variant === 'badge';

  const renderIcon = () => {
    switch (normalizedPlatform) {
      case 'google':
        return <GoogleIcon size={sizeValues.icon} inBadge={inBadge} />;
      case 'microsoft':
        return <MicrosoftIcon size={sizeValues.icon} inBadge={inBadge} />;
      case 'helios':
        return <HeliosIcon size={sizeValues.icon} inBadge={inBadge} />;
      case 'slack':
        return <SlackIcon size={sizeValues.icon} inBadge={inBadge} />;
      case 'okta':
        return <OktaIcon size={sizeValues.icon} inBadge={inBadge} />;
      case 'local':
      default:
        return <DefaultIcon size={sizeValues.icon} inBadge={inBadge} />;
    }
  };

  const badgeStyles: React.CSSProperties = variant === 'badge' ? {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: sizeValues.badge,
    height: sizeValues.badge,
    borderRadius: 6,
    backgroundColor: config.bgColor,
    flexShrink: 0,
  } : {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: sizeValues.badge,
    height: sizeValues.badge,
    flexShrink: 0,
  };

  return (
    <span
      className={`platform-badge-component ${className}`}
      title={config.label}
      style={badgeStyles}
    >
      {renderIcon()}
      {showLabel && (
        <span style={{
          marginLeft: 6,
          fontSize: sizeValues.fontSize,
          fontWeight: 500,
          color: variant === 'badge' ? 'white' : '#374151',
          whiteSpace: 'nowrap'
        }}>
          {config.label}
        </span>
      )}
    </span>
  );
}

// Multi-platform display component
interface PlatformBadgesListProps {
  platforms: (PlatformType | string)[];
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'badge';
  className?: string;
}

export function PlatformBadgesList({
  platforms,
  size = 'md',
  variant = 'badge',
  className = ''
}: PlatformBadgesListProps) {
  if (!platforms || platforms.length === 0) {
    return <PlatformBadge platform="local" size={size} variant={variant} />;
  }

  return (
    <span
      className={`platform-badges-list ${className}`}
      style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}
    >
      {platforms.map((platform, index) => (
        <PlatformBadge
          key={`${platform}-${index}`}
          platform={platform}
          size={size}
          variant={variant}
        />
      ))}
    </span>
  );
}

export default PlatformBadge;
