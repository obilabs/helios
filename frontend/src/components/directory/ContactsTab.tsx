/**
 * ContactsTab - External contacts management component
 *
 * Displays a table of external contacts (vendors, clients, partners)
 * with search, filtering, and CRUD operations.
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DataTable,
  createColumnHelper,
  createSelectionColumn,
  createActionsColumn,
} from '../ui/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '../ui/Badge'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { AddContactModal } from './AddContactModal'
import {
  Plus,
  Search,
  Download,
  Eye,
  Pencil,
  Trash2,
  Building2,
  Mail,
  Phone,
} from 'lucide-react'
import { authFetch } from '../../config/api'
import './ContactsTab.css'

interface Contact {
  id: string
  email: string
  firstName?: string
  lastName?: string
  displayName?: string
  company?: string
  jobTitle?: string
  department?: string
  phone?: string
  mobile?: string
  contactType: 'vendor' | 'client' | 'partner' | 'external'
  tags: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface ContactsResponse {
  data: Contact[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface ContactsTabProps {
  organizationId: string
}

const columnHelper = createColumnHelper<Contact>()

export function ContactsTab({ organizationId }: ContactsTabProps) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null)

  // Fetch contacts
  const { data, isLoading, error } = useQuery<ContactsResponse>({
    queryKey: ['contacts', organizationId, searchQuery, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        sortBy: 'created_at',
        sortOrder: 'desc',
      })
      if (searchQuery) params.set('search', searchQuery)
      if (typeFilter !== 'all') params.set('contactType', typeFilter)

      const response = await authFetch(`/api/v1/contacts?${params}`)
      if (!response.ok) throw new Error('Failed to fetch contacts')
      const json = await response.json()
      return json.data
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await authFetch(`/api/v1/contacts/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete contact')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setDeleteContact(null)
    },
  })

  // Table columns
  const columns = useMemo(
    () => [
      createSelectionColumn<Contact>(),
      columnHelper.accessor(
        (row) => `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.email,
        {
          id: 'name',
          header: 'Name',
          cell: ({ row }) => {
            const contact = row.original
            const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
            return (
              <div className="contact-name-cell">
                <div className="contact-avatar">
                  {(contact.firstName?.[0] || contact.email[0]).toUpperCase()}
                </div>
                <div className="contact-name-info">
                  <span className="contact-name">{name || contact.email}</span>
                  {name && <span className="contact-email">{contact.email}</span>}
                </div>
              </div>
            )
          },
        }
      ),
      columnHelper.accessor('company', {
        header: 'Company',
        cell: ({ getValue }) => {
          const company = getValue()
          return company ? (
            <div className="contact-company">
              <Building2 size={14} />
              <span>{company}</span>
            </div>
          ) : (
            <span className="text-muted">-</span>
          )
        },
      }),
      columnHelper.accessor('jobTitle', {
        header: 'Job Title',
        cell: ({ getValue }) => getValue() || <span className="text-muted">-</span>,
      }),
      columnHelper.accessor('contactType', {
        header: 'Type',
        cell: ({ getValue }) => {
          const type = getValue()
          const colorMap: Record<string, 'blue' | 'green' | 'purple' | 'gray'> = {
            vendor: 'blue',
            client: 'green',
            partner: 'purple',
            external: 'gray',
          }
          return (
            <Badge variant={colorMap[type] || 'gray'}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Badge>
          )
        },
      }),
      columnHelper.accessor('phone', {
        header: 'Phone',
        cell: ({ row }) => {
          const phone = row.original.phone || row.original.mobile
          return phone ? (
            <div className="contact-phone">
              <Phone size={14} />
              <span>{phone}</span>
            </div>
          ) : (
            <span className="text-muted">-</span>
          )
        },
      }),
      columnHelper.accessor('tags', {
        header: 'Tags',
        cell: ({ getValue }) => {
          const tags = getValue() || []
          if (tags.length === 0) return <span className="text-muted">-</span>
          return (
            <div className="contact-tags">
              {tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline" size="sm">
                  {tag}
                </Badge>
              ))}
              {tags.length > 2 && (
                <Badge variant="outline" size="sm">
                  +{tags.length - 2}
                </Badge>
              )}
            </div>
          )
        },
      }),
      createActionsColumn<Contact>((contact) => (
        <div className="contact-actions">
          <button
            className="action-btn"
            onClick={() => setEditingContact(contact)}
            title="View"
          >
            <Eye size={16} />
          </button>
          <button
            className="action-btn"
            onClick={() => setEditingContact(contact)}
            title="Edit"
          >
            <Pencil size={16} />
          </button>
          <button
            className="action-btn action-btn-danger"
            onClick={() => setDeleteContact(contact)}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )),
    ],
    []
  )

  const contacts = data?.data || []

  return (
    <div className="contacts-tab">
      <div className="contacts-toolbar">
        <div className="contacts-search">
          <Search size={16} className="search-icon" />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="contacts-filters">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="type-filter"
          >
            <option value="all">All Types</option>
            <option value="vendor">Vendors</option>
            <option value="client">Clients</option>
            <option value="partner">Partners</option>
            <option value="external">External</option>
          </select>
        </div>

        <div className="contacts-actions">
          <Button variant="outline" size="sm">
            <Download size={16} />
            Export
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            Add Contact
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="contacts-loading">Loading contacts...</div>
      ) : error ? (
        <div className="contacts-error">Failed to load contacts</div>
      ) : contacts.length === 0 ? (
        <div className="contacts-empty">
          <div className="contacts-empty-icon">
            <Mail size={48} />
          </div>
          <h3>No contacts yet</h3>
          <p>Add external contacts like vendors, clients, and partners to keep track of them.</p>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            Add First Contact
          </Button>
        </div>
      ) : (
        <DataTable
          data={contacts}
          columns={columns}
          getRowId={(row) => row.id}
        />
      )}

      {data && data.totalPages > 1 && (
        <div className="contacts-pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="pagination-info">
            Page {page} of {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Add/Edit Contact Modal */}
      {(showAddModal || editingContact) && (
        <AddContactModal
          contact={editingContact}
          onClose={() => {
            setShowAddModal(false)
            setEditingContact(null)
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            setShowAddModal(false)
            setEditingContact(null)
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteContact && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Contact"
          message={`Are you sure you want to delete ${deleteContact.firstName || deleteContact.email}? This action cannot be undone.`}
          confirmText="Delete"
          variant="danger"
          onConfirm={() => deleteMutation.mutate(deleteContact.id)}
          onCancel={() => setDeleteContact(null)}
        />
      )}
    </div>
  )
}
