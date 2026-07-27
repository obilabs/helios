import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

export interface CustomFieldDefinition {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: 'text' | 'email' | 'url' | 'phone' | 'select' | 'multiselect' | 'date' | 'image' | 'badge';
  fieldCategory: 'general' | 'professional' | 'social' | 'branding';
  isRequired: boolean;
  isVisibleToUser: boolean;
  isVisibleInDirectory: boolean;
  isVisibleInProfile: boolean;
  isUsedInSignatures: boolean;
  validationRules?: any;
  fieldOptions?: string[];
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  displayOrder: number;
  iconName?: string;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  imageDimensions?: { width: number; height: number };
}

export interface CustomFieldValue {
  fieldKey: string;
  value: any;
  assetId?: string;
  fileUrl?: string;
}

class CustomFieldsService {
  /**
   * Get all custom field definitions for an organization
   */
  async getFieldDefinitions(organizationId: string): Promise<CustomFieldDefinition[]> {
    try {
      const result = await db.query(`
        SELECT
          id,
          field_key as "fieldKey",
          field_label as "fieldLabel",
          field_type as "fieldType",
          field_category as "fieldCategory",
          is_required as "isRequired",
          is_visible_to_user as "isVisibleToUser",
          is_visible_in_directory as "isVisibleInDirectory",
          is_visible_in_profile as "isVisibleInProfile",
          is_used_in_signatures as "isUsedInSignatures",
          validation_rules as "validationRules",
          field_options as "fieldOptions",
          placeholder,
          help_text as "helpText",
          default_value as "defaultValue",
          display_order as "displayOrder",
          icon_name as "iconName",
          max_file_size as "maxFileSize",
          allowed_file_types as "allowedFileTypes",
          image_dimensions as "imageDimensions"
        FROM custom_field_definitions
        WHERE organization_id = $1 AND is_active = true
        ORDER BY display_order, field_label
      `, [organizationId]);

      return result.rows;
    } catch (error: any) {
      logger.error('Failed to get field definitions', { organizationId, error: error.message });
      throw error;
    }
  }

  /**
   * Get custom field definitions by category
   */
  async getFieldsByCategory(organizationId: string, category: string): Promise<CustomFieldDefinition[]> {
    try {
      const result = await db.query(`
        SELECT
          id,
          field_key as "fieldKey",
          field_label as "fieldLabel",
          field_type as "fieldType",
          field_category as "fieldCategory",
          is_required as "isRequired",
          is_visible_to_user as "isVisibleToUser",
          is_visible_in_directory as "isVisibleInDirectory",
          is_visible_in_profile as "isVisibleInProfile",
          is_used_in_signatures as "isUsedInSignatures",
          validation_rules as "validationRules",
          field_options as "fieldOptions",
          placeholder,
          help_text as "helpText",
          default_value as "defaultValue",
          display_order as "displayOrder",
          icon_name as "iconName"
        FROM custom_field_definitions
        WHERE organization_id = $1 AND field_category = $2 AND is_active = true
        ORDER BY display_order, field_label
      `, [organizationId, category]);

      return result.rows;
    } catch (error: any) {
      logger.error('Failed to get fields by category', { organizationId, category, error: error.message });
      throw error;
    }
  }

  /**
   * Get signature-enabled custom fields
   */
  async getSignatureFields(organizationId: string): Promise<CustomFieldDefinition[]> {
    try {
      const result = await db.query(`
        SELECT
          id,
          field_key as "fieldKey",
          field_label as "fieldLabel",
          field_type as "fieldType",
          field_category as "fieldCategory",
          field_options as "fieldOptions",
          placeholder,
          display_order as "displayOrder",
          icon_name as "iconName",
          max_file_size as "maxFileSize",
          allowed_file_types as "allowedFileTypes",
          image_dimensions as "imageDimensions"
        FROM custom_field_definitions
        WHERE organization_id = $1 AND is_used_in_signatures = true AND is_active = true
        ORDER BY display_order, field_label
      `, [organizationId]);

      return result.rows;
    } catch (error: any) {
      logger.error('Failed to get signature fields', { organizationId, error: error.message });
      throw error;
    }
  }

  /**
   * Create or update a custom field definition
   */
  async upsertFieldDefinition(
    organizationId: string,
    fieldData: Partial<CustomFieldDefinition>,
    createdBy: string
  ): Promise<CustomFieldDefinition> {
    try {
      const result = await db.query(`
        INSERT INTO custom_field_definitions (
          organization_id, field_key, field_label, field_type, field_category,
          is_required, is_visible_to_user, is_visible_in_directory,
          is_visible_in_profile, is_used_in_signatures,
          validation_rules, field_options, placeholder, help_text,
          default_value, display_order, icon_name,
          max_file_size, allowed_file_types, image_dimensions,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        ON CONFLICT (organization_id, field_key)
        DO UPDATE SET
          field_label = EXCLUDED.field_label,
          field_type = EXCLUDED.field_type,
          field_category = EXCLUDED.field_category,
          is_required = EXCLUDED.is_required,
          is_visible_to_user = EXCLUDED.is_visible_to_user,
          is_visible_in_directory = EXCLUDED.is_visible_in_directory,
          is_visible_in_profile = EXCLUDED.is_visible_in_profile,
          is_used_in_signatures = EXCLUDED.is_used_in_signatures,
          validation_rules = EXCLUDED.validation_rules,
          field_options = EXCLUDED.field_options,
          placeholder = EXCLUDED.placeholder,
          help_text = EXCLUDED.help_text,
          default_value = EXCLUDED.default_value,
          display_order = EXCLUDED.display_order,
          icon_name = EXCLUDED.icon_name,
          max_file_size = EXCLUDED.max_file_size,
          allowed_file_types = EXCLUDED.allowed_file_types,
          image_dimensions = EXCLUDED.image_dimensions,
          updated_at = NOW()
        RETURNING *
      `, [
        organizationId,
        fieldData.fieldKey,
        fieldData.fieldLabel,
        fieldData.fieldType || 'text',
        fieldData.fieldCategory || 'general',
        fieldData.isRequired || false,
        fieldData.isVisibleToUser !== false,
        fieldData.isVisibleInDirectory !== false,
        fieldData.isVisibleInProfile !== false,
        fieldData.isUsedInSignatures || false,
        JSON.stringify(fieldData.validationRules || {}),
        JSON.stringify(fieldData.fieldOptions || []),
        fieldData.placeholder,
        fieldData.helpText,
        fieldData.defaultValue,
        fieldData.displayOrder || 0,
        fieldData.iconName,
        fieldData.maxFileSize,
        JSON.stringify(fieldData.allowedFileTypes || ['image/png', 'image/jpeg']),
        fieldData.imageDimensions ? JSON.stringify(fieldData.imageDimensions) : null,
        createdBy
      ]);

      logger.info('Custom field definition created/updated', {
        organizationId,
        fieldKey: fieldData.fieldKey,
        fieldLabel: fieldData.fieldLabel
      });

      return this.mapFieldDefinition(result.rows[0]);
    } catch (error: any) {
      logger.error('Failed to upsert field definition', {
        organizationId,
        fieldKey: fieldData.fieldKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a custom field definition
   */
  async deleteFieldDefinition(organizationId: string, fieldKey: string): Promise<boolean> {
    try {
      const result = await db.query(`
        UPDATE custom_field_definitions
        SET is_active = false, updated_at = NOW()
        WHERE organization_id = $1 AND field_key = $2
        RETURNING id
      `, [organizationId, fieldKey]);

      if (result.rows.length === 0) {
        return false;
      }

      logger.info('Custom field definition deleted', { organizationId, fieldKey });
      return true;
    } catch (error: any) {
      logger.error('Failed to delete field definition', {
        organizationId,
        fieldKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's custom field values
   */
  async getUserFieldValues(userId: string): Promise<Record<string, any>> {
    try {
      const result = await db.query(`
        SELECT custom_fields
        FROM organization_users
        WHERE id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return {};
      }

      return result.rows[0].custom_fields || {};
    } catch (error: any) {
      logger.error('Failed to get user field values', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update user's custom field values
   */
  async updateUserFieldValues(
    userId: string,
    fieldValues: Record<string, any>
  ): Promise<void> {
    try {
      // Merge with existing values
      const existingResult = await db.query(
        'SELECT custom_fields FROM organization_users WHERE id = $1',
        [userId]
      );

      const existingFields = existingResult.rows[0]?.custom_fields || {};
      const mergedFields = { ...existingFields, ...fieldValues };

      await db.query(`
        UPDATE organization_users
        SET custom_fields = $2, updated_at = NOW()
        WHERE id = $1
      `, [userId, JSON.stringify(mergedFields)]);

      logger.info('User custom fields updated', {
        userId,
        fieldCount: Object.keys(fieldValues).length
      });
    } catch (error: any) {
      logger.error('Failed to update user field values', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize default custom fields for a new organization
   */
  async initializeDefaultFields(organizationId: string, createdBy: string): Promise<void> {
    try {
      await db.query(
        'SELECT initialize_default_custom_fields($1, $2)',
        [organizationId, createdBy]
      );

      logger.info('Default custom fields initialized', { organizationId });
    } catch (error: any) {
      logger.error('Failed to initialize default fields', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get available default fields that can be enabled
   */
  async getAvailableDefaultFields(): Promise<any[]> {
    try {
      const result = await db.query(`
        SELECT
          field_key as "fieldKey",
          field_label as "fieldLabel",
          field_type as "fieldType",
          field_category as "fieldCategory",
          field_options as "fieldOptions",
          placeholder,
          help_text as "helpText",
          icon_name as "iconName"
        FROM default_custom_fields
        ORDER BY display_order, field_label
      `);

      return result.rows;
    } catch (error: any) {
      logger.error('Failed to get default fields', { error: error.message });
      throw error;
    }
  }

  /**
   * Map database row to CustomFieldDefinition
   */
  private mapFieldDefinition(row: any): CustomFieldDefinition {
    return {
      id: row.id,
      fieldKey: row.field_key,
      fieldLabel: row.field_label,
      fieldType: row.field_type,
      fieldCategory: row.field_category,
      isRequired: row.is_required,
      isVisibleToUser: row.is_visible_to_user,
      isVisibleInDirectory: row.is_visible_in_directory,
      isVisibleInProfile: row.is_visible_in_profile,
      isUsedInSignatures: row.is_used_in_signatures,
      validationRules: row.validation_rules,
      fieldOptions: row.field_options,
      placeholder: row.placeholder,
      helpText: row.help_text,
      defaultValue: row.default_value,
      displayOrder: row.display_order,
      iconName: row.icon_name,
      maxFileSize: row.max_file_size,
      allowedFileTypes: row.allowed_file_types,
      imageDimensions: row.image_dimensions
    };
  }
}

export const customFieldsService = new CustomFieldsService();