import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

/**
 * Label Service
 *
 * Manages custom labels for canonical entities.
 * Provides label resolution, validation, and CRUD operations.
 */

export interface LabelSet {
  singular: string;
  plural: string;
}

export interface Labels {
  [canonicalName: string]: LabelSet;
}

export interface CustomLabel {
  id: string;
  organizationId: string;
  canonicalName: string;
  labelSingular: string;
  labelPlural: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get all custom labels for an organization
 *
 * @param organizationId - Organization UUID
 * @returns Labels object with all canonical entities
 */
export async function getLabels(organizationId: string): Promise<Labels> {
  try {
    const result = await db.query(
      `SELECT canonical_name, label_singular, label_plural
       FROM custom_labels
       WHERE organization_id = $1
       ORDER BY canonical_name`,
      [organizationId]
    );

    const labels: Labels = {};
    result.rows.forEach((row: any) => {
      labels[row.canonical_name] = {
        singular: row.label_singular,
        plural: row.label_plural,
      };
    });

    logger.info('Fetched labels for organization', {
      organizationId,
      labelCount: result.rows.length,
    });

    return labels;
  } catch (error: any) {
    logger.error('Failed to fetch labels', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get a single label for a canonical entity
 *
 * @param organizationId - Organization UUID
 * @param canonicalName - Canonical entity name (e.g., 'entity.user')
 * @returns LabelSet or null if not found
 */
export async function getLabel(
  organizationId: string,
  canonicalName: string
): Promise<LabelSet | null> {
  try {
    const result = await db.query(
      `SELECT label_singular, label_plural
       FROM custom_labels
       WHERE organization_id = $1 AND canonical_name = $2`,
      [organizationId, canonicalName]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      singular: result.rows[0].label_singular,
      plural: result.rows[0].label_plural,
    };
  } catch (error: any) {
    logger.error('Failed to fetch label', {
      organizationId,
      canonicalName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update custom labels for an organization
 *
 * @param organizationId - Organization UUID
 * @param labels - Labels to update
 * @param updatedBy - User ID making the update
 * @returns Updated labels
 */
export async function updateLabels(
  organizationId: string,
  labels: Labels,
  updatedBy: string
): Promise<Labels> {
  try {
    const updates: Array<{
      canonicalName: string;
      singular: string;
      plural: string;
    }> = [];

    // Validate and prepare updates
    for (const [canonicalName, labelSet] of Object.entries(labels)) {
      // Validate labels
      const validation = validateLabel(labelSet.singular);
      if (!validation.valid) {
        throw new Error(
          `Invalid singular label for ${canonicalName}: ${validation.error}`
        );
      }

      const validationPlural = validateLabel(labelSet.plural);
      if (!validationPlural.valid) {
        throw new Error(
          `Invalid plural label for ${canonicalName}: ${validationPlural.error}`
        );
      }

      updates.push({
        canonicalName,
        singular: labelSet.singular,
        plural: labelSet.plural,
      });
    }

    // Update each label
    for (const update of updates) {
      await db.query(
        `UPDATE custom_labels
         SET label_singular = $1,
             label_plural = $2,
             updated_at = NOW(),
             updated_by = $3
         WHERE organization_id = $4 AND canonical_name = $5`,
        [
          update.singular,
          update.plural,
          updatedBy,
          organizationId,
          update.canonicalName,
        ]
      );
    }

    logger.info('Updated labels for organization', {
      organizationId,
      updatedBy,
      labelCount: updates.length,
    });

    // Return updated labels
    return await getLabels(organizationId);
  } catch (error: any) {
    logger.error('Failed to update labels', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Validate a label value
 *
 * Checks: length, XSS, special characters
 *
 * @param label - Label to validate
 * @returns Validation result
 */
export function validateLabel(label: string): {
  valid: boolean;
  error?: string;
} {
  // Empty check
  if (!label || label.trim() === '') {
    return { valid: false, error: 'Label cannot be empty' };
  }

  // Length check (max 30 characters)
  if (label.length > 30) {
    return {
      valid: false,
      error: 'Label must be 30 characters or less',
    };
  }

  // XSS prevention - no HTML tags
  if (/<[^>]*>/.test(label)) {
    return {
      valid: false,
      error: 'Label cannot contain HTML tags',
    };
  }

  // Special characters check
  // Allow: alphanumeric, spaces, hyphens, apostrophes
  if (!/^[a-zA-Z0-9\s\-']+$/.test(label)) {
    return {
      valid: false,
      error:
        'Label can only contain letters, numbers, spaces, hyphens, and apostrophes',
    };
  }

  // Prevent excessive whitespace
  if (/\s{3,}/.test(label)) {
    return {
      valid: false,
      error: 'Label cannot contain excessive whitespace',
    };
  }

  return { valid: true };
}

/**
 * Reset labels to defaults for an organization
 *
 * @param organizationId - Organization UUID
 * @returns Default labels
 */
export async function resetLabelsToDefaults(
  organizationId: string,
  updatedBy: string
): Promise<Labels> {
  try {
    const defaults = {
      'entity.user': { singular: 'User', plural: 'Users' },
      'entity.workspace': { singular: 'Team', plural: 'Teams' },
      'entity.access_group': { singular: 'Group', plural: 'Groups' },
      'entity.policy_container': { singular: 'Org Unit', plural: 'Org Units' },
      'entity.device': { singular: 'Device', plural: 'Devices' },
    };

    for (const [canonicalName, labelSet] of Object.entries(defaults)) {
      await db.query(
        `UPDATE custom_labels
         SET label_singular = $1,
             label_plural = $2,
             updated_at = NOW(),
             updated_by = $3
         WHERE organization_id = $4 AND canonical_name = $5`,
        [
          labelSet.singular,
          labelSet.plural,
          updatedBy,
          organizationId,
          canonicalName,
        ]
      );
    }

    logger.info('Reset labels to defaults', {
      organizationId,
      updatedBy,
    });

    return defaults;
  } catch (error: any) {
    logger.error('Failed to reset labels', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get labels with availability information
 *
 * Returns labels along with whether each entity is available
 * based on enabled modules
 *
 * @param organizationId - Organization UUID
 * @returns Labels with availability flags
 */
export async function getLabelsWithAvailability(organizationId: string): Promise<{
  labels: Labels;
  availability: { [canonicalName: string]: { available: boolean; providedBy: string[] } };
}> {
  try {
    // Get custom labels
    const labels = await getLabels(organizationId);

    // Get available entities
    const availabilityResult = await db.query(
      'SELECT * FROM get_available_entities($1)',
      [organizationId]
    );

    const availability: { [key: string]: { available: boolean; providedBy: string[] } } = {};

    // All canonical entities
    const allEntities = [
      'entity.user',
      'entity.workspace',
      'entity.access_group',
      'entity.policy_container',
      'entity.device'
    ];

    // Mark available/unavailable
    allEntities.forEach(entity => {
      const found = availabilityResult.rows.find((r: any) => r.canonical_name === entity);
      availability[entity] = {
        available: !!found,
        providedBy: found?.provided_by || []
      };
    });

    return { labels, availability };
  } catch (error: any) {
    logger.error('Failed to get labels with availability', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}
