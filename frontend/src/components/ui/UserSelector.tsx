import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { authFetch } from '../../config/api';
import './ui.css';

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  name?: string;
}

export interface UserSelectorProps {
  label?: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  organizationId: string;
  multiple?: boolean;
  exclude?: string[];
  placeholder?: string;
}

/**
 * UserSelector Component
 *
 * Dropdown selector for users with search and filtering.
 * Supports single and multiple selection.
 *
 * @example
 * ```tsx
 * // Single selection
 * <UserSelector
 *   label="Assign to User"
 *   value={selectedUserId}
 *   onChange={(id) => setSelectedUserId(id as string)}
 *   organizationId={orgId}
 *   placeholder="Search users..."
 * />
 *
 * // Multiple selection
 * <UserSelector
 *   label="Add Members"
 *   value={selectedUserIds}
 *   onChange={(ids) => setSelectedUserIds(ids as string[])}
 *   organizationId={orgId}
 *   multiple={true}
 *   exclude={[currentUserId]}
 * />
 * ```
 */
export const UserSelector: React.FC<UserSelectorProps> = ({
  label,
  value,
  onChange,
  organizationId,
  multiple = false,
  exclude = [],
  placeholder = 'Search users...'
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const response = await authFetch(`/api/users?organization_id=${organizationId}`);

        if (response.ok) {
          const data = await response.json();
          const allUsers = data.users || data || [];

          // Filter out excluded users
          const availableUsers = allUsers.filter((user: User) =>
            !exclude.includes(user.id)
          );

          setUsers(availableUsers);
          setFilteredUsers(availableUsers);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };

    if (organizationId) {
      fetchUsers();
    }
  }, [organizationId, exclude]);

  // Filter users based on search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = users.filter(user => {
      const fullName = getUserName(user).toLowerCase();
      const email = user.email.toLowerCase();
      return fullName.includes(term) || email.includes(term);
    });

    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getUserName = (user: User): string => {
    if (user.name) return user.name;
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    if (user.first_name) return user.first_name;
    return user.email.split('@')[0];
  };

  const getInitials = (user: User): string => {
    const name = getUserName(user);
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleSelectUser = (userId: string) => {
    if (multiple) {
      const currentValue = Array.isArray(value) ? value : [];
      const newValue = currentValue.includes(userId)
        ? currentValue.filter(id => id !== userId)
        : [...currentValue, userId];
      onChange(newValue);
    } else {
      onChange(userId);
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const handleRemoveUser = (userId: string) => {
    if (multiple && Array.isArray(value)) {
      onChange(value.filter(id => id !== userId));
    }
  };

  const isSelected = (userId: string): boolean => {
    if (multiple && Array.isArray(value)) {
      return value.includes(userId);
    }
    return value === userId;
  };

  const getSelectedUsers = (): User[] => {
    if (multiple && Array.isArray(value)) {
      return users.filter(user => value.includes(user.id));
    }
    if (value && typeof value === 'string') {
      const user = users.find(u => u.id === value);
      return user ? [user] : [];
    }
    return [];
  };

  return (
    <div className="helios-user-selector" ref={dropdownRef}>
      {label && (
        <label className="helios-user-selector-label">
          {label}
        </label>
      )}

      <div className="helios-user-selector-input">
        <Search size={16} className="helios-user-selector-icon" />
        <input
          type="text"
          className="helios-user-selector-field"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsOpen(true)}
        />
      </div>

      {isOpen && (
        <div className="helios-user-selector-dropdown">
          {loading ? (
            <div className="helios-user-selector-loading">
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="helios-user-selector-empty">
              No users found
            </div>
          ) : (
            filteredUsers.map(user => (
              <button
                key={user.id}
                className={`helios-user-selector-option ${isSelected(user.id) ? 'selected' : ''}`}
                onClick={() => handleSelectUser(user.id)}
              >
                <div className="helios-user-avatar">
                  {getInitials(user)}
                </div>
                <div className="helios-user-info">
                  <div className="helios-user-name">
                    {getUserName(user)}
                  </div>
                  <div className="helios-user-email">
                    {user.email}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {multiple && getSelectedUsers().length > 0 && (
        <div className="helios-user-selector-selected">
          {getSelectedUsers().map(user => (
            <div key={user.id} className="helios-user-chip">
              <div className="helios-user-avatar">
                {getInitials(user)}
              </div>
              <span>{getUserName(user)}</span>
              <button
                className="helios-user-chip-remove"
                onClick={() => handleRemoveUser(user.id)}
                aria-label={`Remove ${getUserName(user)}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
