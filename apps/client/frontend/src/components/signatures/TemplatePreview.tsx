import React, { useState, useEffect } from 'react';
import { User, ChevronDown, RefreshCw, Eye, Code, AlertCircle, Activity, Info } from 'lucide-react';
import { authFetch } from '../../config/api';
import './TemplatePreview.css';

interface UserData {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  job_title?: string;
}

interface TrackingInfo {
  message: string;
  note: string;
}

interface TemplatePreviewProps {
  htmlContent: string;
  plainTextContent?: string;
  className?: string;
  onRefresh?: () => void;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  htmlContent,
  plainTextContent,
  className,
  onRefresh,
}) => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('sample');
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [renderedText, setRenderedText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'html' | 'text' | 'source'>('html');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [showTrackingTooltip, setShowTrackingTooltip] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (htmlContent) {
      renderPreview();
    }
  }, [htmlContent, selectedUserId]);

  const fetchUsers = async () => {
    try {
      const response = await authFetch('/api/users?per_page=20');
      const data = await response.json();
      if (data.success) {
        setUsers(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const renderPreview = async () => {
    if (!htmlContent) {
      setRenderedHtml('');
      setRenderedText('');
      setTrackingEnabled(false);
      setTrackingInfo(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await authFetch('/api/signatures/templates/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html_content: htmlContent,
          user_id: selectedUserId === 'sample' ? null : selectedUserId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRenderedHtml(data.data.html || htmlContent);
        setRenderedText(data.data.plainText || plainTextContent || '');
        setTrackingEnabled(data.data.trackingEnabled || false);
        setTrackingInfo(data.data.trackingInfo || null);
      } else {
        // If API fails, show original content
        setRenderedHtml(htmlContent);
        setRenderedText(plainTextContent || '');
        setTrackingEnabled(false);
        setTrackingInfo(null);
      }
    } catch (err) {
      console.error('Error rendering preview:', err);
      // Show original content on error
      setRenderedHtml(htmlContent);
      setRenderedText(plainTextContent || '');
      setTrackingEnabled(false);
      setTrackingInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className={`template-preview ${className || ''}`}>
      <div className="preview-header">
        <div className="preview-title">
          <Eye size={16} />
          <span>Preview</span>
        </div>

        <div className="preview-controls">
          <div className="user-selector">
            <button
              className="user-selector-button"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
            >
              <User size={14} />
              <span>
                {selectedUserId === 'sample'
                  ? 'Sample Data'
                  : selectedUser
                    ? `${selectedUser.first_name} ${selectedUser.last_name}`
                    : 'Select User'}
              </span>
              <ChevronDown size={14} />
            </button>

            {showUserDropdown && (
              <div className="user-dropdown">
                <button
                  className={`user-option ${selectedUserId === 'sample' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedUserId('sample');
                    setShowUserDropdown(false);
                  }}
                >
                  <User size={14} />
                  <div className="user-option-info">
                    <span className="user-option-name">Sample Data</span>
                    <span className="user-option-email">Use example values</span>
                  </div>
                </button>

                {users.map(user => (
                  <button
                    key={user.id}
                    className={`user-option ${selectedUserId === user.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setShowUserDropdown(false);
                    }}
                  >
                    <div className="user-avatar-small">
                      {user.first_name?.[0]}{user.last_name?.[0]}
                    </div>
                    <div className="user-option-info">
                      <span className="user-option-name">
                        {user.first_name} {user.last_name}
                      </span>
                      <span className="user-option-email">{user.email}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="refresh-button"
            onClick={() => {
              renderPreview();
              onRefresh?.();
            }}
            disabled={loading}
            title="Refresh preview"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      <div className="preview-tabs">
        <button
          className={`preview-tab ${viewMode === 'html' ? 'active' : ''}`}
          onClick={() => setViewMode('html')}
        >
          <Eye size={14} />
          Visual
        </button>
        <button
          className={`preview-tab ${viewMode === 'text' ? 'active' : ''}`}
          onClick={() => setViewMode('text')}
        >
          Plain Text
        </button>
        <button
          className={`preview-tab ${viewMode === 'source' ? 'active' : ''}`}
          onClick={() => setViewMode('source')}
        >
          <Code size={14} />
          HTML Source
        </button>
      </div>

      {/* Tracking indicator - shown when a real user is selected and tracking is enabled */}
      {trackingEnabled && selectedUserId !== 'sample' && (
        <div className="tracking-indicator">
          <div className="tracking-indicator-content">
            <Activity size={14} className="tracking-icon" />
            <span>Engagement tracking enabled</span>
            <div
              className="tracking-info-trigger"
              onMouseEnter={() => setShowTrackingTooltip(true)}
              onMouseLeave={() => setShowTrackingTooltip(false)}
            >
              <Info size={12} />
              {showTrackingTooltip && trackingInfo && (
                <div className="tracking-tooltip">
                  <p>{trackingInfo.message}</p>
                  <span className="tracking-note">{trackingInfo.note}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="preview-content">
        {error && (
          <div className="preview-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="preview-loading">
            <RefreshCw size={20} className="spinning" />
            <span>Rendering preview...</span>
          </div>
        )}

        {!loading && !error && (
          <>
            {viewMode === 'html' && (
              <div className="preview-html">
                {renderedHtml ? (
                  <div
                    className="signature-render"
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                ) : (
                  <div className="preview-empty">
                    <p>No content to preview</p>
                    <span>Add HTML content to see the preview</span>
                  </div>
                )}
              </div>
            )}

            {viewMode === 'text' && (
              <div className="preview-text">
                {renderedText ? (
                  <pre>{renderedText}</pre>
                ) : (
                  <div className="preview-empty">
                    <p>No plain text content</p>
                    <span>Plain text version will be generated automatically</span>
                  </div>
                )}
              </div>
            )}

            {viewMode === 'source' && (
              <div className="preview-source">
                <pre><code>{renderedHtml || htmlContent || '<!-- No HTML content -->'}</code></pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TemplatePreview;
