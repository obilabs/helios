/**
 * Canonical Entity Definitions
 *
 * This file defines all canonical entity names used throughout the application.
 * These are immutable system identifiers that remain constant regardless of
 * tenant-customizable display labels.
 *
 * IMPORTANT: All code should reference these canonical names, NEVER hardcoded labels.
 *
 * Example:
 *   ✅ CORRECT: <h1>{labels[ENTITIES.USER].plural}</h1>
 *   ❌ WRONG:   <h1>Users</h1>
 */

/**
 * Canonical entity names
 * These are the immutable system identifiers used throughout the codebase
 */
export const ENTITIES = {
  /** User entity - Individual accounts with credentials and permissions */
  USER: 'entity.user',

  /** Workspace entity - Collaboration spaces (Microsoft Teams, Google Chat Spaces) */
  WORKSPACE: 'entity.workspace',

  /** Access Group entity - Permission/mailing lists (Google Groups, M365 Security Groups) */
  ACCESS_GROUP: 'entity.access_group',

  /** Policy Container entity - Hierarchical policy/settings containers (Google Org Units, M365 Admin Units) */
  POLICY_CONTAINER: 'entity.policy_container',

  /** Device entity - Managed endpoints (laptops, phones, tablets) */
  DEVICE: 'entity.device',
} as const;

/**
 * Type for canonical entity names
 */
export type EntityName = typeof ENTITIES[keyof typeof ENTITIES];

/**
 * Default labels for all entities
 * Used as fallback when labels haven't loaded yet
 */
export const DEFAULT_LABELS: Record<EntityName, { singular: string; plural: string }> = {
  [ENTITIES.USER]: {
    singular: 'User',
    plural: 'Users',
  },
  [ENTITIES.WORKSPACE]: {
    singular: 'Team',
    plural: 'Teams',
  },
  [ENTITIES.ACCESS_GROUP]: {
    singular: 'Group',
    plural: 'Groups',
  },
  [ENTITIES.POLICY_CONTAINER]: {
    singular: 'Org Unit',
    plural: 'Org Units',
  },
  [ENTITIES.DEVICE]: {
    singular: 'Device',
    plural: 'Devices',
  },
};

/**
 * Module-Entity mapping (client-side reference)
 * Matches backend MODULE_ENTITY_MAP
 */
export const MODULE_ENTITY_MAP: Record<string, EntityName[]> = {
  core: [ENTITIES.USER, ENTITIES.POLICY_CONTAINER],
  google_workspace: [ENTITIES.ACCESS_GROUP, ENTITIES.POLICY_CONTAINER],
  microsoft_365: [ENTITIES.WORKSPACE, ENTITIES.ACCESS_GROUP],
  google_chat: [ENTITIES.WORKSPACE],
  device_management: [ENTITIES.DEVICE],
};

/**
 * Entity metadata for UI purposes
 */
export const ENTITY_METADATA: Record<EntityName, {
  icon: string;
  description: string;
  examples: string[];
  route: string;
}> = {
  [ENTITIES.USER]: {
    icon: 'Users',
    description: 'Individual accounts in your organization',
    examples: ['People', 'Employees', 'Members', 'Staff'],
    route: '/users',
  },
  [ENTITIES.WORKSPACE]: {
    icon: 'Users',
    description: 'Collaboration spaces with chat, files, and tasks',
    examples: ['Teams', 'Pods', 'Projects', 'Spaces'],
    route: '/workspaces',
  },
  [ENTITIES.ACCESS_GROUP]: {
    icon: 'Users',
    description: 'Mailing lists and permission groups',
    examples: ['Groups', 'Lists', 'Security Groups', 'Distribution Lists'],
    route: '/access-groups',
  },
  [ENTITIES.POLICY_CONTAINER]: {
    icon: 'Building2',
    description: 'Hierarchical containers for applying policies and settings',
    examples: ['Org Units', 'Departments', 'Business Units', 'Divisions'],
    route: '/org-units',
  },
  [ENTITIES.DEVICE]: {
    icon: 'Laptop',
    description: 'Managed devices (laptops, phones, tablets)',
    examples: ['Devices', 'Assets', 'Endpoints', 'Equipment'],
    route: '/devices',
  },
};
