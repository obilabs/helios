import React, { useState } from 'react';
import { Mail, Search, Trash2, AlertTriangle, CheckCircle, Clock, User } from 'lucide-react';
import './EmailSecurity.css';
import { authFetch } from '../config/api';

interface MessageSearchResult {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  recipients: number;
}

interface DeletionResult {
  success: boolean;
  deletedCount: number;
  failedCount: number;
  affectedUsers: string[];
}

export const EmailSecurity: React.FC = () => {
  const [searchBy, setSearchBy] = useState<'sender' | 'messageId' | 'subject'>('sender');
  const [searchValue, setSearchValue] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MessageSearchResult[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletionResult, setDeletionResult] = useState<DeletionResult | null>(null);

  const handleSearch = async () => {
    setSearching(true);
    setSearchResults([]);
    setDeletionResult(null);

    try {
      const params = new URLSearchParams({
        searchBy,
        value: searchValue,
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo })
      });

      const response = await authFetch(`/api/v1/email-security/search?${params}`);

      const data = await response.json();

      if (data.success) {
        setSearchResults(data.data.messages || []);
      } else {
        alert(`Search failed: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Search error:', error);
      alert(`Search failed: ${error.message}`);
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteMessages = async () => {
    if (!deletionReason.trim()) {
      alert('Please provide a reason for deletion');
      return;
    }

    setDeleting(true);

    try {
      const response = await authFetch('/api/v1/email-security/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchBy,
          value: searchValue,
          reason: deletionReason,
          dateFrom,
          dateTo
        })
      });

      const data = await response.json();

      if (data.success) {
        setDeletionResult(data.data);
        setShowConfirmation(false);
        setSearchResults([]);
        setSearchValue('');
        setDeletionReason('');
      } else {
        alert(`Deletion failed: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Deletion error:', error);
      alert(`Deletion failed: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="email-security-page">
      <div className="page-header">
        <div className="page-title-section">
          <Mail size={24} className="page-icon" />
          <div>
            <h1>Mail Search</h1>
            <p className="page-subtitle">Search, audit, and remediate emails across all mailboxes</p>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Search Form */}
        <div className="security-card">
          <div className="card-header">
            <Search size={20} />
            <h2>Message Search</h2>
          </div>

          <div className="search-form">
            <div className="form-row">
              <div className="form-group">
                <label>Search By</label>
                <select
                  value={searchBy}
                  onChange={(e) => setSearchBy(e.target.value as any)}
                  className="form-select"
                >
                  <option value="sender">Sender Email</option>
                  <option value="messageId">Message ID</option>
                  <option value="subject">Subject (regex)</option>
                </select>
              </div>

              <div className="form-group flex-2">
                <label>
                  {searchBy === 'sender' && 'Sender Email Address'}
                  {searchBy === 'messageId' && 'Message ID'}
                  {searchBy === 'subject' && 'Subject Pattern (regex)'}
                </label>
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={
                    searchBy === 'sender' ? 'spammer@malicious.com' :
                    searchBy === 'messageId' ? '<CABcd123xyz@mail.gmail.com>' :
                    'phishing.*urgent'
                  }
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date From (optional)</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Date To (optional)</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                className="btn-primary"
                onClick={handleSearch}
                disabled={!searchValue.trim() || searching}
              >
                <Search size={16} />
                {searching ? 'Searching...' : 'Search Messages'}
              </button>

              {searchResults.length > 0 && (
                <button
                  className="btn-danger"
                  onClick={() => setShowConfirmation(true)}
                >
                  <Trash2 size={16} />
                  Delete from All Mailboxes
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="security-card">
            <div className="card-header">
              <AlertTriangle size={20} className="warning-icon" />
              <h2>Found {searchResults.length} matching messages</h2>
            </div>

            <div className="results-table">
              <table>
                <thead>
                  <tr>
                    <th>Message ID</th>
                    <th>From</th>
                    <th>Subject</th>
                    <th>Date</th>
                    <th>Recipients</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((msg) => (
                    <tr key={msg.messageId}>
                      <td><code>{msg.messageId}</code></td>
                      <td>{msg.from}</td>
                      <td>{msg.subject}</td>
                      <td>{new Date(msg.date).toLocaleString()}</td>
                      <td>
                        <span className="recipients-badge">
                          <User size={14} />
                          {msg.recipients}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Deletion Success */}
        {deletionResult && (
          <div className="security-card success-card">
            <div className="card-header">
              <CheckCircle size={20} />
              <h2>Deletion Complete</h2>
            </div>

            <div className="deletion-result">
              <div className="result-stats">
                <div className="stat-item success">
                  <div className="stat-value">{deletionResult.deletedCount}</div>
                  <div className="stat-label">Messages Deleted</div>
                </div>

                {deletionResult.failedCount > 0 && (
                  <div className="stat-item error">
                    <div className="stat-value">{deletionResult.failedCount}</div>
                    <div className="stat-label">Failed</div>
                  </div>
                )}

                <div className="stat-item">
                  <div className="stat-value">{deletionResult.affectedUsers.length}</div>
                  <div className="stat-label">Users Affected</div>
                </div>
              </div>

              <div className="affected-users">
                <h3>Affected Users:</h3>
                <div className="user-list">
                  {deletionResult.affectedUsers.slice(0, 10).map((email) => (
                    <div key={email} className="user-email">{email}</div>
                  ))}
                  {deletionResult.affectedUsers.length > 10 && (
                    <div className="user-email more">
                      +{deletionResult.affectedUsers.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="security-card info-card">
          <div className="card-header">
            <AlertTriangle size={20} />
            <h2>Important Information</h2>
          </div>

          <div className="info-content">
            <p><strong>This is a powerful security tool.</strong> Use it to remove phishing, spam, or malicious emails from all user mailboxes organization-wide.</p>

            <h3>Common Use Cases:</h3>
            <ul>
              <li><strong>Phishing Attacks:</strong> Search by sender to remove all messages from a malicious domain</li>
              <li><strong>Spam Campaigns:</strong> Use subject regex to find and delete similar spam messages</li>
              <li><strong>Accidental Sends:</strong> Use Message ID to delete a specific email that was sent by mistake</li>
              <li><strong>Security Incidents:</strong> Quickly remove compromised content organization-wide</li>
            </ul>

            <h3>How It Works:</h3>
            <ul>
              <li>Messages are deleted permanently from Gmail trash (cannot be recovered)</li>
              <li>All deletions are logged for audit purposes</li>
              <li>Requires Google Workspace admin privileges via service account</li>
              <li>Operation is performed via Google Workspace Admin API</li>
            </ul>

            <div className="warning-box">
              <AlertTriangle size={16} />
              <span><strong>Warning:</strong> Deleted messages cannot be recovered. Always verify search results before deletion.</span>
            </div>
          </div>
        </div>

        {/* Action History */}
        <div className="security-card">
          <div className="card-header">
            <Clock size={20} />
            <h2>Recent Actions</h2>
          </div>

          <div className="history-list">
            <div className="empty-state">
              <Clock size={32} className="empty-icon" />
              <p>No recent email security actions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="modal-overlay" onClick={() => setShowConfirmation(false)}>
          <div className="modal-content confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Message Deletion</h2>
            </div>

            <div className="modal-body">
              <div className="warning-box large">
                <AlertTriangle size={24} />
                <div>
                  <p><strong>You are about to delete messages from ALL mailboxes</strong></p>
                  <p>This action cannot be undone. Messages will be permanently removed.</p>
                </div>
              </div>

              <div className="deletion-summary">
                <p><strong>Search Criteria:</strong></p>
                <ul>
                  <li>{searchBy === 'sender' && `Sender: ${searchValue}`}</li>
                  <li>{searchBy === 'messageId' && `Message ID: ${searchValue}`}</li>
                  <li>{searchBy === 'subject' && `Subject pattern: ${searchValue}`}</li>
                  {dateFrom && <li>From: {dateFrom}</li>}
                  {dateTo && <li>To: {dateTo}</li>}
                  <li className="highlight">Found: {searchResults.length} messages</li>
                </ul>
              </div>

              <div className="form-group">
                <label>Reason for deletion (required for audit log)</label>
                <textarea
                  value={deletionReason}
                  onChange={(e) => setDeletionReason(e.target.value)}
                  placeholder="e.g., Phishing attack from compromised account, Malicious attachment detected, etc."
                  className="form-textarea"
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowConfirmation(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteMessages}
                disabled={!deletionReason.trim() || deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Messages'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailSecurity;
