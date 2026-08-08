/**
 * ToggleSwitch - Simple, reliable toggle switch component
 *
 * Based on standard HTML checkbox approach with CSS styling.
 * Uses theme colors for proper theming support.
 *
 * Define once, use everywhere.
 */

import React from 'react';
import './ToggleSwitch.css';

export interface ToggleSwitchProps {
  /** Whether the toggle is on */
  checked: boolean;
  /** Callback when toggle state changes */
  onChange: (checked: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Optional ID for accessibility */
  id?: string;
  /** Optional aria-label */
  ariaLabel?: string;
  /** Optional className */
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'medium',
  id,
  ariaLabel,
  className = '',
}) => {
  const toggleId = id || `toggle-${Math.random().toString(36).substr(2, 9)}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.checked);
    }
  };

  return (
    <label
      className={`toggle-switch toggle-switch-${size} ${disabled ? 'disabled' : ''} ${className}`}
      htmlFor={toggleId}
    >
      <input
        type="checkbox"
        id={toggleId}
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span className="toggle-slider"></span>
    </label>
  );
};

export default ToggleSwitch;
