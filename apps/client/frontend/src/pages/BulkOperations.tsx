import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Upload, Download, FileSpreadsheet, Clock, CheckCircle2, XCircle, AlertCircle, Save, Trash2, FolderOpen, Wifi, WifiOff, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Edit2, X, Check, Square, CheckSquare, MinusSquare } from 'lucide-react';
import { bulkOperationsService, type BulkOperation, type ValidationError } from '../services/bulk-operations.service';
import { bulkOperationsSocket, type BulkOperationProgressEvent, type BulkOperationFailureEvent } from '../services/bulk-operations-socket.service';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import './BulkOperations.css';

interface BulkOperationsProps {
  organizationId: string;
}

type OperationType = 'user_update' | 'user_create' | 'user_suspend' | 'group_membership_add' | 'group_membership_remove';

// Pagination configuration
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

export function BulkOperations({ organizationId }: BulkOperationsProps) {
  const [selectedOperation, setSelectedOperation] = useState<OperationType>('user_update');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validatedData, setValidatedData] = useState<any[] | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<BulkOperation | null>(null);
  const [operationHistory, setOperationHistory] = useState<BulkOperation[]>([]);
  const [showHistory] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(true); // Toggle for fallback to polling

  // Bulk editor grid state
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [pendingEdits, setPendingEdits] = useState<Map<string, string>>(new Map()); // key: `${rowIndex}-${column}`

  // Confirmation dialog state
  const [showDeleteRowsConfirm, setShowDeleteRowsConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [showExecuteConfirm, setShowExecuteConfirm] = useState(false);

  // Track if we're currently subscribed to prevent duplicate subscriptions
  const activeSubscriptionRef = useRef<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Computed values for pagination
  const totalItems = previewData?.length || 0;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedData = useMemo(() => {
    if (!previewData) return [];
    return previewData.slice(startIndex, endIndex);
  }, [previewData, startIndex, endIndex]);

  // Selection state helpers
  const allPageRowsSelected = useMemo(() => {
    if (!paginatedData.length) return false;
    return paginatedData.every((_, idx) => selectedRows.has(startIndex + idx));
  }, [paginatedData, selectedRows, startIndex]);

  const somePageRowsSelected = useMemo(() => {
    if (!paginatedData.length) return false;
    const someSelected = paginatedData.some((_, idx) => selectedRows.has(startIndex + idx));
    return someSelected && !allPageRowsSelected;
  }, [paginatedData, selectedRows, startIndex, allPageRowsSelected]);

  // Reset pagination when preview data changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedRows(new Set());
    setPendingEdits(new Map());
    setEditingCell(null);
  }, [previewData]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // Bulk editor grid functions
  const handleSelectAll = () => {
    if (allPageRowsSelected) {
      // Deselect all on current page
      const newSelected = new Set(selectedRows);
      paginatedData.forEach((_, idx) => newSelected.delete(startIndex + idx));
      setSelectedRows(newSelected);
    } else {
      // Select all on current page
      const newSelected = new Set(selectedRows);
      paginatedData.forEach((_, idx) => newSelected.add(startIndex + idx));
      setSelectedRows(newSelected);
    }
  };

  const handleSelectRow = (absoluteIndex: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(absoluteIndex)) {
      newSelected.delete(absoluteIndex);
    } else {
      newSelected.add(absoluteIndex);
    }
    setSelectedRows(newSelected);
  };

  const handleSelectAllData = () => {
    if (selectedRows.size === totalItems) {
      setSelectedRows(new Set());
    } else {
      const allIndices = new Set(Array.from({ length: totalItems }, (_, i) => i));
      setSelectedRows(allIndices);
    }
  };

  const handleClearSelection = () => {
    setSelectedRows(new Set());
  };

  const handleDeleteSelected = () => {
    if (!previewData || selectedRows.size === 0) return;
    setShowDeleteRowsConfirm(true);
  };

  const confirmDeleteSelected = () => {
    if (!previewData) return;
    setShowDeleteRowsConfirm(false);

    const sortedIndices = Array.from(selectedRows).sort((a, b) => b - a);
    const newData = [...previewData];
    sortedIndices.forEach(idx => newData.splice(idx, 1));

    setPreviewData(newData);
    setValidatedData(newData);
    setSelectedRows(new Set());
    setPendingEdits(new Map());

    // Adjust current page if necessary
    const newTotalPages = Math.ceil(newData.length / pageSize);
    if (currentPage > newTotalPages && newTotalPages > 0) {
      setCurrentPage(newTotalPages);
    }
  };

  const handleStartEdit = (rowIndex: number, column: string, currentValue: any) => {
    const editKey = `${rowIndex}-${column}`;
    const pendingValue = pendingEdits.get(editKey);
    setEditingCell({ rowIndex, column });
    setEditingValue(pendingValue !== undefined ? pendingValue : String(currentValue || ''));
  };

  const handleSaveEdit = () => {
    if (!editingCell || !previewData) return;

    const { rowIndex, column } = editingCell;
    const editKey = `${rowIndex}-${column}`;
    const originalValue = String(previewData[rowIndex]?.[column] || '');

    if (editingValue !== originalValue) {
      const newEdits = new Map(pendingEdits);
      newEdits.set(editKey, editingValue);
      setPendingEdits(newEdits);
    } else {
      // Remove from pending edits if value matches original
      const newEdits = new Map(pendingEdits);
      newEdits.delete(editKey);
      setPendingEdits(newEdits);
    }

    setEditingCell(null);
    setEditingValue('');
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const handleApplyPendingEdits = () => {
    if (!previewData || pendingEdits.size === 0) return;

    const newData = previewData.map((row, rowIndex) => {
      const updatedRow = { ...row };
      pendingEdits.forEach((value, key) => {
        const [editRowIndex, column] = key.split('-');
        if (parseInt(editRowIndex) === rowIndex) {
          updatedRow[column] = value;
        }
      });
      return updatedRow;
    });

    setPreviewData(newData);
    setValidatedData(newData);
    setPendingEdits(new Map());
  };

  const handleDiscardPendingEdits = () => {
    if (pendingEdits.size === 0) return;
    setShowDiscardConfirm(true);
  };

  const confirmDiscardPendingEdits = () => {
    setShowDiscardConfirm(false);
    setPendingEdits(new Map());
  };

  const getCellValue = (rowIndex: number, column: string, originalValue: any): string => {
    const editKey = `${rowIndex}-${column}`;
    const pendingValue = pendingEdits.get(editKey);
    return pendingValue !== undefined ? pendingValue : String(originalValue || '');
  };

  const hasPendingEdit = (rowIndex: number, column: string): boolean => {
    return pendingEdits.has(`${rowIndex}-${column}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // Initialize WebSocket connection
  useEffect(() => {
    const connectSocket = async () => {
      try {
        await bulkOperationsSocket.connect('');
        setSocketConnected(true);
        console.log('[BulkOperations] WebSocket connected');
      } catch (error) {
        console.error('[BulkOperations] WebSocket connection failed, falling back to polling:', error);
        setSocketConnected(false);
        setUseWebSocket(false);
      }
    };

    connectSocket();

    // Cleanup on unmount
    return () => {
      if (activeSubscriptionRef.current) {
        bulkOperationsSocket.unsubscribe(activeSubscriptionRef.current);
        activeSubscriptionRef.current = null;
      }
      bulkOperationsSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    loadHistory();
    loadTemplates();
  }, []);

  const loadHistory = async () => {
    try {
      const history = await bulkOperationsService.getOperationHistory(10);
      setOperationHistory(history);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const templateList = await bulkOperationsService.getTemplates();
      setTemplates(templateList);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!validatedData || !templateName.trim()) {
      alert('Please provide a template name');
      return;
    }

    try {
      await bulkOperationsService.createTemplate({
        name: templateName,
        description: templateDescription,
        operationType: selectedOperation,
        templateData: validatedData,
      });

      alert('Template saved successfully!');
      setShowSaveTemplate(false);
      setTemplateName('');
      setTemplateDescription('');
      await loadTemplates();
    } catch (error: any) {
      alert(`Error saving template: ${error.message}`);
    }
  };

  const handleLoadTemplate = async (templateId: string) => {
    try {
      const template = await bulkOperationsService.getTemplate(templateId);
      setSelectedOperation(template.operationType);
      setValidatedData(template.templateData);
      setShowTemplates(false);
      alert('Template loaded successfully!');
    } catch (error: any) {
      alert(`Error loading template: ${error.message}`);
    }
  };

  const handleDeleteTemplate = (templateId: string) => {
    setTemplateToDelete(templateId);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      await bulkOperationsService.deleteTemplate(templateToDelete);
      alert('Template deleted successfully!');
      await loadTemplates();
    } catch (error: any) {
      alert(`Error deleting template: ${error.message}`);
    } finally {
      setTemplateToDelete(null);
    }
  };

  const handleShowPreview = async () => {
    if (!validatedData) return;

    try {
      // For the bulk editor grid, show all validated data (pagination handles display)
      setPreviewData(validatedData);
    } catch (error: any) {
      console.error('Preview error:', error);
      setPreviewData(validatedData);
    }
  };

  const handleDownloadResults = async () => {
    if (!currentOperation || !currentOperation.results) {
      alert('No results available to download');
      return;
    }

    try {
      const results = currentOperation.results;
      await bulkOperationsService.exportToCSV(
        results,
        undefined,
        `bulk_operation_results_${currentOperation.id}.csv`
      );
    } catch (error: any) {
      alert(`Error downloading results: ${error.message}`);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setValidationErrors([]);
      setValidatedData(null);
    }
  };

  const handleValidateCSV = async () => {
    if (!selectedFile) return;

    setIsValidating(true);
    setValidationErrors([]);
    setValidatedData(null);

    try {
      const result = await bulkOperationsService.uploadCSV(selectedFile, selectedOperation);

      if (result.success) {
        setValidatedData(result.data || []);
        alert(`CSV validated successfully!\n${result.meta?.validRows} rows are valid and ready to import.`);
      } else {
        setValidationErrors(result.errors || []);
        alert(`CSV validation failed with ${result.errors?.length} errors. Please fix and try again.`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsValidating(false);
    }
  };

  // WebSocket progress handler
  const handleWebSocketProgress = useCallback((data: BulkOperationProgressEvent) => {
    setCurrentOperation((prev) => ({
      ...prev,
      id: data.bulkOperationId,
      organizationId: data.organizationId,
      operationType: prev?.operationType || selectedOperation,
      status: data.status,
      totalItems: data.totalItems,
      processedItems: data.processedItems,
      successCount: data.successCount,
      failureCount: data.failureCount,
      createdAt: prev?.createdAt || new Date().toISOString(),
      progress: data.progress,
    } as BulkOperation));
  }, [selectedOperation]);

  // WebSocket completion handler
  const handleWebSocketCompletion = useCallback(async (data: BulkOperationProgressEvent) => {
    setCurrentOperation((prev) => ({
      ...prev,
      id: data.bulkOperationId,
      organizationId: data.organizationId,
      operationType: prev?.operationType || selectedOperation,
      status: 'completed',
      totalItems: data.totalItems,
      processedItems: data.processedItems,
      successCount: data.successCount,
      failureCount: data.failureCount,
      createdAt: prev?.createdAt || new Date().toISOString(),
      progress: 100,
    } as BulkOperation));

    activeSubscriptionRef.current = null;
    setIsExecuting(false);
    await loadHistory();
    alert('Bulk operation completed successfully!');

    // Reset form
    setSelectedFile(null);
    setValidatedData(null);
    setValidationErrors([]);
  }, [selectedOperation]);

  // WebSocket failure handler
  const handleWebSocketFailure = useCallback(async (data: BulkOperationFailureEvent) => {
    setCurrentOperation((prev) => ({
      ...prev,
      id: data.bulkOperationId,
      organizationId: data.organizationId,
      operationType: prev?.operationType || selectedOperation,
      status: 'failed',
      totalItems: data.totalItems,
      processedItems: data.processedItems,
      successCount: data.successCount,
      failureCount: data.failureCount,
      createdAt: prev?.createdAt || new Date().toISOString(),
      progress: data.progress,
      errorMessage: data.error,
    } as BulkOperation));

    activeSubscriptionRef.current = null;
    setIsExecuting(false);
    await loadHistory();
    alert(`Bulk operation failed: ${data.error}`);
  }, [selectedOperation]);

  const handleExecute = () => {
    if (!validatedData || validatedData.length === 0) {
      alert('No valid data to execute. Please upload and validate a CSV first.');
      return;
    }
    setShowExecuteConfirm(true);
  };

  const confirmExecute = async () => {
    if (!validatedData) return;
    setShowExecuteConfirm(false);
    setIsExecuting(true);

    try {
      const result = await bulkOperationsService.executeOperation(
        selectedOperation,
        validatedData,
        `${selectedOperation} - ${new Date().toLocaleDateString()}`
      );

      setCurrentOperation({
        id: result.bulkOperationId,
        organizationId,
        operationType: selectedOperation,
        status: result.status,
        totalItems: result.totalItems,
        processedItems: 0,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date().toISOString(),
        progress: 0,
      });

      // Use WebSocket for real-time updates if connected, otherwise fall back to polling
      if (useWebSocket && socketConnected && bulkOperationsSocket.getIsConnected()) {
        console.log('[BulkOperations] Using WebSocket for progress updates');
        activeSubscriptionRef.current = result.bulkOperationId;
        bulkOperationsSocket.subscribe(
          result.bulkOperationId,
          handleWebSocketProgress,
          handleWebSocketCompletion,
          handleWebSocketFailure
        );
      } else {
        console.log('[BulkOperations] Using polling for progress updates');
        // Fall back to polling
        await bulkOperationsService.pollOperationStatus(
          result.bulkOperationId,
          (operation) => {
            setCurrentOperation(operation);
          }
        );

        // Reload history
        await loadHistory();

        alert('Bulk operation completed successfully!');

        // Reset form
        setSelectedFile(null);
        setValidatedData(null);
        setValidationErrors([]);
        setIsExecuting(false);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
      setIsExecuting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await bulkOperationsService.downloadTemplate(selectedOperation);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={20} className="status-icon success" />;
      case 'failed':
        return <XCircle size={20} className="status-icon error" />;
      case 'processing':
        return <Clock size={20} className="status-icon processing" />;
      default:
        return <AlertCircle size={20} className="status-icon pending" />;
    }
  };

  return (
    <div className="bulk-operations-container">
      <div className="bulk-operations-header">
        <div className="header-title-row">
          <div>
            <h1>Bulk Operations</h1>
            <p>Perform mass updates on users and groups using CSV imports</p>
          </div>
          <div className="websocket-status" title={socketConnected ? 'Real-time updates enabled' : 'Using polling for updates'}>
            {socketConnected ? (
              <span className="status-connected">
                <Wifi size={16} />
                Real-time
              </span>
            ) : (
              <span className="status-disconnected">
                <WifiOff size={16} />
                Polling
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bulk-operations-content">
        {/* Upload Section */}
        <div className="bulk-card">
          <div className="card-header">
            <Upload size={24} />
            <h2>Upload CSV</h2>
          </div>

          <div className="operation-selector">
            <label>Operation Type:</label>
            <select
              value={selectedOperation}
              onChange={(e) => setSelectedOperation(e.target.value as OperationType)}
              disabled={isValidating || isExecuting}
            >
              <option value="user_update">Update Users</option>
              <option value="user_create">Create Users</option>
              <option value="user_suspend">Suspend Users</option>
              <option value="group_membership_add">Add to Groups</option>
              <option value="group_membership_remove">Remove from Groups</option>
            </select>

            <button
              className="btn-secondary btn-sm"
              onClick={handleDownloadTemplate}
              disabled={isValidating || isExecuting}
            >
              <Download size={16} />
              Download Template
            </button>

            <button
              className="btn-secondary btn-sm"
              onClick={() => setShowTemplates(!showTemplates)}
              disabled={isValidating || isExecuting}
            >
              <FolderOpen size={16} />
              {showTemplates ? 'Hide Templates' : 'Load Template'}
            </button>
          </div>

          {showTemplates && (
            <div className="templates-section">
              <h3>Saved Templates ({templates.length})</h3>
              {templates.length === 0 ? (
                <p className="no-templates">No templates saved yet. Create one by validating data and clicking "Save as Template".</p>
              ) : (
                <div className="templates-grid">
                  {templates.map((template) => (
                    <div key={template.id} className="template-card">
                      <div className="template-header">
                        <h4>{template.name}</h4>
                        <button
                          className="btn-icon"
                          onClick={() => handleDeleteTemplate(template.id)}
                          title="Delete template"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {template.description && (
                        <p className="template-description">{template.description}</p>
                      )}
                      <div className="template-meta">
                        <span className="template-type">{template.operationType}</span>
                        <span className="template-date">
                          {new Date(template.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="btn-sm btn-primary"
                        onClick={() => handleLoadTemplate(template.id)}
                      >
                        Load Template
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="file-upload-area">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={isValidating || isExecuting}
              id="csv-upload"
              style={{ display: 'none' }}
            />
            <label htmlFor="csv-upload" className={`file-upload-label ${isValidating || isExecuting ? 'disabled' : ''}`}>
              <FileSpreadsheet size={48} />
              {selectedFile ? (
                <>
                  <p className="file-name">{selectedFile.name}</p>
                  <p className="file-size">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                </>
              ) : (
                <>
                  <p>Click to upload CSV file</p>
                  <p className="file-hint">or drag and drop</p>
                </>
              )}
            </label>
          </div>

          {selectedFile && !validatedData && (
            <button
              className="btn-primary"
              onClick={handleValidateCSV}
              disabled={isValidating}
            >
              {isValidating ? 'Validating...' : 'Validate CSV'}
            </button>
          )}

          {validationErrors.length > 0 && (
            <div className="validation-errors">
              <h3>Validation Errors ({validationErrors.length})</h3>
              <div className="error-list">
                {validationErrors.slice(0, 10).map((error, index) => (
                  <div key={index} className="error-item">
                    <span className="error-row">Row {error.row}</span>
                    {error.column && <span className="error-column">{error.column}</span>}
                    <span className="error-message">{error.message}</span>
                  </div>
                ))}
                {validationErrors.length > 10 && (
                  <p className="more-errors">+ {validationErrors.length - 10} more errors</p>
                )}
              </div>
            </div>
          )}

          {validatedData && (
            <div className="validation-success">
              <CheckCircle2 size={24} className="success-icon" />
              <div>
                <h3>CSV Validated Successfully</h3>
                <p>{validatedData.length} rows ready to import</p>
              </div>
              <div className="action-buttons">
                <button
                  className="btn-secondary btn-sm"
                  onClick={handleShowPreview}
                  disabled={isExecuting}
                >
                  Preview Changes
                </button>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setShowSaveTemplate(true)}
                  disabled={isExecuting}
                >
                  <Save size={16} />
                  Save as Template
                </button>
                <button
                  className="btn-primary"
                  onClick={handleExecute}
                  disabled={isExecuting}
                >
                  {isExecuting ? 'Executing...' : `Execute Operation`}
                </button>
              </div>
            </div>
          )}

          {showSaveTemplate && (
            <div className="save-template-modal">
              <div className="modal-content">
                <h3>Save as Template</h3>
                <div className="form-group">
                  <label>Template Name</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., New Hire Onboarding"
                  />
                </div>
                <div className="form-group">
                  <label>Description (optional)</label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Describe what this template does..."
                    rows={3}
                  />
                </div>
                <div className="modal-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowSaveTemplate(false);
                      setTemplateName('');
                      setTemplateDescription('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleSaveAsTemplate}
                    disabled={!templateName.trim()}
                  >
                    Save Template
                  </button>
                </div>
              </div>
            </div>
          )}

          {previewData && (
            <div className="preview-section bulk-editor-grid">
              <div className="preview-header">
                <h3>Bulk Editor ({previewData.length} items)</h3>
                <div className="preview-header-actions">
                  {pendingEdits.size > 0 && (
                    <div className="pending-edits-indicator">
                      <Edit2 size={14} />
                      <span>{pendingEdits.size} pending change{pendingEdits.size !== 1 ? 's' : ''}</span>
                      <button className="btn-text btn-sm" onClick={handleApplyPendingEdits}>
                        Apply
                      </button>
                      <button className="btn-text btn-sm" onClick={handleDiscardPendingEdits}>
                        Discard
                      </button>
                    </div>
                  )}
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setPreviewData(null);
                      setSelectedRows(new Set());
                      setPendingEdits(new Map());
                    }}
                  >
                    <X size={16} />
                    Close Editor
                  </button>
                </div>
              </div>

              {/* Bulk Action Toolbar */}
              {selectedRows.size > 0 && (
                <div className="bulk-action-toolbar">
                  <div className="selection-info">
                    <CheckSquare size={16} />
                    <span>{selectedRows.size} of {totalItems} row{selectedRows.size !== 1 ? 's' : ''} selected</span>
                  </div>
                  <div className="bulk-actions">
                    {selectedRows.size < totalItems && (
                      <button className="btn-text btn-sm" onClick={handleSelectAllData}>
                        Select all {totalItems}
                      </button>
                    )}
                    <button className="btn-text btn-sm" onClick={handleClearSelection}>
                      Clear selection
                    </button>
                    <button className="btn-danger btn-sm" onClick={handleDeleteSelected}>
                      <Trash2 size={14} />
                      Delete selected
                    </button>
                  </div>
                </div>
              )}

              <div className="preview-table-container">
                <table className="preview-table bulk-editor-table">
                  <thead>
                    <tr>
                      <th className="checkbox-column">
                        <button
                          className="checkbox-btn"
                          onClick={handleSelectAll}
                          title={allPageRowsSelected ? 'Deselect all on page' : 'Select all on page'}
                        >
                          {allPageRowsSelected ? (
                            <CheckSquare size={18} />
                          ) : somePageRowsSelected ? (
                            <MinusSquare size={18} />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </th>
                      <th className="row-number-column">#</th>
                      {Object.keys(previewData[0] || {}).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((item, pageIndex) => {
                      const absoluteIndex = startIndex + pageIndex;
                      const isSelected = selectedRows.has(absoluteIndex);
                      const columns = Object.keys(item);

                      return (
                        <tr
                          key={absoluteIndex}
                          className={`
                            ${isSelected ? 'row-selected' : ''}
                            ${columns.some(col => hasPendingEdit(absoluteIndex, col)) ? 'row-has-edits' : ''}
                          `}
                        >
                          <td className="checkbox-column">
                            <button
                              className="checkbox-btn"
                              onClick={() => handleSelectRow(absoluteIndex)}
                            >
                              {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                            </button>
                          </td>
                          <td className="row-number-column">{absoluteIndex + 1}</td>
                          {columns.map((column) => {
                            const originalValue = item[column];
                            const displayValue = getCellValue(absoluteIndex, column, originalValue);
                            const isPendingEdit = hasPendingEdit(absoluteIndex, column);
                            const isEditing = editingCell?.rowIndex === absoluteIndex && editingCell?.column === column;

                            return (
                              <td
                                key={column}
                                className={`
                                  editable-cell
                                  ${isPendingEdit ? 'cell-pending-edit' : ''}
                                  ${isEditing ? 'cell-editing' : ''}
                                `}
                                onDoubleClick={() => !isEditing && handleStartEdit(absoluteIndex, column, originalValue)}
                              >
                                {isEditing ? (
                                  <div className="cell-edit-container">
                                    <input
                                      ref={editInputRef}
                                      type="text"
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveEdit();
                                        if (e.key === 'Escape') handleCancelEdit();
                                      }}
                                      onBlur={handleSaveEdit}
                                      className="cell-edit-input"
                                    />
                                    <div className="cell-edit-actions">
                                      <button className="btn-icon-sm" onClick={handleSaveEdit} title="Save">
                                        <Check size={14} />
                                      </button>
                                      <button className="btn-icon-sm" onClick={handleCancelEdit} title="Cancel">
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="cell-display">
                                    <span className="cell-value">{displayValue}</span>
                                    {isPendingEdit && (
                                      <span className="cell-original" title={`Original: ${originalValue}`}>
                                        (was: {String(originalValue).substring(0, 15)}{String(originalValue).length > 15 ? '...' : ''})
                                      </span>
                                    )}
                                    <button
                                      className="cell-edit-btn"
                                      onClick={() => handleStartEdit(absoluteIndex, column, originalValue)}
                                      title="Edit"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="pagination-container">
                <div className="pagination-info">
                  Showing {startIndex + 1} - {endIndex} of {totalItems} items
                </div>

                <div className="pagination-controls">
                  <div className="page-size-selector">
                    <label>Rows per page:</label>
                    <select
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>

                  <div className="page-navigation">
                    <button
                      className="btn-icon"
                      onClick={() => handlePageChange(1)}
                      disabled={currentPage === 1}
                      title="First page"
                    >
                      <ChevronsLeft size={18} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      title="Previous page"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    <span className="page-indicator">
                      Page {currentPage} of {totalPages || 1}
                    </span>

                    <button
                      className="btn-icon"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                      title="Next page"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handlePageChange(totalPages)}
                      disabled={currentPage >= totalPages}
                      title="Last page"
                    >
                      <ChevronsRight size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <p className="editor-hint">
                Double-click a cell to edit. Press Enter to save, Escape to cancel.
              </p>
            </div>
          )}
        </div>

        {/* Progress Section */}
        {currentOperation && (
          <div className="bulk-card">
            <div className="card-header">
              <Clock size={24} />
              <h2>Operation Progress</h2>
            </div>

            <div className="progress-container">
              <div className="progress-stats">
                <div className="stat">
                  <span className="stat-label">Status</span>
                  <span className="stat-value">{currentOperation.status}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Progress</span>
                  <span className="stat-value">{currentOperation.progress}%</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Processed</span>
                  <span className="stat-value">{currentOperation.processedItems} / {currentOperation.totalItems}</span>
                </div>
                <div className="stat success">
                  <span className="stat-label">Success</span>
                  <span className="stat-value">{currentOperation.successCount}</span>
                </div>
                <div className="stat error">
                  <span className="stat-label">Failed</span>
                  <span className="stat-value">{currentOperation.failureCount}</span>
                </div>
              </div>

              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${currentOperation.progress}%` }}
                />
              </div>

              {(currentOperation.status === 'completed' || currentOperation.status === 'failed') && (
                <div className="progress-actions">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={handleDownloadResults}
                  >
                    <Download size={16} />
                    Download Results
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Section */}
        {showHistory && (
          <div className="bulk-card">
            <div className="card-header">
              <Clock size={24} />
              <h2>Recent Operations</h2>
            </div>

            {operationHistory.length === 0 ? (
              <p className="no-history">No bulk operations yet</p>
            ) : (
              <div className="history-list">
                {operationHistory.map((op) => (
                  <div key={op.id} className="history-item">
                    <div className="history-icon">{getStatusIcon(op.status)}</div>
                    <div className="history-details">
                      <div className="history-header">
                        <span className="operation-type">{op.operationName || op.operationType}</span>
                        <span className="operation-date">{new Date(op.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="history-stats">
                        <span>{op.totalItems} items</span>
                        <span className="success">{op.successCount} success</span>
                        <span className="error">{op.failureCount} failed</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Rows Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteRowsConfirm}
        title="Delete Selected Rows"
        message={`Delete ${selectedRows.size} selected row(s)? This cannot be undone.`}
        variant="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteSelected}
        onCancel={() => setShowDeleteRowsConfirm(false)}
      />

      {/* Discard Changes Confirmation */}
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Discard Changes"
        message="Discard all pending changes? This cannot be undone."
        variant="warning"
        confirmText="Discard"
        onConfirm={confirmDiscardPendingEdits}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      {/* Delete Template Confirmation */}
      <ConfirmDialog
        isOpen={templateToDelete !== null}
        title="Delete Template"
        message="Are you sure you want to delete this template?"
        variant="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteTemplate}
        onCancel={() => setTemplateToDelete(null)}
      />

      {/* Execute Operation Confirmation */}
      <ConfirmDialog
        isOpen={showExecuteConfirm}
        title="Execute Bulk Operation"
        message={`Execute bulk operation on ${validatedData?.length || 0} items? This will modify data in your connected platforms.`}
        variant="warning"
        confirmText="Execute"
        onConfirm={confirmExecute}
        onCancel={() => setShowExecuteConfirm(false)}
      />
    </div>
  );
}
