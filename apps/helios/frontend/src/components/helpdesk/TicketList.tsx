import React from 'react';
import { Clock, AlertCircle, CheckCircle, User, Tag } from 'lucide-react';
import type { Ticket } from '../../services/helpdesk.service';
import './TicketList.css';

interface TicketListProps {
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  onSelectTicket: (ticket: Ticket) => void;
}

const TicketList: React.FC<TicketListProps> = ({ tickets, selectedTicket, onSelectTicket }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <AlertCircle className="status-icon status-new" />;
      case 'in_progress':
        return <Clock className="status-icon status-progress" />;
      case 'resolved':
        return <CheckCircle className="status-icon status-resolved" />;
      case 'reopened':
        return <AlertCircle className="status-icon status-reopened" />;
      default:
        return null;
    }
  };

  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'priority-urgent';
      case 'high':
        return 'priority-high';
      case 'normal':
        return 'priority-normal';
      case 'low':
        return 'priority-low';
      default:
        return '';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m ago`;
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  if (tickets.length === 0) {
    return (
      <div className="ticket-list-empty">
        <AlertCircle className="empty-icon" />
        <p>No tickets found</p>
      </div>
    );
  }

  return (
    <div className="ticket-list">
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className={`ticket-item ${selectedTicket?.id === ticket.id ? 'selected' : ''}`}
          onClick={() => onSelectTicket(ticket)}
        >
          <div className="ticket-header">
            <div className="ticket-status">
              {getStatusIcon(ticket.status)}
              <span className={`ticket-priority ${getPriorityClass(ticket.priority)}`}>
                {ticket.priority.toUpperCase()}
              </span>
            </div>
            <span className="ticket-time">{formatTime(ticket.created_at)}</span>
          </div>

          <div className="ticket-subject">
            {truncateText(ticket.subject || 'No subject', 100)}
          </div>

          <div className="ticket-meta">
            <div className="ticket-sender">
              <User className="meta-icon" />
              <span>{ticket.sender_name || ticket.sender_email}</span>
            </div>
            {ticket.assigned_to_name && (
              <div className="ticket-assignee">
                <User className="meta-icon assigned" />
                <span>{ticket.assigned_to_name}</span>
              </div>
            )}
          </div>

          {ticket.tags && ticket.tags.length > 0 && (
            <div className="ticket-tags">
              <Tag className="meta-icon" />
              {ticket.tags.map((tag, index) => (
                <span key={index} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="ticket-footer">
            <div className="ticket-group">{ticket.group_email}</div>
            {(ticket.notes_count ?? 0) > 0 && (
              <div className="ticket-notes-count">
                {ticket.notes_count} note{(ticket.notes_count ?? 0) > 1 ? 's' : ''}
              </div>
            )}
            {(ticket.viewers_count ?? 0) > 0 && (
              <div className="ticket-viewers">
                {ticket.viewers_count} viewing
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TicketList;