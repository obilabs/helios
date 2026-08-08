/**
 * Contact Service - External Contact Management
 *
 * Manages external contacts (vendors, clients, partners) that are
 * email-only entries with no login capability.
 */

import { db } from '../database/connection.js'
import { logger } from '../utils/logger.js'

export interface Contact {
  id: string
  organizationId: string
  email: string
  firstName?: string
  lastName?: string
  displayName?: string
  company?: string
  jobTitle?: string
  department?: string
  phone?: string
  mobile?: string
  notes?: string
  contactType: 'vendor' | 'client' | 'partner' | 'external'
  source: 'manual' | 'import' | 'google_contacts' | 'csv'
  googleContactId?: string
  customFields: Record<string, any>
  tags: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  createdBy?: string
}

export interface CreateContactInput {
  organizationId: string
  email: string
  firstName?: string
  lastName?: string
  displayName?: string
  company?: string
  jobTitle?: string
  department?: string
  phone?: string
  mobile?: string
  notes?: string
  contactType?: 'vendor' | 'client' | 'partner' | 'external'
  source?: 'manual' | 'import' | 'google_contacts' | 'csv'
  customFields?: Record<string, any>
  tags?: string[]
  createdBy?: string
}

export interface UpdateContactInput {
  firstName?: string
  lastName?: string
  displayName?: string
  company?: string
  jobTitle?: string
  department?: string
  phone?: string
  mobile?: string
  notes?: string
  contactType?: 'vendor' | 'client' | 'partner' | 'external'
  customFields?: Record<string, any>
  tags?: string[]
  isActive?: boolean
}

export interface ContactFilters {
  search?: string
  contactType?: string
  company?: string
  tags?: string[]
  isActive?: boolean
}

export interface PaginationOptions {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedContacts {
  data: Contact[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export class ContactService {
  /**
   * List contacts with pagination and filtering
   */
  async listContacts(
    organizationId: string,
    filters: ContactFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedContacts> {
    const { page = 1, limit = 50, sortBy = 'created_at', sortOrder = 'desc' } = pagination
    const offset = (page - 1) * limit

    const conditions: string[] = ['organization_id = $1']
    const values: any[] = [organizationId]
    let paramIndex = 2

    if (filters.search) {
      conditions.push(`(
        first_name ILIKE $${paramIndex} OR
        last_name ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex} OR
        company ILIKE $${paramIndex} OR
        display_name ILIKE $${paramIndex}
      )`)
      values.push(`%${filters.search}%`)
      paramIndex++
    }

    if (filters.contactType) {
      conditions.push(`contact_type = $${paramIndex}`)
      values.push(filters.contactType)
      paramIndex++
    }

    if (filters.company) {
      conditions.push(`company ILIKE $${paramIndex}`)
      values.push(`%${filters.company}%`)
      paramIndex++
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${paramIndex}`)
      values.push(filters.tags)
      paramIndex++
    }

    if (filters.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex}`)
      values.push(filters.isActive)
      paramIndex++
    }

    const whereClause = conditions.join(' AND ')

    // Validate sort column
    const allowedSortColumns = ['created_at', 'updated_at', 'email', 'first_name', 'last_name', 'company']
    const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at'
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC'

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM contacts WHERE ${whereClause}`,
      values
    )
    const total = parseInt(countResult.rows[0].count)

    // Get paginated data
    const result = await db.query(
      `SELECT * FROM contacts
       WHERE ${whereClause}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    )

    return {
      data: result.rows.map(this.mapRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  }

  /**
   * Get a single contact by ID
   */
  async getContact(id: string): Promise<Contact | null> {
    const result = await db.query(
      `SELECT * FROM contacts WHERE id = $1`,
      [id]
    )

    return result.rows[0] ? this.mapRow(result.rows[0]) : null
  }

  /**
   * Get a contact by email within an organization
   */
  async getContactByEmail(organizationId: string, email: string): Promise<Contact | null> {
    const result = await db.query(
      `SELECT * FROM contacts WHERE organization_id = $1 AND email = $2`,
      [organizationId, email.toLowerCase()]
    )

    return result.rows[0] ? this.mapRow(result.rows[0]) : null
  }

  /**
   * Create a new contact
   */
  async createContact(input: CreateContactInput): Promise<Contact> {
    const {
      organizationId,
      email,
      firstName,
      lastName,
      displayName,
      company,
      jobTitle,
      department,
      phone,
      mobile,
      notes,
      contactType = 'external',
      source = 'manual',
      customFields = {},
      tags = [],
      createdBy
    } = input

    const normalizedEmail = email.toLowerCase().trim()

    // Check if contact already exists
    const existing = await this.getContactByEmail(organizationId, normalizedEmail)
    if (existing) {
      throw new Error(`Contact with email ${normalizedEmail} already exists`)
    }

    // Check if email belongs to a user (prevent duplicate)
    const userCheck = await db.query(
      `SELECT id FROM organization_users WHERE organization_id = $1 AND email = $2`,
      [organizationId, normalizedEmail]
    )
    if (userCheck.rows.length > 0) {
      throw new Error(`A user account exists with email ${normalizedEmail}. Use the Users feature instead.`)
    }

    const result = await db.query(
      `INSERT INTO contacts (
        organization_id, email, first_name, last_name, display_name,
        company, job_title, department, phone, mobile, notes,
        contact_type, source, custom_fields, tags, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        organizationId, normalizedEmail, firstName, lastName, displayName,
        company, jobTitle, department, phone, mobile, notes,
        contactType, source, JSON.stringify(customFields), tags, createdBy
      ]
    )

    logger.info('Contact created', { organizationId, email: normalizedEmail, contactType })

    return this.mapRow(result.rows[0])
  }

  /**
   * Update a contact
   */
  async updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
    const contact = await this.getContact(id)
    if (!contact) {
      throw new Error('Contact not found')
    }

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    const fieldsToUpdate: Array<{ key: keyof UpdateContactInput; column: string }> = [
      { key: 'firstName', column: 'first_name' },
      { key: 'lastName', column: 'last_name' },
      { key: 'displayName', column: 'display_name' },
      { key: 'company', column: 'company' },
      { key: 'jobTitle', column: 'job_title' },
      { key: 'department', column: 'department' },
      { key: 'phone', column: 'phone' },
      { key: 'mobile', column: 'mobile' },
      { key: 'notes', column: 'notes' },
      { key: 'contactType', column: 'contact_type' },
      { key: 'isActive', column: 'is_active' }
    ]

    for (const { key, column } of fieldsToUpdate) {
      if (input[key] !== undefined) {
        updates.push(`${column} = $${paramIndex++}`)
        values.push(input[key])
      }
    }

    if (input.customFields !== undefined) {
      updates.push(`custom_fields = $${paramIndex++}`)
      values.push(JSON.stringify(input.customFields))
    }

    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`)
      values.push(input.tags)
    }

    if (updates.length === 0) {
      return contact
    }

    values.push(id)
    const result = await db.query(
      `UPDATE contacts
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    )

    logger.info('Contact updated', { id, updates: Object.keys(input) })

    return this.mapRow(result.rows[0])
  }

  /**
   * Delete a contact
   */
  async deleteContact(id: string): Promise<void> {
    const contact = await this.getContact(id)
    if (!contact) {
      throw new Error('Contact not found')
    }

    await db.query(`DELETE FROM contacts WHERE id = $1`, [id])

    logger.info('Contact deleted', { id, email: contact.email })
  }

  /**
   * Import multiple contacts (batch operation)
   */
  async importContacts(
    organizationId: string,
    contacts: Omit<CreateContactInput, 'organizationId'>[],
    createdBy?: string
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const contact of contacts) {
      try {
        await this.createContact({
          ...contact,
          organizationId,
          source: 'import',
          createdBy
        })
        imported++
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          skipped++
        } else {
          errors.push(`${contact.email}: ${error.message}`)
        }
      }
    }

    logger.info('Contacts imported', { organizationId, imported, skipped, errors: errors.length })

    return { imported, skipped, errors }
  }

  /**
   * Export contacts to array (for CSV export)
   */
  async exportContacts(organizationId: string, filters: ContactFilters = {}): Promise<Contact[]> {
    const { data } = await this.listContacts(organizationId, filters, { limit: 10000 })
    return data
  }

  /**
   * Get contact statistics
   */
  async getContactStats(organizationId: string): Promise<{
    total: number
    byType: Record<string, number>
    active: number
    inactive: number
  }> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false) as inactive,
        COUNT(*) FILTER (WHERE contact_type = 'vendor') as vendors,
        COUNT(*) FILTER (WHERE contact_type = 'client') as clients,
        COUNT(*) FILTER (WHERE contact_type = 'partner') as partners,
        COUNT(*) FILTER (WHERE contact_type = 'external') as external
       FROM contacts
       WHERE organization_id = $1`,
      [organizationId]
    )

    const row = result.rows[0]
    return {
      total: parseInt(row.total),
      active: parseInt(row.active),
      inactive: parseInt(row.inactive),
      byType: {
        vendor: parseInt(row.vendors),
        client: parseInt(row.clients),
        partner: parseInt(row.partners),
        external: parseInt(row.external)
      }
    }
  }

  /**
   * Map database row to interface
   */
  private mapRow(row: any): Contact {
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      company: row.company,
      jobTitle: row.job_title,
      department: row.department,
      phone: row.phone,
      mobile: row.mobile,
      notes: row.notes,
      contactType: row.contact_type,
      source: row.source,
      googleContactId: row.google_contact_id,
      customFields: row.custom_fields || {},
      tags: row.tags || [],
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by
    }
  }
}

export const contactService = new ContactService()
