import { useState, useEffect } from 'react';
import { Globe, AlertTriangle, MapPin, Users, RefreshCw, Loader2 } from 'lucide-react';
import { authFetch, apiPath } from '../../config/api';
import './LoginMapWidget.css';

interface CountryData {
  code: string;
  name: string;
  loginCount: number;
  uniqueUsers: number;
  suspiciousCount: number;
  lastLogin: string;
  latitude: number;
  longitude: number;
}

interface LoginMapData {
  countries: CountryData[];
  period: {
    start: string;
    end: string;
  };
}

interface LoginStats {
  totalLogins7d: number;
  suspiciousLogins7d: number;
  uniqueCountries7d: number;
  logins24h: number;
}

export function LoginMapWidget() {
  const [data, setData] = useState<LoginMapData | null>(null);
  const [stats, setStats] = useState<LoginStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [mapResponse, statsResponse] = await Promise.all([
        authFetch(apiPath('/login-activity/map?days=7')),
        authFetch(apiPath('/login-activity/stats'))
      ]);

      if (mapResponse.ok) {
        const mapData = await mapResponse.json();
        if (mapData.success) {
          setData(mapData.data);
        }
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.success) {
          setStats(statsData.data);
        }
      }
    } catch (err: any) {
      setError('Failed to load login data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await authFetch(apiPath('/login-activity/sync'), {
        method: 'POST'
      });
      if (response.ok) {
        // Refresh data after sync
        await fetchData();
      }
    } catch (err) {
      // Ignore errors
    } finally {
      setIsSyncing(false);
    }
  };

  // Convert lat/long to SVG coordinates (simple equirectangular projection)
  const latLongToSvg = (lat: number, lng: number): { x: number; y: number } => {
    // SVG viewBox is 0 0 1000 500
    const x = ((lng + 180) / 360) * 1000;
    const y = ((90 - lat) / 180) * 500;
    return { x, y };
  };

  // Get marker size based on login count
  const getMarkerSize = (count: number): number => {
    if (count > 100) return 12;
    if (count > 50) return 10;
    if (count > 10) return 8;
    return 6;
  };

  if (isLoading) {
    return (
      <div className="login-map-widget loading">
        <Loader2 className="spin" size={24} />
        <span>Loading login activity...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="login-map-widget error">
        <AlertTriangle size={24} />
        <span>{error}</span>
        <button onClick={fetchData}>Retry</button>
      </div>
    );
  }

  const hasData = data && data.countries.length > 0;
  const hasSuspicious = stats && stats.suspiciousLogins7d > 0;

  return (
    <div className="login-map-widget">
      <div className="login-map-header">
        <div className="login-map-title">
          <Globe size={18} />
          <span>Login Locations</span>
          {hasSuspicious && (
            <span className="suspicious-badge">
              <AlertTriangle size={12} />
              {stats.suspiciousLogins7d}
            </span>
          )}
        </div>
        <button
          className="sync-btn"
          onClick={handleSync}
          disabled={isSyncing}
          title="Sync login activity"
        >
          {isSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {hasData ? (
        <>
          <div className="login-map-container">
            <svg viewBox="0 0 1000 500" className="world-map">
              {/* Simple world map outline - continents */}
              <path
                className="map-land"
                d="M150,180 L170,160 L200,150 L230,160 L250,180 L260,220 L240,260 L200,280 L160,260 L140,220 Z
                   M280,100 L380,80 L480,100 L520,150 L500,220 L450,280 L380,300 L300,280 L260,220 L270,150 Z
                   M540,120 L620,100 L700,120 L750,180 L740,250 L700,300 L620,320 L560,300 L530,240 L540,180 Z
                   M770,180 L850,160 L920,200 L940,280 L900,340 L840,360 L780,340 L760,280 L770,220 Z
                   M200,320 L280,300 L340,320 L360,380 L320,440 L240,460 L180,420 L180,360 Z
                   M620,340 L680,320 L740,340 L760,400 L720,450 L660,460 L620,420 L620,380 Z"
              />
              {/* Country markers */}
              {data.countries.map((country) => {
                const pos = latLongToSvg(country.latitude, country.longitude);
                const size = getMarkerSize(country.loginCount);
                const isSuspicious = country.suspiciousCount > 0;

                return (
                  <g
                    key={country.code}
                    className={`country-marker ${isSuspicious ? 'suspicious' : ''} ${selectedCountry?.code === country.code ? 'selected' : ''}`}
                    onClick={() => setSelectedCountry(selectedCountry?.code === country.code ? null : country)}
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={size}
                      className="marker-circle"
                    />
                    {isSuspicious && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={size + 4}
                        className="marker-alert-ring"
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {selectedCountry && (
            <div className="country-detail">
              <div className="country-name">
                <MapPin size={14} />
                {selectedCountry.name}
              </div>
              <div className="country-stats">
                <span><Users size={12} /> {selectedCountry.uniqueUsers} users</span>
                <span>{selectedCountry.loginCount} logins</span>
                {selectedCountry.suspiciousCount > 0 && (
                  <span className="suspicious">
                    <AlertTriangle size={12} /> {selectedCountry.suspiciousCount} suspicious
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="login-map-stats">
            <div className="stat">
              <span className="stat-value">{stats?.logins24h || 0}</span>
              <span className="stat-label">24h logins</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats?.uniqueCountries7d || 0}</span>
              <span className="stat-label">Countries</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats?.totalLogins7d || 0}</span>
              <span className="stat-label">7d total</span>
            </div>
          </div>
        </>
      ) : (
        <div className="login-map-empty">
          <Globe size={32} className="empty-icon" />
          <p>No login data available</p>
          <p className="empty-hint">
            Connect Google Workspace and sync to see login locations.
          </p>
          <button className="sync-btn-large" onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            Sync now
          </button>
        </div>
      )}
    </div>
  );
}

export default LoginMapWidget;
