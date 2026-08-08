import React, { useEffect, useState } from 'react';
import { Mail, TrendingUp, TrendingDown, Minus, RefreshCw, Clock, AlertCircle } from 'lucide-react';
import { apiPath, authFetch } from '../../config/api';
import './EmailEngagementWidget.css';

interface DailyStats {
  date: string;
  opens: number;
  unique: number;
}

interface UserStats {
  today: { opens: number; unique: number };
  thisWeek: { opens: number; unique: number };
  thisMonth: { opens: number; unique: number };
  trend: { direction: 'up' | 'down' | 'stable'; percentage: number };
  peakHours: Array<{ hour: number; day: string; avgOpens: number }>;
  byDevice: { desktop: number; mobile: number; tablet: number };
}

interface EmailEngagementWidgetProps {
  className?: string;
}

export const EmailEngagementWidget: React.FC<EmailEngagementWidgetProps> = ({ className = '' }) => {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both stats and daily data in parallel
      const [statsRes, dailyRes] = await Promise.all([
        authFetch(apiPath('/tracking/my-stats')),
        authFetch(apiPath('/tracking/my-stats/daily?days=7')),
      ]);

      if (!statsRes.ok || !dailyRes.ok) {
        throw new Error('Failed to fetch engagement data');
      }

      const [statsData, dailyData] = await Promise.all([
        statsRes.json(),
        dailyRes.json(),
      ]);

      if (statsData.success) {
        setStats(statsData.data);
      }
      if (dailyData.success) {
        setDailyStats(dailyData.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load engagement data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const getTrendIcon = () => {
    if (!stats) return <Minus size={14} />;
    switch (stats.trend.direction) {
      case 'up':
        return <TrendingUp size={14} className="trend-icon trend-up" />;
      case 'down':
        return <TrendingDown size={14} className="trend-icon trend-down" />;
      default:
        return <Minus size={14} className="trend-icon trend-stable" />;
    }
  };

  const formatTrendText = () => {
    if (!stats) return '';
    const { direction, percentage } = stats.trend;
    if (direction === 'stable') return 'Same as last week';
    const arrow = direction === 'up' ? '+' : '-';
    return `${arrow}${Math.abs(percentage)}% vs last week`;
  };

  const formatPeakTime = () => {
    if (!stats || !stats.peakHours || stats.peakHours.length === 0) return 'No data yet';
    const peak = stats.peakHours[0];
    const hour = peak.hour;
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${peak.day} ${displayHour}${period}`;
  };

  const getMaxOpens = () => {
    if (!dailyStats.length) return 1;
    return Math.max(...dailyStats.map(d => d.opens), 1);
  };

  if (loading) {
    return (
      <div className={`email-engagement-widget ${className}`}>
        <div className="widget-loading">
          <RefreshCw size={16} className="animate-spin" />
          <span>Loading engagement data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`email-engagement-widget ${className}`}>
        <div className="widget-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={fetchStats} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const maxOpens = getMaxOpens();

  return (
    <div className={`email-engagement-widget ${className}`}>
      <div className="widget-header">
        <div className="widget-title">
          <Mail size={16} className="widget-icon" />
          <span>Email Engagement</span>
        </div>
        <button onClick={fetchStats} className="refresh-btn" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="widget-stats">
        <div className="stat-main">
          <span className="stat-value">{stats?.thisWeek.opens || 0}</span>
          <span className="stat-label">opens this week</span>
        </div>
        <div className="stat-trend">
          {getTrendIcon()}
          <span className={`trend-text trend-${stats?.trend.direction || 'stable'}`}>
            {formatTrendText()}
          </span>
        </div>
      </div>

      {/* Mini bar chart for last 7 days */}
      <div className="widget-chart">
        {dailyStats.length > 0 ? (
          <div className="chart-bars">
            {dailyStats.slice(-7).map((day, index) => {
              const height = Math.max(4, (day.opens / maxOpens) * 100);
              const dateObj = new Date(day.date);
              const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
              return (
                <div key={index} className="chart-bar-container" title={`${day.opens} opens on ${day.date}`}>
                  <div
                    className="chart-bar"
                    style={{ height: `${height}%` }}
                  />
                  <span className="chart-label">{dayName}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="chart-empty">No engagement data yet</div>
        )}
      </div>

      <div className="widget-footer">
        <Clock size={12} />
        <span>Peak: {formatPeakTime()}</span>
      </div>
    </div>
  );
};

export default EmailEngagementWidget;
