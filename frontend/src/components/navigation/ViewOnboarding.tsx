import React, { useState, useEffect } from 'react';
import { Shield, User, ArrowRight, X } from 'lucide-react';
import { useView, type ViewMode } from '../../contexts/ViewContext';
import './ViewOnboarding.css';

interface ViewOnboardingProps {
  onComplete: () => void;
}

const ONBOARDING_STORAGE_KEY = 'helios_view_onboarding_completed';

/**
 * ViewOnboarding Component
 *
 * Shows a modal to internal admins explaining the dual-view system
 * on their first login. Allows them to choose a default view.
 *
 * - Only shown to internal admins (isAdmin && isEmployee)
 * - Only shown once (remembered in localStorage)
 * - Can choose Admin Console or Employee View as default
 */
export const ViewOnboarding: React.FC<ViewOnboardingProps> = ({ onComplete }) => {
  const { canSwitchViews, setCurrentView } = useView();
  const [selectedView, setSelectedView] = useState<ViewMode>('admin');

  // Check if onboarding should be shown
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!canSwitchViews) {
      setShouldShow(false);
      return;
    }

    const completed = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    setShouldShow(!completed);
  }, [canSwitchViews]);

  if (!shouldShow) {
    return null;
  }

  const handleComplete = () => {
    // Save the selected view preference
    setCurrentView(selectedView);
    // Mark onboarding as completed
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setShouldShow(false);
    onComplete();
  };

  const handleDismiss = () => {
    // Mark onboarding as completed without changing view
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setShouldShow(false);
    onComplete();
  };

  return (
    <div className="view-onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="view-onboarding-modal">
        <button
          className="view-onboarding-close"
          onClick={handleDismiss}
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="view-onboarding-header">
          <h2 id="onboarding-title" className="view-onboarding-title">
            Welcome to Helios
          </h2>
          <p className="view-onboarding-subtitle">
            As an admin, you have access to two different views
          </p>
        </div>

        <div className="view-onboarding-content">
          <div className="view-option-cards">
            <button
              className={`view-option-card ${selectedView === 'admin' ? 'selected' : ''}`}
              onClick={() => setSelectedView('admin')}
              aria-pressed={selectedView === 'admin'}
            >
              <div className="view-option-card-icon admin">
                <Shield size={24} />
              </div>
              <div className="view-option-card-content">
                <h3 className="view-option-card-title">Admin Console</h3>
                <p className="view-option-card-description">
                  Manage users, groups, settings, and security policies for your organization.
                </p>
              </div>
              {selectedView === 'admin' && (
                <div className="view-option-card-check">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </button>

            <button
              className={`view-option-card ${selectedView === 'user' ? 'selected' : ''}`}
              onClick={() => setSelectedView('user')}
              aria-pressed={selectedView === 'user'}
            >
              <div className="view-option-card-icon user">
                <User size={24} />
              </div>
              <div className="view-option-card-content">
                <h3 className="view-option-card-title">Employee View</h3>
                <p className="view-option-card-description">
                  Browse the people directory, view your team, and manage your profile.
                </p>
              </div>
              {selectedView === 'user' && (
                <div className="view-option-card-check">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </button>
          </div>

          <p className="view-onboarding-hint">
            You can switch between views anytime using the view switcher in the header.
          </p>
        </div>

        <div className="view-onboarding-footer">
          <button
            className="view-onboarding-button primary"
            onClick={handleComplete}
          >
            Continue to {selectedView === 'admin' ? 'Admin Console' : 'Employee View'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook to check if onboarding should be shown
 */
export const useViewOnboarding = () => {
  const { canSwitchViews } = useView();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!canSwitchViews) {
      setShowOnboarding(false);
      return;
    }

    const completed = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    setShowOnboarding(!completed);
  }, [canSwitchViews]);

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setShowOnboarding(false);
  };

  return { showOnboarding, completeOnboarding };
};

export default ViewOnboarding;
