import React from 'react';
import './ui.css';

export interface ToggleProps {
  /** Whether the toggle is on */
  checked: boolean;
  /** Callback when toggle state changes */
  onChange: (checked: boolean) => void;
  /** Optional label text */
  label?: string;
  /** Optional description below the label */
  description?: string;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'small' | 'medium';
  /** Optional className for the container */
  className?: string;
  /** ID for accessibility */
  id?: string;
}

/**
 * Standardized Toggle switch component for consistent UI across settings pages.
 * Replaces inconsistent checkbox/switch implementations.
 *
 * @example
 * // Basic usage
 * <Toggle checked={enabled} onChange={setEnabled} />
 *
 * @example
 * // With label and description
 * <Toggle
 *   checked={darkMode}
 *   onChange={setDarkMode}
 *   label="Dark Mode"
 *   description="Enable dark theme across the application"
 * />
 */
export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'medium',
  className = '',
  id,
}) => {
  const toggleId = id || `toggle-${Math.random().toString(36).substr(2, 9)}`;

  const handleChange = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <div className={`helios-toggle-container ${className} ${disabled ? 'disabled' : ''}`}>
      {(label || description) && (
        <div className="helios-toggle-text">
          {label && (
            <label htmlFor={toggleId} className="helios-toggle-label">
              {label}
            </label>
          )}
          {description && (
            <span className="helios-toggle-description">{description}</span>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        id={toggleId}
        aria-checked={checked}
        aria-disabled={disabled}
        className={`helios-toggle helios-toggle-${size} ${checked ? 'checked' : ''}`}
        onClick={handleChange}
        disabled={disabled}
      >
        <span className="helios-toggle-track">
          <span className="helios-toggle-thumb" />
        </span>
      </button>
    </div>
  );
};

export default Toggle;
