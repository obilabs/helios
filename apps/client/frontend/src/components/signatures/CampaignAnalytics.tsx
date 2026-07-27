/**
 * CampaignAnalytics Component
 *
 * Displays comprehensive analytics for a signature campaign including:
 * - Summary statistics (total opens, unique opens, open rate)
 * - Time series chart showing opens over time
 * - Device breakdown (desktop, mobile, tablet)
 * - Top performers table
 * - Geographic distribution
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  MousePointer,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  HelpCircle,
  Download,
  RefreshCw,
  Calendar,
  ChevronLeft,
  AlertCircle,
  Mail,
} from 'lucide-react';
import { authFetch } from '../../config/api';
import './CampaignAnalytics.css';

interface CampaignStats {
  campaignId: string;
  campaignName: string;
  totalOpens: number;
  uniqueOpens: number;
  targetUserCount: number;
  openRate: number;
  lastOpenAt: string | null;
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
    unknown: number;
  };
}

interface DailyOpens {
  date: string;
  totalOpens: number;
  uniqueOpens: number;
}

interface GeoDistribution {
  countryCode: string | null;
  country: string;
  opens: number;
  uniqueOpens: number;
  percentage: number;
}

interface TopPerformer {
  userId: string;
  userEmail: string;
  userName: string;
  opens: number;
  lastOpenAt: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  status: string;
  start_date: string;
  end_date: string;
  template_name?: string;
}

interface CampaignAnalyticsProps {
  campaignId: string;
  onBack?: () => void;
}

const CampaignAnalytics: React.FC<CampaignAnalyticsProps> = ({
  campaignId,
  onBack,
}) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [dailyOpens, setDailyOpens] = useState<DailyOpens[]>([]);
  const [geoDistribution, setGeoDistribution] = useState<GeoDistribution[]>([]);
  // TopPerformers will be used when we add the backend endpoint
  const [_topPerformers, _setTopPerformers] = useState<TopPerformer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch campaign details and analytics in parallel
      const [campaignRes, statsRes, opensRes, geoRes] = await Promise.all([
        authFetch(`/api/signatures/campaigns/${campaignId}?include_details=true`),
        authFetch(`/api/signatures/campaigns/${campaignId}/stats`),
        authFetch(`/api/signatures/campaigns/${campaignId}/opens-by-day${getDateRangeParams()}`),
        authFetch(`/api/signatures/campaigns/${campaignId}/geo-distribution`),
      ]);

      const [campaignData, statsData, opensData, geoData] = await Promise.all([
        campaignRes.json(),
        statsRes.json(),
        opensRes.json(),
        geoRes.json(),
      ]);

      if (campaignData.success) {
        setCampaign(campaignData.data);
      }

      if (statsData.success) {
        setStats(statsData.data);
      }

      if (opensData.success) {
        setDailyOpens(opensData.data || []);
      }

      if (geoData.success) {
        setGeoDistribution(geoData.data || []);
      }

      // Mock top performers for now (would need backend endpoint)
      _setTopPerformers([]);

    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [campaignId, dateRange]);

  const getDateRangeParams = () => {
    const now = new Date();
    let startDate: Date;

    switch (dateRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        return '';
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return `?start_date=${startDate.toISOString()}&end_date=${now.toISOString()}`;
  };

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  const handleExport = async () => {
    try {
      const response = await authFetch(`/api/signatures/campaigns/${campaignId}/stats`);

      const data = await response.json();
      if (data.success) {
        // Create CSV content
        const csvContent = [
          ['Metric', 'Value'],
          ['Total Opens', stats?.totalOpens || 0],
          ['Unique Opens', stats?.uniqueOpens || 0],
          ['Target Users', stats?.targetUserCount || 0],
          ['Open Rate', `${(stats?.openRate || 0).toFixed(1)}%`],
          ['Desktop Opens', stats?.deviceBreakdown?.desktop || 0],
          ['Mobile Opens', stats?.deviceBreakdown?.mobile || 0],
          ['Tablet Opens', stats?.deviceBreakdown?.tablet || 0],
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campaign-${campaignId}-analytics.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error exporting data:', err);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active': return 'badge-active';
      case 'completed': return 'badge-completed';
      case 'paused': return 'badge-paused';
      case 'draft': return 'badge-draft';
      case 'cancelled': return 'badge-cancelled';
      default: return 'badge-default';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Calculate chart dimensions
  const maxOpens = Math.max(...dailyOpens.map(d => d.totalOpens), 1);

  if (loading) {
    return (
      <div className="analytics-loading">
        <div className="spinner"></div>
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-error">
        <AlertCircle size={48} />
        <h3>Error Loading Analytics</h3>
        <p>{error}</p>
        <button className="btn-primary" onClick={handleRefresh}>
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="campaign-analytics">
      {/* Header */}
      <div className="analytics-header">
        <div className="header-left">
          {onBack && (
            <button className="btn-back" onClick={onBack}>
              <ChevronLeft size={20} />
              Back
            </button>
          )}
          <div className="campaign-info">
            <h1>{campaign?.name || 'Campaign Analytics'}</h1>
            <div className="campaign-meta">
              {campaign && (
                <>
                  <span className={`status-badge ${getStatusBadgeClass(campaign.status)}`}>
                    {campaign.status}
                  </span>
                  <span className="date-range">
                    <Calendar size={14} />
                    {formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <select
            className="date-range-select"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
            Refresh
          </button>
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#dbeafe' }}>
            <MousePointer size={20} style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.totalOpens?.toLocaleString() || 0}</div>
            <div className="stat-label">Total Opens</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#dcfce7' }}>
            <Users size={20} style={{ color: '#22c55e' }} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.uniqueOpens?.toLocaleString() || 0}</div>
            <div className="stat-label">Unique Opens</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#f3e8ff' }}>
            <TrendingUp size={20} style={{ color: '#8b5cf6' }} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{(stats?.openRate || 0).toFixed(1)}%</div>
            <div className="stat-label">Open Rate</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#fef3c7' }}>
            <Mail size={20} style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.targetUserCount?.toLocaleString() || 0}</div>
            <div className="stat-label">Target Users</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Opens Over Time Chart */}
        <div className="chart-card opens-chart">
          <div className="chart-header">
            <h3>
              <BarChart3 size={18} />
              Opens Over Time
            </h3>
          </div>
          <div className="chart-content">
            {dailyOpens.length > 0 ? (
              <div className="bar-chart">
                <div className="chart-bars">
                  {dailyOpens.map((day, index) => (
                    <div key={day.date} className="bar-group">
                      <div
                        className="bar total-bar"
                        style={{
                          height: `${(day.totalOpens / maxOpens) * 100}%`,
                        }}
                        title={`${day.date}: ${day.totalOpens} opens`}
                      />
                      <div
                        className="bar unique-bar"
                        style={{
                          height: `${(day.uniqueOpens / maxOpens) * 100}%`,
                        }}
                        title={`${day.date}: ${day.uniqueOpens} unique opens`}
                      />
                      {index % Math.ceil(dailyOpens.length / 7) === 0 && (
                        <span className="bar-label">
                          {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="legend-color total"></span>
                    <span>Total Opens</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color unique"></span>
                    <span>Unique Opens</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-chart">
                <BarChart3 size={48} />
                <p>No data available for the selected period</p>
              </div>
            )}
          </div>
        </div>

        {/* Device Breakdown */}
        <div className="chart-card device-chart">
          <div className="chart-header">
            <h3>
              <Monitor size={18} />
              Device Breakdown
            </h3>
          </div>
          <div className="chart-content">
            {stats?.deviceBreakdown && (stats.deviceBreakdown.desktop + stats.deviceBreakdown.mobile + stats.deviceBreakdown.tablet + stats.deviceBreakdown.unknown) > 0 ? (
              <div className="device-breakdown">
                <DeviceBar
                  icon={<Monitor size={18} />}
                  label="Desktop"
                  value={stats.deviceBreakdown.desktop}
                  total={stats.totalOpens}
                  color="#3b82f6"
                />
                <DeviceBar
                  icon={<Smartphone size={18} />}
                  label="Mobile"
                  value={stats.deviceBreakdown.mobile}
                  total={stats.totalOpens}
                  color="#22c55e"
                />
                <DeviceBar
                  icon={<Tablet size={18} />}
                  label="Tablet"
                  value={stats.deviceBreakdown.tablet}
                  total={stats.totalOpens}
                  color="#f59e0b"
                />
                <DeviceBar
                  icon={<HelpCircle size={18} />}
                  label="Unknown"
                  value={stats.deviceBreakdown.unknown}
                  total={stats.totalOpens}
                  color="#9ca3af"
                />
              </div>
            ) : (
              <div className="empty-chart">
                <Monitor size={48} />
                <p>No device data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Geographic Distribution */}
      <div className="chart-card geo-chart">
        <div className="chart-header">
          <h3>
            <Globe size={18} />
            Geographic Distribution
          </h3>
        </div>
        <div className="chart-content">
          {geoDistribution.length > 0 ? (
            <div className="geo-table">
              <table>
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Opens</th>
                    <th>Unique</th>
                    <th>Percentage</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {geoDistribution.slice(0, 10).map((geo) => (
                    <tr key={geo.countryCode || 'unknown'}>
                      <td className="country-cell">
                        <span className="country-flag">
                          {geo.countryCode ? getFlagEmoji(geo.countryCode) : '?'}
                        </span>
                        <span>{geo.country}</span>
                      </td>
                      <td>{geo.opens.toLocaleString()}</td>
                      <td>{geo.uniqueOpens.toLocaleString()}</td>
                      <td>{geo.percentage.toFixed(1)}%</td>
                      <td>
                        <div className="geo-bar">
                          <div
                            className="geo-bar-fill"
                            style={{ width: `${geo.percentage}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-chart">
              <Globe size={48} />
              <p>No geographic data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Last Open */}
      {stats?.lastOpenAt && (
        <div className="last-open-info">
          <span>Last open: {formatDateTime(stats.lastOpenAt)}</span>
        </div>
      )}
    </div>
  );
};

// Helper component for device breakdown bars
interface DeviceBarProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  color: string;
}

const DeviceBar: React.FC<DeviceBarProps> = ({ icon, label, value, total, color }) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="device-bar-row">
      <div className="device-info">
        <span className="device-icon" style={{ color }}>{icon}</span>
        <span className="device-label">{label}</span>
      </div>
      <div className="device-bar-container">
        <div
          className="device-bar-fill"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <div className="device-stats">
        <span className="device-value">{value.toLocaleString()}</span>
        <span className="device-percent">{percentage.toFixed(0)}%</span>
      </div>
    </div>
  );
};

// Helper function to convert country code to flag emoji
function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export default CampaignAnalytics;
