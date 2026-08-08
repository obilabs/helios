import { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Loader2,
  User,
  Copy,
  Check,
  Trash2,
  Minimize2,
  Maximize2,
  AlertCircle
} from 'lucide-react';
import { authFetch } from '../../config/api';
import HeliosAvatar, { type AvatarState } from '../HeliosAvatar';
import './ChatPanel.css';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  aiEnabled?: boolean;
  onConfigure?: () => void;
  initialMessage?: string;
}

const STORAGE_KEY = 'helios_ai_chat_history';
const MAX_HISTORY_LENGTH = 50;

export function ChatPanel({
  isOpen,
  onClose,
  aiEnabled = false,
  onConfigure,
  initialMessage
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load chat history from storage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setMessages(data.messages || []);
        setSessionId(data.sessionId || null);
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Save chat history to storage
  useEffect(() => {
    if (messages.length > 0 || sessionId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: messages.slice(-MAX_HISTORY_LENGTH),
        sessionId
      }));
    }
  }, [messages, sessionId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle initial message from command bar
  useEffect(() => {
    if (initialMessage && isOpen && aiEnabled) {
      setInput(initialMessage);
      // Auto-submit the message
      setTimeout(() => {
        handleSubmit(new Event('submit') as any, initialMessage);
      }, 100);
    }
  }, [initialMessage, isOpen, aiEnabled]);

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

  // Submit message
  const handleSubmit = async (e: React.FormEvent, messageOverride?: string) => {
    e.preventDefault();

    const messageText = messageOverride || input.trim();
    if (!messageText || !aiEnabled || isLoading) return;

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError(null);
    setIsLoading(true);
    setAvatarState('thinking');

    try {
      const res = await authFetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messageText,
          sessionId: sessionId,
          pageContext: window.location.pathname,
          includeHistory: true
        })
      });

      // Clone response before reading so we can get raw text if JSON parsing fails
      const resClone = res.clone();
      let data;
      try {
        data = await res.json();
      } catch (parseError) {
        // If JSON parsing fails, try to get the raw text to show a better error
        const rawText = await resClone.text().catch(() => 'Unable to read response');
        console.error('Failed to parse AI response:', rawText.substring(0, 500));
        throw new Error(`Invalid response from server: ${rawText.substring(0, 100)}...`);
      }

      if (data.success) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.data.message,
          timestamp: new Date(),
          usage: data.data.usage
        };

        setMessages(prev => [...prev, assistantMessage]);
        setSessionId(data.data.sessionId);
        setAvatarState('happy');
        // Return to idle after showing happy state
        setTimeout(() => setAvatarState('idle'), 2000);
      } else {
        setError(data.message || 'Failed to get response');
        setAvatarState('error');
        setTimeout(() => setAvatarState('idle'), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to AI assistant');
      setAvatarState('error');
      setTimeout(() => setAvatarState('idle'), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle textarea auto-resize and enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Copy message content
  const copyToClipboard = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Clear chat history
  const clearHistory = () => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Format message content with code blocks
  const formatContent = (content: string) => {
    // Split by code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        // Extract language and code
        const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
        if (match) {
          const language = match[1] || '';
          const code = match[2] || '';
          return (
            <div key={index} className="code-block">
              {language && <div className="code-language">{language}</div>}
              <pre><code>{code.trim()}</code></pre>
              <button
                className="code-copy-btn"
                onClick={() => copyToClipboard(code.trim(), `code-${index}`)}
                title="Copy code"
              >
                {copiedId === `code-${index}` ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          );
        }
      }

      // Regular text - handle inline formatting
      return (
        <span key={index} className="message-text">
          {part.split('\n').map((line, lineIndex) => (
            <span key={lineIndex}>
              {line}
              {lineIndex < part.split('\n').length - 1 && <br />}
            </span>
          ))}
        </span>
      );
    });
  };

  if (!isOpen) return null;

  return (
    <div className={`chat-panel-overlay ${isExpanded ? 'expanded' : ''}`}>
      <div
        className={`chat-panel ${isExpanded ? 'expanded' : ''}`}
        ref={panelRef}
      >
        {/* Header */}
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <HeliosAvatar state={avatarState} size="small" />
            <span>Helios AI</span>
          </div>
          <div className="chat-panel-actions">
            {messages.length > 0 && (
              <button
                className="chat-action-btn"
                onClick={clearHistory}
                title="Clear history"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              className="chat-action-btn"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Minimize' : 'Maximize'}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              className="chat-action-btn"
              onClick={onClose}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-panel-messages">
          {!aiEnabled ? (
            <div className="chat-empty-state">
              <HeliosAvatar state="concerned" size="large" />
              <h3>AI Assistant Not Configured</h3>
              <p>Configure the AI Assistant in Settings to start chatting.</p>
              {onConfigure && (
                <button className="configure-btn" onClick={onConfigure}>
                  Configure AI
                </button>
              )}
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty-state">
              <HeliosAvatar state="idle" size="large" />
              <h3>Start a Conversation</h3>
              <p>Ask me about users, groups, licenses, or how to use Helios.</p>
              <div className="suggested-prompts">
                <button onClick={() => setInput('How many users are in my organization?')}>
                  How many users are in my organization?
                </button>
                <button onClick={() => setInput('Show me users who haven\'t logged in recently')}>
                  Show inactive users
                </button>
                <button onClick={() => setInput('Generate a curl command to list all groups')}>
                  Generate API command
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat-message ${message.role}`}
                >
                  <div className="message-avatar">
                    {message.role === 'user' ? (
                      <User size={16} />
                    ) : (
                      <HeliosAvatar state="idle" size="small" />
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-role">
                        {message.role === 'user' ? 'You' : 'AI Assistant'}
                      </span>
                      <span className="message-time">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="message-body">
                      {formatContent(message.content)}
                    </div>
                    {message.role === 'assistant' && (
                      <div className="message-actions">
                        <button
                          className="message-action-btn"
                          onClick={() => copyToClipboard(message.content, message.id)}
                          title="Copy message"
                        >
                          {copiedId === message.id ? (
                            <>
                              <Check size={14} />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        {message.usage && (
                          <span className="token-usage">
                            {message.usage.totalTokens} tokens
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="chat-message assistant loading">
                  <div className="message-avatar">
                    <HeliosAvatar state="thinking" size="small" />
                  </div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="chat-error">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Input */}
        {aiEnabled && (
          <form className="chat-panel-input" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your workspace..."
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="send-btn"
            >
              {isLoading ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="chat-panel-footer">
          <span>Powered by your configured LLM</span>
          <span className="shortcut">
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
