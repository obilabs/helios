/**
 * SearchToolbar - Standardized toolbar component
 *
 * Provides consistent height and styling for:
 * - Search inputs
 * - Dropdown selects
 * - Action buttons
 *
 * All elements in the toolbar have uniform height (40px default)
 */

import React, { forwardRef } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import './SearchToolbar.css';

// ============================================
// Search Input
// ============================================
interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  showClear?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, onClear, showClear, placeholder = 'Search...', className = '', ...props }, ref) => {
    const hasValue = value && String(value).length > 0;

    return (
      <div className={`toolbar-search ${className}`}>
        <Search size={16} className="toolbar-search-icon" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="toolbar-search-input"
          {...props}
        />
        {showClear && hasValue && (
          <button
            type="button"
            className="toolbar-search-clear"
            onClick={onClear}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }
);
SearchInput.displayName = 'SearchInput';

// ============================================
// Dropdown Select
// ============================================
interface SelectOption {
  value: string;
  label: string;
}

interface ToolbarSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export const ToolbarSelect: React.FC<ToolbarSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
}) => {
  return (
    <div className={`toolbar-select ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="toolbar-select-input"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="toolbar-select-icon" />
    </div>
  );
};

// ============================================
// Toolbar Button
// ============================================
interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ children, variant = 'secondary', icon, iconPosition = 'left', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`toolbar-button toolbar-button-${variant} ${className}`}
        {...props}
      >
        {icon && iconPosition === 'left' && <span className="toolbar-button-icon">{icon}</span>}
        {children && <span className="toolbar-button-text">{children}</span>}
        {icon && iconPosition === 'right' && <span className="toolbar-button-icon">{icon}</span>}
      </button>
    );
  }
);
ToolbarButton.displayName = 'ToolbarButton';

// ============================================
// Icon Button (square)
// ============================================
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`toolbar-icon-button toolbar-button-${variant} ${className}`}
        {...props}
      >
        {icon}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';

// ============================================
// Toolbar Container
// ============================================
interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({ children, className = '' }) => {
  return (
    <div className={`toolbar ${className}`}>
      {children}
    </div>
  );
};

// ============================================
// Toolbar Group (for grouping items)
// ============================================
interface ToolbarGroupProps {
  children: React.ReactNode;
  className?: string;
}

export const ToolbarGroup: React.FC<ToolbarGroupProps> = ({ children, className = '' }) => {
  return (
    <div className={`toolbar-group ${className}`}>
      {children}
    </div>
  );
};

// ============================================
// Toolbar Spacer
// ============================================
export const ToolbarSpacer: React.FC = () => {
  return <div className="toolbar-spacer" />;
};
