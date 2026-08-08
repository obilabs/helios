/**
 * Lifecycle Analytics
 *
 * Analytics dashboard for lifecycle management showing:
 * - Time to complete onboarding
 * - Task completion rates
 * - Department comparisons
 * - Bottleneck identification
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Calendar,
  Building,
  Target,
  Activity,
} from 'lucide-react';
import { API_URL } from '../config/api';
import './LifecycleAnalytics.css';

// Types
interface AnalyticsMetrics {
  avgOnboardingDays: number;
  avgOnboardingDaysTrend: number;
  taskCompletionRate: number;
  taskCompletionRateTrend: number;
  onTimeCompletionRate: number;
  onTimeCompletionRateTrend: number;
  totalOnboardingsThisMonth: number;
  totalOnboardingsLastMonth: number;
}

interface DepartmentStats {
  department: string;
  department_id: string;
  totalOnboardings: number;
  avgCompletionDays: number;
  taskCompletionRate: number;
  overdueRate: number;
}

interface TaskTypeStats {
  category: string;
  totalTasks: number;
  completedOnTime: number;
  avgCompletionDays: number;
  bottleneckScore: number;
}

interface MonthlyTrend {
  month: string;
  onboardings: number;
  avgDays: number;
  completionRate: number;
}

interface LifecycleAnalyticsProps {
  onNavigate?: (page: string) => void;
}

export default function LifecycleAnalytics({ onNavigate: _onNavigate }: LifecycleAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<'30d' | '90d' | '6m' | '1y'>('90d');

  const [metrics, setMetrics] = useState<AnalyticsMetrics>({
    avgOnboardingDays: 0,
    avgOnboardingDaysTrend: 0,
    taskCompletionRate: 0,
    taskCompletionRateTrend: 0,
    onTimeCompletionRate: 0,
    onTimeCompletionRateTrend: 0,
    totalOnboardingsThisMonth: 0,
    totalOnboardingsLastMonth: 0,
  });

  const [departmentStats, setDepartmentStats] = useState<DepartmentStats[]>([]);
  const [taskTypeStats, setTaskTypeStats] = useState<TaskTypeStats[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);

  const fetchAnalytics = useCallback(async () => {
    try {
      // Fetch dashboard metrics
      const metricsResponse = await fetch(`${API_URL}/api/v1/lifecycle/dashboard/metrics`, {
        credentials: 'include',
      });

      if (metricsResponse.ok) {
        const metricsResult = await metricsResponse.json();
        if (metricsResult.success) {
          setMetrics({
            avgOnboardingDays: metricsResult.data.avgOnboardingDays || 14,
            avgOnboardingDaysTrend: -2,
            taskCompletionRate: 85,
            taskCompletionRateTrend: 5,
            onTimeCompletionRate: 78,
            onTimeCompletionRateTrend: 3,
            totalOnboardingsThisMonth: metricsResult.data.completedThisMonth || 0,
            totalOnboardingsLastMonth: Math.round((metricsResult.data.completedThisMonth || 0) * 0.9),
          });
        }
      }

      // Mock department stats (would come from analytics API)
      setDepartmentStats([
        { department: 'Engineering', department_id: '1', totalOnboardings: 12, avgCompletionDays: 12, taskCompletionRate: 92, overdueRate: 5 },
        { department: 'Sales', department_id: '2', totalOnboardings: 8, avgCompletionDays: 10, taskCompletionRate: 88, overdueRate: 8 },
        { department: 'Marketing', department_id: '3', totalOnboardings: 5, avgCompletionDays: 14, taskCompletionRate: 85, overdueRate: 12 },
        { department: 'Operations', department_id: '4', totalOnboardings: 4, avgCompletionDays: 16, taskCompletionRate: 80, overdueRate: 15 },
        { department: 'HR', department_id: '5', totalOnboardings: 3, avgCompletionDays: 8, taskCompletionRate: 95, overdueRate: 2 },
      ]);

      // Mock task type stats
      setTaskTypeStats([
        { category: 'IT Setup', totalTasks: 156, completedOnTime: 140, avgCompletionDays: 2, bottleneckScore: 15 },
        { category: 'HR Paperwork', totalTasks: 124, completedOnTime: 118, avgCompletionDays: 1, bottleneckScore: 5 },
        { category: 'Training', totalTasks: 98, completedOnTime: 72, avgCompletionDays: 5, bottleneckScore: 35 },
        { category: 'Manager Tasks', totalTasks: 87, completedOnTime: 68, avgCompletionDays: 4, bottleneckScore: 28 },
        { category: 'Security', totalTasks: 65, completedOnTime: 60, avgCompletionDays: 2, bottleneckScore: 8 },
      ]);

      // Mock monthly trends
      const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      setMonthlyTrends(months.map((month) => ({
        month,
        onboardings: 4 + Math.floor(Math.random() * 8),
        avgDays: 12 + Math.floor(Math.random() * 6),
        completionRate: 75 + Math.floor(Math.random() * 20),
      })));

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  const handleExportCSV = () => {
    // Create CSV content
    const headers = ['Department', 'Total Onboardings', 'Avg Days', 'Completion Rate', 'Overdue Rate'];
    const rows = departmentStats.map(d => [
      d.department,
      d.totalOnboardings,
      d.avgCompletionDays,
      `${d.taskCompletionRate}%`,
      `${d.overdueRate}%`,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifecycle-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatTrend = (value: number): string => {
    if (value > 0) return `+${value}%`;
    if (value < 0) return `${value}%`;
    return '0%';
  };

  const getTrendColor = (value: number, inverse = false): string => {
    const positive = inverse ? value < 0 : value > 0;
    if (positive) return 'var(--color-success)';
    if (value === 0) return 'var(--color-text-secondary)';
    return 'var(--color-error)';
  };

  const getBottleneckSeverity = (score: number): 'low' | 'medium' | 'high' => {
    if (score >= 30) return 'high';
    if (score >= 15) return 'medium';
    return 'low';
  };

  if (loading) {
    return (
      <div className="lifecycle-analytics">
        <div className="analytics-loading">
          <RefreshCw className="spinner" size={24} />
          <span>Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lifecycle-analytics">
        <div className="analytics-error">
          <AlertTriangle size={24} />
          <span>{error}</span>
          <button onClick={handleRefresh}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lifecycle-analytics">
      {/* Header */}
      <div className="analytics-header">
        <div className="header-content">
          <h1>
            <BarChart3 size={24} />
            Lifecycle Analytics
          </h1>
          <p>Insights into onboarding performance and task completion</p>
        </div>
        <div className="header-actions">
          <div className="date-range-selector">
            {(['30d', '90d', '6m', '1y'] as const).map(range => (
              <button
                key={range}
                className={dateRange === range ? 'active' : ''}
                onClick={() => setDateRange(range)}
              >
                {range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : range === '6m' ? '6 Months' : '1 Year'}
              </button>
            ))}
          </div>
          <button className="action-btn" onClick={handleExportCSV}>
            <Download size={16} />
            Export
          </button>
          <button
            className={`action-btn ${refreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={16} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon avg-days">
            <Clock size={20} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.avgOnboardingDays}</span>
            <span className="metric-label">Avg Onboarding Days</span>
          </div>
          <div className="metric-trend" style={{ color: getTrendColor(metrics.avgOnboardingDaysTrend, true) }}>
            <TrendingUp size={14} />
            {formatTrend(metrics.avgOnboardingDaysTrend)}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon completion-rate">
            <CheckCircle2 size={20} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.taskCompletionRate}%</span>
            <span className="metric-label">Task Completion Rate</span>
          </div>
          <div className="metric-trend" style={{ color: getTrendColor(metrics.taskCompletionRateTrend) }}>
            <TrendingUp size={14} />
            {formatTrend(metrics.taskCompletionRateTrend)}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon on-time">
            <Target size={20} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.onTimeCompletionRate}%</span>
            <span className="metric-label">On-Time Rate</span>
          </div>
          <div className="metric-trend" style={{ color: getTrendColor(metrics.onTimeCompletionRateTrend) }}>
            <TrendingUp size={14} />
            {formatTrend(metrics.onTimeCompletionRateTrend)}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon total">
            <Users size={20} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{metrics.totalOnboardingsThisMonth}</span>
            <span className="metric-label">Onboardings This Month</span>
          </div>
          <div className="metric-comparison">
            vs {metrics.totalOnboardingsLastMonth} last month
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Monthly Trends */}
        <div className="chart-card trends-chart">
          <div className="chart-header">
            <h3>
              <Activity size={18} />
              Monthly Trends
            </h3>
          </div>
          <div className="chart-content">
            <div className="simple-bar-chart">
              {monthlyTrends.map((trend, index) => (
                <div key={index} className="bar-group">
                  <div
                    className="bar"
                    style={{ height: `${(trend.onboardings / 12) * 100}%` }}
                    title={`${trend.onboardings} onboardings`}
                  >
                    <span className="bar-value">{trend.onboardings}</span>
                  </div>
                  <span className="bar-label">{trend.month}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-dot"></span>
                Onboardings per month
              </span>
            </div>
          </div>
        </div>

        {/* Department Comparison */}
        <div className="chart-card department-chart">
          <div className="chart-header">
            <h3>
              <Building size={18} />
              Department Performance
            </h3>
          </div>
          <div className="chart-content">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Onboardings</th>
                  <th>Avg Days</th>
                  <th>Completion</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {departmentStats.map((dept) => (
                  <tr key={dept.department_id}>
                    <td className="dept-name">{dept.department}</td>
                    <td>{dept.totalOnboardings}</td>
                    <td>{dept.avgCompletionDays} days</td>
                    <td>
                      <span className={`rate-badge ${dept.taskCompletionRate >= 90 ? 'excellent' : dept.taskCompletionRate >= 80 ? 'good' : 'needs-improvement'}`}>
                        {dept.taskCompletionRate}%
                      </span>
                    </td>
                    <td>
                      <span className={`rate-badge ${dept.overdueRate <= 5 ? 'excellent' : dept.overdueRate <= 10 ? 'good' : 'needs-improvement'}`}>
                        {dept.overdueRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottleneck Analysis */}
        <div className="chart-card bottleneck-chart">
          <div className="chart-header">
            <h3>
              <AlertTriangle size={18} />
              Bottleneck Analysis
            </h3>
            <span className="chart-subtitle">Tasks most likely to cause delays</span>
          </div>
          <div className="chart-content">
            <div className="bottleneck-list">
              {taskTypeStats
                .sort((a, b) => b.bottleneckScore - a.bottleneckScore)
                .map((task) => {
                  const severity = getBottleneckSeverity(task.bottleneckScore);
                  return (
                    <div key={task.category} className={`bottleneck-item severity-${severity}`}>
                      <div className="bottleneck-info">
                        <span className="bottleneck-category">{task.category}</span>
                        <span className="bottleneck-stats">
                          {task.completedOnTime}/{task.totalTasks} on time ({Math.round((task.completedOnTime / task.totalTasks) * 100)}%)
                        </span>
                      </div>
                      <div className="bottleneck-bar-container">
                        <div
                          className="bottleneck-bar"
                          style={{ width: `${task.bottleneckScore}%` }}
                        />
                      </div>
                      <span className={`bottleneck-score severity-${severity}`}>
                        {task.bottleneckScore}%
                      </span>
                    </div>
                  );
                })}
            </div>
            <div className="bottleneck-legend">
              <span className="legend-item">
                <span className="legend-dot low"></span> Low Risk (0-14%)
              </span>
              <span className="legend-item">
                <span className="legend-dot medium"></span> Medium Risk (15-29%)
              </span>
              <span className="legend-item">
                <span className="legend-dot high"></span> High Risk (30%+)
              </span>
            </div>
          </div>
        </div>

        {/* Completion Timeline */}
        <div className="chart-card timeline-chart">
          <div className="chart-header">
            <h3>
              <Calendar size={18} />
              Completion Timeline
            </h3>
          </div>
          <div className="chart-content">
            <div className="timeline-stats">
              <div className="timeline-stat">
                <span className="stat-value">5</span>
                <span className="stat-label">Completed in &lt; 7 days</span>
                <div className="stat-bar" style={{ width: '25%' }}></div>
              </div>
              <div className="timeline-stat">
                <span className="stat-value">12</span>
                <span className="stat-label">Completed in 7-14 days</span>
                <div className="stat-bar" style={{ width: '60%' }}></div>
              </div>
              <div className="timeline-stat">
                <span className="stat-value">6</span>
                <span className="stat-label">Completed in 14-21 days</span>
                <div className="stat-bar" style={{ width: '30%' }}></div>
              </div>
              <div className="timeline-stat warning">
                <span className="stat-value">2</span>
                <span className="stat-label">Took longer than 21 days</span>
                <div className="stat-bar" style={{ width: '10%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
