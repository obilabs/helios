import Papa from 'papaparse';
import { logger } from '../utils/logger.js';

export interface ParsedCSVResult {
  success: boolean;
  data?: any[];
  headers?: string[];
  errors?: Array<{
    row: number;
    column?: string;
    message: string;
  }>;
  meta?: {
    totalRows: number;
    validRows: number;
    errorRows: number;
  };
}

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'email' | 'number' | 'boolean' | 'date';
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  custom?: (value: any, row: any) => string | null; // Return error message or null
}

export class CSVParserService {
  /**
   * Parse CSV file content
   */
  public parseCSV(content: string): ParsedCSVResult {
    try {
      const result = Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
        transform: (value: string) => value.trim(),
      });

      if (result.errors.length > 0) {
        return {
          success: false,
          errors: result.errors.map((error: any) => ({
            row: error.row,
            column: error.type === 'FieldMismatch' ? 'structure' : undefined,
            message: error.message,
          })),
        };
      }

      return {
        success: true,
        data: result.data,
        headers: result.meta.fields || [],
        meta: {
          totalRows: result.data.length,
          validRows: result.data.length,
          errorRows: 0,
        },
      };
    } catch (error: any) {
      logger.error('CSV parsing error', { error: error.message });
      return {
        success: false,
        errors: [{
          row: 0,
          message: `Failed to parse CSV: ${error.message}`,
        }],
      };
    }
  }

  /**
   * Validate parsed CSV data against rules
   */
  public validateData(
    data: any[],
    rules: ValidationRule[]
  ): ParsedCSVResult {
    const errors: Array<{ row: number; column?: string; message: string }> = [];
    const validRows: any[] = [];

    data.forEach((row, index) => {
      const rowNumber = index + 2; // +2 because index 0 is row 2 (after header)
      let rowValid = true;

      for (const rule of rules) {
        const value = row[rule.field];
        const error = this.validateField(value, rule, row);

        if (error) {
          errors.push({
            row: rowNumber,
            column: rule.field,
            message: error,
          });
          rowValid = false;
        }
      }

      if (rowValid) {
        validRows.push(row);
      }
    });

    return {
      success: errors.length === 0,
      data: validRows,
      errors: errors.length > 0 ? errors : undefined,
      meta: {
        totalRows: data.length,
        validRows: validRows.length,
        errorRows: errors.length,
      },
    };
  }

  /**
   * Validate a single field against a rule
   */
  private validateField(value: any, rule: ValidationRule, row: any): string | null {
    // Check if required
    if (rule.required && (value === undefined || value === null || value === '')) {
      return `${rule.field} is required`;
    }

    // If not required and empty, skip other validations
    if (!value) {
      return null;
    }

    // Type validation
    if (rule.type) {
      switch (rule.type) {
        case 'email':
          if (!this.isValidEmail(value)) {
            return `${rule.field} must be a valid email address`;
          }
          break;
        case 'number':
          if (isNaN(Number(value))) {
            return `${rule.field} must be a number`;
          }
          break;
        case 'boolean':
          if (!['true', 'false', '1', '0', 'yes', 'no'].includes(String(value).toLowerCase())) {
            return `${rule.field} must be a boolean value`;
          }
          break;
        case 'date':
          if (isNaN(Date.parse(value))) {
            return `${rule.field} must be a valid date`;
          }
          break;
      }
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(value)) {
      return `${rule.field} does not match required format`;
    }

    // Length validation
    if (rule.minLength && String(value).length < rule.minLength) {
      return `${rule.field} must be at least ${rule.minLength} characters`;
    }

    if (rule.maxLength && String(value).length > rule.maxLength) {
      return `${rule.field} must be at most ${rule.maxLength} characters`;
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      return `${rule.field} must be one of: ${rule.enum.join(', ')}`;
    }

    // Custom validation
    if (rule.custom) {
      const customError = rule.custom(value, row);
      if (customError) {
        return customError;
      }
    }

    return null;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Map CSV columns to system fields
   */
  public mapColumns(
    data: any[],
    columnMapping: Record<string, string>
  ): any[] {
    return data.map(row => {
      const mappedRow: any = {};
      for (const [csvColumn, systemField] of Object.entries(columnMapping)) {
        mappedRow[systemField] = row[csvColumn];
      }
      return mappedRow;
    });
  }

  /**
   * Convert CSV data to the format expected by the system
   */
  public transformToSystemFormat(
    data: any[],
    operationType: string
  ): any[] {
    switch (operationType) {
      case 'user_update':
      case 'user_create':
        return data.map(row => ({
          email: row.email?.toLowerCase(),
          firstName: row.firstName || row.given_name || row.first_name,
          lastName: row.lastName || row.family_name || row.last_name,
          password: row.password || undefined, // Include password for user_create
          department: row.department,
          jobTitle: row.jobTitle || row.title || row.job_title,
          organizationalUnit: row.organizationalUnit || row.orgUnitPath || row.org_unit_path,
          location: row.location,
          mobilePhone: row.mobilePhone || row.mobile_phone,
          workPhone: row.workPhone || row.work_phone,
          action: row.action || 'update',
        }));

      case 'group_membership_add':
      case 'group_membership_remove':
        return data.map(row => ({
          groupEmail: row.groupEmail || row.group_email || row.group,
          userEmail: row.userEmail || row.user_email || row.email,
          action: row.action || operationType.includes('add') ? 'add' : 'remove',
        }));

      case 'user_suspend':
      case 'user_delete':
        return data.map(row => ({
          email: row.email?.toLowerCase(),
          action: operationType.replace('user_', ''),
        }));

      default:
        return data;
    }
  }

  /**
   * Generate sample CSV template for an operation type
   */
  public generateTemplate(operationType: string): string {
    const templates: Record<string, string> = {
      user_update: 'email,firstName,lastName,department,jobTitle,organizationalUnit,action\njohn.doe@example.com,John,Doe,Engineering,Senior Developer,/Engineering,update',
      user_create: 'email,firstName,lastName,password,department,jobTitle,organizationalUnit\njane.smith@example.com,Jane,Smith,Welcome123!,Marketing,Marketing Manager,/Marketing',
      group_membership_add: 'groupEmail,userEmail\nengineering-team@example.com,john.doe@example.com',
      group_membership_remove: 'groupEmail,userEmail\nold-team@example.com,jane.smith@example.com',
      user_suspend: 'email\ninactive.user@example.com',
      user_delete: 'email,action\nold.user@example.com,delete',
    };

    return templates[operationType] || '';
  }

  /**
   * Export data to CSV format
   */
  public exportToCSV(data: any[], headers?: string[]): string {
    const result = Papa.unparse(data, {
      columns: headers,
      header: true,
    });

    return result;
  }
}

export const csvParserService = new CSVParserService();
