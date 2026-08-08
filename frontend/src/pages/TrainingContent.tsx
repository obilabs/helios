/**
 * Training Content Management Page
 *
 * Admin page for managing training content including videos,
 * documents, terms acceptance, and quizzes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Filter,
  Video,
  FileText,
  ClipboardCheck,
  Link2,
  CheckSquare,
  Edit2,
  Trash2,
  RefreshCw,
  BarChart2,
  Clock,
  Users,
  AlertCircle,
} from 'lucide-react';
import { authFetch } from '../config/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import './TrainingContent.css';

interface TrainingContent {
  id: string;
  title: string;
  description?: string;
  content_type: 'video' | 'document' | 'terms' | 'quiz' | 'link' | 'checklist';
  url?: string;
  estimated_duration_minutes: number;
  category?: string;
  is_active: boolean;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
}

interface ContentStats {
  totalAssigned: number;
  completed: number;
  inProgress: number;
  avgScore?: number;
}

type ContentType = 'all' | 'video' | 'document' | 'terms' | 'quiz' | 'link' | 'checklist';

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  video: <Video size={16} />,
  document: <FileText size={16} />,
  terms: <ClipboardCheck size={16} />,
  quiz: <CheckSquare size={16} />,
  link: <Link2 size={16} />,
  checklist: <CheckSquare size={16} />,
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  video: 'Video',
  document: 'Document',
  terms: 'Terms & Policies',
  quiz: 'Quiz',
  link: 'External Link',
  checklist: 'Checklist',
};

const TrainingContentPage: React.FC = () => {
  const [content, setContent] = useState<TrainingContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContentType>('all');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [selectedContent, setSelectedContent] = useState<TrainingContent | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingContent, setEditingContent] = useState<TrainingContent | null>(null);
  const [stats, setStats] = useState<Record<string, ContentStats>>({});

  const fetchContent = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('content_type', typeFilter);
      if (showActiveOnly) params.append('is_active', 'true');
      if (searchQuery) params.append('search', searchQuery);

      const response = await authFetch(`/api/v1/training/content?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setContent(data.data.content || []);
        }
      }
    } catch (error) {
      console.error('Error fetching content:', error);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, showActiveOnly, searchQuery]);

  const fetchStats = async (contentId: string) => {
    try {
      const response = await authFetch(`/api/v1/training/content/${contentId}/stats`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats((prev) => ({ ...prev, [contentId]: data.data }));
        }
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleDelete = async () => {
    if (!selectedContent) return;

    try {
      const response = await authFetch(`/api/v1/training/content/${selectedContent.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setContent((prev) => prev.filter((c) => c.id !== selectedContent.id));
        setShowDeleteConfirm(false);
        setSelectedContent(null);
      }
    } catch (error) {
      console.error('Error deleting content:', error);
    }
  };

  const handleEdit = (item: TrainingContent) => {
    setEditingContent(item);
    setShowEditor(true);
  };

  const handleCreate = () => {
    setEditingContent(null);
    setShowEditor(true);
  };

  const handleSave = async (data: Partial<TrainingContent>) => {
    try {
      const url = editingContent
        ? `/api/v1/training/content/${editingContent.id}`
        : '/api/v1/training/content';
      const method = editingContent ? 'PUT' : 'POST';

      const response = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setShowEditor(false);
        fetchContent();
      }
    } catch (error) {
      console.error('Error saving content:', error);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const filteredContent = content.filter((item) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="training-content-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Training Content</h1>
          <p className="header-subtitle">Manage training materials for onboarding and ongoing education</p>
        </div>
        <button className="btn-primary" onClick={handleCreate}>
          <Plus size={16} />
          Add Content
        </button>
      </div>

      {/* Filters */}
      <div className="content-filters">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <Filter size={16} />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ContentType)}
          >
            <option value="all">All Types</option>
            <option value="video">Videos</option>
            <option value="document">Documents</option>
            <option value="terms">Terms & Policies</option>
            <option value="quiz">Quizzes</option>
            <option value="link">Links</option>
            <option value="checklist">Checklists</option>
          </select>
        </div>

        <label className="toggle-filter">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={(e) => setShowActiveOnly(e.target.checked)}
          />
          <span>Active only</span>
        </label>

        <button className="btn-icon" onClick={fetchContent} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Content List */}
      <div className="content-list">
        {loading ? (
          <div className="loading-state">
            <RefreshCw className="animate-spin" size={24} />
            <span>Loading content...</span>
          </div>
        ) : filteredContent.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>No training content found</h3>
            <p>Create your first training content to get started</p>
            <button className="btn-primary" onClick={handleCreate}>
              <Plus size={16} />
              Add Content
            </button>
          </div>
        ) : (
          <div className="content-grid">
            {filteredContent.map((item) => (
              <div key={item.id} className={`content-card ${!item.is_active ? 'inactive' : ''}`}>
                <div className="card-header">
                  <div className="content-type-badge">
                    {CONTENT_TYPE_ICONS[item.content_type]}
                    <span>{CONTENT_TYPE_LABELS[item.content_type]}</span>
                  </div>
                  <div className="card-actions">
                    <button
                      className="btn-icon"
                      onClick={() => fetchStats(item.id)}
                      title="View Stats"
                    >
                      <BarChart2 size={14} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleEdit(item)}
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn-icon btn-danger"
                      onClick={() => {
                        setSelectedContent(item);
                        setShowDeleteConfirm(true);
                      }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="card-body">
                  <h3 className="content-title">{item.title}</h3>
                  {item.description && (
                    <p className="content-description">{item.description}</p>
                  )}

                  <div className="content-meta">
                    {item.estimated_duration_minutes > 0 && (
                      <span className="meta-item">
                        <Clock size={12} />
                        {formatDuration(item.estimated_duration_minutes)}
                      </span>
                    )}
                    {item.category && (
                      <span className="meta-item category-badge">{item.category}</span>
                    )}
                    {item.is_mandatory && (
                      <span className="meta-item mandatory-badge">Required</span>
                    )}
                  </div>

                  {stats[item.id] && (
                    <div className="content-stats">
                      <div className="stat">
                        <Users size={12} />
                        <span>{stats[item.id].totalAssigned} assigned</span>
                      </div>
                      <div className="stat">
                        <CheckSquare size={12} />
                        <span>{stats[item.id].completed} completed</span>
                      </div>
                      {stats[item.id].avgScore !== undefined && (
                        <div className="stat">
                          <BarChart2 size={12} />
                          <span>{Math.round(stats[item.id].avgScore!)}% avg score</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!item.is_active && (
                  <div className="inactive-overlay">
                    <AlertCircle size={16} />
                    <span>Inactive</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Content"
        message={`Are you sure you want to delete "${selectedContent?.title}"? This will remove it from all user assignments.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setSelectedContent(null);
        }}
      />

      {/* Editor Modal */}
      {showEditor && (
        <TrainingContentEditor
          content={editingContent}
          onSave={handleSave}
          onClose={() => {
            setShowEditor(false);
            setEditingContent(null);
          }}
        />
      )}
    </div>
  );
};

// Simple editor modal component
interface EditorProps {
  content: TrainingContent | null;
  onSave: (data: Partial<TrainingContent>) => void;
  onClose: () => void;
}

const TrainingContentEditor: React.FC<EditorProps> = ({ content, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    title: content?.title || '',
    description: content?.description || '',
    content_type: content?.content_type || 'document',
    url: content?.url || '',
    estimated_duration_minutes: content?.estimated_duration_minutes || 0,
    category: content?.category || '',
    is_mandatory: content?.is_mandatory || false,
    is_active: content?.is_active ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{content ? 'Edit Content' : 'Add Content'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Type *</label>
              <select
                value={formData.content_type}
                onChange={(e) => setFormData((prev) => ({ ...prev, content_type: e.target.value as any }))}
              >
                <option value="video">Video</option>
                <option value="document">Document</option>
                <option value="terms">Terms & Policies</option>
                <option value="quiz">Quiz</option>
                <option value="link">External Link</option>
                <option value="checklist">Checklist</option>
              </select>
            </div>

            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., compliance, security"
              />
            </div>
          </div>

          <div className="form-group">
            <label>URL</label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          <div className="form-group">
            <label>Estimated Duration (minutes)</label>
            <input
              type="number"
              min="0"
              value={formData.estimated_duration_minutes}
              onChange={(e) => setFormData((prev) => ({ ...prev, estimated_duration_minutes: parseInt(e.target.value) || 0 }))}
            />
          </div>

          <div className="form-row checkboxes">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.is_mandatory}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_mandatory: e.target.checked }))}
              />
              <span>Mandatory</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              <span>Active</span>
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {content ? 'Save Changes' : 'Create Content'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrainingContentPage;
