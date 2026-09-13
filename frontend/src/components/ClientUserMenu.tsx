import { useState, useRef, useEffect } from 'react';
import { Key, LogOut, ChevronDown, User } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog';
import './ClientUserMenu.css';

interface ClientUserMenuProps {
  userName: string;
  userEmail: string;
  userRole: string;
  onLogout: () => void;
  onChangePassword?: () => void;
  onNavigateToMyProfile?: () => void;
}

/**
 * The user menu is about the signed-in person only: profile, password, sign out.
 * Organization settings, administrators, API keys, API documentation and the
 * Developer Console each have one home, in Settings (Roles and Advanced), so
 * they are deliberately not duplicated here.
 */
export function ClientUserMenu({ userName, userEmail, userRole, onLogout, onChangePassword, onNavigateToMyProfile }: ClientUserMenuProps) {
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
            {onChangePassword && (
              <button className="menu-item" onClick={() => {
                setIsOpen(false);
                onChangePassword();
              }}>
                <Key size={14} className="menu-icon-svg" />
                <span>Change Password</span>
              </button>
            )}
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