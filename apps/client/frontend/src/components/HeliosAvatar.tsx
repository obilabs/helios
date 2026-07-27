import React, { useEffect, useState } from 'react';
import './HeliosAvatar.css';

export type AvatarState = 'idle' | 'thinking' | 'searching' | 'speaking' | 'happy' | 'concerned' | 'error';

interface HeliosAvatarProps {
  state?: AvatarState;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const HeliosAvatar: React.FC<HeliosAvatarProps> = ({
  state = 'idle',
  size = 'medium',
  className = ''
}) => {
  const [blinkState, setBlinkState] = useState(false);
  const [floatOffset, setFloatOffset] = useState(0);

  // Blink animation - random intervals
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      if (Math.random() > 0.7 && state !== 'thinking') {
        setBlinkState(true);
        setTimeout(() => setBlinkState(false), 150);
      }
    }, 2000);

    return () => clearInterval(blinkInterval);
  }, [state]);

  // Subtle float animation
  useEffect(() => {
    let frame: number;
    let start: number | null = null;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const offset = Math.sin(elapsed / 1000) * 3;
      setFloatOffset(offset);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const sizeMap = {
    small: 40,
    medium: 64,
    large: 96
  };

  const svgSize = sizeMap[size];
  const eyeY = blinkState ? 45 : 42;
  const eyeHeight = blinkState ? 2 : 8;

  // Expression-based modifications
  const getEyeProps = () => {
    switch (state) {
      case 'thinking':
        return { leftX: 38, rightX: 58, y: 40, height: 6, rx: 3 };
      case 'searching':
        return { leftX: 36, rightX: 56, y: 42, height: 8, rx: 4 };
      case 'happy':
        return { leftX: 38, rightX: 58, y: 44, height: 6, rx: 3 };
      case 'concerned':
        return { leftX: 38, rightX: 58, y: 40, height: 10, rx: 5 };
      case 'error':
        return { leftX: 38, rightX: 58, y: 42, height: 8, rx: 4 };
      default:
        return { leftX: 38, rightX: 58, y: eyeY, height: eyeHeight, rx: 4 };
    }
  };

  const getMouthPath = () => {
    switch (state) {
      case 'thinking':
        return 'M 42 62 Q 48 62 54 62'; // Straight line
      case 'searching':
        return 'M 42 60 Q 48 58 54 60'; // Slight focus
      case 'speaking':
        return 'M 40 60 Q 48 68 56 60'; // Open mouth
      case 'happy':
        return 'M 40 58 Q 48 68 56 58'; // Big smile
      case 'concerned':
        return 'M 42 64 Q 48 60 54 64'; // Slight frown
      case 'error':
        return 'M 40 66 Q 48 58 56 66'; // Frown
      default:
        return 'M 42 60 Q 48 66 54 60'; // Gentle smile
    }
  };

  const getEyebrowProps = () => {
    switch (state) {
      case 'thinking':
        return { leftD: 'M 32 34 Q 38 30 44 34', rightD: 'M 52 34 Q 58 30 64 34' };
      case 'concerned':
        return { leftD: 'M 32 32 Q 38 36 44 32', rightD: 'M 52 32 Q 58 36 64 32' };
      case 'error':
        return { leftD: 'M 32 30 Q 38 36 44 30', rightD: 'M 52 30 Q 58 36 64 30' };
      case 'happy':
        return { leftD: 'M 32 36 Q 38 32 44 36', rightD: 'M 52 36 Q 58 32 64 36' };
      default:
        return { leftD: 'M 32 34 Q 38 32 44 34', rightD: 'M 52 34 Q 58 32 64 34' };
    }
  };

  const eyeProps = getEyeProps();
  const mouthPath = getMouthPath();
  const eyebrowProps = getEyebrowProps();

  // Glow color based on state
  const getGlowColor = () => {
    switch (state) {
      case 'thinking':
        return '#a78bfa';
      case 'searching':
        return '#60a5fa';
      case 'speaking':
        return '#8b5cf6';
      case 'happy':
        return '#34d399';
      case 'concerned':
        return '#fbbf24';
      case 'error':
        return '#f87171';
      default:
        return '#8b5cf6';
    }
  };

  return (
    <div
      className={`helios-avatar helios-avatar--${size} helios-avatar--${state} ${className}`}
      style={{ transform: `translateY(${floatOffset}px)` }}
    >
      <svg
        viewBox="0 0 96 96"
        width={svgSize}
        height={svgSize}
        className="helios-avatar__svg"
      >
        <defs>
          {/* Gradient for the head */}
          <linearGradient id="headGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>

          {/* Inner glow */}
          <radialGradient id="innerGlow" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#e9d5ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>

          {/* Outer glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Thinking pulse filter */}
          <filter id="pulseGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer glow ring for states */}
        <circle
          cx="48"
          cy="48"
          r="44"
          fill="none"
          stroke={getGlowColor()}
          strokeWidth="2"
          opacity="0.3"
          className={`helios-avatar__glow-ring helios-avatar__glow-ring--${state}`}
        />

        {/* Main head shape */}
        <ellipse
          cx="48"
          cy="48"
          rx="36"
          ry="40"
          fill="url(#headGradient)"
          filter="url(#glow)"
          className="helios-avatar__head"
        />

        {/* Inner highlight */}
        <ellipse
          cx="48"
          cy="40"
          rx="28"
          ry="28"
          fill="url(#innerGlow)"
        />

        {/* Eyebrows */}
        <path
          d={eyebrowProps.leftD}
          stroke="#6d28d9"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          className="helios-avatar__eyebrow"
        />
        <path
          d={eyebrowProps.rightD}
          stroke="#6d28d9"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          className="helios-avatar__eyebrow"
        />

        {/* Eyes */}
        <rect
          x={eyeProps.leftX}
          y={eyeProps.y}
          width="8"
          height={eyeProps.height}
          rx={eyeProps.rx}
          fill="#4c1d95"
          className="helios-avatar__eye helios-avatar__eye--left"
        />
        <rect
          x={eyeProps.rightX}
          y={eyeProps.y}
          width="8"
          height={eyeProps.height}
          rx={eyeProps.rx}
          fill="#4c1d95"
          className="helios-avatar__eye helios-avatar__eye--right"
        />

        {/* Eye shine */}
        {!blinkState && state !== 'error' && (
          <>
            <circle cx="40" cy={eyeProps.y + 2} r="2" fill="white" opacity="0.8" />
            <circle cx="60" cy={eyeProps.y + 2} r="2" fill="white" opacity="0.8" />
          </>
        )}

        {/* Mouth */}
        <path
          d={mouthPath}
          stroke="#4c1d95"
          strokeWidth="3"
          strokeLinecap="round"
          fill={state === 'speaking' ? '#7c3aed' : 'none'}
          className={`helios-avatar__mouth helios-avatar__mouth--${state}`}
        />

        {/* Cheeks for happy state */}
        {state === 'happy' && (
          <>
            <circle cx="28" cy="52" r="6" fill="#f9a8d4" opacity="0.4" />
            <circle cx="68" cy="52" r="6" fill="#f9a8d4" opacity="0.4" />
          </>
        )}

        {/* Error X marks on eyes */}
        {state === 'error' && (
          <>
            <g className="helios-avatar__error-eyes">
              <line x1="36" y1="38" x2="44" y2="48" stroke="#4c1d95" strokeWidth="2" strokeLinecap="round" />
              <line x1="44" y1="38" x2="36" y2="48" stroke="#4c1d95" strokeWidth="2" strokeLinecap="round" />
              <line x1="52" y1="38" x2="60" y2="48" stroke="#4c1d95" strokeWidth="2" strokeLinecap="round" />
              <line x1="60" y1="38" x2="52" y2="48" stroke="#4c1d95" strokeWidth="2" strokeLinecap="round" />
            </g>
          </>
        )}

        {/* Thinking dots */}
        {state === 'thinking' && (
          <g className="helios-avatar__thinking-dots">
            <circle cx="74" cy="20" r="4" fill="#a78bfa" opacity="0.6" />
            <circle cx="82" cy="12" r="3" fill="#a78bfa" opacity="0.4" />
            <circle cx="88" cy="6" r="2" fill="#a78bfa" opacity="0.3" />
          </g>
        )}

        {/* Searching magnifier accent */}
        {state === 'searching' && (
          <g className="helios-avatar__search-accent" transform="translate(68, 14)">
            <circle cx="8" cy="8" r="6" fill="none" stroke="#60a5fa" strokeWidth="2" />
            <line x1="12" y1="12" x2="16" y2="16" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}
      </svg>

      {/* State indicator label */}
      {state !== 'idle' && (
        <span className={`helios-avatar__state-label helios-avatar__state-label--${state}`}>
          {state === 'thinking' && 'Thinking...'}
          {state === 'searching' && 'Searching...'}
          {state === 'speaking' && 'Speaking'}
          {state === 'happy' && 'Done!'}
          {state === 'concerned' && 'Hmm...'}
          {state === 'error' && 'Error'}
        </span>
      )}
    </div>
  );
};

export default HeliosAvatar;
