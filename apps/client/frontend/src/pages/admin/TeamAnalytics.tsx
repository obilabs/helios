import React, { useEffect, useState } from 'react';
import {
  Mail,
  TrendingUp,
  RefreshCw,
  Users,
  BarChart2,
  Clock,
  AlertCircle,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { apiPath, authFetch } from '../../config/api';
import { EngagementChart } from '../../components/charts/EngagementChart';
import './TeamAnalytics.css';

interface TopPerformer {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  opens: number;
  uniqueOpens: number;
}

interface DepartmentStats {
  department: string;
  opens: number;
  uniqueOpens: number;
  users: number;
  avgOpensPerUser: number;
}

interface DailyStats {
  date: string;
  totalOpens: number;
  uniqueOpens: number;
  activeUsers: number;
}

interface OrganizationStats {
  totalOpens: number;
  uniqueOpens: number;
  activeUsers: number;
  trackedUsers: number;
  topPerformers: TopPerformer[];
  byDepartment: DepartmentStats[];
  dailyStats: DailyStats[];
}

interface DeviceStats {
  desktop: number;
  mobile: number;
  tablet: number;
  total: number;
}

interface PeakHour {
  hour: number;
  day: string;
  avgOpens: number;
}

export const TeamAnalytics: React.FC = () => {
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [deviceStats, setDeviceStats] = useState<DeviceStats | null>(null);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [statsRes, devicesRes, peakRes] = await Promise.all([
        authFetch(apiPath(`/admin/tracking/organization-stats?days=${days}`)),
        authFetch(apiPath(`/admin/tracking/devices?days=${days}`)),
        authFetch(apiPath(`/admin/tracking/peak-hours?days=${days}`)),
      ]);

      if (!statsRes.ok) {
        throw new Error('Failed to fetch organization stats');
      }

      const [statsData, devicesData, peakData] = await Promise.all([
        statsRes.json(),
        devicesRes.json(),
        peakRes.json(),
      ]);

      if (statsData.success) {
        setStats(statsData.data);
      }
      if (devicesData.success) {
        setDeviceStats(devicesData.data);
      }
      if (peakData.success) {
        setPeakHours(peakData.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [days]);

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}${period}`;
  };

  const calculateEngagementRate = () => {
    if (!stats || stats.trackedUsers === 0) return 0;
    return Math.round((stats.activeUsers / stats.trackedUsers) * 100);
  };

  const getDevicePercentage = (device: keyof Omit<DeviceStats, 'total'>) => {
    if (!deviceStats || deviceStats.total === 0) return 0;
    return Math.round((deviceStats[device] / deviceStats.total) * 100);
  };

  if (loading) {
    return (
      <div className="team-analytics-page">
        <div className="page-loading">
          <RefreshCw size={24} className="animate-spin" />
          <span>Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="team-analytics-page">
        <div className="page-error">
          <AlertCircle size={24} />
          <span>{error}</span>
          <button onClick={fetchData} className="retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const chartData = (stats?.dailyStats || []).map(d => ({
    date: d.date,
    opens: d.totalOpens,
    unique: d.uniqueOpens,
  }));

  return (
    <div className="team-analytics-page">
      <div className="page-header">
        <div className="header-content">
          <h1>
            <BarChart2 size={24} />
            Team Email Analytics
          </h1>
          <p className="page-subtitle">Track email engagement across your organization</p>
        </div>
        <div className="header-actions">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="date-range-select"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={fetchData} className="refresh-btn">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Mail size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.totalOpens.toLocaleString() || 0}</span>
            <span className="stat-label">Total Opens</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon unique">
            <TrendingUp size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.uniqueOpens.toLocaleString() || 0}</span>
            <span className="stat-label">Unique Opens</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon active">
            <Users size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.activeUsers || 0}</span>
            <span className="stat-label">Active Users</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon rate">
            <BarChart2 size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{calculateEngagementRate()}%</span>
            <span className="stat-label">Engagement Rate</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="analytics-grid">
        {/* Daily Opens Chart */}
        <div className="analytics-card chart-card">
          <h2>Daily Engagement</h2>
          <EngagementChart data={chartData} height={250} showUnique={true} />
        </div>

        {/* Top Performers */}
        <div className="analytics-card performers-card">
          <h2>Top Performers</h2>
          {stats?.topPerformers && stats.topPerformers.length > 0 ? (
            <div className="performers-list">
              {stats.topPerformers.slice(0, 5).map((performer, index) => (
                <div key={performer.userId} className="performer-item">
                  <span className="performer-rank">{index + 1}</span>
                  <div className="performer-info">
                    <span className="performer-name">{performer.name || performer.email}</span>
                    {performer.department && (
                      <span className="performer-dept">{performer.department}</span>
                    )}
                  </div>
                  <span className="performer-opens">{performer.opens.toLocaleString()} opens</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No engagement data yet</div>
          )}
        </div>

        {/* Device Breakdown */}
        <div className="analytics-card devices-card">
          <h2>Device Breakdown</h2>
          {deviceStats && deviceStats.total > 0 ? (
            <div className="device-breakdown">
              <div className="device-item">
                <Monitor size={18} />
                <div className="device-bar">
                  <div
                    className="device-bar-fill desktop"
                    style={{ width: `${getDevicePercentage('desktop')}%` }}
                  />
                </div>
                <span className="device-label">Desktop</span>
                <span className="device-value">{getDevicePercentage('desktop')}%</span>
              </div>
              <div className="device-item">
                <Smartphone size={18} />
                <div className="device-bar">
                  <div
                    className="device-bar-fill mobile"
                    style={{ width: `${getDevicePercentage('mobile')}%` }}
                  />
                </div>
                <span className="device-label">Mobile</span>
                <span className="device-value">{getDevicePercentage('mobile')}%</span>
              </div>
              <div className="device-item">
                <Tablet size={18} />
                <div className="device-bar">
                  <div
                    className="device-bar-fill tablet"
                    style={{ width: `${getDevicePercentage('tablet')}%` }}
                  />
                </div>
                <span className="device-label">Tablet</span>
                <span className="device-value">{getDevicePercentage('tablet')}%</span>
              </div>
            </div>
          ) : (
            <div className="empty-state">No device data yet</div>
          )}
        </div>

        {/* Peak Hours */}
        <div className="analytics-card peak-card">
          <h2>Peak Engagement Hours</h2>
          {peakHours.length > 0 ? (
            <div className="peak-hours-list">
              {peakHours.slice(0, 5).map((peak) => (
                <div key={`${peak.day}-${peak.hour}`} className="peak-item">
                  <Clock size={16} />
                  <span className="peak-time">{peak.day} {formatHour(peak.hour)}</span>
                  <span className="peak-avg">{peak.avgOpens} avg opens</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No peak hour data yet</div>
          )}
        </div>

        {/* Department Breakdown */}
        <div className="analytics-card departments-card">
          <h2>By Department</h2>
          {stats?.byDepartment && stats.byDepartment.length > 0 ? (
            <div className="departments-list">
              <div className="department-header">
                <span>Department</span>
                <span>Opens</span>
                <span>Users</span>
                <span>Avg/User</span>
              </div>
              {stats.byDepartment.slice(0, 10).map((dept) => (
                <div key={dept.department || 'unassigned'} className="department-item">
                  <span className="dept-name">{dept.department || 'Unassigned'}</span>
                  <span className="dept-opens">{dept.opens.toLocaleString()}</span>
                  <span className="dept-users">{dept.users}</span>
                  <span className="dept-avg">{dept.avgOpensPerUser.toFixed(1)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No department data yet</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamAnalytics;
