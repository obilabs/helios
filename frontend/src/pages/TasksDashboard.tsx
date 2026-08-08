/**
 * Tasks Dashboard Page
 *
 * Displays lifecycle tasks assigned to the current user.
 * Supports filtering, completion, and task detail views.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Filter,
  RefreshCw,
  Search,
} from 'lucide-react';
import { authFetch } from '../config/api';
import TaskCard from '../components/lifecycle/TaskCard';
import TaskDetailModal from '../components/lifecycle/TaskDetailModal';
import './TasksDashboard.css';

interface Task {
  id: string;
  title: string;
  description?: string;
  category?: string;
  assignee_type: 'user' | 'manager' | 'hr' | 'it' | 'system';
  due_date?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
  request_id?: string;
  request_email?: string;
  request_name?: string;
  request_start_date?: string;
  completed_at?: string;
  completed_by_name?: string;
  completion_notes?: string;
}

interface TaskCounts {
  pending: number;
  in_progress: number;
  overdue: number;
  completed_today: number;
}

type FilterType = 'all' | 'pending' | 'in_progress' | 'overdue' | 'completed';
type CategoryFilter = 'all' | 'onboarding' | 'offboarding' | 'equipment' | 'access' | 'training';

const TasksDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<TaskCounts>({
    pending: 0,
    in_progress: 0,
    overdue: 0,
    completed_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const statusParam = filter === 'all' ? 'pending,in_progress' :
                          filter === 'overdue' ? 'pending' :
                          filter === 'completed' ? 'completed' : filter;

      const response = await authFetch(
        `/api/v1/lifecycle/tasks/my?status=${statusParam}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          let taskList = data.data.tasks || [];

          // Filter overdue if needed
          if (filter === 'overdue') {
            const today = new Date().toISOString().split('T')[0];
            taskList = taskList.filter((t: Task) => t.due_date && t.due_date < today);
          }

          setTasks(taskList);
        }
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  }, [filter]);

  const fetchCounts = useCallback(async () => {
    try {
      const response = await authFetch('/api/v1/lifecycle/dashboard');

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCounts(data.data.taskCounts || counts);
        }
      }
    } catch (error) {
      console.error('Error fetching counts:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTasks(), fetchCounts()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTasks, fetchCounts]);

  const handleCompleteTask = async (taskId: string, notes?: string) => {
    try {
      const response = await authFetch(`/api/v1/lifecycle/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });

      if (response.ok) {
        await Promise.all([fetchTasks(), fetchCounts()]);
        setShowDetailModal(false);
      }
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

  const handleStartTask = async (taskId: string) => {
    try {
      const response = await authFetch(`/api/v1/lifecycle/tasks/${taskId}/start`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchTasks();
      }
    } catch (error) {
      console.error('Error starting task:', error);
    }
  };

  const handleSkipTask = async (taskId: string, reason?: string) => {
    try {
      const response = await authFetch(`/api/v1/lifecycle/tasks/${taskId}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      if (response.ok) {
        await Promise.all([fetchTasks(), fetchCounts()]);
        setShowDetailModal(false);
      }
    } catch (error) {
      console.error('Error skipping task:', error);
    }
  };

  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setShowDetailModal(true);
  };

  // Filter tasks by category and search
  const filteredTasks = tasks.filter((task) => {
    if (categoryFilter !== 'all' && task.category !== categoryFilter) {
      return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(query) ||
        task.request_name?.toLowerCase().includes(query) ||
        task.request_email?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Group tasks by due date
  const groupedTasks = {
    overdue: filteredTasks.filter((t) => {
      if (!t.due_date || t.status === 'completed') return false;
      return t.due_date < new Date().toISOString().split('T')[0];
    }),
    today: filteredTasks.filter((t) => {
      if (!t.due_date) return false;
      return t.due_date === new Date().toISOString().split('T')[0];
    }),
    upcoming: filteredTasks.filter((t) => {
      if (!t.due_date) return false;
      const today = new Date().toISOString().split('T')[0];
      return t.due_date > today && t.status !== 'completed';
    }),
    noDueDate: filteredTasks.filter((t) => !t.due_date && t.status !== 'completed'),
    completed: filteredTasks.filter((t) => t.status === 'completed'),
  };

  return (
    <div className="tasks-dashboard">
      <div className="tasks-header">
        <div className="header-content">
          <h1>My Tasks</h1>
          <p className="header-subtitle">Manage your assigned lifecycle tasks</p>
        </div>
        <button className="btn-refresh" onClick={() => { fetchTasks(); fetchCounts(); }}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="tasks-summary">
        <div
          className={`summary-card ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <div className="card-icon pending">
            <Clock size={20} />
          </div>
          <div className="card-content">
            <span className="card-value">{counts.pending}</span>
            <span className="card-label">Pending</span>
          </div>
        </div>

        <div
          className={`summary-card ${filter === 'in_progress' ? 'active' : ''}`}
          onClick={() => setFilter('in_progress')}
        >
          <div className="card-icon in-progress">
            <RefreshCw size={20} />
          </div>
          <div className="card-content">
            <span className="card-value">{counts.in_progress}</span>
            <span className="card-label">In Progress</span>
          </div>
        </div>

        <div
          className={`summary-card ${filter === 'overdue' ? 'active' : ''}`}
          onClick={() => setFilter('overdue')}
        >
          <div className="card-icon overdue">
            <AlertTriangle size={20} />
          </div>
          <div className="card-content">
            <span className="card-value">{counts.overdue}</span>
            <span className="card-label">Overdue</span>
          </div>
        </div>

        <div
          className={`summary-card ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
        >
          <div className="card-icon completed">
            <CheckCircle2 size={20} />
          </div>
          <div className="card-content">
            <span className="card-value">{counts.completed_today}</span>
            <span className="card-label">Completed Today</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="tasks-filters">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <Filter size={16} />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
          >
            <option value="all">All Categories</option>
            <option value="onboarding">Onboarding</option>
            <option value="offboarding">Offboarding</option>
            <option value="equipment">Equipment</option>
            <option value="access">Access</option>
            <option value="training">Training</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="tasks-content">
        {loading ? (
          <div className="loading-state">
            <RefreshCw className="animate-spin" size={24} />
            <span>Loading tasks...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={48} />
            <h3>No tasks found</h3>
            <p>
              {filter === 'completed'
                ? 'No completed tasks to show'
                : 'You have no pending tasks assigned to you'}
            </p>
          </div>
        ) : (
          <>
            {/* Overdue Section */}
            {groupedTasks.overdue.length > 0 && filter !== 'completed' && (
              <div className="task-section">
                <h2 className="section-title overdue">
                  <AlertTriangle size={18} />
                  Overdue ({groupedTasks.overdue.length})
                </h2>
                <div className="task-list">
                  {groupedTasks.overdue.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={() => handleCompleteTask(task.id)}
                      onStart={() => handleStartTask(task.id)}
                      onClick={() => openTaskDetail(task)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Today Section */}
            {groupedTasks.today.length > 0 && filter !== 'completed' && (
              <div className="task-section">
                <h2 className="section-title today">
                  <Calendar size={18} />
                  Due Today ({groupedTasks.today.length})
                </h2>
                <div className="task-list">
                  {groupedTasks.today.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={() => handleCompleteTask(task.id)}
                      onStart={() => handleStartTask(task.id)}
                      onClick={() => openTaskDetail(task)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Section */}
            {groupedTasks.upcoming.length > 0 && filter !== 'completed' && (
              <div className="task-section">
                <h2 className="section-title upcoming">
                  <Clock size={18} />
                  Upcoming ({groupedTasks.upcoming.length})
                </h2>
                <div className="task-list">
                  {groupedTasks.upcoming.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={() => handleCompleteTask(task.id)}
                      onStart={() => handleStartTask(task.id)}
                      onClick={() => openTaskDetail(task)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* No Due Date Section */}
            {groupedTasks.noDueDate.length > 0 && filter !== 'completed' && (
              <div className="task-section">
                <h2 className="section-title">
                  <Clock size={18} />
                  No Due Date ({groupedTasks.noDueDate.length})
                </h2>
                <div className="task-list">
                  {groupedTasks.noDueDate.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={() => handleCompleteTask(task.id)}
                      onStart={() => handleStartTask(task.id)}
                      onClick={() => openTaskDetail(task)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Completed Section */}
            {groupedTasks.completed.length > 0 && filter === 'completed' && (
              <div className="task-section">
                <h2 className="section-title completed">
                  <CheckCircle2 size={18} />
                  Completed ({groupedTasks.completed.length})
                </h2>
                <div className="task-list">
                  {groupedTasks.completed.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => openTaskDetail(task)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Task Detail Modal */}
      {showDetailModal && selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setShowDetailModal(false)}
          onComplete={handleCompleteTask}
          onSkip={handleSkipTask}
          onStart={handleStartTask}
        />
      )}
    </div>
  );
};

export default TasksDashboard;
