/**
 * Domain Service - Organization Domain Management
 *
 * Manages organization email domains for user classification.
 * Users with matching domains are classified as 'user' (internal),
 * users with non-matching domains are classified as 'guest' (external).
 */

import { db } from '../database/connection.js'
import { logger } from '../utils/logger.js'
import { googleWorkspaceService } from './google-workspace.service.js'

export interface OrganizationDomain {
  id: string
  organizationId: string
  domain: string
  domainType: 'primary' | 'alias'
  verificationStatus: 'pending' | 'verified' | 'failed'
  verificationMethod?: string
  verifiedAt?: Date
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  createdBy?: string
}

export interface CreateDomainInput {
  organizationId: string
  domain: string
  domainType?: 'primary' | 'alias'
  createdBy?: string
}

export interface UpdateDomainInput {
  domainType?: 'primary' | 'alias'
  isActive?: boolean
}

// Domain validation regex
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

export class DomainService {
  /**
   * List all domains for an organization
   */
  async listDomains(organizationId: string): Promise<OrganizationDomain[]> {
    const result = await db.query(
      `SELECT id, organization_id, domain, domain_type, verification_status,
              verification_method, verified_at, is_active, created_at, updated_at, created_by
       FROM organization_domains
       WHERE organization_id = $1
       ORDER BY domain_type ASC, domain ASC`,
      [organizationId]
    )

    return result.rows.map(this.mapRow)
  }

  /**
   * Get active domains for an organization (for classification)
   */
  async getActiveDomains(organizationId: string): Promise<string[]> {
    const result = await db.query(
      `SELECT domain FROM organization_domains
       WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    )

    return result.rows.map((r: { domain: string }) => r.domain.toLowerCase())
  }

  /**
   * Get a single domain by ID
   */
  async getDomain(id: string): Promise<OrganizationDomain | null> {
    const result = await db.query(
      `SELECT id, organization_id, domain, domain_type, verification_status,
              verification_method, verified_at, is_active, created_at, updated_at, created_by
       FROM organization_domains
       WHERE id = $1`,
      [id]
    )

    return result.rows[0] ? this.mapRow(result.rows[0]) : null
  }

  /**
   * Add a new domain to an organization
   */
  async addDomain(input: CreateDomainInput): Promise<OrganizationDomain> {
    const { organizationId, domain, domainType = 'alias', createdBy } = input

    // Validate domain format
    const normalizedDomain = domain.toLowerCase().trim()
    if (!DOMAIN_REGEX.test(normalizedDomain)) {
      throw new Error(`Invalid domain format: ${domain}`)
    }

    // Check if domain already exists
    const existing = await db.query(
      `SELECT id FROM organization_domains WHERE organization_id = $1 AND domain = $2`,
      [organizationId, normalizedDomain]
    )

    if (existing.rows.length > 0) {
      throw new Error(`Domain ${normalizedDomain} already exists for this organization`)
    }

    // Check if domain is used by another organization
    const otherOrg = await db.query(
      `SELECT organization_id FROM organization_domains WHERE domain = $1 AND organization_id != $2`,
      [normalizedDomain, organizationId]
    )

    if (otherOrg.rows.length > 0) {
      throw new Error(`Domain ${normalizedDomain} is already registered to another organization`)
    }

    // If this is set as primary, demote existing primary to alias
    if (domainType === 'primary') {
      await db.query(
        `UPDATE organization_domains SET domain_type = 'alias'
         WHERE organization_id = $1 AND domain_type = 'primary'`,
        [organizationId]
      )
    }

    const result = await db.query(
      `INSERT INTO organization_domains
         (organization_id, domain, domain_type, verification_status, created_by)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id, organization_id, domain, domain_type, verification_status,
                 verification_method, verified_at, is_active, created_at, updated_at, created_by`,
      [organizationId, normalizedDomain, domainType, createdBy]
    )

    logger.info('Domain added (pending verification)', { organizationId, domain: normalizedDomain, domainType })

    return this.mapRow(result.rows[0])
  }

  /**
   * Update a domain
   */
  async updateDomain(id: string, input: UpdateDomainInput): Promise<OrganizationDomain> {
    const domain = await this.getDomain(id)
    if (!domain) {
      throw new Error('Domain not found')
    }

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (input.domainType !== undefined) {
      // If setting as primary, demote existing primary
      if (input.domainType === 'primary') {
        await db.query(
          `UPDATE organization_domains SET domain_type = 'alias'
           WHERE organization_id = $1 AND domain_type = 'primary' AND id != $2`,
          [domain.organizationId, id]
        )
      }
      updates.push(`domain_type = $${paramIndex++}`)
      values.push(input.domainType)
    }

    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`)
      values.push(input.isActive)
    }

    if (updates.length === 0) {
      return domain
    }

    values.push(id)
    const result = await db.query(
      `UPDATE organization_domains
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING id, organization_id, domain, domain_type, verification_status,
                 verification_method, verified_at, is_active, created_at, updated_at, created_by`,
      values
    )

    return this.mapRow(result.rows[0])
  }

  /**
   * Remove a domain
   */
  async removeDomain(id: string): Promise<void> {
    const domain = await this.getDomain(id)
    if (!domain) {
      throw new Error('Domain not found')
    }

    // Check if this is the last domain
    const count = await db.query(
      `SELECT COUNT(*) FROM organization_domains
       WHERE organization_id = $1 AND is_active = true`,
      [domain.organizationId]
    )

    if (parseInt(count.rows[0].count) <= 1) {
      throw new Error('Cannot remove the last domain. At least one domain is required.')
    }

    // If removing primary, promote another to primary
    if (domain.domainType === 'primary') {
      await db.query(
        `UPDATE organization_domains
         SET domain_type = 'primary'
         WHERE organization_id = $1 AND id != $2 AND is_active = true
         ORDER BY created_at ASC
         LIMIT 1`,
        [domain.organizationId, id]
      )
    }

    await db.query(`DELETE FROM organization_domains WHERE id = $1`, [id])

    logger.info('Domain removed', { id, domain: domain.domain })
  }

  /**
   * Check if a domain belongs to an organization
   */
  async isDomainOwned(organizationId: string, domain: string): Promise<boolean> {
    const result = await db.query(
      `SELECT 1 FROM organization_domains
       WHERE organization_id = $1 AND domain = $2 AND is_active = true`,
      [organizationId, domain.toLowerCase()]
    )

    return result.rows.length > 0
  }

  /**
   * Get primary domain for an organization
   */
  async getPrimaryDomain(organizationId: string): Promise<string | null> {
    const result = await db.query(
      `SELECT domain FROM organization_domains
       WHERE organization_id = $1 AND domain_type = 'primary' AND is_active = true
       LIMIT 1`,
      [organizationId]
    )

    return result.rows[0]?.domain || null
  }

  /**
   * Verify a domain against Google Workspace
   * Checks if the domain exists in the organization's Google Workspace domains
   */
  async verifyDomain(domainId: string): Promise<{ success: boolean; message: string }> {
    const domain = await this.getDomain(domainId)
    if (!domain) {
      return { success: false, message: 'Domain not found' }
    }

    try {
      // Get Google Workspace domains for this organization
      const gwDomains = await googleWorkspaceService.listGoogleWorkspaceDomains(domain.organizationId)

      if (!gwDomains.success || !gwDomains.domains) {
        // If we can't get Google Workspace domains, mark as failed
        await db.query(
          `UPDATE organization_domains
           SET verification_status = 'failed', verification_method = 'google_workspace', updated_at = NOW()
           WHERE id = $1`,
          [domainId]
        )
        return {
          success: false,
          message: gwDomains.error || 'Failed to retrieve Google Workspace domains. Please ensure Google Workspace integration is configured.'
        }
      }

      // Check if the domain exists in Google Workspace
      const normalizedDomain = domain.domain.toLowerCase()
      const domainExists = gwDomains.domains.some(
        (d: any) => d.domainName?.toLowerCase() === normalizedDomain
      )

      if (domainExists) {
        await db.query(
          `UPDATE organization_domains
           SET verification_status = 'verified', verification_method = 'google_workspace', verified_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [domainId]
        )
        logger.info('Domain verified via Google Workspace', { domainId, domain: normalizedDomain })
        return { success: true, message: 'Domain verified successfully' }
      } else {
        await db.query(
          `UPDATE organization_domains
           SET verification_status = 'failed', verification_method = 'google_workspace', updated_at = NOW()
           WHERE id = $1`,
          [domainId]
        )
        logger.warn('Domain verification failed - not found in Google Workspace', { domainId, domain: normalizedDomain })
        return {
          success: false,
          message: `Domain "${normalizedDomain}" was not found in your Google Workspace. Please add this domain in Google Admin Console first.`
        }
      }
    } catch (error: any) {
      logger.error('Domain verification error', { domainId, error: error.message })
      await db.query(
        `UPDATE organization_domains
         SET verification_status = 'failed', verification_method = 'google_workspace', updated_at = NOW()
         WHERE id = $1`,
        [domainId]
      )
      return { success: false, message: `Verification failed: ${error.message}` }
    }
  }

  /**
   * Map database row to interface
   */
  private mapRow(row: any): OrganizationDomain {
    return {
      id: row.id,
      organizationId: row.organization_id,
      domain: row.domain,
      domainType: row.domain_type,
      verificationStatus: row.verification_status,
      verificationMethod: row.verification_method,
      verifiedAt: row.verified_at,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by
    }
  }
}

export const domainService = new DomainService()
