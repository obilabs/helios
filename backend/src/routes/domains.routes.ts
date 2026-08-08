/**
 * Domain Routes - Organization Domain Management
 *
 * Manages organization email domains for user classification.
 * Admin-only access for write operations.
 */

import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { domainService } from '../services/domain.service.js'
import { classificationService } from '../services/classification.service.js'
import { successResponse, errorResponse, notFoundResponse } from '../utils/response.js'
import { ErrorCode } from '../types/error-codes.js'
import { logger } from '../utils/logger.js'

const router = Router()

/**
 * @openapi
 * /organization/domains:
 *   get:
 *     summary: List organization domains
 *     description: Get all email domains configured for the organization
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of domains
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId
    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID required')
    }

    const domains = await domainService.listDomains(organizationId)

    return successResponse(res, domains)
  } catch (error: any) {
    logger.error('Failed to list domains', { error: error.message })
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message)
  }
})

/**
 * @openapi
 * /organization/domains:
 *   post:
 *     summary: Add a new domain
 *     description: Add a new email domain to the organization (admin only)
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [domain]
 *             properties:
 *               domain:
 *                 type: string
 *                 example: acme.com
 *               domainType:
 *                 type: string
 *                 enum: [primary, alias]
 *                 default: alias
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId
    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID required')
    }

    const { domain, domainType } = req.body

    if (!domain) {
      return errorResponse(res, ErrorCode.MISSING_REQUIRED_FIELD, 'Domain is required')
    }

    const newDomain = await domainService.addDomain({
      organizationId,
      domain,
      domainType,
      createdBy: req.user?.userId
    })

    // Automatically verify the domain against Google Workspace
    const verificationResult = await domainService.verifyDomain(newDomain.id)

    // Reclassify users after adding domain (only if verified)
    if (verificationResult.success) {
      await classificationService.reclassifyOrganizationUsers(organizationId)
    }

    // Get updated domain with verification status
    const updatedDomain = await domainService.getDomain(newDomain.id)

    return successResponse(res, {
      ...updatedDomain,
      verificationMessage: verificationResult.message
    }, {}, 201)
  } catch (error: any) {
    logger.error('Failed to add domain', { error: error.message })
    return errorResponse(res, ErrorCode.VALIDATION_ERROR, error.message)
  }
})

/**
 * @openapi
 * /organization/domains/{id}:
 *   get:
 *     summary: Get a domain
 *     description: Get details of a specific domain
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const domain = await domainService.getDomain(req.params.id)

    if (!domain) {
      return notFoundResponse(res, 'Domain not found')
    }

    // Verify user has access to this domain's organization
    if (domain.organizationId !== req.user?.organizationId) {
      return notFoundResponse(res, 'Domain not found')
    }

    return successResponse(res, domain)
  } catch (error: any) {
    logger.error('Failed to get domain', { error: error.message })
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message)
  }
})

/**
 * @openapi
 * /organization/domains/{id}:
 *   put:
 *     summary: Update a domain
 *     description: Update domain settings (admin only)
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domainType:
 *                 type: string
 *                 enum: [primary, alias]
 *               isActive:
 *                 type: boolean
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const domain = await domainService.getDomain(req.params.id)

    if (!domain) {
      return notFoundResponse(res, 'Domain not found')
    }

    if (domain.organizationId !== req.user?.organizationId) {
      return notFoundResponse(res, 'Domain not found')
    }

    const { domainType, isActive } = req.body

    const updated = await domainService.updateDomain(req.params.id, {
      domainType,
      isActive
    })

    // Reclassify users if domain was deactivated
    if (isActive === false) {
      await classificationService.reclassifyOrganizationUsers(domain.organizationId)
    }

    return successResponse(res, updated)
  } catch (error: any) {
    logger.error('Failed to update domain', { error: error.message })
    return errorResponse(res, ErrorCode.VALIDATION_ERROR, error.message)
  }
})

/**
 * @openapi
 * /organization/domains/{id}:
 *   delete:
 *     summary: Remove a domain
 *     description: Remove an email domain from the organization (admin only)
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const domain = await domainService.getDomain(req.params.id)

    if (!domain) {
      return notFoundResponse(res, 'Domain not found')
    }

    if (domain.organizationId !== req.user?.organizationId) {
      return notFoundResponse(res, 'Domain not found')
    }

    const organizationId = domain.organizationId

    await domainService.removeDomain(req.params.id)

    // Reclassify users after removing domain
    await classificationService.reclassifyOrganizationUsers(organizationId)

    return successResponse(res, { message: 'Domain removed successfully' })
  } catch (error: any) {
    logger.error('Failed to remove domain', { error: error.message })
    return errorResponse(res, ErrorCode.VALIDATION_ERROR, error.message)
  }
})

/**
 * @openapi
 * /organization/domains/{id}/verify:
 *   post:
 *     summary: Verify a domain
 *     description: Verify a domain against Google Workspace (admin only)
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.post('/:id/verify', requireAuth, requireAdmin, async (req, res) => {
  try {
    const domain = await domainService.getDomain(req.params.id)

    if (!domain) {
      return notFoundResponse(res, 'Domain not found')
    }

    if (domain.organizationId !== req.user?.organizationId) {
      return notFoundResponse(res, 'Domain not found')
    }

    const result = await domainService.verifyDomain(req.params.id)

    if (result.success) {
      // Reclassify users after verifying domain
      await classificationService.reclassifyOrganizationUsers(domain.organizationId)
      return successResponse(res, {
        verified: true,
        message: result.message
      })
    } else {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, result.message)
    }
  } catch (error: any) {
    logger.error('Failed to verify domain', { error: error.message })
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message)
  }
})

/**
 * @openapi
 * /classify/email:
 *   get:
 *     summary: Classify an email address
 *     description: Determine if an email would be classified as user or guest
 *     tags: [Domains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 */
router.get('/classify', requireAuth, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId
    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID required')
    }

    const email = req.query.email as string
    if (!email) {
      return errorResponse(res, ErrorCode.MISSING_REQUIRED_FIELD, 'Email is required')
    }

    const classification = await classificationService.classifyEmail(organizationId, email)

    return successResponse(res, classification)
  } catch (error: any) {
    logger.error('Failed to classify email', { error: error.message })
    return errorResponse(res, ErrorCode.VALIDATION_ERROR, error.message)
  }
})

export default router
