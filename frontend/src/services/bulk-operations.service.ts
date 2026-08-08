import { apiPath, authFetch } from '../config/api';

export interface BulkOperation {
  id: string;
  organizationId: string;
  operationType: string;
  operationName?: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress?: number;
  results?: any[];
}

export interface ValidationError {
  row: number;
  column?: string;
  message: string;
}

export interface UploadResult {
  success: boolean;
  data?: any[];
  errors?: ValidationError[];
  meta?: {
    totalRows: number;
    validRows: number;
    errorRows: number;
  };
  headers?: string[];
}

export class BulkOperationsService {
  /**
   * Upload and validate CSV file
   */
  async uploadCSV(file: File, operationType: string): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('operationType', operationType);

    // Don't set Content-Type for FormData - browser sets it with boundary
    const response = await authFetch(apiPath('/bulk/upload'), {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload CSV');
    }

    return await response.json();
  }

  /**
   * Preview bulk operation changes
   */
  async previewOperation(operationType: string, items: any[]): Promise<any> {
    const response = await authFetch(apiPath('/bulk/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationType, items }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to preview operation');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Execute bulk operation
   */
  async executeOperation(
    operationType: string,
    items: any[],
    operationName?: string
  ): Promise<{ bulkOperationId: string; status: string; totalItems: number }> {
    const response = await authFetch(apiPath('/bulk/execute'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationType, items, operationName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to execute operation');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get bulk operation status
   */
  async getOperationStatus(bulkOperationId: string): Promise<BulkOperation> {
    const response = await authFetch(apiPath(`/bulk/status/${bulkOperationId}`));

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get operation status');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get bulk operation history
   */
  async getOperationHistory(limit: number = 50): Promise<BulkOperation[]> {
    const response = await authFetch(apiPath(`/bulk/history?limit=${limit}`));

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get operation history');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Download CSV template
   */
  async downloadTemplate(operationType: string): Promise<void> {
    const response = await authFetch(apiPath(`/bulk/template/${operationType}`));

    if (!response.ok) {
      throw new Error('Failed to download template');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${operationType}_template.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  /**
   * Export data to CSV
   */
  async exportToCSV(data: any[], headers?: string[], filename?: string): Promise<void> {
    const response = await authFetch(apiPath('/bulk/export'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, headers, filename }),
    });

    if (!response.ok) {
      throw new Error('Failed to export data');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  /**
   * Poll operation status until completion
   */
  async pollOperationStatus(
    bulkOperationId: string,
    onProgress: (operation: BulkOperation) => void,
    intervalMs: number = 2000
  ): Promise<BulkOperation> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const operation = await this.getOperationStatus(bulkOperationId);
          onProgress(operation);

          if (operation.status === 'completed' || operation.status === 'failed') {
            resolve(operation);
          } else {
            setTimeout(poll, intervalMs);
          }
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Get all templates for the organization
   */
  async getTemplates(): Promise<any[]> {
    const response = await authFetch(apiPath('/bulk/templates'));

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get templates');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(templateId: string): Promise<any> {
    const response = await authFetch(apiPath(`/bulk/templates/${templateId}`));

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get template');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Create a new template
   */
  async createTemplate(params: {
    name: string;
    description?: string;
    operationType: string;
    templateData: any;
  }): Promise<any> {
    const response = await authFetch(apiPath('/bulk/templates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create template');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Update a template
   */
  async updateTemplate(templateId: string, updates: {
    name?: string;
    description?: string;
    templateData?: any;
  }): Promise<any> {
    const response = await authFetch(apiPath(`/bulk/templates/${templateId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update template');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const response = await authFetch(apiPath(`/bulk/templates/${templateId}`), {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete template');
    }
  }
}

export const bulkOperationsService = new BulkOperationsService();
