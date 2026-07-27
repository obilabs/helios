import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  X,
  Loader2,
  Bot,
  Users,
  UsersIcon,
  Settings,
  RefreshCw,
  Plus,
  FileDown,
  History,
  ArrowRight,
  Command
} from 'lucide-react';
import { authFetch } from '../../config/api';
import './CommandBar.css';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  route?: string;
  action?: () => void;
}

interface RecentQuery {
  id: string;
  query: string;
  timestamp: number;
}

interface CommandBarProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
  aiEnabled?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'add-user', label: 'Add User', icon: <Plus size={16} />, route: '/admin/users/new' },
  { id: 'view-users', label: 'View Users', icon: <Users size={16} />, route: '/admin/users' },
  { id: 'view-groups', label: 'View Groups', icon: <UsersIcon size={16} />, route: '/admin/groups' },
  { id: 'sync-now', label: 'Sync Now', icon: <RefreshCw size={16} />, route: '/admin/settings' },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} />, route: '/admin/settings' },
  { id: 'export-users', label: 'Export Users', icon: <FileDown size={16} />, route: '/admin/users' }
];

const MAX_RECENT_QUERIES = 5;
const STORAGE_KEY = 'helios_ai_recent_queries';

export function CommandBar({ isOpen, onClose, onNavigate, aiEnabled = false }: CommandBarProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentQueries, setRecentQueries] = useState<RecentQuery[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Load recent queries from storage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setRecentQueries(JSON.parse(stored));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!isOpen) {
      setQuery('');
      setResponse(null);
      setError(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle click outside
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Save recent query
  const saveRecentQuery = (q: string) => {
    const newQuery: RecentQuery = {
      id: Date.now().toString(),
      query: q,
      timestamp: Date.now()
    };

    const updated = [newQuery, ...recentQueries.filter(r => r.query !== q)].slice(0, MAX_RECENT_QUERIES);
    setRecentQueries(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // Submit query to AI
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim() || !aiEnabled) return;

    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await authFetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: query,
          sessionId: sessionId,
          pageContext: window.location.pathname
        })
      });

      const data = await res.json();

      if (data.success) {
        setResponse(data.data.message);
        setSessionId(data.data.sessionId);
        saveRecentQuery(query);
      } else {
        setError(data.message || 'Failed to get response');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to AI assistant');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle quick action click
  const handleQuickAction = (action: QuickAction) => {
    if (action.route) {
      onNavigate(action.route);
      onClose();
    } else if (action.action) {
      action.action();
    }
  };

  // Handle recent query click
  const handleRecentQuery = (q: string) => {
    setQuery(q);
    inputRef.current?.focus();
  };

  // Filter quick actions based on query
  const filteredActions = query
    ? QUICK_ACTIONS.filter(a =>
        a.label.toLowerCase().includes(query.toLowerCase())
      )
    : QUICK_ACTIONS;

  if (!isOpen) return null;

  return (
    <div className="command-bar-backdrop" onClick={handleBackdropClick}>
      <div className="command-bar" ref={modalRef}>
        <form onSubmit={handleSubmit}>
          <div className="command-bar-input-wrapper">
            {isLoading ? (
              <Loader2 className="command-bar-icon spin" size={20} />
            ) : (
              <Search className="command-bar-icon" size={20} />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={aiEnabled ? "Ask anything or type a command..." : "Search commands..."}
              className="command-bar-input"
              disabled={isLoading}
            />
            {query && (
              <button
                type="button"
                className="command-bar-clear"
                onClick={() => setQuery('')}
              >
                <X size={16} />
              </button>
            )}
            <div className="command-bar-shortcut">
              <Command size={12} />
              <span>K</span>
            </div>
          </div>
        </form>

        <div className="command-bar-content">
          {error && (
            <div className="command-bar-error">
              {error}
            </div>
          )}

          {response && (
            <div className="command-bar-response">
              <div className="response-header">
                <Bot size={16} />
                <span>AI Assistant</span>
              </div>
              <div className="response-content">
                {response}
              </div>
            </div>
          )}

          {!response && !error && (
            <>
              {recentQueries.length > 0 && !query && aiEnabled && (
                <div className="command-bar-section">
                  <div className="section-title">
                    <History size={14} />
                    <span>Recent</span>
                  </div>
                  <div className="section-items">
                    {recentQueries.map((r) => (
                      <button
                        key={r.id}
                        className="command-bar-item"
                        onClick={() => handleRecentQuery(r.query)}
                      >
                        <span className="item-text">{r.query}</span>
                        <ArrowRight size={14} className="item-arrow" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="command-bar-section">
                <div className="section-title">
                  <Settings size={14} />
                  <span>Quick Actions</span>
                </div>
                <div className="section-items">
                  {filteredActions.map((action) => (
                    <button
                      key={action.id}
                      className="command-bar-item"
                      onClick={() => handleQuickAction(action)}
                    >
                      <span className="item-icon">{action.icon}</span>
                      <span className="item-text">{action.label}</span>
                      <ArrowRight size={14} className="item-arrow" />
                    </button>
                  ))}
                </div>
              </div>

              {aiEnabled && query && (
                <div className="command-bar-hint">
                  Press <kbd>Enter</kbd> to ask AI
                </div>
              )}

              {!aiEnabled && (
                <div className="command-bar-hint ai-disabled">
                  <Bot size={14} />
                  <span>AI Assistant is not configured. <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('/admin/settings'); onClose(); }}>Configure in Settings</a></span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="command-bar-footer">
          <span><kbd>Esc</kbd> to close</span>
          {aiEnabled && <span><kbd>Enter</kbd> to ask AI</span>}
        </div>
      </div>
    </div>
  );
}

export default CommandBar;
