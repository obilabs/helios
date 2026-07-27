/**
 * Manager Dashboard
 *
 * Dashboard for managers to view their team's onboarding progress,
 * pending tasks, and upcoming start dates.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  CheckSquare,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  User,
  Briefcase,
} from 'lucide-react';
import { API_URL } from '../config/api';
import './ManagerDashboard.css';

// Types
interface TeamOnboarding {
  id: string;
  user_name: string;
  email: string;
  start_date: string | null;
  status: string;
  department?: string;
  job_title?: string;
  progress_percentage: number;
}

interface MyTask {
  id: string;
  title: string;
  description?: string;
  due_date: string | null;
  status: string;
  category?: string;
  priority?: string;
  user_name?: string;
}

interface UpcomingStart {
  id: string;
  user_name: string;
  email: string;
  start_date: string;
  department?: string;
  job_title?: string;
}

interface ManagerMetrics {
  teamOnboardingsCount: number;
  myPendingTasksCount: number;
  myInProgressTasksCount: number;
  overdueTasksCount: number;
  upcomingStartsCount: number;
}

interface ManagerDashboardData {
  teamOnboardings: {
    items: TeamOnboarding[];
    total: number;
  };
  myTasks: {
    items: MyTask[];
    total: number;
  };
  upcomingStarts: UpcomingStart[];
  metrics: ManagerMetrics;
}

interface ManagerDashboardProps {
  onNavigate: (page: string) => void;
}

export default function ManagerDashboard({ onNavigate }: ManagerDashboardProps) {
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/lifecycle/dashboard/manager`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.error || 'Failed to load dashboard');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchDashboard, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/lifecycle/tasks/${taskId}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: '' }),
      });

      if (response.ok) {
        fetchDashboard();
      }
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'TBD';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysUntil = (dateStr: string): number => {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const isOverdue = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const getProgressColor = (percentage: number): string => {
    if (percentage >= 75) return 'var(--color-success)';
    if (percentage >= 50) return 'var(--color-warning)';
    return 'var(--color-error)';
  };

  if (loading) {
    return (
      <div className="manager-dashboard">
        <div className="dashboard-loading">
          <RefreshCw className="spinner" size={24} />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="manager-dashboard">
        <div className="dashboard-error">
          <AlertTriangle size={24} />
          <span>{error}</span>
          <button onClick={handleRefresh}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { teamOnboardings, myTasks, upcomingStarts, metrics } = data;

  return (
    <div className="manager-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Manager Dashboard</h1>
          <p>Track your team's onboarding progress and pending tasks</p>
        </div>
        <button
          className={`refresh-button ${refreshing ? 'refreshing' : ''}`}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={16} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon team">
            <Users size={20} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.teamOnboardingsCount}</span>
            <span className="metric-label">Team Onboardings</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon tasks">
            <CheckSquare size={20} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.myPendingTasksCount + metrics.myInProgressTasksCount}</span>
            <span className="metric-label">My Pending Tasks</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon upcoming">
            <Calendar size={20} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.upcomingStartsCount}</span>
            <span className="metric-label">Upcoming Starts</span>
          </div>
        </div>

        <div className={`metric-card ${metrics.overdueTasksCount > 0 ? 'warning' : ''}`}>
          <div className="metric-icon overdue">
            <Clock size={20} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.overdueTasksCount}</span>
            <span className="metric-label">Overdue Tasks</span>
          </div>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="dashboard-grid">
        {/* Team Onboardings */}
        <div className="dashboard-card team-onboardings">
          <div className="card-header">
            <h2>
              <Users size={18} />
              Team Onboardings
            </h2>
            <button className="view-all" onClick={() => onNavigate('requests')}>
              View All <ChevronRight size={14} />
            </button>
          </div>

          {teamOnboardings.items.length === 0 ? (
            <div className="empty-state">
              <Users size={32} />
              <p>No team members currently onboarding</p>
            </div>
          ) : (
            <div className="onboarding-list">
              {teamOnboardings.items.map((onboarding) => (
                <div key={onboarding.id} className="onboarding-item">
                  <div className="onboarding-avatar">
                    <User size={16} />
                  </div>
                  <div className="onboarding-info">
                    <div className="onboarding-name">{onboarding.user_name}</div>
                    <div className="onboarding-details">
                      {onboarding.job_title && <span>{onboarding.job_title}</span>}
                      {onboarding.department && <span>{onboarding.department}</span>}
                    </div>
                  </div>
                  <div className="onboarding-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${onboarding.progress_percentage}%`,
                          backgroundColor: getProgressColor(onboarding.progress_percentage),
                        }}
                      />
                    </div>
                    <span className="progress-text">{onboarding.progress_percentage}%</span>
                  </div>
                  <div className="onboarding-date">
                    {onboarding.start_date ? formatDate(onboarding.start_date) : 'TBD'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Tasks */}
        <div className="dashboard-card my-tasks">
          <div className="card-header">
            <h2>
              <CheckSquare size={18} />
              My Tasks
            </h2>
            <button className="view-all" onClick={() => onNavigate('tasks-dashboard')}>
              View All <ChevronRight size={14} />
            </button>
          </div>

          {myTasks.items.length === 0 ? (
            <div className="empty-state">
              <CheckSquare size={32} />
              <p>No pending tasks assigned to you</p>
            </div>
          ) : (
            <div className="task-list">
              {myTasks.items.map((task) => (
                <div
                  key={task.id}
                  className={`task-item ${isOverdue(task.due_date) ? 'overdue' : ''}`}
                >
                  <div className="task-content">
                    <div className="task-title">{task.title}</div>
                    <div className="task-meta">
                      {task.user_name && (
                        <span className="task-user">
                          <User size={12} /> {task.user_name}
                        </span>
                      )}
                      {task.category && <span className="task-category">{task.category}</span>}
                    </div>
                  </div>
                  <div className="task-actions">
                    {task.due_date && (
                      <span className={`task-due ${isOverdue(task.due_date) ? 'overdue' : ''}`}>
                        {isOverdue(task.due_date) ? (
                          <>
                            <AlertTriangle size={12} />
                            Overdue
                          </>
                        ) : (
                          formatDate(task.due_date)
                        )}
                      </span>
                    )}
                    <button
                      className="complete-btn"
                      onClick={() => handleCompleteTask(task.id)}
                      title="Mark as complete"
                    >
                      <CheckSquare size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Starts */}
        <div className="dashboard-card upcoming-starts">
          <div className="card-header">
            <h2>
              <Calendar size={18} />
              Upcoming Starts
            </h2>
          </div>

          {upcomingStarts.length === 0 ? (
            <div className="empty-state">
              <Calendar size={32} />
              <p>No upcoming starts in the next 30 days</p>
            </div>
          ) : (
            <div className="upcoming-list">
              {upcomingStarts.map((start) => {
                const daysUntil = getDaysUntil(start.start_date);
                return (
                  <div key={start.id} className="upcoming-item">
                    <div className="upcoming-avatar">
                      <User size={16} />
                    </div>
                    <div className="upcoming-info">
                      <div className="upcoming-name">{start.user_name}</div>
                      <div className="upcoming-details">
                        <Briefcase size={12} />
                        {start.job_title || 'New Hire'}
                      </div>
                    </div>
                    <div className="upcoming-countdown">
                      <span className="days-count">{daysUntil}</span>
                      <span className="days-label">{daysUntil === 1 ? 'day' : 'days'}</span>
                    </div>
                    <div className="upcoming-date">{formatDate(start.start_date)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
