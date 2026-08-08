/**
 * AddContactModal - Create/Edit external contact modal
 */

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Modal } from '../ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Loader2 } from 'lucide-react'
import { authFetch } from '../../config/api'
import './AddContactModal.css'

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
  notes?: string
}

interface AddContactModalProps {
  contact?: Contact | null
  onClose: () => void
  onSuccess: () => void
}

const contactTypes = [
  { value: 'vendor', label: 'Vendor' },
  { value: 'client', label: 'Client' },
  { value: 'partner', label: 'Partner' },
  { value: 'external', label: 'External' },
]

export function AddContactModal({ contact, onClose, onSuccess }: AddContactModalProps) {
  const isEditing = !!contact

  const [formData, setFormData] = useState<{
    email: string
    firstName: string
    lastName: string
    displayName: string
    company: string
    jobTitle: string
    department: string
    phone: string
    mobile: string
    contactType: 'vendor' | 'client' | 'partner' | 'external'
    tags: string[]
    notes: string
  }>({
    email: '',
    firstName: '',
    lastName: '',
    displayName: '',
    company: '',
    jobTitle: '',
    department: '',
    phone: '',
    mobile: '',
    contactType: 'external',
    tags: [],
    notes: '',
  })

  const [tagInput, setTagInput] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Populate form when editing
  useEffect(() => {
    if (contact) {
      setFormData({
        email: contact.email || '',
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        displayName: contact.displayName || '',
        company: contact.company || '',
        jobTitle: contact.jobTitle || '',
        department: contact.department || '',
        phone: contact.phone || '',
        mobile: contact.mobile || '',
        contactType: contact.contactType || 'external',
        tags: contact.tags || [],
        notes: contact.notes || '',
      })
    }
  }, [contact])

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const url = isEditing
        ? `/api/v1/contacts/${contact!.id}`
        : '/api/v1/contacts'
      const method = isEditing ? 'PUT' : 'POST'

      const response = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to save contact')
      }

      return response.json()
    },
    onSuccess: () => {
      onSuccess()
    },
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !formData.tags.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate
    const newErrors: Record<string, string> = {}
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    mutation.mutate(formData)
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isEditing ? 'Edit Contact' : 'Add Contact'}
      size="large"
    >
      <form onSubmit={handleSubmit} className="add-contact-form">
        <div className="form-grid">
          {/* Email - Required */}
          <div className="form-group full-width">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="contact@company.com"
              disabled={isEditing}
              className={errors.email ? 'error' : ''}
            />
            {errors.email && <span className="error-text">{errors.email}</span>}
          </div>

          {/* Name fields */}
          <div className="form-group">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="John"
            />
          </div>

          <div className="form-group">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Doe"
            />
          </div>

          {/* Company info */}
          <div className="form-group">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              name="company"
              value={formData.company}
              onChange={handleChange}
              placeholder="Acme Inc."
            />
          </div>

          <div className="form-group">
            <Label htmlFor="jobTitle">Job Title</Label>
            <Input
              id="jobTitle"
              name="jobTitle"
              value={formData.jobTitle}
              onChange={handleChange}
              placeholder="Account Manager"
            />
          </div>

          <div className="form-group">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              name="department"
              value={formData.department}
              onChange={handleChange}
              placeholder="Sales"
            />
          </div>

          <div className="form-group">
            <Label htmlFor="contactType">Contact Type</Label>
            <select
              id="contactType"
              name="contactType"
              value={formData.contactType}
              onChange={handleChange}
              className="form-select"
            >
              {contactTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Phone numbers */}
          <div className="form-group">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="form-group">
            <Label htmlFor="mobile">Mobile</Label>
            <Input
              id="mobile"
              name="mobile"
              type="tel"
              value={formData.mobile}
              onChange={handleChange}
              placeholder="+1 (555) 987-6543"
            />
          </div>

          {/* Tags */}
          <div className="form-group full-width">
            <Label htmlFor="tags">Tags</Label>
            <div className="tags-input-container">
              <div className="tags-list">
                {formData.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="tag-remove"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="tag-input-row">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder="Add a tag..."
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group full-width">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Additional notes about this contact..."
              rows={3}
              className="form-textarea"
            />
          </div>
        </div>

        {mutation.error && (
          <div className="form-error">
            {mutation.error instanceof Error ? mutation.error.message : 'An error occurred'}
          </div>
        )}

        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" size={16} />}
            {isEditing ? 'Save Changes' : 'Add Contact'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
