/**
 * HR Dashboard
 *
 * Central dashboard for HR administrators showing lifecycle management
 * metrics, pending requests, active onboardings, and attention items.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  UserMinus,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  ChevronRight,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Filter,
  MoreHorizontal,
  Check,
  X,
} from 'lucide-react';
import { authFetch } from '../config/api';
import './HRDashboard.css';

interface DashboardMetrics {
  pendingRequests: number;
  activeOnboardings: number;
  overdueTasksCount: number;
  myTasksCount: number;
  completedThisMonth: number;
  avgOnboardingDays: number;
}

interface PendingRequest {
  id: string;
  type: 'onboarding' | 'offboarding' | 'transfer';
  user_name: string;
  user_email: string;
  requested_by: string;
  requested_at: string;
  start_date?: string;
  department?: string;
  template_name?: string;
  waiting_days: number;
}

interface ActiveOnboarding {
  id: string;
  user_name: string;
  user_email: string;
  start_date: string;
  template_name: string;
  department?: string;
  manager_name?: string;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  progress_percentage: number;
  status: 'on_track' | 'at_risk' | 'overdue';
}

interface AttentionItem {
  id: string;
  type: 'overdue_task' | 'stale_request' | 'blocked_onboarding';
  title: string;
  description: string;
  severity: 'warning' | 'critical';
  days_overdue?: number;
  link?: string;
  related_user?: string;
}

interface HRDashboardProps {
  onNavigate?: (page: string) => void;
}

const HRDashboard: React.FC<HRDashboardProps> = ({ onNavigate: _onNavigate }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    pendingRequests: 0,
    activeOnboardings: 0,
    overdueTasksCount: 0,
    myTasksCount: 0,
    completedThisMonth: 0,
    avgOnboardingDays: 0,
  });
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [activeOnboardings, setActiveOnboardings] = useState<ActiveOnboarding[]>([]);
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onboardingFilter, setOnboardingFilter] = useState<'all' | 'on_track' | 'at_risk' | 'overdue'>('all');

  const fetchDashboardData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);

      // Fetch all dashboard data in parallel
      const [metricsRes, requestsRes, onboardingsRes, attentionRes] = await Promise.all([
        authFetch('/api/v1/lifecycle/dashboard/metrics'),
        authFetch('/api/v1/lifecycle/requests?status=pending&limit=10'),
        authFetch('/api/v1/lifecycle/dashboard/active-onboardings'),
        authFetch('/api/v1/lifecycle/dashboard/attention'),
      ]);

      // Process metrics
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        if (data.success) {
          setMetrics(data.data);
        }
      }

      // Process pending requests
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        if (data.success) {
          setPendingRequests(data.data.requests || []);
        }
      }

      // Process active onboardings
      if (onboardingsRes.ok) {
        const data = await onboardingsRes.json();
        if (data.success) {
          setActiveOnboardings(data.data.onboardings || []);
        }
      }

      // Process attention items
      if (attentionRes.ok) {
        const data = await attentionRes.json();
        if (data.success) {
          setAttentionItems(data.data.items || []);
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    // Refresh every 5 minutes
    const interval = setInterval(() => fetchDashboardData(false), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleApprove = async (requestId: string) => {
    try {
      const response = await authFetch(`/api/v1/lifecycle/requests/${requestId}/approve`, {
        method: 'POST',
      });

      if (response.ok) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        fetchDashboardData(true);
      }
    } catch (error) {
      console.error('Error approving request:', error);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const response = await authFetch(`/api/v1/lifecycle/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rejected from dashboard' }),
      });

      if (response.ok) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        fetchDashboardData(true);
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  };

  const getRequestTypeIcon = (type: string) => {
    switch (type) {
      case 'onboarding':
        return <UserPlus size={16} />;
      case 'offboarding':
        return <UserMinus size={16} />;
      default:
        return <Users size={16} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_track':
        return 'status-success';
      case 'at_risk':
        return 'status-warning';
      case 'overdue':
        return 'status-danger';
      default:
        return '';
    }
  };

  const filteredOnboardings = activeOnboardings.filter((o) => {
    if (onboardingFilter === 'all') return true;
    return o.status === onboardingFilter;
  });

  if (loading) {
    return (
      <div className="hr-dashboard loading-state">
        <Loader2 className="animate-spin" size={32} />
        <span>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="hr-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>HR Dashboard</h1>
          <p>Lifecycle management overview</p>
        </div>
        <button
          className="btn-refresh"
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Metrics Row */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-icon pending">
            <Clock size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.pendingRequests}</span>
            <span className="metric-label">Pending Requests</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon active">
            <UserPlus size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.activeOnboardings}</span>
            <span className="metric-label">Active Onboardings</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon overdue">
            <AlertCircle size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.overdueTasksCount}</span>
            <span className="metric-label">Overdue Tasks</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon tasks">
            <CheckCircle2 size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.myTasksCount}</span>
            <span className="metric-label">My Tasks</span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="secondary-metrics">
        <div className="secondary-metric">
          <TrendingUp size={16} />
          <span>
            <strong>{metrics.completedThisMonth}</strong> completed this month
          </span>
        </div>
        <div className="secondary-metric">
          <Calendar size={16} />
          <span>
            <strong>{metrics.avgOnboardingDays}</strong> avg. days to complete
          </span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Pending Requests Queue */}
        <div className="dashboard-card requests-queue">
          <div className="card-header">
            <h2>Pending Requests</h2>
            <span className="badge">{pendingRequests.length}</span>
          </div>
          <div className="card-content">
            {pendingRequests.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={32} />
                <p>No pending requests</p>
              </div>
            ) : (
              <div className="requests-list">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="request-item">
                    <div className="request-icon">{getRequestTypeIcon(request.type)}</div>
                    <div className="request-info">
                      <span className="request-name">{request.user_name}</span>
                      <span className="request-meta">
                        {request.type} - {request.department || 'No dept'}
                        {request.waiting_days > 0 && (
                          <span className="waiting-time">
                            {request.waiting_days}d waiting
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="request-actions">
                      <button
                        className="btn-icon approve"
                        onClick={() => handleApprove(request.id)}
                        title="Approve"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        className="btn-icon reject"
                        onClick={() => handleReject(request.id)}
                        title="Reject"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {pendingRequests.length > 0 && (
            <div className="card-footer">
              <a href="/admin/requests" className="view-all">
                View all requests
                <ChevronRight size={16} />
              </a>
            </div>
          )}
        </div>

        {/* Attention Required */}
        <div className="dashboard-card attention-alerts">
          <div className="card-header">
            <h2>Attention Required</h2>
            {attentionItems.filter((i) => i.severity === 'critical').length > 0 && (
              <span className="badge critical">
                {attentionItems.filter((i) => i.severity === 'critical').length}
              </span>
            )}
          </div>
          <div className="card-content">
            {attentionItems.length === 0 ? (
              <div className="empty-state success">
                <CheckCircle2 size={32} />
                <p>All clear! No items need attention</p>
              </div>
            ) : (
              <div className="attention-list">
                {attentionItems.map((item) => (
                  <div key={item.id} className={`attention-item ${item.severity}`}>
                    <div className="attention-icon">
                      {item.severity === 'critical' ? (
                        <AlertCircle size={18} />
                      ) : (
                        <AlertTriangle size={18} />
                      )}
                    </div>
                    <div className="attention-info">
                      <span className="attention-title">{item.title}</span>
                      <span className="attention-description">{item.description}</span>
                    </div>
                    {item.days_overdue && (
                      <span className="overdue-badge">{item.days_overdue}d overdue</span>
                    )}
                    <ChevronRight size={16} className="chevron" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Active Onboardings Table */}
        <div className="dashboard-card active-onboardings">
          <div className="card-header">
            <h2>Active Onboardings</h2>
            <div className="header-actions">
              <div className="filter-dropdown">
                <Filter size={14} />
                <select
                  value={onboardingFilter}
                  onChange={(e) =>
                    setOnboardingFilter(e.target.value as typeof onboardingFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
          </div>
          <div className="card-content">
            {filteredOnboardings.length === 0 ? (
              <div className="empty-state">
                <Users size={32} />
                <p>No active onboardings</p>
              </div>
            ) : (
              <div className="onboardings-table">
                <div className="table-header">
                  <span className="col-name">Name</span>
                  <span className="col-department">Department</span>
                  <span className="col-start">Start Date</span>
                  <span className="col-progress">Progress</span>
                  <span className="col-status">Status</span>
                  <span className="col-actions"></span>
                </div>
                <div className="table-body">
                  {filteredOnboardings.map((onboarding) => (
                    <div key={onboarding.id} className="table-row">
                      <div className="col-name">
                        <span className="user-name">{onboarding.user_name}</span>
                        <span className="user-email">{onboarding.user_email}</span>
                      </div>
                      <div className="col-department">{onboarding.department || '-'}</div>
                      <div className="col-start">
                        {new Date(onboarding.start_date).toLocaleDateString()}
                      </div>
                      <div className="col-progress">
                        <div className="progress-container">
                          <div className="progress-bar">
                            <div
                              className={`progress-fill ${getStatusColor(onboarding.status)}`}
                              style={{ width: `${onboarding.progress_percentage}%` }}
                            />
                          </div>
                          <span className="progress-text">
                            {onboarding.completed_tasks}/{onboarding.total_tasks}
                          </span>
                        </div>
                      </div>
                      <div className="col-status">
                        <span className={`status-badge ${getStatusColor(onboarding.status)}`}>
                          {onboarding.status === 'on_track'
                            ? 'On Track'
                            : onboarding.status === 'at_risk'
                            ? 'At Risk'
                            : 'Overdue'}
                        </span>
                      </div>
                      <div className="col-actions">
                        <button className="btn-icon">
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {activeOnboardings.length > 10 && (
            <div className="card-footer">
              <a href="/admin/requests?status=in_progress" className="view-all">
                View all onboardings
                <ChevronRight size={16} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HRDashboard;
