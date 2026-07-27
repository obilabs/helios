import React from 'react';
import { Shield, User, ChevronDown } from 'lucide-react';
import { useView, type ViewMode } from '../../contexts/ViewContext';
import './ViewSwitcher.css';

interface ViewSwitcherProps {
  className?: string;
}

/**
 * View Switcher Component
 *
 * Allows internal admins (who are also employees) to switch
 * between Admin Console and Employee View.
 *
 * - External admins: Component not rendered
 * - Internal admins: Dropdown to switch views
 * - Regular employees: Component not rendered
 */
export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ className = '' }) => {
  const { currentView, setCurrentView, canSwitchViews } = useView();
  const [isOpen, setIsOpen] = React.useState(false);

  // Only show for users who can switch views
  if (!canSwitchViews) {
    return null;
  }

  const options: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    {
      value: 'admin',
      label: 'Admin Console',
      icon: <Shield size={16} />,
    },
    {
      value: 'user',
      label: 'Employee View',
      icon: <User size={16} />,
    },
  ];

  const currentOption = options.find(opt => opt.value === currentView) || options[0];

  const handleSelect = (value: ViewMode) => {
    setCurrentView(value);
    setIsOpen(false);
  };

  return (
    <div className={`view-switcher ${className}`}>
      <button
        className="view-switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        data-testid="view-switcher-trigger"
      >
        <span className="view-switcher-icon">{currentOption.icon}</span>
        <span className="view-switcher-label">{currentOption.label}</span>
        <ChevronDown size={14} className={`view-switcher-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="view-switcher-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <div className="view-switcher-dropdown" role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                className={`view-switcher-option ${option.value === currentView ? 'selected' : ''}`}
                onClick={() => handleSelect(option.value)}
                role="option"
                aria-selected={option.value === currentView}
                data-testid={`view-option-${option.value}`}
              >
                <span className="view-option-icon">{option.icon}</span>
                <span className="view-option-label">{option.label}</span>
                {option.value === currentView && (
                  <span className="view-option-check">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ViewSwitcher;
