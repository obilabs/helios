import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, AlertCircle, Clock, CheckCircle, Users, TrendingUp } from 'lucide-react';
import { helpdeskService, type Ticket, type TicketStats } from '../services/helpdesk.service';
import TicketList from '../components/helpdesk/TicketList';
import TicketViewer from '../components/helpdesk/TicketViewer';
import './Helpdesk.css';

const Helpdesk: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'all' | 'my' | 'unassigned'>('all');

  // Load tickets and stats
  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter, viewMode]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build filters
      const filters: any = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (priorityFilter !== 'all') filters.priority = priorityFilter;
      if (viewMode === 'my') {
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        filters.assigned_to = userData.id;
      } else if (viewMode === 'unassigned') {
        filters.assigned_to = 'null';
      }

      const [ticketsData, statsData] = await Promise.all([
        helpdeskService.getTickets(filters),
        helpdeskService.getStats(),
      ]);

      setTickets(ticketsData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load helpdesk data');
    } finally {
      setLoading(false);
    }
  };

  const handleTicketSelect = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
  };

  const handleTicketUpdate = async () => {
    // Reload tickets after update
    await loadData();
  };

  const handleCloseViewer = () => {
    setSelectedTicket(null);
  };

  // Filter tickets based on search query
  const filteredTickets = tickets.filter(ticket => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.subject?.toLowerCase().includes(query) ||
      ticket.sender_email?.toLowerCase().includes(query) ||
      ticket.sender_name?.toLowerCase().includes(query) ||
      ticket.group_email?.toLowerCase().includes(query)
    );
  });


  if (loading) {
    return (
      <div className="helpdesk-container">
        <div className="loading-spinner">Loading helpdesk...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="helpdesk-container">
        <div className="error-message">
          <AlertCircle className="icon" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="helpdesk-container">
      <div className="helpdesk-header">
        <h1>Helpdesk</h1>
        <div className="header-actions">
          <button className="btn btn-primary">
            <Plus className="icon" />
            New Ticket
          </button>
        </div>
      </div>

      {stats && (
        <div className="helpdesk-stats">
          <div className="stat-card">
            <div className="stat-icon">
              <AlertCircle />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.newTickets}</div>
              <div className="stat-label">New</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <Clock />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.inProgress}</div>
              <div className="stat-label">In Progress</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <CheckCircle />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.resolved}</div>
              <div className="stat-label">Resolved</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <Users />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.myTickets}</div>
              <div className="stat-label">My Tickets</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <TrendingUp />
            </div>
            <div className="stat-content">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total</div>
            </div>
          </div>
        </div>
      )}

      <div className="helpdesk-content">
        <div className="tickets-panel">
          <div className="panel-header">
            <div className="view-tabs">
              <button
                className={`tab ${viewMode === 'all' ? 'active' : ''}`}
                onClick={() => setViewMode('all')}
              >
                All Tickets
              </button>
              <button
                className={`tab ${viewMode === 'my' ? 'active' : ''}`}
                onClick={() => setViewMode('my')}
              >
                My Tickets
              </button>
              <button
                className={`tab ${viewMode === 'unassigned' ? 'active' : ''}`}
                onClick={() => setViewMode('unassigned')}
              >
                Unassigned
              </button>
            </div>
          </div>

          <div className="panel-filters">
            <div className="search-box">
              <Search className="icon" />
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <Filter className="icon" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="in_progress">In Progress</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="reopened">Reopened</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="all">All Priority</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <TicketList
            tickets={filteredTickets}
            selectedTicket={selectedTicket}
            onSelectTicket={handleTicketSelect}
          />
        </div>

        {selectedTicket && (
          <TicketViewer
            ticket={selectedTicket}
            onClose={handleCloseViewer}
            onUpdate={handleTicketUpdate}
          />
        )}
      </div>
    </div>
  );
};

export default Helpdesk;