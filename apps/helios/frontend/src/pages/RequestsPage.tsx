import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Calendar,
  AlertCircle,
  RefreshCw,
  Eye,
  Trash2,
  PlayCircle,
} from 'lucide-react';
import { authFetchJson } from '../config/api';
import { useToast } from '../contexts/ToastContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

type RequestType = 'onboard' | 'offboard' | 'transfer';
type RequestStatus = 'pending' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'cancelled';

interface LifecycleRequest {
  id: string;
  organization_id: string;
  request_type: RequestType;
  status: RequestStatus;
  email: string;
  first_name: string;
  last_name: string;
  personal_email?: string;
  user_id?: string;
  start_date?: string;
  end_date?: string;
  template_id?: string;
  template_name?: string;
  job_title?: string;
  department_id?: string;
  department_name?: string;
  manager_id?: string;
  manager_name?: string;
  location?: string;
  requested_by?: string;
  requested_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  rejection_reason?: string;
  tasks_total: number;
  tasks_completed: number;
  created_at: string;
  updated_at: string;
}

interface RequestCounts {
  pending: number;
  approved: number;
  rejected: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}

export const RequestsPage = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'active' | 'completed'>('all');
  const [requests, setRequests] = useState<LifecycleRequest[]>([]);
  const [counts, setCounts] = useState<RequestCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<RequestType | ''>('');
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LifecycleRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { showToast } = useToast();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      // Build status filter based on tab
      let statusFilter: string | undefined;
      if (activeTab === 'pending') statusFilter = 'pending';
      else if (activeTab === 'active') statusFilter = 'approved,in_progress';
      else if (activeTab === 'completed') statusFilter = 'completed,rejected,cancelled';

      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('request_type', typeFilter);
      if (searchQuery) params.set('search', searchQuery);

      const response = await authFetchJson<{ success: boolean; data: LifecycleRequest[]; total: number }>(
        `/api/v1/lifecycle/requests?${params.toString()}`
      );

      if (response.success) {
        setRequests(response.data);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
      showToast('Failed to load requests', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, typeFilter, searchQuery, showToast]);

  const fetchCounts = useCallback(async () => {
    try {
      const response = await authFetchJson<{ success: boolean; data: RequestCounts }>(
        '/api/v1/lifecycle/requests/counts'
      );
      if (response.success) {
        setCounts(response.data);
      }
    } catch (error) {
      console.error('Error fetching counts:', error);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchCounts();
  }, [fetchRequests, fetchCounts]);

  const handleApprove = async (requestId: string) => {
    try {
      const response = await authFetchJson<{ success: boolean; message?: string }>(
        `/api/v1/lifecycle/requests/${requestId}/approve`,
        { method: 'POST' }
      );

      if (response.success) {
        showToast('Request approved successfully', 'success');
        fetchRequests();
        fetchCounts();
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to approve request', 'error');
    }
  };

  const handleReject = async () => {
    if (!rejectRequestId) return;

    try {
      const response = await authFetchJson<{ success: boolean; message?: string }>(
        `/api/v1/lifecycle/requests/${rejectRequestId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: rejectReason }),
        }
      );

      if (response.success) {
        showToast('Request rejected', 'success');
        setShowRejectDialog(false);
        setRejectRequestId(null);
        setRejectReason('');
        fetchRequests();
        fetchCounts();
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to reject request', 'error');
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      const response = await authFetchJson<{ success: boolean; message?: string }>(
        `/api/v1/lifecycle/requests/${requestId}`,
        { method: 'DELETE' }
      );

      if (response.success) {
        showToast('Request cancelled', 'success');
        fetchRequests();
        fetchCounts();
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to cancel request', 'error');
    }
  };

  const openRejectDialog = (requestId: string) => {
    setRejectRequestId(requestId);
    setShowRejectDialog(true);
  };

  const viewRequest = (request: LifecycleRequest) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
  };

  const getProgressPercentage = (request: LifecycleRequest) => {
    if (request.tasks_total === 0) return 0;
    return Math.round((request.tasks_completed / request.tasks_total) * 100);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Manage onboarding and offboarding requests</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { fetchRequests(); fetchCounts(); }}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowNewRequestModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            <Plus size={16} />
            New Request
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {counts && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <SummaryCard
            label="Pending"
            count={counts.pending}
            color="yellow"
            icon={Clock}
            active={activeTab === 'pending'}
            onClick={() => setActiveTab('pending')}
          />
          <SummaryCard
            label="Active"
            count={counts.approved + counts.in_progress}
            color="blue"
            icon={PlayCircle}
            active={activeTab === 'active'}
            onClick={() => setActiveTab('active')}
          />
          <SummaryCard
            label="Completed"
            count={counts.completed}
            color="green"
            icon={CheckCircle}
            active={activeTab === 'completed'}
            onClick={() => setActiveTab('completed')}
          />
          <SummaryCard
            label="All Requests"
            count={Object.values(counts).reduce((a, b) => a + b, 0)}
            color="gray"
            icon={FileText}
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as RequestType | '')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">All Types</option>
            <option value="onboard">Onboarding</option>
            <option value="offboard">Offboarding</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <RefreshCw className="animate-spin mx-auto mb-4" size={32} />
            <p>Loading requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileText className="mx-auto mb-4 text-gray-300" size={48} />
            <p className="text-lg font-medium text-gray-900 mb-1">No requests found</p>
            <p className="text-sm">Create a new request to get started</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Person
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-medium">
                        {request.first_name[0]}{request.last_name[0]}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {request.first_name} {request.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{request.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <TypeBadge type={request.request_type} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      {request.start_date
                        ? new Date(request.start_date).toLocaleDateString()
                        : request.end_date
                          ? new Date(request.end_date).toLocaleDateString()
                          : 'No date'}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Requested: {new Date(request.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {request.tasks_total > 0 ? (
                      <div className="w-32">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{request.tasks_completed}/{request.tasks_total} tasks</span>
                          <span>{getProgressPercentage(request)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-purple-600 h-1.5 rounded-full transition-all"
                            style={{ width: `${getProgressPercentage(request)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">No tasks</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {request.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(request.id)}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => openRejectDialog(request.id)}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-medium hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => viewRequest(request)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                      >
                        <Eye size={18} />
                      </button>
                      {!['completed', 'cancelled', 'rejected'].includes(request.status) && (
                        <button
                          onClick={() => handleCancel(request.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject Dialog */}
      <ConfirmDialog
        isOpen={showRejectDialog}
        title="Reject Request"
        message="Please provide a reason for rejecting this request."
        confirmText="Reject"
        cancelText="Cancel"
        onConfirm={handleReject}
        onCancel={() => {
          setShowRejectDialog(false);
          setRejectRequestId(null);
          setRejectReason('');
        }}
        variant="danger"
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Enter rejection reason..."
          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          rows={3}
        />
      </ConfirmDialog>

      {/* New Request Modal */}
      {showNewRequestModal && (
        <NewRequestModal
          onClose={() => setShowNewRequestModal(false)}
          onSuccess={() => {
            setShowNewRequestModal(false);
            fetchRequests();
            fetchCounts();
          }}
        />
      )}

      {/* Request Detail Modal */}
      {showDetailModal && selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedRequest(null);
          }}
          onUpdate={() => {
            fetchRequests();
            fetchCounts();
          }}
        />
      )}
    </div>
  );
};

const SummaryCard = ({
  label,
  count,
  color,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: 'yellow' | 'blue' | 'green' | 'gray';
  icon: typeof Clock;
  active: boolean;
  onClick: () => void;
}) => {
  const colors = {
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border-2 text-left transition-all ${
        active ? colors[color] : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon size={20} className={active ? '' : 'text-gray-400'} />
        <div>
          <div className="text-2xl font-semibold">{count}</div>
          <div className="text-sm text-gray-500">{label}</div>
        </div>
      </div>
    </button>
  );
};

const StatusBadge = ({ status }: { status: RequestStatus }) => {
  const styles: Record<RequestStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    rejected: 'bg-red-100 text-red-800',
    in_progress: 'bg-purple-100 text-purple-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  const icons: Record<RequestStatus, typeof Clock> = {
    pending: Clock,
    approved: CheckCircle,
    rejected: XCircle,
    in_progress: PlayCircle,
    completed: CheckCircle,
    cancelled: XCircle,
  };

  const Icon = icons[status] || Clock;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      <Icon size={12} />
      <span className="capitalize">{status.replace('_', ' ')}</span>
    </span>
  );
};

const TypeBadge = ({ type }: { type: RequestType }) => {
  const styles: Record<RequestType, string> = {
    onboard: 'bg-green-100 text-green-800',
    offboard: 'bg-orange-100 text-orange-800',
    transfer: 'bg-blue-100 text-blue-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[type]} capitalize`}>
      {type === 'onboard' ? 'Onboarding' : type === 'offboard' ? 'Offboarding' : 'Transfer'}
    </span>
  );
};

// New Request Modal Component
const NewRequestModal = ({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [formData, setFormData] = useState({
    request_type: 'onboard' as RequestType,
    first_name: '',
    last_name: '',
    email: '',
    personal_email: '',
    start_date: '',
    job_title: '',
    department_id: '',
    manager_id: '',
    template_id: '',
  });
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [managers, setManagers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    // Fetch departments, managers, and templates
    const fetchData = async () => {
      try {
        const [deptRes, mgrRes, tplRes] = await Promise.all([
          authFetchJson<{ success: boolean; data: Array<{ id: string; name: string }> }>('/api/v1/departments'),
          authFetchJson<{ success: boolean; data: Array<{ id: string; first_name: string; last_name: string }> }>('/api/v1/users?role=admin,manager'),
          authFetchJson<{ success: boolean; data: Array<{ id: string; name: string }> }>('/api/v1/lifecycle/onboarding-templates?isActive=true'),
        ]);

        if (deptRes.success) setDepartments(deptRes.data);
        if (mgrRes.success) setManagers(mgrRes.data);
        if (tplRes.success) setTemplates(tplRes.data);
      } catch (error) {
        console.error('Error fetching form data:', error);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await authFetchJson<{ success: boolean; data: LifecycleRequest }>(
        '/api/v1/lifecycle/requests',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );

      if (response.success) {
        showToast('Request created successfully', 'success');
        onSuccess();
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to create request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New Request</h2>
          <p className="text-sm text-gray-500 mt-1">Create an onboarding or offboarding request</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Request Type</label>
            <select
              value={formData.request_type}
              onChange={(e) => setFormData({ ...formData, request_type: e.target.value as RequestType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="onboard">Onboarding (New Hire)</option>
              <option value="offboard">Offboarding (Departure)</option>
              <option value="transfer">Transfer (Internal Move)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work Email *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="will.be.created@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Personal Email</label>
            <input
              type="email"
              value={formData.personal_email}
              onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="For pre-start communications"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.request_type === 'offboard' ? 'Last Day' : 'Start Date'}
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
            <input
              type="text"
              value={formData.job_title}
              onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={formData.department_id}
              onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select department...</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
            <select
              value={formData.manager_id}
              onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select manager...</option>
              {managers.map((mgr) => (
                <option key={mgr.id} value={mgr.id}>{mgr.first_name} {mgr.last_name}</option>
              ))}
            </select>
          </div>

          {formData.request_type === 'onboard' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Onboarding Template</label>
              <select
                value={formData.template_id}
                onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select template...</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Request Detail Modal Component
const RequestDetailModal = ({
  request,
  onClose,
  onUpdate,
}: {
  request: LifecycleRequest;
  onClose: () => void;
  onUpdate: () => void;
}) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const response = await authFetchJson<{ success: boolean; data: any[] }>(
          `/api/v1/lifecycle/tasks?request_id=${request.id}`
        );
        if (response.success) {
          setTasks(response.data);
        }
      } catch (error) {
        console.error('Error fetching tasks:', error);
      } finally {
        setLoadingTasks(false);
      }
    };
    fetchTasks();
  }, [request.id]);

  const handleCompleteTask = async (taskId: string) => {
    try {
      await authFetchJson(`/api/v1/lifecycle/tasks/${taskId}/complete`, { method: 'POST' });
      showToast('Task completed', 'success');
      // Refresh tasks
      const response = await authFetchJson<{ success: boolean; data: any[] }>(
        `/api/v1/lifecycle/tasks?request_id=${request.id}`
      );
      if (response.success) setTasks(response.data);
      onUpdate();
    } catch (error: any) {
      showToast(error.message || 'Failed to complete task', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-semibold text-lg">
                {request.first_name[0]}{request.last_name[0]}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {request.first_name} {request.last_name}
                </h2>
                <p className="text-sm text-gray-500">{request.email}</p>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Request Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 uppercase">Type</label>
              <div className="mt-1"><TypeBadge type={request.request_type} /></div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Status</label>
              <div className="mt-1"><StatusBadge status={request.status} /></div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">
                {request.request_type === 'offboard' ? 'Last Day' : 'Start Date'}
              </label>
              <div className="mt-1 text-sm text-gray-900">
                {request.start_date ? new Date(request.start_date).toLocaleDateString() : 'Not set'}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Job Title</label>
              <div className="mt-1 text-sm text-gray-900">{request.job_title || 'Not set'}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Department</label>
              <div className="mt-1 text-sm text-gray-900">{request.department_name || 'Not set'}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Manager</label>
              <div className="mt-1 text-sm text-gray-900">{request.manager_name || 'Not set'}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Requested By</label>
              <div className="mt-1 text-sm text-gray-900">{request.requested_by_name || 'Unknown'}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Template</label>
              <div className="mt-1 text-sm text-gray-900">{request.template_name || 'None'}</div>
            </div>
          </div>

          {request.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-red-800">Rejection Reason</p>
                  <p className="text-sm text-red-700 mt-1">{request.rejection_reason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Tasks */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
              <span>Tasks ({tasks.length})</span>
              {request.tasks_total > 0 && (
                <span className="text-xs font-normal text-gray-500">
                  {request.tasks_completed}/{request.tasks_total} completed
                </span>
              )}
            </h3>

            {loadingTasks ? (
              <div className="text-center py-4 text-gray-500">Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                No tasks generated yet
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`p-3 rounded-lg border ${
                      task.status === 'completed'
                        ? 'bg-green-50 border-green-200'
                        : task.status === 'skipped'
                          ? 'bg-gray-50 border-gray-200'
                          : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {task.status === 'completed' ? (
                          <CheckCircle className="text-green-500" size={18} />
                        ) : task.status === 'skipped' ? (
                          <XCircle className="text-gray-400" size={18} />
                        ) : (
                          <Clock className="text-gray-400" size={18} />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{task.title}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <span className="capitalize">{task.assignee_type}</span>
                            {task.due_date && (
                              <>
                                <span>•</span>
                                <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {task.status === 'pending' && (
                        <button
                          onClick={() => handleCompleteTask(task.id)}
                          className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequestsPage;
