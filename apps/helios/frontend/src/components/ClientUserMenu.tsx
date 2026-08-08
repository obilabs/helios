import { useState, useRef, useEffect } from 'react';
import { Terminal, Key, Users, Lock, Settings as SettingsIcon, LogOut, Book, ChevronDown, User } from 'lucide-react';
import { useView } from '../contexts/ViewContext';
import { ConfirmDialog } from './ui/ConfirmDialog';
import './ClientUserMenu.css';

interface ClientUserMenuProps {
  userName: string;
  userEmail: string;
  userRole: string;
  onLogout: () => void;
  onChangePassword?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToUserSettings?: () => void;
  onNavigateToAdministrators?: () => void;
  onNavigateToConsole?: () => void;
  onNavigateToMyProfile?: () => void;
}

export function ClientUserMenu({ userName, userEmail, userRole, onLogout, onChangePassword, onNavigateToSettings, onNavigateToUserSettings, onNavigateToAdministrators, onNavigateToConsole, onNavigateToMyProfile }: ClientUserMenuProps) {
  const { currentView } = useView();
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  const getInitials = () => {
    const parts = userName.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return userName.substring(0, 2).toUpperCase();
  };

  return (
    <div className="client-user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
      >
        <div className="user-avatar">{getInitials()}</div>
        <ChevronDown size={14} className="menu-arrow" />
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <div className="user-avatar-large">{getInitials()}</div>
            <div className="user-info">
              <div className="user-name">{userName}</div>
              <div className="user-email">{userEmail}</div>
              <div className="user-role">{userRole}</div>
            </div>
          </div>

          <div className="menu-divider"></div>

          <div className="menu-items">
            <button className="menu-item" onClick={() => {
              setIsOpen(false);
              if (onNavigateToMyProfile) {
                onNavigateToMyProfile();
              }
            }}>
              <User size={14} className="menu-icon-svg" />
              <span>My Profile</span>
            </button>
            <button className="menu-item" onClick={() => {
              setIsOpen(false);
              if (onChangePassword) {
                onChangePassword();
              } else if (onNavigateToSettings) {
                onNavigateToSettings();
              }
            }}>
              <Key size={14} className="menu-icon-svg" />
              <span>Change Password</span>
            </button>
            {/* Admin-only menu items - hidden in user view */}
            {currentView === 'admin' && (
              <>
                <button className="menu-item" onClick={() => {
                  setIsOpen(false);
                  if (onNavigateToAdministrators) {
                    onNavigateToAdministrators();
                  }
                }}>
                  <Users size={14} className="menu-icon-svg" />
                  <span>Administrators</span>
                </button>
                <button className="menu-item" onClick={() => alert('API Keys coming soon!')}>
                  <Lock size={14} className="menu-icon-svg" />
                  <span>My API Keys</span>
                </button>
                <button className="menu-item" onClick={() => {
                  setIsOpen(false);
                  window.open('/api/v1/docs', '_blank');
                }}>
                  <Book size={14} className="menu-icon-svg" />
                  <span>API Documentation</span>
                </button>
                <button className="menu-item" onClick={() => {
                  setIsOpen(false);
                  if (onNavigateToConsole) {
                    onNavigateToConsole();
                  }
                }}>
                  <Terminal size={14} className="menu-icon-svg" />
                  <span>Developer Console</span>
                </button>
              </>
            )}
            <button className="menu-item" onClick={() => {
              setIsOpen(false);
              // Navigate based on current view context
              if (currentView === 'user' && onNavigateToUserSettings) {
                onNavigateToUserSettings();
              } else if (onNavigateToSettings) {
                onNavigateToSettings();
              } else {
                alert('Settings coming soon!');
              }
            }}>
              <SettingsIcon size={14} className="menu-icon-svg" />
              <span>Settings</span>
            </button>
          </div>

          <div className="menu-divider"></div>

          <div className="menu-items">
            <button className="menu-item danger" onClick={handleLogout}>
              <LogOut size={14} className="menu-icon-svg" />
              <span>Sign Out</span>
            </button>
          </div>

          <div className="menu-footer">
            <div className="footer-text">
              Secure administrative access
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        variant="info"
        confirmText="Sign Out"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}