import React, { useState, useEffect } from 'react';
import {
  X, User, Tag, Send,
  UserPlus, UserMinus, AlertCircle,
  MoreVertical, Edit
} from 'lucide-react';
import { helpdeskService, type Ticket, type TicketNote, type PresenceData } from '../../services/helpdesk.service';
import PresenceIndicator from './PresenceIndicator';
import './TicketViewer.css';

interface TicketViewerProps {
  ticket: Ticket;
  onClose: () => void;
  onUpdate: () => void;
}

const TicketViewer: React.FC<TicketViewerProps> = ({ ticket, onClose, onUpdate }) => {
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [_loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const userData = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    loadTicketData();
  }, [ticket.id]);

  const loadTicketData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [notesData, presenceData] = await Promise.all([
        helpdeskService.getTicketNotes(ticket.id),
        helpdeskService.getTicketPresence(ticket.id),
      ]);

      setNotes(notesData);
      setPresence(presenceData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load ticket data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    try {
      await helpdeskService.assignTicket(ticket.id);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to assign ticket');
    }
  };

  const handleUnassign = async () => {
    try {
      await helpdeskService.unassignTicket(ticket.id);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to unassign ticket');
    }
  };

  const handleStatusChange = async (status: string) => {
    try {
      await helpdeskService.updateTicketStatus(ticket.id, status);
      setShowStatusMenu(false);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update status');
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;

    try {
      const newNote = await helpdeskService.addNote(ticket.id, noteContent);
      setNotes([newNote, ...notes]);
      setNoteContent('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add note');
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      new: { color: 'status-new', label: 'New' },
      in_progress: { color: 'status-progress', label: 'In Progress' },
      pending: { color: 'status-pending', label: 'Pending' },
      resolved: { color: 'status-resolved', label: 'Resolved' },
      reopened: { color: 'status-reopened', label: 'Reopened' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || { color: '', label: status };
    return <span className={`status-badge ${config.color}`}>{config.label}</span>;
  };

  const getPriorityBadge = (priority: string) => {
    return <span className={`priority-badge priority-${priority}`}>{priority.toUpperCase()}</span>;
  };

  return (
    <div className="ticket-viewer">
      <div className="viewer-header">
        <div className="viewer-title">
          <h2>{ticket.subject || 'No subject'}</h2>
          {presence && <PresenceIndicator presence={presence} />}
        </div>
        <button className="close-button" onClick={onClose}>
          <X />
        </button>
      </div>

      {error && (
        <div className="viewer-error">
          <AlertCircle className="icon" />
          <span>{error}</span>
        </div>
      )}

      <div className="viewer-content">
        <div className="ticket-details">
          <div className="detail-row">
            <span className="detail-label">Status:</span>
            <div className="detail-value">
              {getStatusBadge(ticket.status)}
              <button
                className="status-menu-trigger"
                onClick={() => setShowStatusMenu(!showStatusMenu)}
              >
                <MoreVertical className="icon" />
              </button>
              {showStatusMenu && (
                <div className="status-menu">
                  <button onClick={() => handleStatusChange('new')}>New</button>
                  <button onClick={() => handleStatusChange('in_progress')}>In Progress</button>
                  <button onClick={() => handleStatusChange('pending')}>Pending</button>
                  <button onClick={() => handleStatusChange('resolved')}>Resolved</button>
                  <button onClick={() => handleStatusChange('reopened')}>Reopened</button>
                </div>
              )}
            </div>
          </div>

          <div className="detail-row">
            <span className="detail-label">Priority:</span>
            <div className="detail-value">{getPriorityBadge(ticket.priority)}</div>
          </div>

          <div className="detail-row">
            <span className="detail-label">From:</span>
            <div className="detail-value">
              <User className="icon" />
              <span>{ticket.sender_name || ticket.sender_email}</span>
            </div>
          </div>

          <div className="detail-row">
            <span className="detail-label">Group:</span>
            <div className="detail-value">{ticket.group_email}</div>
          </div>

          <div className="detail-row">
            <span className="detail-label">Created:</span>
            <div className="detail-value">{formatDateTime(ticket.created_at)}</div>
          </div>

          <div className="detail-row">
            <span className="detail-label">Assigned To:</span>
            <div className="detail-value">
              {ticket.assigned_to_name ? (
                <>
                  <User className="icon" />
                  <span>{ticket.assigned_to_name}</span>
                  {ticket.assigned_to === userData.id && (
                    <button className="btn-small" onClick={handleUnassign}>
                      <UserMinus className="icon" />
                      Unassign
                    </button>
                  )}
                </>
              ) : (
                <button className="btn-small btn-primary" onClick={handleAssign}>
                  <UserPlus className="icon" />
                  Take Ticket
                </button>
              )}
            </div>
          </div>

          {ticket.tags && ticket.tags.length > 0 && (
            <div className="detail-row">
              <span className="detail-label">Tags:</span>
              <div className="detail-value">
                <div className="tags-list">
                  {ticket.tags.map((tag, index) => (
                    <span key={index} className="tag-item">
                      <Tag className="icon" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ticket-conversation">
          <div className="conversation-header">
            <h3>Internal Notes</h3>
            <span className="note-count">{notes.length} notes</span>
          </div>

          <div className="note-composer">
            <textarea
              placeholder="Add an internal note..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={3}
            />
            <div className="composer-actions">
              <button
                className="btn btn-primary"
                onClick={handleAddNote}
                disabled={!noteContent.trim()}
              >
                <Send className="icon" />
                Add Note
              </button>
            </div>
          </div>

          <div className="notes-list">
            {notes.map((note) => (
              <div key={note.id} className="note-item">
                <div className="note-header">
                  <div className="note-author">
                    <User className="icon" />
                    <span>{note.author_name}</span>
                  </div>
                  <span className="note-time">{formatDateTime(note.created_at)}</span>
                </div>
                <div className="note-content">{note.content}</div>
                {note.is_edited && (
                  <div className="note-edited">
                    <Edit className="icon" />
                    Edited {note.edited_at && formatDateTime(note.edited_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketViewer;