/**
 * DomainsSection - Organization email domains management
 *
 * Manages the list of email domains that belong to the organization.
 * Users with matching domains are classified as "staff", others as "guests".
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Plus, Trash2, AlertCircle, Check, Loader2, Crown, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { authFetch } from '../../config/api'
import './DomainsSection.css'

interface Domain {
  id: string
  domain: string
  domainType: 'primary' | 'alias'
  isActive: boolean
  verificationStatus: 'verified' | 'pending' | 'failed'
  createdAt: string
}

interface DomainsSectionProps {
  organizationId: string
}

export function DomainsSection({ organizationId }: DomainsSectionProps) {
  const queryClient = useQueryClient()
  const [newDomain, setNewDomain] = useState('')
  const [error, setError] = useState('')
  const [deletingDomain, setDeletingDomain] = useState<Domain | null>(null)

  // Fetch domains
  const { data: domains = [], isLoading } = useQuery<Domain[]>({
    queryKey: ['organization-domains', organizationId],
    queryFn: async () => {
      const response = await authFetch('/api/v1/organization/domains')
      if (!response.ok) throw new Error('Failed to fetch domains')
      const json = await response.json()
      return json.data || []
    },
  })

  // Add domain mutation
  const addMutation = useMutation({
    mutationFn: async (domain: string) => {
      const response = await authFetch('/api/v1/organization/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, domainType: 'alias' }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to add domain')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-domains'] })
      setNewDomain('')
      setError('')
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  // Delete domain mutation
  const deleteMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const response = await authFetch(`/api/v1/organization/domains/${domainId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete domain')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-domains'] })
      setDeletingDomain(null)
    },
  })

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Basic validation
    const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/
    if (!domainPattern.test(newDomain)) {
      setError('Please enter a valid domain (e.g., example.com)')
      return
    }

    addMutation.mutate(newDomain.toLowerCase())
  }

  if (isLoading) {
    return (
      <div className="domains-section">
        <div className="domains-loading">
          <Loader2 className="animate-spin" size={20} />
          <span>Loading domains...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="domains-section">
      <div className="domains-header">
        <div className="domains-title">
          <Globe size={20} />
          <h3>Organization Domains</h3>
        </div>
        <p className="domains-description">
          Email domains that belong to your organization. Users with these domains
          are classified as <strong>staff</strong>, others are classified as <strong>guests</strong>.
        </p>
      </div>

      {/* Add Domain Form */}
      <form className="add-domain-form" onSubmit={handleAddDomain}>
        <div className="add-domain-input">
          <Input
            type="text"
            value={newDomain}
            onChange={(e) => {
              setNewDomain(e.target.value)
              setError('')
            }}
            placeholder="example.com"
            disabled={addMutation.isPending}
          />
          <Button type="submit" disabled={addMutation.isPending || !newDomain.trim()}>
            {addMutation.isPending ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Plus size={16} />
            )}
            Add Domain
          </Button>
        </div>
        {error && (
          <div className="add-domain-error">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </form>

      {/* Domains List */}
      <div className="domains-list">
        {domains.length === 0 ? (
          <div className="domains-empty">
            <Building2 size={32} />
            <p>No domains configured yet</p>
            <span>Add your organization's email domains above</span>
          </div>
        ) : (
          domains.map((domain) => (
            <div key={domain.id} className={`domain-item ${domain.domainType === 'primary' ? 'primary' : ''}`}>
              <div className="domain-info">
                <div className="domain-name">
                  {domain.domainType === 'primary' && (
                    <Crown size={14} className="primary-icon" />
                  )}
                  <span>{domain.domain}</span>
                </div>
                <div className="domain-badges">
                  <span className={`domain-type ${domain.domainType}`}>
                    {domain.domainType === 'primary' ? 'Primary' : 'Alias'}
                  </span>
                  {domain.verificationStatus === 'verified' && (
                    <span className="domain-verified">
                      <Check size={12} />
                      Verified
                    </span>
                  )}
                </div>
              </div>
              <div className="domain-actions">
                {domain.domainType !== 'primary' && (
                  <button
                    className="domain-delete-btn"
                    onClick={() => setDeletingDomain(domain)}
                    title="Remove domain"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Box */}
      <div className="domains-info">
        <AlertCircle size={16} />
        <div>
          <strong>How domain classification works:</strong>
          <ul>
            <li>Users with email addresses matching these domains are classified as <strong>staff</strong></li>
            <li>Users with other email domains are classified as <strong>guests</strong></li>
            <li>When domains are added or removed, existing users are automatically reclassified</li>
          </ul>
        </div>
      </div>

      {/* Delete Confirmation */}
      {deletingDomain && (
        <ConfirmDialog
          isOpen={true}
          title="Remove Domain"
          message={`Are you sure you want to remove "${deletingDomain.domain}"? Users with this email domain will be reclassified as guests.`}
          confirmText="Remove"
          variant="warning"
          onConfirm={() => deleteMutation.mutate(deletingDomain.id)}
          onCancel={() => setDeletingDomain(null)}
        />
      )}
    </div>
  )
}
