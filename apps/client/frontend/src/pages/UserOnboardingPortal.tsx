/**
 * User Onboarding Portal
 *
 * User-facing portal for new employees to complete their onboarding tasks,
 * training content, and track their progress.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Video,
  FileText,
  ClipboardCheck,
  Link2,
  CheckSquare,
  AlertCircle,
  ChevronRight,
  Play,
  ExternalLink,
  Award,
  Target,
  Loader2,
} from 'lucide-react';
import { authFetch } from '../config/api';
import './UserOnboardingPortal.css';

interface OnboardingTask {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  due_date?: string;
  completed_at?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface TrainingItem {
  id: string;
  content_id: string;
  title: string;
  description?: string;
  content_type: 'video' | 'document' | 'terms' | 'quiz' | 'link' | 'checklist';
  url?: string;
  estimated_duration_minutes: number;
  is_mandatory: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  progress_percentage: number;
  started_at?: string;
  completed_at?: string;
  score?: number;
}

interface OnboardingProgress {
  tasksTotal: number;
  tasksCompleted: number;
  trainingTotal: number;
  trainingCompleted: number;
  overallProgress: number;
  startDate?: string;
  expectedEndDate?: string;
}

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  video: <Video size={18} />,
  document: <FileText size={18} />,
  terms: <ClipboardCheck size={18} />,
  quiz: <CheckSquare size={18} />,
  link: <Link2 size={18} />,
  checklist: <CheckSquare size={18} />,
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  video: 'Watch Video',
  document: 'Read Document',
  terms: 'Review & Accept',
  quiz: 'Take Quiz',
  link: 'Visit Link',
  checklist: 'Complete Checklist',
};

const UserOnboardingPortal: React.FC = () => {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [training, setTraining] = useState<TrainingItem[]>([]);
  const [progress, setProgress] = useState<OnboardingProgress>({
    tasksTotal: 0,
    tasksCompleted: 0,
    trainingTotal: 0,
    trainingCompleted: 0,
    overallProgress: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'training'>('overview');
  const [selectedTraining, setSelectedTraining] = useState<TrainingItem | null>(null);

  const fetchOnboardingData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch tasks assigned to current user
      const tasksResponse = await authFetch('/api/v1/lifecycle/tasks?assignedToMe=true');
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        if (tasksData.success) {
          setTasks(tasksData.data.tasks || []);
        }
      }

      // Fetch training progress for current user
      const trainingResponse = await authFetch('/api/v1/training/my-progress');
      if (trainingResponse.ok) {
        const trainingData = await trainingResponse.json();
        if (trainingData.success) {
          setTraining(trainingData.data.items || []);
        }
      }

      // Calculate progress
      calculateProgress();
    } catch (error) {
      console.error('Error fetching onboarding data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateProgress = useCallback(() => {
    const tasksCompleted = tasks.filter(t => t.status === 'completed').length;
    const trainingCompleted = training.filter(t => t.status === 'completed').length;
    const totalItems = tasks.length + training.length;
    const completedItems = tasksCompleted + trainingCompleted;

    setProgress({
      tasksTotal: tasks.length,
      tasksCompleted,
      trainingTotal: training.length,
      trainingCompleted,
      overallProgress: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
    });
  }, [tasks, training]);

  useEffect(() => {
    fetchOnboardingData();
  }, [fetchOnboardingData]);

  useEffect(() => {
    calculateProgress();
  }, [calculateProgress]);

  const handleCompleteTask = async (taskId: string) => {
    try {
      const response = await authFetch(`/api/v1/lifecycle/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: '' }),
      });

      if (response.ok) {
        setTasks(prev =>
          prev.map(t =>
            t.id === taskId ? { ...t, status: 'completed' as const, completed_at: new Date().toISOString() } : t
          )
        );
      }
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

  const handleStartTraining = async (item: TrainingItem) => {
    try {
      await authFetch(`/api/v1/training/progress/${item.id}/start`, {
        method: 'POST',
      });

      setTraining(prev =>
        prev.map(t =>
          t.id === item.id ? { ...t, status: 'in_progress' as const, started_at: new Date().toISOString() } : t
        )
      );

      setSelectedTraining(item);
    } catch (error) {
      console.error('Error starting training:', error);
    }
  };

  const handleCompleteTraining = async (progressId: string) => {
    try {
      const response = await authFetch(`/api/v1/training/progress/${progressId}/complete`, {
        method: 'POST',
      });

      if (response.ok) {
        setTraining(prev =>
          prev.map(t =>
            t.id === progressId
              ? { ...t, status: 'completed' as const, completed_at: new Date().toISOString(), progress_percentage: 100 }
              : t
          )
        );
        setSelectedTraining(null);
      }
    } catch (error) {
      console.error('Error completing training:', error);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const getPendingTasks = () => tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const getPendingTraining = () => training.filter(t => t.status !== 'completed');

  if (loading) {
    return (
      <div className="onboarding-portal loading-state">
        <Loader2 className="animate-spin" size={32} />
        <span>Loading your onboarding...</span>
      </div>
    );
  }

  return (
    <div className="onboarding-portal">
      {/* Welcome Header */}
      <div className="portal-header">
        <div className="welcome-section">
          <h1>Welcome to your Onboarding</h1>
          <p>Complete the tasks and training below to get started</p>
        </div>
        <div className="progress-circle">
          <svg viewBox="0 0 36 36" className="circular-chart">
            <path
              className="circle-bg"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="circle"
              strokeDasharray={`${progress.overallProgress}, 100`}
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="progress-text">
            <span className="percentage">{progress.overallProgress}%</span>
            <span className="label">Complete</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon tasks">
            <Target size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{progress.tasksCompleted}/{progress.tasksTotal}</span>
            <span className="stat-label">Tasks Completed</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon training">
            <Award size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{progress.trainingCompleted}/{progress.trainingTotal}</span>
            <span className="stat-label">Training Completed</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon pending">
            <Clock size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{getPendingTasks().length + getPendingTraining().length}</span>
            <span className="stat-label">Items Remaining</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="portal-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks {getPendingTasks().length > 0 && <span className="badge">{getPendingTasks().length}</span>}
        </button>
        <button
          className={`tab ${activeTab === 'training' ? 'active' : ''}`}
          onClick={() => setActiveTab('training')}
        >
          Training {getPendingTraining().length > 0 && <span className="badge">{getPendingTraining().length}</span>}
        </button>
      </div>

      {/* Tab Content */}
      <div className="portal-content">
        {activeTab === 'overview' && (
          <div className="overview-content">
            {/* Next Up Section */}
            <div className="section">
              <h2>Next Up</h2>
              <div className="next-up-list">
                {getPendingTasks().slice(0, 3).map(task => (
                  <div key={task.id} className="next-up-item">
                    <div className="item-icon task">
                      <Circle size={18} />
                    </div>
                    <div className="item-content">
                      <span className="item-title">{task.title}</span>
                      <span className="item-meta">
                        {task.category}
                        {task.due_date && (
                          <span className={isOverdue(task.due_date) ? 'overdue' : ''}>
                            <Clock size={12} /> Due {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    </div>
                    <button
                      className="btn-complete"
                      onClick={() => handleCompleteTask(task.id)}
                    >
                      <CheckCircle2 size={18} />
                    </button>
                  </div>
                ))}

                {getPendingTraining().slice(0, 3).map(item => (
                  <div key={item.id} className="next-up-item">
                    <div className="item-icon training">
                      {CONTENT_TYPE_ICONS[item.content_type]}
                    </div>
                    <div className="item-content">
                      <span className="item-title">{item.title}</span>
                      <span className="item-meta">
                        {CONTENT_TYPE_LABELS[item.content_type]}
                        <span><Clock size={12} /> {formatDuration(item.estimated_duration_minutes)}</span>
                        {item.is_mandatory && <span className="mandatory">Required</span>}
                      </span>
                    </div>
                    <button
                      className="btn-start"
                      onClick={() => handleStartTraining(item)}
                    >
                      <Play size={16} />
                      Start
                    </button>
                  </div>
                ))}

                {getPendingTasks().length === 0 && getPendingTraining().length === 0 && (
                  <div className="empty-state">
                    <CheckCircle2 size={48} />
                    <h3>All Done!</h3>
                    <p>You've completed all your onboarding tasks and training.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Completed Section */}
            {(progress.tasksCompleted > 0 || progress.trainingCompleted > 0) && (
              <div className="section">
                <h2>Recently Completed</h2>
                <div className="completed-list">
                  {tasks
                    .filter(t => t.status === 'completed')
                    .slice(0, 5)
                    .map(task => (
                      <div key={task.id} className="completed-item">
                        <CheckCircle2 size={18} className="check-icon" />
                        <span>{task.title}</span>
                      </div>
                    ))}
                  {training
                    .filter(t => t.status === 'completed')
                    .slice(0, 5)
                    .map(item => (
                      <div key={item.id} className="completed-item">
                        <CheckCircle2 size={18} className="check-icon" />
                        <span>{item.title}</span>
                        {item.score !== undefined && (
                          <span className="score">{item.score}%</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="tasks-content">
            {tasks.length === 0 ? (
              <div className="empty-state">
                <Target size={48} />
                <h3>No Tasks Assigned</h3>
                <p>You don't have any onboarding tasks at the moment.</p>
              </div>
            ) : (
              <div className="task-list">
                {/* Group by category */}
                {Object.entries(
                  tasks.reduce((acc, task) => {
                    if (!acc[task.category]) acc[task.category] = [];
                    acc[task.category].push(task);
                    return acc;
                  }, {} as Record<string, OnboardingTask[]>)
                ).map(([category, categoryTasks]) => (
                  <div key={category} className="task-category">
                    <h3>{category}</h3>
                    {categoryTasks.map(task => (
                      <div
                        key={task.id}
                        className={`task-item ${task.status} ${isOverdue(task.due_date) && task.status !== 'completed' ? 'overdue' : ''}`}
                      >
                        <button
                          className="task-checkbox"
                          onClick={() => task.status !== 'completed' && handleCompleteTask(task.id)}
                          disabled={task.status === 'completed'}
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 size={20} />
                          ) : (
                            <Circle size={20} />
                          )}
                        </button>
                        <div className="task-content">
                          <span className="task-title">{task.title}</span>
                          {task.description && (
                            <p className="task-description">{task.description}</p>
                          )}
                          <div className="task-meta">
                            {task.due_date && (
                              <span className={`due-date ${isOverdue(task.due_date) && task.status !== 'completed' ? 'overdue' : ''}`}>
                                <Clock size={12} />
                                {task.status === 'completed' ? 'Completed' : `Due ${new Date(task.due_date).toLocaleDateString()}`}
                              </span>
                            )}
                            {task.priority !== 'medium' && (
                              <span className={`priority ${task.priority}`}>
                                {task.priority}
                              </span>
                            )}
                          </div>
                        </div>
                        {task.status !== 'completed' && (
                          <ChevronRight size={18} className="chevron" />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'training' && (
          <div className="training-content">
            {training.length === 0 ? (
              <div className="empty-state">
                <Award size={48} />
                <h3>No Training Assigned</h3>
                <p>You don't have any training content to complete.</p>
              </div>
            ) : (
              <div className="training-list">
                {/* Mandatory First */}
                {training.filter(t => t.is_mandatory && t.status !== 'completed').length > 0 && (
                  <div className="training-section">
                    <h3>Required Training</h3>
                    {training
                      .filter(t => t.is_mandatory && t.status !== 'completed')
                      .map(item => (
                        <TrainingCard
                          key={item.id}
                          item={item}
                          onStart={() => handleStartTraining(item)}
                          onComplete={() => handleCompleteTraining(item.id)}
                        />
                      ))}
                  </div>
                )}

                {/* Optional */}
                {training.filter(t => !t.is_mandatory && t.status !== 'completed').length > 0 && (
                  <div className="training-section">
                    <h3>Additional Training</h3>
                    {training
                      .filter(t => !t.is_mandatory && t.status !== 'completed')
                      .map(item => (
                        <TrainingCard
                          key={item.id}
                          item={item}
                          onStart={() => handleStartTraining(item)}
                          onComplete={() => handleCompleteTraining(item.id)}
                        />
                      ))}
                  </div>
                )}

                {/* Completed */}
                {training.filter(t => t.status === 'completed').length > 0 && (
                  <div className="training-section completed">
                    <h3>Completed</h3>
                    {training
                      .filter(t => t.status === 'completed')
                      .map(item => (
                        <TrainingCard
                          key={item.id}
                          item={item}
                          onStart={() => handleStartTraining(item)}
                          onComplete={() => handleCompleteTraining(item.id)}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Training Viewer Modal */}
      {selectedTraining && (
        <TrainingViewer
          item={selectedTraining}
          onComplete={() => handleCompleteTraining(selectedTraining.id)}
          onClose={() => setSelectedTraining(null)}
        />
      )}
    </div>
  );
};

// Training Card Component
interface TrainingCardProps {
  item: TrainingItem;
  onStart: () => void;
  onComplete: () => void;
}

const TrainingCard: React.FC<TrainingCardProps> = ({ item, onStart, onComplete: _onComplete }) => {
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className={`training-card ${item.status}`}>
      <div className="training-icon">
        {CONTENT_TYPE_ICONS[item.content_type]}
      </div>
      <div className="training-info">
        <h4>{item.title}</h4>
        {item.description && <p>{item.description}</p>}
        <div className="training-meta">
          <span><Clock size={12} /> {formatDuration(item.estimated_duration_minutes)}</span>
          {item.is_mandatory && <span className="mandatory">Required</span>}
          {item.status === 'completed' && item.score !== undefined && (
            <span className="score">Score: {item.score}%</span>
          )}
        </div>
        {item.status === 'in_progress' && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${item.progress_percentage}%` }} />
          </div>
        )}
      </div>
      <div className="training-actions">
        {item.status === 'not_started' && (
          <button className="btn-start" onClick={onStart}>
            <Play size={16} />
            Start
          </button>
        )}
        {item.status === 'in_progress' && (
          <button className="btn-continue" onClick={onStart}>
            Continue
            <ChevronRight size={16} />
          </button>
        )}
        {item.status === 'completed' && (
          <span className="completed-badge">
            <CheckCircle2 size={16} />
            Done
          </span>
        )}
      </div>
    </div>
  );
};

// Training Viewer Component
interface TrainingViewerProps {
  item: TrainingItem;
  onComplete: () => void;
  onClose: () => void;
}

const TrainingViewer: React.FC<TrainingViewerProps> = ({ item, onComplete, onClose }) => {
  const [acknowledged, setAcknowledged] = useState(false);

  const renderContent = () => {
    switch (item.content_type) {
      case 'video':
        return (
          <div className="viewer-video">
            {item.url ? (
              <iframe
                src={item.url}
                title={item.title}
                allowFullScreen
              />
            ) : (
              <div className="no-content">
                <Video size={48} />
                <p>Video not available</p>
              </div>
            )}
          </div>
        );

      case 'document':
        return (
          <div className="viewer-document">
            {item.url ? (
              <iframe
                src={item.url}
                title={item.title}
              />
            ) : (
              <div className="no-content">
                <FileText size={48} />
                <p>Document not available</p>
              </div>
            )}
          </div>
        );

      case 'link':
        return (
          <div className="viewer-link">
            <Link2 size={48} />
            <h3>External Resource</h3>
            <p>{item.description || 'Click below to open the resource in a new tab.'}</p>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-external">
                Open Link
                <ExternalLink size={16} />
              </a>
            )}
          </div>
        );

      case 'terms':
        return (
          <div className="viewer-terms">
            <div className="terms-content">
              {item.description || 'Terms and conditions content goes here.'}
            </div>
            <div className="terms-acknowledge">
              <label>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>I have read and agree to these terms</span>
              </label>
            </div>
          </div>
        );

      case 'quiz':
        return (
          <div className="viewer-quiz">
            <AlertCircle size={48} />
            <h3>Quiz</h3>
            <p>Quiz functionality coming soon.</p>
          </div>
        );

      case 'checklist':
        return (
          <div className="viewer-checklist">
            <CheckSquare size={48} />
            <h3>Checklist</h3>
            <p>Checklist functionality coming soon.</p>
          </div>
        );

      default:
        return null;
    }
  };

  const canComplete = () => {
    if (item.content_type === 'terms') {
      return acknowledged;
    }
    return true;
  };

  return (
    <div className="training-viewer-overlay" onClick={onClose}>
      <div className="training-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-header">
          <div className="viewer-title">
            {CONTENT_TYPE_ICONS[item.content_type]}
            <h2>{item.title}</h2>
          </div>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="viewer-body">
          {renderContent()}
        </div>

        <div className="viewer-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-primary"
            onClick={onComplete}
            disabled={!canComplete()}
          >
            <CheckCircle2 size={16} />
            Mark as Complete
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserOnboardingPortal;
