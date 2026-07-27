import { useState, useEffect } from 'react';
import {
  Loader2,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  AlertTriangle,
  Clock,
  Server,
  Bot,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { authFetch } from '../../config/api';
import './AIUsage.css';

interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  avgLatencyMs: number;
  errorRate: number;
  byDay: Array<{ date: string; requests: number; tokens: number }>;
  byModel: Array<{ model: string; requests: number; tokens: number }>;
  byTool?: Array<{ tool: string; count: number }>;
  topQueries?: Array<{ query: string; count: number }>;
  limits?: {
    tokensPerDay: number;
    requestsPerMinute: number;
    tokensUsedToday: number;
    requestsThisMinute: number;
  };
}

interface AIUsageProps {
  organizationId?: string;
}

const DATE_RANGES = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

export function AIUsage({ organizationId: _organizationId }: AIUsageProps) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      setIsRefreshing(true);
      const res = await authFetch(`/api/v1/ai/usage?days=${dateRange}`);

      const data = await res.json();
      if (data.success) {
        setStats(data.data);
        setError(null);
      } else {
        setError(data.message || 'Failed to load usage stats');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [dateRange]);

  // Export usage data as CSV
  const exportCSV = () => {
    if (!stats) return;

    // Create CSV content
    let csv = 'Date,Requests,Tokens\n';
    stats.byDay.forEach(day => {
      csv += `${day.date},${day.requests},${day.tokens}\n`;
    });

    // Download file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-usage-${dateRange}days.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Calculate percentages for quota bars
  const getQuotaPercentage = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  // Get trend indicator
  const getTrend = (current: number, previous: number) => {
    if (previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return {
      direction: change >= 0 ? 'up' : 'down',
      percentage: Math.abs(change).toFixed(1)
    };
  };

  // Get max value for chart scaling
  const getMaxRequests = () => {
    if (!stats?.byDay.length) return 100;
    return Math.max(...stats.byDay.map(d => d.requests)) || 100;
  };

  if (isLoading) {
    return (
      <div className="ai-usage-loading">
        <Loader2 size={32} className="spin" />
        <p>Loading usage statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ai-usage-error">
        <AlertTriangle size={32} />
        <h3>Failed to Load Usage Data</h3>
        <p>{error}</p>
        <button onClick={fetchStats}>
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="ai-usage-empty">
        <Bot size={48} />
        <h3>No Usage Data</h3>
        <p>Start using the AI Assistant to see usage statistics here.</p>
      </div>
    );
  }

  // Calculate this week vs last week for trends
  const thisWeekRequests = stats.byDay.slice(0, 7).reduce((sum, d) => sum + d.requests, 0);
  const lastWeekRequests = stats.byDay.slice(7, 14).reduce((sum, d) => sum + d.requests, 0);
  const requestsTrend = getTrend(thisWeekRequests, lastWeekRequests);

  const thisWeekTokens = stats.byDay.slice(0, 7).reduce((sum, d) => sum + d.tokens, 0);
  const lastWeekTokens = stats.byDay.slice(7, 14).reduce((sum, d) => sum + d.tokens, 0);
  const tokensTrend = getTrend(thisWeekTokens, lastWeekTokens);

  return (
    <div className="ai-usage">
      {/* Header */}
      <div className="ai-usage-header">
        <div className="header-title">
          <Activity size={24} />
          <h2>AI Usage Dashboard</h2>
        </div>
        <div className="header-actions">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="date-range-select"
          >
            {DATE_RANGES.map(range => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
          <button
            className="refresh-btn"
            onClick={fetchStats}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
          </button>
          <button className="export-btn" onClick={exportCSV}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="usage-summary-grid">
        <div className="summary-card">
          <div className="card-icon requests">
            <Zap size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Total Requests</span>
            <span className="card-value">{stats.totalRequests.toLocaleString()}</span>
            {requestsTrend && (
              <span className={`trend ${requestsTrend.direction}`}>
                {requestsTrend.direction === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {requestsTrend.percentage}%
              </span>
            )}
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon tokens">
            <BarChart3 size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Total Tokens</span>
            <span className="card-value">{stats.totalTokens.toLocaleString()}</span>
            {tokensTrend && (
              <span className={`trend ${tokensTrend.direction}`}>
                {tokensTrend.direction === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {tokensTrend.percentage}%
              </span>
            )}
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon latency">
            <Clock size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Avg Latency</span>
            <span className="card-value">{Math.round(stats.avgLatencyMs)}ms</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon error">
            <AlertTriangle size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Error Rate</span>
            <span className="card-value">{(stats.errorRate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Quota Section */}
      {stats.limits && (
        <div className="quota-section">
          <h3>Usage Limits</h3>
          <div className="quota-grid">
            <div className="quota-card">
              <div className="quota-header">
                <span>Tokens Today</span>
                <span>{stats.limits.tokensUsedToday.toLocaleString()} / {stats.limits.tokensPerDay.toLocaleString()}</span>
              </div>
              <div className="quota-bar">
                <div
                  className="quota-fill"
                  style={{ width: `${getQuotaPercentage(stats.limits.tokensUsedToday, stats.limits.tokensPerDay)}%` }}
                />
              </div>
            </div>
            <div className="quota-card">
              <div className="quota-header">
                <span>Requests/Min</span>
                <span>{stats.limits.requestsThisMinute} / {stats.limits.requestsPerMinute}</span>
              </div>
              <div className="quota-bar">
                <div
                  className="quota-fill"
                  style={{ width: `${getQuotaPercentage(stats.limits.requestsThisMinute, stats.limits.requestsPerMinute)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Daily Usage Chart */}
        <div className="chart-card">
          <h3>
            <Calendar size={18} />
            Daily Usage
          </h3>
          <div className="bar-chart">
            {stats.byDay.slice(0, 14).reverse().map((day, index) => {
              const height = (day.requests / getMaxRequests()) * 100;
              const date = new Date(day.date);
              const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

              return (
                <div key={index} className="bar-column">
                  <div className="bar-wrapper">
                    <div
                      className="bar"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${day.requests} requests, ${day.tokens} tokens`}
                    />
                  </div>
                  <span className="bar-label">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Breakdown */}
        <div className="chart-card">
          <h3>
            <Server size={18} />
            By Model
          </h3>
          <div className="breakdown-list">
            {stats.byModel.length === 0 ? (
              <p className="empty-text">No model data available</p>
            ) : (
              stats.byModel.map((model, index) => {
                const percentage = stats.totalRequests > 0
                  ? (model.requests / stats.totalRequests) * 100
                  : 0;

                return (
                  <div key={index} className="breakdown-item">
                    <div className="breakdown-header">
                      <span className="breakdown-name">{model.model || 'Unknown'}</span>
                      <span className="breakdown-stats">
                        {model.requests} requests ({model.tokens.toLocaleString()} tokens)
                      </span>
                    </div>
                    <div className="breakdown-bar">
                      <div
                        className="breakdown-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Tool Invocations (if available) */}
      {stats.byTool && stats.byTool.length > 0 && (
        <div className="tools-section">
          <h3>
            <Zap size={18} />
            Tool Invocations
          </h3>
          <div className="tools-grid">
            {stats.byTool.slice(0, 10).map((tool, index) => (
              <div key={index} className="tool-card">
                <span className="tool-name">{tool.tool}</span>
                <span className="tool-count">{tool.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity Table */}
      <div className="activity-section">
        <h3>
          <Activity size={18} />
          Daily Breakdown
        </h3>
        <div className="activity-table-wrapper">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="align-right">Requests</th>
                <th className="align-right">Tokens</th>
                <th className="align-right">Avg Tokens/Request</th>
              </tr>
            </thead>
            <tbody>
              {stats.byDay.slice(0, 14).map((day, index) => (
                <tr key={index}>
                  <td>{new Date(day.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}</td>
                  <td className="align-right">{day.requests.toLocaleString()}</td>
                  <td className="align-right">{day.tokens.toLocaleString()}</td>
                  <td className="align-right">
                    {day.requests > 0 ? Math.round(day.tokens / day.requests) : 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AIUsage;
