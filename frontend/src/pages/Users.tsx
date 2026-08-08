import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, ChevronDown, Download, RefreshCw, CheckCircle, PauseCircle, Trash2, FileSpreadsheet, FileJson, Filter } from 'lucide-react';
import { UserTable } from '../components/UserTable';
import { QuickAddUserSlideOut } from '../components/QuickAddUserSlideOut';
import { FilterPanel } from '../components/FilterPanel';
import type { FilterOptions } from '../components/FilterPanel';
import { useTabPersistence } from '../hooks/useTabPersistence';
import { useEntityLabels } from '../contexts/LabelsContext';
import { ENTITIES } from '../config/entities';
import { authFetch } from '../config/api';
import './Users.css';

interface UsersProps {
  organizationId: string;
  onNavigate?: (page: string) => void;
}

type UserType = 'staff' | 'guests' | 'contacts';

type StatusFilter = 'all' | 'active' | 'pending' | 'suspended' | 'expired' | 'deleted';

type PlatformFilter = 'all' | 'local' | 'google_workspace' | 'microsoft_365';

export function Users({ organizationId, onNavigate }: UsersProps) {
  // Get dynamic labels from context (allows customization like "People" instead of "Users")
  const userLabels = useEntityLabels(ENTITIES.USER);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useTabPersistence<UserType>('helios_users_tab', 'staff');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  // Initialize search from URL parameter
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');

  // Clear URL search param when searchQuery changes
  useEffect(() => {
    if (searchParams.has('search') && !searchQuery) {
      searchParams.delete('search');
      setSearchParams(searchParams);
    }
  }, [searchQuery, searchParams, setSearchParams]);
  const [counts, setCounts] = useState({
    staff: 0,
    guests: 0,
    contacts: 0
  });
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    active: 0,
    pending: 0,
    suspended: 0,
    expired: 0,
    deleted: 0
  });
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showQuickAddSlideOut, setShowQuickAddSlideOut] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterOptions>({});
  const [departments, setDepartments] = useState<string[]>([]);
  const addDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const actionsDropdownRef = useRef<HTMLDivElement>(null);
  const platformDropdownRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (addDropdownRef.current && !addDropdownRef.current.contains(event.target as Node)) {
        setShowAddDropdown(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(event.target as Node)) {
        setShowActionsDropdown(false);
      }
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(event.target as Node)) {
        setShowPlatformDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch user counts for each type
  useEffect(() => {
    fetchCounts();
  }, [organizationId]);

  const fetchCounts = async () => {
    try {
      // Fetch counts for each user type
      const [staffResponse, guestsResponse, contactsResponse] = await Promise.all([
        authFetch(`/api/v1/organization/users/count?userType=staff`),
        authFetch(`/api/v1/organization/users/count?userType=guest`),
        authFetch(`/api/v1/organization/users/count?userType=contact`)
      ]);

      // Helper to safely parse JSON response
      const safeParseJson = async (response: Response) => {
        if (!response.ok) {
          console.warn(`API returned ${response.status} for user count`);
          return { success: false, data: { count: 0 } };
        }
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('Response is not JSON');
          return { success: false, data: { count: 0 } };
        }
        return response.json();
      };

      const [staffData, guestsData, contactsData] = await Promise.all([
        safeParseJson(staffResponse),
        safeParseJson(guestsResponse),
        safeParseJson(contactsResponse)
      ]);

      setCounts({
        staff: staffData.success ? staffData.data.count : 0,
        guests: guestsData.success ? guestsData.data.count : 0,
        contacts: contactsData.success ? contactsData.data.count : 0
      });
    } catch (error) {
      console.error('Error fetching user counts:', error);
      // Set default counts on error
      setCounts({ staff: 0, guests: 0, contacts: 0 });
    }
  };

  const tabs = [
    {
      id: 'staff' as UserType,
      label: userLabels.plural,
      count: counts.staff
    },
    {
      id: 'guests' as UserType,
      label: 'Guests',
      count: counts.guests
    },
    {
      id: 'contacts' as UserType,
      label: 'Contacts',
      count: counts.contacts
    }
  ];

  const getTypeLabel = () => {
    if (activeTab === 'staff') return userLabels.plural;
    if (activeTab === 'guests') return 'Guests';
    return 'Contacts';
  };

  // Export users as CSV or JSON
  const handleExport = async (format: 'csv' | 'json') => {
    try {
      setIsExporting(true);
      setShowExportDropdown(false);

      const apiUserType = activeTab === 'guests' ? 'guest' : activeTab === 'contacts' ? 'contact' : 'staff';

      const response = await authFetch(
        `/api/v1/organization/users/export?userType=${apiUserType}&format=${format}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-${apiUserType}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export users. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle bulk actions
  const handleBulkAction = async (action: 'activate' | 'suspend' | 'delete' | 'sync') => {
    setShowActionsDropdown(false);

    if (action === 'sync') {
      // Refresh the user list
      fetchCounts();
      return;
    }

    // For bulk user actions, we'd need to get selected users from UserTable
    // For now, show a message that selection is required
    alert(`Please select users in the table to ${action} them.`);
  };

  const getStatusTabs = () => {
    if (activeTab === 'staff') {
      return [
        { id: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
        { id: 'active' as StatusFilter, label: 'Active', count: statusCounts.active },
        { id: 'pending' as StatusFilter, label: 'Staged', count: statusCounts.pending },
        { id: 'suspended' as StatusFilter, label: 'Suspended', count: statusCounts.suspended },
        { id: 'deleted' as StatusFilter, label: 'Deleted', count: statusCounts.deleted }
      ];
    } else if (activeTab === 'guests') {
      return [
        { id: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
        { id: 'active' as StatusFilter, label: 'Active', count: statusCounts.active },
        { id: 'expired' as StatusFilter, label: 'Expired', count: statusCounts.expired },
        { id: 'pending' as StatusFilter, label: 'Staged', count: statusCounts.pending }
      ];
    } else {
      return [
        { id: 'all' as StatusFilter, label: 'All', count: statusCounts.all }
      ];
    }
  };

  const platformOptions = [
    { id: 'all' as PlatformFilter, label: 'All Platforms' },
    { id: 'local' as PlatformFilter, label: 'Local Only' },
    { id: 'google_workspace' as PlatformFilter, label: 'Google Workspace' },
    { id: 'microsoft_365' as PlatformFilter, label: 'Microsoft 365' }
  ];

  const getPlatformLabel = () => {
    const option = platformOptions.find(opt => opt.id === platformFilter);
    return option?.label || 'All Platforms';
  };

  return (
    <div className="users-page">
      {/* Page Title */}
      <div className="page-title">
        <h1>{getTypeLabel()}</h1>
      </div>

      {/* Type Tabs - JumpCloud Style */}
      <div className="type-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`type-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab.id);
              setStatusFilter('all');
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status Tabs - JumpCloud Style */}
      <div className="status-tabs">
        {getStatusTabs().map(tab => (
          <button
            key={tab.id}
            className={`status-tab ${statusFilter === tab.id ? 'active' : ''}`}
            onClick={() => setStatusFilter(tab.id)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Actions Bar */}
      <div className="actions-bar">
        <div className="add-user-dropdown" ref={addDropdownRef}>
          <button
            className="btn-add-user-primary"
            onClick={() => setShowAddDropdown(!showAddDropdown)}
          >
            <UserPlus size={16} />
            Add {activeTab === 'staff' ? userLabels.singular : activeTab === 'guests' ? 'Guest' : 'Contact'}
            <ChevronDown size={14} className={`dropdown-chevron ${showAddDropdown ? 'open' : ''}`} />
          </button>
          {showAddDropdown && (
            <div className="add-dropdown-menu">
              <button
                className="dropdown-item"
                onClick={() => {
                  setShowAddDropdown(false);
                  setShowQuickAddSlideOut(true);
                }}
              >
                <UserPlus size={16} />
                Quick Add
                <span className="dropdown-item-desc">Create user in slideout panel</span>
              </button>
              <button
                className="dropdown-item highlight"
                onClick={() => {
                  setShowAddDropdown(false);
                  onNavigate?.('new-user-onboarding');
                }}
              >
                <UserPlus size={16} />
                Full Onboarding
                <span className="dropdown-item-desc">Use template with groups, access & welcome email</span>
              </button>
            </div>
          )}
        </div>

        <div className="actions-right">
          <div className="search-box">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Filter Panel Button */}
          <div className="dropdown-wrapper" ref={filterPanelRef}>
            <button
              className={`btn-icon ${showFilterPanel || Object.keys(advancedFilters).length > 0 ? 'active' : ''}`}
              onClick={() => {
                setShowFilterPanel(!showFilterPanel);
              }}
              title="Advanced Filters"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <FilterPanel
              isOpen={showFilterPanel}
              onClose={() => setShowFilterPanel(false)}
              onFiltersChange={setAdvancedFilters}
              currentFilters={advancedFilters}
              departments={departments}
              roles={['admin', 'manager', 'user']}
            />
          </div>

          {/* Platform Filter Dropdown */}
          <div className="dropdown-wrapper" ref={platformDropdownRef}>
            <button
              className={`btn-filter-pill ${platformFilter !== 'all' ? 'active' : ''}`}
              onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
            >
              <Filter size={12} />
              {getPlatformLabel()}
              <ChevronDown size={12} className={showPlatformDropdown ? 'rotate-180' : ''} />
            </button>
            {showPlatformDropdown && (
              <div className="filter-dropdown-menu">
                {platformOptions.map((option) => (
                  <button
                    key={option.id}
                    className={`filter-dropdown-item ${platformFilter === option.id ? 'selected' : ''}`}
                    onClick={() => {
                      setPlatformFilter(option.id);
                      setShowPlatformDropdown(false);
                    }}
                  >
                    {option.label}
                    {platformFilter === option.id && <CheckCircle size={14} className="check-icon" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="dropdown-wrapper" ref={exportDropdownRef}>
            <button
              className="btn-filter-pill"
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <RefreshCw size={12} className="spinning" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download size={12} />
                  Export
                  <ChevronDown size={12} className={showExportDropdown ? 'rotate-180' : ''} />
                </>
              )}
            </button>
            {showExportDropdown && (
              <div className="filter-dropdown-menu">
                <button className="filter-dropdown-item" onClick={() => handleExport('csv')}>
                  <FileSpreadsheet size={14} />
                  Export as CSV
                </button>
                <button className="filter-dropdown-item" onClick={() => handleExport('json')}>
                  <FileJson size={14} />
                  Export as JSON
                </button>
              </div>
            )}
          </div>

          {/* Actions Dropdown */}
          <div className="dropdown-wrapper" ref={actionsDropdownRef}>
            <button
              className="btn-filter-pill"
              onClick={() => setShowActionsDropdown(!showActionsDropdown)}
            >
              Actions
              <ChevronDown size={12} className={showActionsDropdown ? 'rotate-180' : ''} />
            </button>
            {showActionsDropdown && (
              <div className="filter-dropdown-menu">
                <button className="filter-dropdown-item" onClick={() => handleBulkAction('sync')}>
                  <RefreshCw size={14} />
                  Refresh List
                </button>
                <div className="filter-dropdown-divider"></div>
                <button className="filter-dropdown-item" onClick={() => handleBulkAction('activate')}>
                  <CheckCircle size={14} />
                  Activate Selected
                </button>
                <button className="filter-dropdown-item" onClick={() => handleBulkAction('suspend')}>
                  <PauseCircle size={14} />
                  Suspend Selected
                </button>
                <button className="filter-dropdown-item filter-dropdown-item-danger" onClick={() => handleBulkAction('delete')}>
                  <Trash2 size={14} />
                  Delete Selected
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Card */}
      <div className="users-content-card">

        {/* User Table - TanStack Table based */}
        <UserTable
          organizationId={organizationId}
          userType={activeTab}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          platformFilter={platformFilter}
          onStatusCountsChange={setStatusCounts}
          onDepartmentsChange={setDepartments}
          onNavigate={(page, params) => {
            if (params?.userId) {
              // Store the userId for the offboarding page
              sessionStorage.setItem('offboard_user_id', params.userId);
            }
            onNavigate?.(page);
          }}
        />
      </div>

      {/* Quick Add User Slideout */}
      {showQuickAddSlideOut && (
        <QuickAddUserSlideOut
          organizationId={organizationId}
          onClose={() => setShowQuickAddSlideOut(false)}
          onUserCreated={() => {
            fetchCounts();
            setShowQuickAddSlideOut(false);
          }}
        />
      )}
    </div>
  );
}
