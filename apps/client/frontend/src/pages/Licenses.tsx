import React, { useState, useEffect } from 'react';
import { Key, Building2, RefreshCw, Users, ChevronRight, X, AlertCircle } from 'lucide-react';
import './Licenses.css';

interface License {
  id: string;
  provider: 'google' | 'microsoft';
  skuId: string;
  displayName: string;
  description?: string;
  totalUnits: number;
  consumedUnits: number;
  availableUnits: number;
  features?: string[];
  productId?: string;
}

interface LicenseUser {
  email: string;
  userId: string;
}

const Licenses: React.FC = () => {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'google' | 'microsoft'>('all');
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [licenseUsers, setLicenseUsers] = useState<LicenseUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [summary, setSummary] = useState({ total: 0, google: 0, microsoft: 0 });

  const fetchLicenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/organization/licenses', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setLicenses(data.data.licenses || []);
        setSummary({
          total: data.data.summary?.totalLicenses || 0,
          google: data.data.summary?.googleLicenses || 0,
          microsoft: data.data.summary?.microsoftLicenses || 0,
        });
      } else {
        setError(data.error?.message || 'Failed to fetch licenses');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const fetchLicenseUsers = async (license: License) => {
    setLoadingUsers(true);
    try {
      // Extract productId from the license ID (format: gw-productId-skuId)
      const parts = license.id.split('-');
      const productId = parts.length >= 3 ? parts.slice(1, -1).join('-') : 'Google-Apps';

      const response = await fetch(`/api/v1/organization/licenses/${productId}/${license.skuId}/users`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setLicenseUsers(data.data.users || []);
      } else {
        setLicenseUsers([]);
      }
    } catch (err) {
      setLicenseUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  useEffect(() => {
    if (selectedLicense && selectedLicense.provider === 'google') {
      fetchLicenseUsers(selectedLicense);
    }
  }, [selectedLicense]);

  const filteredLicenses = licenses.filter(lic =>
    filter === 'all' || lic.provider === filter
  );

  const getUsagePercentage = (consumed: number, total: number) => {
    if (total <= 0 || consumed < 0) return null;
    return Math.min(100, Math.round((consumed / total) * 100));
  };

  const getUsageColor = (percentage: number | null) => {
    if (percentage === null) return 'var(--color-text-muted)';
    if (percentage >= 90) return 'var(--color-error)';
    if (percentage >= 75) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  const formatCount = (count: number) => {
    if (count === -1) return 'N/A';
    return count.toLocaleString();
  };

  return (
    <div className="licenses-page">
      <div className="page-header">
        <div className="header-content">
          <Key className="header-icon" size={24} />
          <div>
            <h1>Licenses</h1>
            <p className="header-subtitle">
              Manage license inventory across Google Workspace and Microsoft 365
            </p>
          </div>
        </div>
        <button className="btn-secondary" onClick={fetchLicenses} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="license-summary">
        <div className="summary-card">
          <div className="summary-icon total">
            <Key size={20} />
          </div>
          <div className="summary-content">
            <span className="summary-value">{summary.total}</span>
            <span className="summary-label">Total License Types</span>
          </div>
        </div>
        <div className="summary-card" onClick={() => setFilter('google')}>
          <div className="summary-icon google">
            <Building2 size={20} />
          </div>
          <div className="summary-content">
            <span className="summary-value">{summary.google}</span>
            <span className="summary-label">Google Workspace</span>
          </div>
        </div>
        <div className="summary-card" onClick={() => setFilter('microsoft')}>
          <div className="summary-icon microsoft">
            <Building2 size={20} />
          </div>
          <div className="summary-content">
            <span className="summary-value">{summary.microsoft}</span>
            <span className="summary-label">Microsoft 365</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Providers
        </button>
        <button
          className={`filter-tab ${filter === 'google' ? 'active' : ''}`}
          onClick={() => setFilter('google')}
        >
          Google Workspace
        </button>
        <button
          className={`filter-tab ${filter === 'microsoft' ? 'active' : ''}`}
          onClick={() => setFilter('microsoft')}
        >
          Microsoft 365
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="loading-state">
          <RefreshCw size={24} className="spinning" />
          <p>Loading licenses...</p>
        </div>
      ) : (
        /* License Table */
        <div className="licenses-table-container">
          <table className="licenses-table">
            <thead>
              <tr>
                <th>License</th>
                <th>Provider</th>
                <th>Assigned</th>
                <th>Total</th>
                <th>Usage</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLicenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <Key size={32} />
                    <p>No licenses found</p>
                    <span>Configure Google Workspace or Microsoft 365 to see licenses</span>
                  </td>
                </tr>
              ) : (
                filteredLicenses.map((license) => {
                  const percentage = getUsagePercentage(license.consumedUnits, license.totalUnits);
                  return (
                    <tr
                      key={license.id}
                      className={selectedLicense?.id === license.id ? 'selected' : ''}
                      onClick={() => setSelectedLicense(license)}
                    >
                      <td>
                        <div className="license-name">
                          <strong>{license.displayName}</strong>
                          {license.description && (
                            <span className="license-description">{license.description}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`provider-badge ${license.provider}`}>
                          {license.provider === 'google' ? 'Google' : 'Microsoft'}
                        </span>
                      </td>
                      <td className="count-cell">
                        {formatCount(license.consumedUnits)}
                      </td>
                      <td className="count-cell">
                        {formatCount(license.totalUnits)}
                      </td>
                      <td>
                        {percentage !== null ? (
                          <div className="usage-bar-container">
                            <div
                              className="usage-bar"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: getUsageColor(percentage)
                              }}
                            />
                            <span className="usage-text">{percentage}%</span>
                          </div>
                        ) : (
                          <span className="usage-na">
                            {license.consumedUnits >= 0 ? `${license.consumedUnits} users` : 'N/A'}
                          </span>
                        )}
                      </td>
                      <td>
                        <ChevronRight size={16} className="row-chevron" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* License Users Slide-out */}
      {selectedLicense && (
        <div className="license-slideout">
          <div className="slideout-header">
            <div>
              <h2>{selectedLicense.displayName}</h2>
              <span className={`provider-badge ${selectedLicense.provider}`}>
                {selectedLicense.provider === 'google' ? 'Google Workspace' : 'Microsoft 365'}
              </span>
            </div>
            <button className="close-btn" onClick={() => setSelectedLicense(null)}>
              <X size={20} />
            </button>
          </div>

          <div className="slideout-content">
            <div className="license-stats">
              <div className="stat-item">
                <span className="stat-label">Assigned</span>
                <span className="stat-value">{formatCount(selectedLicense.consumedUnits)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total</span>
                <span className="stat-value">{formatCount(selectedLicense.totalUnits)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Available</span>
                <span className="stat-value">{formatCount(selectedLicense.availableUnits)}</span>
              </div>
            </div>

            <div className="users-section">
              <h3>
                <Users size={16} />
                Assigned Users
              </h3>

              {loadingUsers ? (
                <div className="loading-users">
                  <RefreshCw size={16} className="spinning" />
                  Loading users...
                </div>
              ) : licenseUsers.length === 0 ? (
                <div className="no-users">
                  {selectedLicense.provider === 'google'
                    ? 'No users found or Licensing API scope not delegated'
                    : 'User list not available for Microsoft licenses'}
                </div>
              ) : (
                <ul className="users-list">
                  {licenseUsers.map((user) => (
                    <li key={user.email}>
                      <Users size={14} />
                      {user.email}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Licenses;
