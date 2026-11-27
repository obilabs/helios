import { useState, useEffect } from 'react';
import { Globe, AlertTriangle, MapPin, Users, RefreshCw, Loader2 } from 'lucide-react';
import { authFetch, apiPath } from '../../config/api';
import { MAP_WIDTH, MAP_HEIGHT, latLongToSvg } from './loginMapProjection';
import { WORLD_OUTLINE_PATH } from './worldOutline';
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

interface LocationStatus {
  available: boolean;
  reason?: 'not_downloaded' | 'downloads_disabled' | 'invalid';
  attribution: { text: string; url: string };
}

interface LoginStats {
  totalLogins7d: number;
  suspiciousLogins7d: number;
  uniqueCountries7d: number;
  logins24h: number;
  locations?: LocationStatus;
}

/** Why locations are missing, in one short line. */
function locationsUnavailableText(reason: LocationStatus['reason']): string {
  switch (reason) {
    case 'downloads_disabled':
      return 'Locations unavailable: the location database download is turned off and no database file is in place.';
    case 'invalid':
      return 'Locations unavailable: the location database file could not be read.';
    default:
      return 'Locations unavailable: the location database has not been downloaded yet.';
  }
}

export function LoginMapWidget() {
  const [data, setData] = useState<LoginMapData | null>(null);
  const [stats, setStats] = useState<LoginStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null);

  // Reads stored login data only. The backend pulls login events from Google
  // on its sync schedule (at most hourly), at start-up and when Google is
  // connected; opening Home never calls Google. The refresh icon pulls now.
  useEffect(() => {
    fetchData();
  }, []);

  /** Loads stored login data. */
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [mapResponse, statsResponse] = await Promise.all([
        authFetch(apiPath('/login-activity/map?days=7')),
        authFetch(apiPath('/login-activity/stats'))
      ]);

      // A failed request used to fall through silently, leaving the empty state
      // that tells the admin to connect Google Workspace. Say what failed instead.
      if (!mapResponse.ok || !statsResponse.ok) {
        const failed = !mapResponse.ok ? mapResponse : statsResponse;
        setError(`Could not load login data (HTTP ${failed.status}).`);
      }

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

  const hasLocations = !!data && data.countries.length > 0;
  // Logins are stored and counted even when no location could be found for them.
  const hasData = hasLocations || (stats?.totalLogins7d ?? 0) > 0;
  const locations = stats?.locations;
  const hasSuspicious = stats && stats.suspiciousLogins7d > 0;

  return (
    <div className="login-map-widget">
      <div className="login-map-header">
        <div className="login-map-title">
          <Globe size={16} />
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
          {hasLocations && data && (
          <div className="login-map-container">
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              className="world-map"
              role="img"
              aria-label="World map of sign-in locations"
            >
              {/* Land outline, Natural Earth 1:110m, in the same frame as the markers */}
              <path className="map-land" d={WORLD_OUTLINE_PATH} />
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
          )}

          {locations && !locations.available && (
            <p className="login-map-notice">{locationsUnavailableText(locations.reason)}</p>
          )}

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

          {hasLocations && locations && (
            <p className="login-map-attribution">
              <a href={locations.attribution.url} target="_blank" rel="noopener noreferrer">
                {locations.attribution.text}
              </a>
            </p>
          )}
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
