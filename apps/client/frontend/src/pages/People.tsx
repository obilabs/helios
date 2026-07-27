import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Grid,
  List,
  Filter,
  Loader2,
  Users,
  Sparkles,
  X,
  ChevronDown,
} from 'lucide-react';
import { peopleService, type PersonCard as PersonCardType, type FilterOptions } from '../services/people.service';
import { PersonCard } from '../components/PersonCard';
import { PersonSlideOut } from '../components/PersonSlideOut';
import './People.css';

interface PeopleProps {
  organizationId: string;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'department' | 'startDate';

export function People({ organizationId: _organizationId }: PeopleProps) {
  const [people, setPeople] = useState<PersonCardType[]>([]);
  const [newJoiners, setNewJoiners] = useState<PersonCardType[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Pagination
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Selected person for slideout
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Load filter options
  useEffect(() => {
    async function loadFilters() {
      const filters = await peopleService.getFilterOptions();
      if (filters) {
        setFilterOptions(filters);
      }
    }
    loadFilters();
  }, []);

  // Load new joiners
  useEffect(() => {
    async function loadNewJoiners() {
      const joiners = await peopleService.getNewJoiners(6);
      setNewJoiners(joiners);
    }
    loadNewJoiners();
  }, []);

  // Load people
  const loadPeople = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const result = await peopleService.listPeople({
      search: searchQuery || undefined,
      department: selectedDepartment || undefined,
      location: selectedLocation || undefined,
      sortBy,
      limit: 20,
      offset: reset ? 0 : pagination.offset + pagination.limit,
    });

    if (result) {
      if (reset) {
        setPeople(result.people);
      } else {
        setPeople((prev) => [...prev, ...result.people]);
      }
      setPagination(result.pagination);
    }

    setLoading(false);
    setLoadingMore(false);
  }, [searchQuery, selectedDepartment, selectedLocation, sortBy, pagination.offset, pagination.limit]);

  // Load on filter/sort change
  useEffect(() => {
    loadPeople(true);
  }, [searchQuery, selectedDepartment, selectedLocation, sortBy]);

  // Handle search with debounce
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const clearFilters = () => {
    setSelectedDepartment('');
    setSelectedLocation('');
    setSearchInput('');
    setSearchQuery('');
  };

  const hasActiveFilters = selectedDepartment || selectedLocation || searchQuery;

  return (
    <div className="people-container">
      {/* Header */}
      <div className="people-header">
        <div className="header-content">
          <h1>
            <Users className="header-icon" size={28} />
            People Directory
          </h1>
          <p>Find and connect with your colleagues</p>
        </div>
      </div>

      {/* New Joiners Section */}
      {newJoiners.length > 0 && !hasActiveFilters && (
        <div className="new-joiners-section">
          <div className="section-header">
            <h2>
              <Sparkles size={18} />
              New Joiners
            </h2>
            <span className="section-subtitle">Recently joined the team</span>
          </div>
          <div className="new-joiners-grid">
            {newJoiners.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                onClick={setSelectedPersonId}
                viewMode="grid"
              />
            ))}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="people-controls">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name, title, or skills..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button className="clear-search" onClick={() => setSearchInput('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-controls">
          <button
            className={`filter-toggle ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            Filters
            {hasActiveFilters && <span className="filter-badge" />}
          </button>

          <div className="view-toggle">
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <Grid size={16} />
            </button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-group">
            <label>Department</label>
            <div className="select-wrapper">
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
              >
                <option value="">All Departments</option>
                {filterOptions?.departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="select-icon" />
            </div>
          </div>

          <div className="filter-group">
            <label>Location</label>
            <div className="select-wrapper">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="">All Locations</option>
                {filterOptions?.locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="select-icon" />
            </div>
          </div>

          <div className="filter-group">
            <label>Sort By</label>
            <div className="select-wrapper">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                <option value="name">Name (A-Z)</option>
                <option value="department">Department</option>
                <option value="startDate">Start Date</option>
              </select>
              <ChevronDown size={14} className="select-icon" />
            </div>
          </div>

          {hasActiveFilters && (
            <button className="clear-filters" onClick={clearFilters}>
              <X size={14} />
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Results */}
      <div className="people-results">
        {loading ? (
          <div className="loading-state">
            <Loader2 size={32} className="spinner" />
            <p>Loading people...</p>
          </div>
        ) : people.length === 0 ? (
          <div className="empty-state">
            <Users size={48} />
            <h3>No people found</h3>
            <p>
              {hasActiveFilters
                ? 'Try adjusting your filters or search query'
                : 'No users in the directory yet'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="btn-secondary">
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="results-header">
              <span className="results-count">
                {pagination.total} {pagination.total === 1 ? 'person' : 'people'}
              </span>
            </div>

            {viewMode === 'grid' ? (
              <div className="people-grid">
                {people.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    onClick={setSelectedPersonId}
                    viewMode="grid"
                  />
                ))}
              </div>
            ) : (
              <div className="people-list">
                <div className="list-header">
                  <span>Name</span>
                  <span>Department</span>
                  <span>Location</span>
                  <span>Info</span>
                </div>
                {people.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    onClick={setSelectedPersonId}
                    viewMode="list"
                  />
                ))}
              </div>
            )}

            {pagination.hasMore && (
              <div className="load-more">
                <button
                  onClick={() => loadPeople(false)}
                  disabled={loadingMore}
                  className="btn-secondary"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 size={14} className="spinner" />
                      Loading...
                    </>
                  ) : (
                    `Load More (${pagination.total - people.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Person SlideOut */}
      {selectedPersonId && (
        <PersonSlideOut
          personId={selectedPersonId}
          onClose={() => setSelectedPersonId(null)}
          onSearchSkill={(skill, _type) => {
            // Close the slideout
            setSelectedPersonId(null);
            // Set search input to the skill/interest
            setSearchInput(skill);
          }}
        />
      )}
    </div>
  );
}
