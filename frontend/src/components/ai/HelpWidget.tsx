import { useState, useEffect, useRef } from 'react';
import { HelpCircle, X, ChevronRight, Loader2, BookOpen, Search, MessageSquare } from 'lucide-react';
import { authFetch, apiPath } from '../../config/api';
import './HelpWidget.css';

interface HelpArticle {
  id: string;
  title: string;
  type: string;
  category: string;
  summary: string;
  content: string;
  keywords: string[];
}

interface HelpWidgetProps {
  currentPage: string;
  subContext?: string;
  externalOpen?: boolean;
  onExternalClose?: () => void;
  hideFloatingButton?: boolean;
  onAskAI?: (question: string) => void;
}

export function HelpWidget({
  currentPage,
  subContext,
  externalOpen,
  onExternalClose,
  hideFloatingButton = false,
  onAskAI,
}: HelpWidgetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HelpArticle[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use external control if provided, otherwise use internal state
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (externalOpen !== undefined) {
      if (!open && onExternalClose) {
        onExternalClose();
      }
    } else {
      setInternalOpen(open);
    }
  };

  // Fetch help content when page changes or widget opens
  useEffect(() => {
    if (isOpen) {
      fetchHelpContent();
    }
  }, [currentPage, subContext, isOpen]);

  // Fetch context-based help content
  const fetchHelpContent = async () => {
    setIsLoading(true);
    try {
      const contextKey = subContext ? `${currentPage}-${subContext}` : currentPage;
      const url = apiPath(`/help/context/${encodeURIComponent(contextKey)}`);
      const response = await authFetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.articles) {
          setArticles(data.data.articles);
        }
      }
    } catch (error) {
      console.error('Failed to fetch help content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Search help content
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const url = apiPath(`/help/search?q=${encodeURIComponent(query)}&limit=5`);
        const response = await authFetch(url);

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.articles) {
            setSearchResults(data.data.articles);
          }
        }
      } catch (error) {
        console.error('Failed to search help:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  // Close widget when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedArticle(null);
        setSearchQuery('');
        setSearchResults([]);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onExternalClose]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '?' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      if (e.key === 'Escape' && isOpen) {
        if (selectedArticle) {
          setSelectedArticle(null);
        } else {
          setIsOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedArticle]);

  // Format markdown-like content to JSX
  const formatContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, index) => {
      // Headers
      if (line.startsWith('**') && line.endsWith('**:')) {
        return <h4 key={index} className="help-content-header">{line.replace(/\*\*/g, '').replace(/:$/, '')}</h4>;
      }
      // Bold text
      if (line.includes('**')) {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={index}>
            {parts.map((part, i) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        );
      }
      // List items
      if (line.startsWith('- ')) {
        return <li key={index}>{line.slice(2)}</li>;
      }
      // Empty lines
      if (!line.trim()) {
        return <br key={index} />;
      }
      // Regular paragraph
      return <p key={index}>{line}</p>;
    });
  };

  const displayContext = subContext ? `${currentPage}-${subContext}` : currentPage;
  const displayArticles = searchQuery ? searchResults : articles;

  return (
    <div className="help-widget" ref={widgetRef}>
      {/* Floating button */}
      {!hideFloatingButton && (
        <button
          className={`help-widget-button ${isOpen ? 'active' : ''}`}
          onClick={() => {
            setIsOpen(!isOpen);
            setSelectedArticle(null);
            setSearchQuery('');
          }}
          title="Get help (press ?)"
          aria-label="Help"
        >
          {isOpen ? <X size={20} /> : <HelpCircle size={20} />}
        </button>
      )}

      {/* Help panel */}
      {isOpen && (
        <div className="help-widget-popup">
          <div className="help-widget-header">
            <div className="help-widget-title">
              <BookOpen size={16} />
              <span>Help</span>
            </div>
            <div className="help-header-actions">
              <span className="help-page-context">{formatPageName(displayContext)}</span>
              <button
                className="help-close-btn"
                onClick={() => setIsOpen(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="help-search">
            <Search size={14} className="help-search-icon" />
            <input
              type="text"
              placeholder="Search help..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="help-search-input"
            />
            {isSearching && <Loader2 size={14} className="spin help-search-loading" />}
          </div>

          {/* Content area */}
          <div className="help-content-area">
            {selectedArticle ? (
              // Article detail view
              <div className="help-article-detail">
                <button
                  className="help-back-btn"
                  onClick={() => setSelectedArticle(null)}
                >
                  <ChevronRight size={14} className="rotate-180" />
                  Back to list
                </button>
                <div className="help-article-content">
                  <h3>{selectedArticle.title}</h3>
                  <span className="help-article-type">{selectedArticle.type}</span>
                  <div className="help-article-body">
                    {formatContent(selectedArticle.content)}
                  </div>
                  {onAskAI && (
                    <button
                      className="help-ask-ai-btn"
                      onClick={() => {
                        const question = `Tell me more about "${selectedArticle.title}" - ${selectedArticle.summary}`;
                        onAskAI(question);
                        setIsOpen(false);
                      }}
                    >
                      <MessageSquare size={14} />
                      Ask AI about this
                    </button>
                  )}
                </div>
              </div>
            ) : isLoading ? (
              // Loading state
              <div className="help-loading">
                <Loader2 size={20} className="spin" />
                <span>Loading help...</span>
              </div>
            ) : displayArticles.length > 0 ? (
              // Article list
              <div className="help-article-list">
                <p className="help-list-label">
                  {searchQuery ? `Results for "${searchQuery}"` : 'Related help articles'}
                </p>
                <ul>
                  {displayArticles.map((article) => (
                    <li key={article.id}>
                      <button
                        className="help-article-btn"
                        onClick={() => setSelectedArticle(article)}
                      >
                        <div className="help-article-info">
                          <span className="help-article-title">{article.title}</span>
                          <span className="help-article-summary">{article.summary}</span>
                        </div>
                        <ChevronRight size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              // Empty state
              <div className="help-empty">
                <BookOpen size={24} className="help-empty-icon" />
                <p>
                  {searchQuery
                    ? 'No articles found for your search.'
                    : 'No help articles available for this page.'}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="help-widget-footer">
            <span className="keyboard-hint">
              Press <kbd>?</kbd> to toggle
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to format page name for display
function formatPageName(page: string): string {
  const names: Record<string, string> = {
    dashboard: 'Dashboard',
    users: 'Users',
    'users-active': 'Active Users',
    'users-staged': 'Staged Users',
    'users-suspended': 'Suspended Users',
    'users-deleted': 'Deleted Users',
    guests: 'Guests',
    contacts: 'Contacts',
    groups: 'Groups',
    settings: 'Settings',
    signatures: 'Signatures',
    'audit-logs': 'Audit Logs',
    'security-events': 'Security Events',
    'onboarding-templates': 'Onboarding Templates',
    'offboarding-templates': 'Offboarding Templates',
    'scheduled-actions': 'Scheduled Actions',
    requests: 'Requests',
    people: 'People Directory',
    orgChart: 'Org Chart',
    console: 'Developer Console',
    workspaces: 'Workspaces',
    'files-assets': 'Media Files',
    assets: 'IT Assets',
    'external-sharing': 'External Sharing',
    'email-security': 'Mail Search',
    administrators: 'Administrators',
    'my-profile': 'My Profile',
    'my-team': 'My Team',
    'my-groups': 'My Groups',
  };
  return names[page] || page.charAt(0).toUpperCase() + page.slice(1).replace(/-/g, ' ');
}

export default HelpWidget;
