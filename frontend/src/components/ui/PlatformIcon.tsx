import React from 'react';
import { Database, Grid2X2, Cloud, MessageSquare } from 'lucide-react';

export type PlatformType = 'google' | 'microsoft' | 'helios' | 'slack' | 'okta' | 'unknown';

interface PlatformIconProps {
  platform: PlatformType | string;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

// Platform labels only (no background colors - icons stand alone)
const platformLabels: Record<string, string> = {
  google: 'Google Workspace',
  microsoft: 'Microsoft 365',
  helios: 'Helios',
  slack: 'Slack',
  okta: 'Okta',
  unknown: 'Unknown',
};

// Google icon with brand colors (no background needed)
const GoogleIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// Microsoft icon with brand colors (no background needed)
const MicrosoftIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M1 1h10v10H1V1z" fill="#F25022"/>
    <path d="M13 1h10v10H13V1z" fill="#7FBA00"/>
    <path d="M1 13h10v10H1V13z" fill="#00A4EF"/>
    <path d="M13 13h10v10H13V13z" fill="#FFB900"/>
  </svg>
);

// Helios icon - uses current theme color via CSS variable
const HeliosIcon: React.FC<{ size: number }> = ({ size }) => (
  <Database size={size} strokeWidth={1.5} style={{ color: 'var(--theme-primary, #6b7280)' }} />
);

// Slack icon - simplified monochrome
const SlackIcon: React.FC<{ size: number }> = ({ size }) => (
  <MessageSquare size={size} strokeWidth={1.5} style={{ color: '#611f69' }} />
);

// Okta icon - uses cloud
const OktaIcon: React.FC<{ size: number }> = ({ size }) => (
  <Cloud size={size} strokeWidth={1.5} style={{ color: '#007dc1' }} />
);

// Unknown/default icon
const DefaultIcon: React.FC<{ size: number }> = ({ size }) => (
  <Grid2X2 size={size} strokeWidth={1.5} style={{ color: '#6b7280' }} />
);

export function PlatformIcon({ platform, size = 20, showLabel = false, className = '' }: PlatformIconProps) {
  const normalizedPlatform = platform?.toLowerCase() || 'unknown';
  const label = platformLabels[normalizedPlatform] || platformLabels.unknown;

  const renderIcon = () => {
    switch (normalizedPlatform) {
      case 'google':
        return <GoogleIcon size={size} />;
      case 'microsoft':
        return <MicrosoftIcon size={size} />;
      case 'helios':
        return <HeliosIcon size={size} />;
      case 'slack':
        return <SlackIcon size={size} />;
      case 'okta':
        return <OktaIcon size={size} />;
      default:
        return <DefaultIcon size={size} />;
    }
  };

  return (
    <span
      className={`platform-icon ${className}`}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {renderIcon()}
      {showLabel && (
        <span style={{ marginLeft: '6px', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
          {label}
        </span>
      )}
    </span>
  );
}

// Multi-platform display component
interface PlatformBadgesProps {
  platforms: (PlatformType | string)[];
  size?: number;
  className?: string;
}

export function PlatformBadges({ platforms, size = 20, className = '' }: PlatformBadgesProps) {
  if (!platforms || platforms.length === 0) {
    return <PlatformIcon platform="helios" size={size} />;
  }

  return (
    <span className={`platform-badges ${className}`} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
      {platforms.map((platform, index) => (
        <PlatformIcon key={`${platform}-${index}`} platform={platform} size={size} />
      ))}
    </span>
  );
}

export default PlatformIcon;
