/**
 * SINGLE-TENANT SERVICE
 *
 * This service provides helper methods for working with THE single organization.
 * This application supports EXACTLY ONE organization by design.
 *
 * For multi-tenant needs, use Helios MTP instead.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface Organization {
  id: string;
  name: string;
  domain: string;
  logo?: string;
  primary_color?: string;
  secondary_color?: string;
  is_setup_complete: boolean;
  created_at: Date;
  updated_at: Date;
  [key: string]: any;
}

interface OrganizationDomain {
  id: string;
  organization_id: string;
  domain: string;
  is_primary: boolean;
  is_verified: boolean;
  verification_token?: string;
  verified_at?: Date;
}

export class SingleOrganizationService {
  private static cachedOrg: Organization | null = null;
  private static cacheExpiry: number = 0;
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get THE single organization
   * @returns The one and only organization
   * @throws Error if no organization exists or multiple detected
   */
  static async getTheOrganization(): Promise<Organization> {
    // Check cache first
    if (this.cachedOrg && Date.now() < this.cacheExpiry) {
      return this.cachedOrg;
    }

    try {
      // Use the database function that enforces single-tenant
      const result = await db.query('SELECT * FROM get_single_organization()');

      if (!result.rows[0]) {
        throw new Error('No organization found. Please complete setup first.');
      }

      // Cache the result
      this.cachedOrg = result.rows[0];
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;

      return result.rows[0];
    } catch (error: any) {
      if (error.message?.includes('Multiple organizations detected')) {
        logger.error('🚨 CRITICAL: Multiple organizations detected in single-tenant system!');
        logger.error('This should never happen. Database constraints may be compromised.');
        process.exit(1); // Force shutdown - this is a critical error
      }
      throw error;
    }
  }

  /**
   * Get the organization ID (convenience method)
   * @returns The ID of the single organization
   */
  static async getOrganizationId(): Promise<string> {
    const org = await this.getTheOrganization();
    return org.id;
  }

  /**
   * Check if initial setup is complete
   * @returns True if organization exists and setup is complete
   */
  static async isSetupComplete(): Promise<boolean> {
    try {
      const org = await this.getTheOrganization();
      return org.is_setup_complete || false;
    } catch (error: any) {
      if (error.message?.includes('No organization found')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create THE organization (only during initial setup)
   * @param data Organization data
   * @returns The created organization
   * @throws Error if organization already exists
   */
  static async createOrganization(data: Partial<Organization>): Promise<Organization> {
    // Check if organization already exists
    const countResult = await db.query('SELECT COUNT(*) as count FROM organizations');
    const count = parseInt(countResult.rows[0].count);

    if (count > 0) {
      throw new Error(
        'SINGLE-TENANT VIOLATION: Organization already exists. ' +
        'This system supports exactly ONE organization. ' +
        'Multiple organizations are not allowed.'
      );
    }

    // Create the organization
    const query = `
      INSERT INTO organizations (name, domain, logo, primary_color, secondary_color)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      data.name,
      data.domain,
      data.logo || null,
      data.primary_color || null,
      data.secondary_color || null
    ];

    try {
      const result = await db.query(query, values);

      // Clear cache
      this.clearCache();

      logger.info(`✅ Organization "${data.name}" created successfully`);
      return result.rows[0];
    } catch (error: any) {
      if (error.message?.includes('Only one organization is allowed')) {
        throw new Error('Cannot create organization: Single-tenant constraint violated');
      }
      throw error;
    }
  }

  /**
   * Update THE organization
   * @param updates Partial organization data to update
   * @returns Updated organization
   */
  static async updateOrganization(updates: Partial<Organization>): Promise<Organization> {
    const org = await this.getTheOrganization();

    // Build update query dynamically
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      return org; // Nothing to update
    }

    values.push(org.id); // Add org ID as last parameter

    const query = `
      UPDATE organizations
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);

    // Clear cache
    this.clearCache();

    logger.info(`✅ Organization "${result.rows[0].name}" updated`);
    return result.rows[0];
  }

  /**
   * Get all domains for THE organization
   * @returns Array of domains
   */
  static async getOrganizationDomains(): Promise<OrganizationDomain[]> {
    const org = await this.getTheOrganization();

    const query = `
      SELECT * FROM organization_domains
      WHERE organization_id = $1
      ORDER BY is_primary DESC, domain ASC
    `;

    const result = await db.query(query, [org.id]);
    return result.rows;
  }

  /**
   * Add a domain to THE organization
   * @param domain Domain to add
   * @param isPrimary Whether this is the primary domain
   * @returns Created domain record
   */
  static async addDomain(domain: string, isPrimary: boolean = false): Promise<OrganizationDomain> {
    const org = await this.getTheOrganization();

    const query = `
      INSERT INTO organization_domains (organization_id, domain, is_primary)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await db.query(query, [org.id, domain.toLowerCase(), isPrimary]);

    logger.info(`✅ Domain "${domain}" added to organization`);
    return result.rows[0];
  }

  /**
   * Verify single-tenant integrity
   * @returns True if integrity is maintained
   * @throws Error if multiple organizations detected
   */
  static async verifySingleTenantIntegrity(): Promise<boolean> {
    const result = await db.query('SELECT verify_single_tenant_integrity()');
    return result.rows[0]?.verify_single_tenant_integrity || false;
  }

  /**
   * Clear the organization cache
   */
  static clearCache(): void {
    this.cachedOrg = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get organization context for logging/auditing
   * Includes organization name in log entries
   */
  static async getContext(): Promise<{ organizationId: string; organizationName: string }> {
    const org = await this.getTheOrganization();
    return {
      organizationId: org.id,
      organizationName: org.name
    };
  }

  /**
   * DEPRECATED: These methods exist only for backwards compatibility
   * They all work with THE single organization
   */

  static async getOrganizationById(id: string): Promise<Organization> {
    logger.warn('⚠️ getOrganizationById called - this is single-tenant, ID is ignored');
    return this.getTheOrganization();
  }

  static async getOrganizationByDomain(domain: string): Promise<Organization> {
    logger.warn('⚠️ getOrganizationByDomain called - this is single-tenant, returning THE organization');
    return this.getTheOrganization();
  }
}

// Export convenience functions for common operations
export async function getTheOrganization(): Promise<Organization> {
  return SingleOrganizationService.getTheOrganization();
}

export async function getOrganizationId(): Promise<string> {
  return SingleOrganizationService.getOrganizationId();
}

export async function isSetupComplete(): Promise<boolean> {
  return SingleOrganizationService.isSetupComplete();
}

export async function verifySingleTenantIntegrity(): Promise<boolean> {
  return SingleOrganizationService.verifySingleTenantIntegrity();
}