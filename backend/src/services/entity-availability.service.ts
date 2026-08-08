import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

/**
 * Entity Availability Service
 *
 * Determines which canonical entities are available for an organization
 * based on enabled modules.
 */

export interface EntityAvailability {
  canonicalName: string;
  available: boolean;
  providedBy: string[];
  isPrimary?: boolean;
}

export interface AvailableEntitiesResponse {
  [canonicalName: string]: {
    available: boolean;
    providedBy: string[];
  };
}

/**
 * Module-Entity Registry
 *
 * Defines which modules provide which canonical entities.
 * This is the single source of truth for entity availability logic.
 */
export const MODULE_ENTITY_MAP: { [moduleKey: string]: string[] } = {
  // Core entities (always available, no module required)
  core: ['entity.user', 'entity.policy_container'],

  // Google Workspace provides
  google_workspace: ['entity.access_group', 'entity.policy_container'],

  // Microsoft 365 provides
  microsoft_365: ['entity.workspace', 'entity.access_group'],

  // Google Chat provides
  google_chat: ['entity.workspace'],

  // Device Management provides
  device_management: ['entity.device'],
};

/**
 * Get all available entities for an organization
 *
 * Uses database function get_available_entities() which queries
 * enabled modules and returns available canonical entities.
 *
 * @param organizationId - Organization UUID
 * @returns Array of available canonical entity names
 */
export async function getAvailableEntities(
  organizationId: string
): Promise<string[]> {
  try {
    const result = await db.query(
      'SELECT canonical_name FROM get_available_entities($1)',
      [organizationId]
    );

    const entities = result.rows.map((row: any) => row.canonical_name);

    logger.info('Fetched available entities', {
      organizationId,
      entityCount: entities.length,
      entities,
    });

    return entities;
  } catch (error: any) {
    logger.error('Failed to fetch available entities', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get detailed availability information for all entities
 *
 * Includes which modules provide each entity
 *
 * @param organizationId - Organization UUID
 * @returns Availability details for all canonical entities
 */
export async function getAvailableEntitiesDetailed(
  organizationId: string
): Promise<AvailableEntitiesResponse> {
  try {
    const result = await db.query(
      'SELECT canonical_name, provided_by FROM get_available_entities($1)',
      [organizationId]
    );

    const availability: AvailableEntitiesResponse = {};

    // All possible canonical entities
    const allEntities = [
      'entity.user',
      'entity.workspace',
      'entity.access_group',
      'entity.policy_container',
      'entity.device',
    ];

    // Mark which are available
    allEntities.forEach((entity) => {
      const found = result.rows.find((r: any) => r.canonical_name === entity);
      availability[entity] = {
        available: !!found,
        providedBy: found?.provided_by || [],
      };
    });

    logger.info('Fetched detailed entity availability', {
      organizationId,
      availableCount: result.rows.length,
    });

    return availability;
  } catch (error: any) {
    logger.error('Failed to fetch detailed entity availability', {
      organizationId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Check if a specific entity is available for an organization
 *
 * @param organizationId - Organization UUID
 * @param canonicalName - Canonical entity name
 * @returns true if entity is available
 */
export async function isEntityAvailable(
  organizationId: string,
  canonicalName: string
): Promise<boolean> {
  try {
    const result = await db.query(
      `SELECT 1 FROM get_available_entities($1)
       WHERE canonical_name = $2`,
      [organizationId, canonicalName]
    );

    return result.rows.length > 0;
  } catch (error: any) {
    logger.error('Failed to check entity availability', {
      organizationId,
      canonicalName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get which modules provide a specific entity
 *
 * @param canonicalName - Canonical entity name
 * @returns Array of module keys that provide this entity
 */
export function getModulesProvidingEntity(canonicalName: string): string[] {
  const providers: string[] = [];

  for (const [moduleKey, entities] of Object.entries(MODULE_ENTITY_MAP)) {
    if (entities.includes(canonicalName)) {
      providers.push(moduleKey);
    }
  }

  return providers;
}

/**
 * Get all entities provided by a module
 *
 * @param moduleKey - Module key (e.g., 'google_workspace')
 * @returns Array of canonical entity names provided by this module
 */
export function getEntitiesProvidedByModule(moduleKey: string): string[] {
  return MODULE_ENTITY_MAP[moduleKey] || [];
}

/**
 * Validate module dependencies for entity access
 *
 * Ensures at least one module providing the entity is enabled
 *
 * @param organizationId - Organization UUID
 * @param canonicalName - Canonical entity name
 * @returns Validation result with suggestions
 */
export async function validateEntityAccess(
  organizationId: string,
  canonicalName: string
): Promise<{
  valid: boolean;
  error?: string;
  suggestions?: string[];
}> {
  try {
    const available = await isEntityAvailable(organizationId, canonicalName);

    if (available) {
      return { valid: true };
    }

    // Entity not available - provide helpful suggestions
    const providers = getModulesProvidingEntity(canonicalName);

    if (providers.length === 0) {
      return {
        valid: false,
        error: `Entity ${canonicalName} is not provided by any module`,
      };
    }

    return {
      valid: false,
      error: `Entity ${canonicalName} is not available`,
      suggestions: providers.map(
        (module) => `Enable the ${module.replace('_', ' ')} module to access this entity`
      ),
    };
  } catch (error: any) {
    logger.error('Failed to validate entity access', {
      organizationId,
      canonicalName,
      error: error.message,
    });
    throw error;
  }
}
