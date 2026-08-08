import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  ChevronDown,
  RefreshCw,
  Eye,
  Code,
  FileText,
  Activity,
  Info,
  Search,
  CheckCircle
} from 'lucide-react';
import { authFetch } from '../../config/api';
import './PreviewModal.css';

interface UserData {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  job_title?: string;
  department?: string;
  work_phone?: string;
  mobile_phone?: string;
}

interface TrackingInfo {
  message: string;
  note: string;
}

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  htmlContent: string;
  plainTextContent?: string;
  templateName?: string;
}

type ViewMode = 'visual' | 'text' | 'source';

const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  onClose,
  htmlContent,
  plainTextContent,
  templateName = 'Signature Template',
}) => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('sample');
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [renderedText, setRenderedText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [showTrackingTooltip, setShowTrackingTooltip] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && htmlContent) {
      renderPreview();
    }
  }, [isOpen, htmlContent, selectedUserId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-selector')) {
        setShowUserDropdown(false);
      }
    };
    if (showUserDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showUserDropdown]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await authFetch('/api/users?per_page=50');
      const data = await response.json();
      if (data.success) {
        setUsers(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
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

  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      user.first_name?.toLowerCase().includes(query) ||
      user.last_name?.toLowerCase().includes(query) ||
      user.job_title?.toLowerCase().includes(query) ||
      user.department?.toLowerCase().includes(query)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-modal-header">
          <div className="preview-modal-title">
            <Eye size={20} />
            <div>
              <h2>Preview Signature</h2>
              <span className="preview-template-name">{templateName}</span>
            </div>
          </div>
          <button className="preview-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="preview-modal-toolbar">
          <div className="user-selector">
            <button
              className="user-selector-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowUserDropdown(!showUserDropdown);
              }}
            >
              <User size={16} />
              <span className="user-selector-label">Preview as:</span>
              <span className="user-selector-value">
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
                <div className="user-dropdown-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="user-dropdown-list">
                  <button
                    className={`user-option ${selectedUserId === 'sample' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedUserId('sample');
                      setShowUserDropdown(false);
                      setSearchQuery('');
                    }}
                  >
                    <div className="user-avatar-sample">
                      <User size={14} />
                    </div>
                    <div className="user-option-info">
                      <span className="user-option-name">Sample Data</span>
                      <span className="user-option-email">Use example placeholder values</span>
                    </div>
                    {selectedUserId === 'sample' && <CheckCircle size={16} className="user-selected-icon" />}
                  </button>

                  {loadingUsers ? (
                    <div className="user-dropdown-loading">
                      <RefreshCw size={16} className="spinning" />
                      <span>Loading users...</span>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="user-dropdown-empty">
                      <span>No users found</span>
                    </div>
                  ) : (
                    filteredUsers.map(user => (
                      <button
                        key={user.id}
                        className={`user-option ${selectedUserId === user.id ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedUserId(user.id);
                          setShowUserDropdown(false);
                          setSearchQuery('');
                        }}
                      >
                        <div className="user-avatar">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </div>
                        <div className="user-option-info">
                          <span className="user-option-name">
                            {user.first_name} {user.last_name}
                          </span>
                          <span className="user-option-email">
                            {user.email}
                            {user.job_title && ` - ${user.job_title}`}
                          </span>
                        </div>
                        {selectedUserId === user.id && <CheckCircle size={16} className="user-selected-icon" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            className="refresh-preview-button"
            onClick={renderPreview}
            disabled={loading}
            title="Refresh preview"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="preview-view-tabs">
          <button
            className={`view-tab ${viewMode === 'visual' ? 'active' : ''}`}
            onClick={() => setViewMode('visual')}
          >
            <Eye size={14} />
            Visual
          </button>
          <button
            className={`view-tab ${viewMode === 'text' ? 'active' : ''}`}
            onClick={() => setViewMode('text')}
          >
            <FileText size={14} />
            Plain Text
          </button>
          <button
            className={`view-tab ${viewMode === 'source' ? 'active' : ''}`}
            onClick={() => setViewMode('source')}
          >
            <Code size={14} />
            HTML Source
          </button>
        </div>

        {/* Tracking indicator */}
        {trackingEnabled && selectedUserId !== 'sample' && (
          <div className="preview-tracking-indicator">
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
        )}

        <div className="preview-modal-content">
          {loading ? (
            <div className="preview-loading">
              <RefreshCw size={24} className="spinning" />
              <span>Rendering preview...</span>
            </div>
          ) : (
            <>
              {viewMode === 'visual' && (
                <div className="preview-visual">
                  {renderedHtml ? (
                    <div className="preview-email-container">
                      <div className="preview-email-header">
                        <span className="preview-email-label">Email Signature Preview</span>
                        {selectedUserId !== 'sample' && selectedUser && (
                          <span className="preview-email-user">
                            for {selectedUser.first_name} {selectedUser.last_name}
                          </span>
                        )}
                      </div>
                      <div
                        className="preview-signature-render"
                        dangerouslySetInnerHTML={{ __html: renderedHtml }}
                      />
                    </div>
                  ) : (
                    <div className="preview-empty">
                      <Eye size={32} />
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
                      <FileText size={32} />
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

        <div className="preview-modal-footer">
          <div className="preview-modal-info">
            {selectedUserId !== 'sample' && selectedUser && (
              <span>
                Viewing signature for <strong>{selectedUser.first_name} {selectedUser.last_name}</strong> ({selectedUser.email})
              </span>
            )}
            {selectedUserId === 'sample' && (
              <span>Viewing with sample placeholder data</span>
            )}
          </div>
          <button className="preview-modal-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
