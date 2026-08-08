import React, { useState, useMemo } from 'react';
import { Activity, Clock, Search, Download, Filter, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, User, Building2, Ticket, Loader2 } from 'lucide-react';
import { DataTable, createColumnHelper } from '../components/ui/DataTable';
import { useAuditLogs, useAuditLogActions } from '../hooks/queries/useAuditLogs';
import { auditLogsService } from '../services';
import type { AuditLog, ActorType, ActionResult, AuditLogFilters } from '../services';
import './AuditLogs.css';

const columnHelper = createColumnHelper<AuditLog>();

const AuditLogs: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // New filters for actor attribution
  const [actorTypeFilter, setActorTypeFilter] = useState<ActorType | ''>('');
  const [vendorNameFilter, setVendorNameFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [ticketReferenceFilter, setTicketReferenceFilter] = useState('');
  const [resultFilter, setResultFilter] = useState<ActionResult | ''>('');
  const [pendingSearch, setPendingSearch] = useState('');
  const itemsPerPage = 50;

  // Build filter params
  const filterParams: AuditLogFilters = useMemo(() => {
    const params: AuditLogFilters = {};
    if (actionFilter) params.action = actionFilter;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (searchTerm) params.search = searchTerm;
    if (actorTypeFilter) params.actorType = actorTypeFilter;
    if (vendorNameFilter) params.vendorName = vendorNameFilter;
    if (technicianFilter) params.technician = technicianFilter;
    if (ticketReferenceFilter) params.ticketReference = ticketReferenceFilter;
    if (resultFilter) params.result = resultFilter;
    return params;
  }, [actionFilter, startDate, endDate, searchTerm, actorTypeFilter, vendorNameFilter, technicianFilter, ticketReferenceFilter, resultFilter]);

  // TanStack Query hooks
  const { data, isLoading, error } = useAuditLogs({
    page: currentPage,
    pageSize: itemsPerPage,
    ...filterParams,
  });

  const { data: actionOptions = [] } = useAuditLogActions();

  const logs = data?.data ?? [];
  const hasMore = data?.hasMore ?? false;

  const handleSearch = () => {
    setSearchTerm(pendingSearch);
    setCurrentPage(1);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setExportError(null);
      const params: Omit<AuditLogFilters, 'limit' | 'offset'> = {};
      if (actionFilter) params.action = actionFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (actorTypeFilter) params.actorType = actorTypeFilter;
      if (vendorNameFilter) params.vendorName = vendorNameFilter;
      if (resultFilter) params.result = resultFilter;

      await auditLogsService.exportAuditLogs(params);
    } catch (err: any) {
      setExportError(err.message || 'Failed to export audit logs');
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('create')) return 'action-create';
    if (action.includes('update') || action.includes('edit')) return 'action-update';
    if (action.includes('delete') || action.includes('remove')) return 'action-delete';
    if (action.includes('login') || action.includes('auth')) return 'action-auth';
    return 'action-default';
  };

  const getActorName = (log: AuditLog) => {
    if (log.actor_first_name && log.actor_last_name) {
      return `${log.actor_first_name} ${log.actor_last_name}`;
    }
    return log.actor_email || 'System';
  };

  const getActorTypeBadge = (type: ActorType | undefined) => {
    switch (type) {
      case 'vendor':
        return { label: 'Vendor', className: 'actor-type-vendor' };
      case 'service':
        return { label: 'Service', className: 'actor-type-service' };
      case 'internal':
      default:
        return { label: 'Internal', className: 'actor-type-internal' };
    }
  };

  const getResultBadge = (result: ActionResult | undefined) => {
    switch (result) {
      case 'failure':
        return { icon: XCircle, label: 'Failed', className: 'result-failure' };
      case 'denied':
        return { icon: AlertCircle, label: 'Denied', className: 'result-denied' };
      case 'success':
      default:
        return { icon: CheckCircle, label: 'Success', className: 'result-success' };
    }
  };

  // Define columns using TanStack Table
  const columns = useMemo(() => [
    columnHelper.accessor('created_at', {
      header: 'Timestamp',
      cell: ({ getValue }) => (
        <span className="timestamp-cell">{formatDate(getValue())}</span>
      ),
      size: 160,
    }),
    columnHelper.display({
      id: 'actor',
      header: 'Actor',
      cell: ({ row }) => {
        const log = row.original;
        const actorTypeBadge = getActorTypeBadge(log.actor_type);
        const actorName = log.actor_type === 'vendor' && log.vendor_technician_name
          ? log.vendor_technician_name
          : getActorName(log);
        const actorEmail = log.actor_type === 'vendor' && log.vendor_technician_email
          ? log.vendor_technician_email
          : log.actor_email;
        const actorTooltip = [
          actorEmail,
          log.vendor_name && `Vendor: ${log.vendor_name}`,
          log.ticket_reference && `Ticket: ${log.ticket_reference}`,
          log.service_name && `Service: ${log.service_name}`,
          log.api_key_name && `API Key: ${log.api_key_name}`
        ].filter(Boolean).join('\n');

        return (
          <div className="actor-cell" title={actorTooltip || undefined}>
            <span className={`actor-type-badge ${actorTypeBadge.className}`}>
              {actorTypeBadge.label}
            </span>
            <span className="actor-name">{actorName}</span>
          </div>
        );
      },
      size: 200,
    }),
    columnHelper.accessor('action', {
      header: 'Action',
      cell: ({ getValue }) => {
        const action = getValue();
        return (
          <span className={`action-badge ${getActionColor(action)}`}>
            {action}
          </span>
        );
      },
      size: 150,
    }),
    columnHelper.accessor('result', {
      header: 'Result',
      cell: ({ getValue }) => {
        const resultBadge = getResultBadge(getValue());
        const ResultIcon = resultBadge.icon;
        return (
          <span className={`result-badge ${resultBadge.className}`}>
            <ResultIcon size={12} />
            {resultBadge.label}
          </span>
        );
      },
      size: 100,
    }),
    columnHelper.display({
      id: 'resource',
      header: 'Resource',
      cell: ({ row }) => {
        const log = row.original;
        return log.resource_type ? (
          <span className="resource-text">
            {log.resource_type}{log.resource_id && ` #${log.resource_id}`}
          </span>
        ) : '-';
      },
      size: 150,
    }),
    columnHelper.accessor('ip_address', {
      header: 'IP Address',
      cell: ({ getValue }) => getValue() || '-',
      size: 120,
    }),
  ], []);

  return (
    <div className="audit-logs-page">
      <div className="page-header">
        <div className="header-title-section">
          <h1>Audit Logs</h1>
          <p className="header-subtitle">View detailed activity logs for your organization</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || isLoading}
          className="export-button"
        >
          <Download size={16} />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="filters-section">
        <div className="search-bar">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search descriptions or metadata..."
            value={pendingSearch}
            onChange={(e) => setPendingSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className="search-input"
          />
          <button onClick={handleSearch} className="search-button">
            Search
          </button>
        </div>

        <div className="filters-row">
          <div className="filter-group">
            <label>
              <Filter size={14} />
              Action Type
            </label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="">All Actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>
              <User size={14} />
              Actor Type
            </label>
            <select
              value={actorTypeFilter}
              onChange={(e) => {
                setActorTypeFilter(e.target.value as ActorType | '');
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="">All Sources</option>
              <option value="internal">Internal Users</option>
              <option value="service">API / Services</option>
              <option value="vendor">Vendors</option>
            </select>
          </div>

          <div className="filter-group">
            <label>
              <CheckCircle size={14} />
              Result
            </label>
            <select
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value as ActionResult | '');
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="">All Results</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="denied">Denied</option>
            </select>
          </div>

          <div className="filter-group">
            <label>
              <Clock size={14} />
              Start Date
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="date-input"
            />
          </div>

          <div className="filter-group">
            <label>
              <Clock size={14} />
              End Date
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="date-input"
            />
          </div>
        </div>

        {/* Vendor-specific filters - shown only when Vendor actor type is selected */}
        {actorTypeFilter === 'vendor' && (
          <div className="filters-row vendor-filters">
            <div className="filter-group">
              <label>
                <Building2 size={14} />
                Vendor Name
              </label>
              <input
                type="text"
                placeholder="Filter by vendor..."
                value={vendorNameFilter}
                onChange={(e) => {
                  setVendorNameFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <label>
                <User size={14} />
                Technician
              </label>
              <input
                type="text"
                placeholder="Filter by technician..."
                value={technicianFilter}
                onChange={(e) => {
                  setTechnicianFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <label>
                <Ticket size={14} />
                Ticket Reference
              </label>
              <input
                type="text"
                placeholder="Filter by ticket..."
                value={ticketReferenceFilter}
                onChange={(e) => {
                  setTicketReferenceFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="filter-input"
              />
            </div>
          </div>
        )}
      </div>

      {(error || exportError) && (
        <div className="error-banner">
          <Activity size={16} />
          {(error as Error)?.message || exportError}
        </div>
      )}

      {isLoading ? (
        <div className="loading-state">
          <Loader2 className="loading-spinner spin" size={32} />
          <p>Loading audit logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <Activity size={48} />
          <h3>No audit logs found</h3>
          <p>No activity logs match your current filters</p>
        </div>
      ) : (
        <>
          <DataTable
            data={logs}
            columns={columns}
            enableSorting={true}
            enableFiltering={false}
            enablePagination={false}
            rowHeight={48}
            emptyMessage="No audit logs found"
            getRowId={(row) => String(row.id)}
          />

          <div className="pagination">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="pagination-button"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span className="pagination-info">
              Page {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={!hasMore}
              className="pagination-button"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AuditLogs;
