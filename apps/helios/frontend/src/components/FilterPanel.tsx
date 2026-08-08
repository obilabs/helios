import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Building2, Shield, Cloud, Check } from 'lucide-react';
import './FilterPanel.css';

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onFiltersChange: (filters: FilterOptions) => void;
  currentFilters: FilterOptions;
  departments: string[];
  roles: string[];
}

export interface FilterOptions {
  dateCreated?: 'recently' | 'today' | 'week' | 'month' | 'custom';
  dateCreatedStart?: string;
  dateCreatedEnd?: string;
  lastLogin?: 'never' | 'today' | 'week' | 'month' | 'inactive';
  department?: string;
  role?: string;
  integrationStatus?: 'synced' | 'local' | 'all';
}

export function FilterPanel({
  isOpen,
  onClose,
  onFiltersChange,
  currentFilters,
  departments,
  roles: _roles  // Available for future custom role support
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [localFilters, setLocalFilters] = useState<FilterOptions>(currentFilters);

  useEffect(() => {
    setLocalFilters(currentFilters);
  }, [currentFilters]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleFilterChange = (key: keyof FilterOptions, value: string | undefined) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters: FilterOptions = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  const activeFilterCount = Object.values(localFilters).filter(v => v !== undefined && v !== '').length;

  if (!isOpen) return null;

  return (
    <div className="filter-panel" ref={panelRef}>
      <div className="filter-panel-header">
        <h3>Filters</h3>
        <div className="filter-panel-actions">
          {activeFilterCount > 0 && (
            <button className="btn-clear-filters" onClick={clearFilters}>
              Clear all
            </button>
          )}
          <button className="btn-close-panel" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="filter-panel-content">
        {/* Date Created Filters */}
        <div className="filter-section">
          <h4>
            <Calendar size={14} />
            Date Created
          </h4>
          <div className="filter-options">
            <label className={`filter-option ${localFilters.dateCreated === 'recently' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="dateCreated"
                checked={localFilters.dateCreated === 'recently'}
                onChange={() => handleFilterChange('dateCreated', 'recently')}
              />
              <span>Recently Created (7 days)</span>
              {localFilters.dateCreated === 'recently' && <Check size={14} className="check-icon" />}
            </label>
            <label className={`filter-option ${localFilters.dateCreated === 'today' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="dateCreated"
                checked={localFilters.dateCreated === 'today'}
                onChange={() => handleFilterChange('dateCreated', 'today')}
              />
              <span>Today</span>
              {localFilters.dateCreated === 'today' && <Check size={14} className="check-icon" />}
            </label>
            <label className={`filter-option ${localFilters.dateCreated === 'week' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="dateCreated"
                checked={localFilters.dateCreated === 'week'}
                onChange={() => handleFilterChange('dateCreated', 'week')}
              />
              <span>This Week</span>
              {localFilters.dateCreated === 'week' && <Check size={14} className="check-icon" />}
            </label>
            <label className={`filter-option ${localFilters.dateCreated === 'month' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="dateCreated"
                checked={localFilters.dateCreated === 'month'}
                onChange={() => handleFilterChange('dateCreated', 'month')}
              />
              <span>This Month</span>
              {localFilters.dateCreated === 'month' && <Check size={14} className="check-icon" />}
            </label>
            {localFilters.dateCreated && (
              <button
                className="btn-clear-section"
                onClick={() => handleFilterChange('dateCreated', undefined)}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Last Login Filters */}
        <div className="filter-section">
          <h4>
            <Calendar size={14} />
            Last Login
          </h4>
          <div className="filter-options">
            <label className={`filter-option ${localFilters.lastLogin === 'never' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="lastLogin"
                checked={localFilters.lastLogin === 'never'}
                onChange={() => handleFilterChange('lastLogin', 'never')}
              />
              <span>Never Logged In</span>
              {localFilters.lastLogin === 'never' && <Check size={14} className="check-icon" />}
            </label>
            <label className={`filter-option ${localFilters.lastLogin === 'today' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="lastLogin"
                checked={localFilters.lastLogin === 'today'}
                onChange={() => handleFilterChange('lastLogin', 'today')}
              />
              <span>Today</span>
              {localFilters.lastLogin === 'today' && <Check size={14} className="check-icon" />}
            </label>
            <label className={`filter-option ${localFilters.lastLogin === 'week' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="lastLogin"
                checked={localFilters.lastLogin === 'week'}
                onChange={() => handleFilterChange('lastLogin', 'week')}
              />
              <span>This Week</span>
              {localFilters.lastLogin === 'week' && <Check size={14} className="check-icon" />}
            </label>
            <label className={`filter-option ${localFilters.lastLogin === 'inactive' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="lastLogin"
                checked={localFilters.lastLogin === 'inactive'}
                onChange={() => handleFilterChange('lastLogin', 'inactive')}
              />
              <span>Inactive (30+ days)</span>
              {localFilters.lastLogin === 'inactive' && <Check size={14} className="check-icon" />}
            </label>
            {localFilters.lastLogin && (
              <button
                className="btn-clear-section"
                onClick={() => handleFilterChange('lastLogin', undefined)}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Department Filter */}
        {departments.length > 0 && (
          <div className="filter-section">
            <h4>
              <Building2 size={14} />
              Department
            </h4>
            <div className="filter-options">
              <select
                value={localFilters.department || ''}
                onChange={(e) => handleFilterChange('department', e.target.value || undefined)}
                className="filter-select"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Role Filter */}
        <div className="filter-section">
          <h4>
            <Shield size={14} />
            Role
          </h4>
          <div className="filter-options">
            <select
              value={localFilters.role || ''}
              onChange={(e) => handleFilterChange('role', e.target.value || undefined)}
              className="filter-select"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="user">User</option>
            </select>
          </div>
        </div>

        {/* Integration Status Filter */}
        <div className="filter-section">
          <h4>
            <Cloud size={14} />
            Integration Status
          </h4>
          <div className="filter-options">
            <label className={`filter-option ${localFilters.integrationStatus === 'synced' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="integrationStatus"
                checked={localFilters.integrationStatus === 'synced'}
                onChange={() => handleFilterChange('integrationStatus', 'synced')}
              />
              <span>Synced (Google/Microsoft)</span>
              {localFilters.integrationStatus === 'synced' && <Check size={14} className="check-icon" />}
            </label>
            <label className={`filter-option ${localFilters.integrationStatus === 'local' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="integrationStatus"
                checked={localFilters.integrationStatus === 'local'}
                onChange={() => handleFilterChange('integrationStatus', 'local')}
              />
              <span>Local Only</span>
              {localFilters.integrationStatus === 'local' && <Check size={14} className="check-icon" />}
            </label>
            {localFilters.integrationStatus && (
              <button
                className="btn-clear-section"
                onClick={() => handleFilterChange('integrationStatus', undefined)}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
