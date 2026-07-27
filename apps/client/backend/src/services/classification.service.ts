/**
 * Classification Service - User Type Classification
 *
 * Classifies users as 'user' (internal) or 'guest' (external)
 * based on their email domain matching organization domains.
 */

import { db } from '../database/connection.js'
import { domainService } from './domain.service.js'
import { logger } from '../utils/logger.js'

export type UserClassification = 'user' | 'guest'

export interface ClassificationResult {
  userType: UserClassification
  reason: string
  matchedDomain?: string
  isOrgDomain: boolean
}

export class ClassificationService {
  /**
   * Extract domain from email address
   */
  getEmailDomain(email: string): string {
    const parts = email.split('@')
    if (parts.length !== 2) {
      throw new Error(`Invalid email format: ${email}`)
    }
    return parts[1].toLowerCase()
  }

  /**
   * Classify an email address based on organization domains
   */
  async classifyEmail(organizationId: string, email: string): Promise<ClassificationResult> {
    const domain = this.getEmailDomain(email)

    // Get active organization domains
    const orgDomains = await domainService.getActiveDomains(organizationId)

    // Check if domain matches any org domain
    const isOrgDomain = orgDomains.includes(domain)

    if (isOrgDomain) {
      return {
        userType: 'user',
        reason: 'Email domain matches organization domain',
        matchedDomain: domain,
        isOrgDomain: true
      }
    }

    return {
      userType: 'guest',
      reason: 'Email domain is external to organization',
      isOrgDomain: false
    }
  }

  /**
   * Classify multiple emails at once (batch operation)
   */
  async classifyEmails(organizationId: string, emails: string[]): Promise<Map<string, ClassificationResult>> {
    const orgDomains = await domainService.getActiveDomains(organizationId)
    const results = new Map<string, ClassificationResult>()

    for (const email of emails) {
      try {
        const domain = this.getEmailDomain(email)
        const isOrgDomain = orgDomains.includes(domain)

        results.set(email, {
          userType: isOrgDomain ? 'user' : 'guest',
          reason: isOrgDomain
            ? 'Email domain matches organization domain'
            : 'Email domain is external to organization',
          matchedDomain: isOrgDomain ? domain : undefined,
          isOrgDomain
        })
      } catch (error) {
        results.set(email, {
          userType: 'guest',
          reason: 'Invalid email format',
          isOrgDomain: false
        })
      }
    }

    return results
  }

  /**
   * Reclassify all users in an organization based on current domains
   * Call this after adding/removing domains
   */
  async reclassifyOrganizationUsers(organizationId: string): Promise<{ updated: number }> {
    const orgDomains = await domainService.getActiveDomains(organizationId)

    if (orgDomains.length === 0) {
      logger.warn('No active domains found for reclassification', { organizationId })
      return { updated: 0 }
    }

    // Build domain list for SQL IN clause
    const domainPlaceholders = orgDomains.map((_, i) => `$${i + 2}`).join(', ')

    // Update users with matching domains to 'user'
    const userResult = await db.query(
      `UPDATE organization_users
       SET user_type = 'user', is_guest = false, updated_at = NOW()
       WHERE organization_id = $1
         AND LOWER(SPLIT_PART(email, '@', 2)) IN (${domainPlaceholders})
         AND (user_type != 'user' OR user_type IS NULL)`,
      [organizationId, ...orgDomains]
    )

    // Update users with non-matching domains to 'guest'
    const guestResult = await db.query(
      `UPDATE organization_users
       SET user_type = 'guest', is_guest = true, updated_at = NOW()
       WHERE organization_id = $1
         AND LOWER(SPLIT_PART(email, '@', 2)) NOT IN (${domainPlaceholders})
         AND (user_type != 'guest' OR user_type IS NULL)`,
      [organizationId, ...orgDomains]
    )

    const totalUpdated = (userResult.rowCount || 0) + (guestResult.rowCount || 0)

    logger.info('Reclassified organization users', {
      organizationId,
      usersUpdated: userResult.rowCount,
      guestsUpdated: guestResult.rowCount
    })

    return { updated: totalUpdated }
  }

  /**
   * Get classification for a user by ID
   */
  async getUserClassification(userId: string): Promise<ClassificationResult | null> {
    const result = await db.query(
      `SELECT ou.email, ou.organization_id, ou.user_type
       FROM organization_users ou
       WHERE ou.id = $1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const { email, organization_id } = result.rows[0]
    return this.classifyEmail(organization_id, email)
  }
}

export const classificationService = new ClassificationService()
