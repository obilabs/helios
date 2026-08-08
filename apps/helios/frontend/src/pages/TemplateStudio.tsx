import { useState, useEffect } from 'react';
import { useTabPersistence } from '../hooks/useTabPersistence';
import { PenLine, Mail, Globe, Puzzle, Plus, FileText, Calendar, Target, Search, RefreshCw, Star, Palette, Eye, Pencil, Copy, Trash2, Tag, X, Loader, Check, Image } from 'lucide-react';
import './TemplateStudio.css';
import { AssetPickerModal } from '../components/AssetPickerModal';
import { authFetch } from '../config/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  template_type?: string;
  html_content: string;
  mobile_html_content?: string;
  plain_text_content?: string;
  thumbnail_url?: string;
  is_default: boolean;
  is_active: boolean;
  is_system_template?: boolean;
  assignment_count: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
  created_by_name?: string;
}

interface Campaign {
  id: string;
  campaign_name: string;
  campaign_description?: string;
  template_name: string;
  target_type: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
}

interface TemplateStudioProps {
  organizationId: string;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title?: string;
  department?: string;
  mobile_phone?: string;
  work_phone?: string;
  work_phone_extension?: string;
  location?: string;
  organizational_unit?: string;
  employee_id?: string;
  bio?: string;
  pronouns?: string;
  professional_designations?: string;
  avatar_url?: string;
  user_linkedin_url?: string;
  user_twitter_url?: string;
  user_github_url?: string;
  user_portfolio_url?: string;
  user_instagram_url?: string;
  user_facebook_url?: string;
}

export function TemplateStudio({ organizationId }: TemplateStudioProps) {
  const [activeTab, setActiveTab] = useTabPersistence<'templates' | 'campaigns' | 'assignments'>('helios_template_studio_tab', 'templates');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  // Create template form state
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('email_signature');
  const [newTemplateType, setNewTemplateType] = useState('email_signature');
  const [newTemplateHtml, setNewTemplateHtml] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [templateWarning, setTemplateWarning] = useState<string | null>(null);

  // Template variables and preview
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [organizationData, setOrganizationData] = useState<any>(null);

  // Asset picker state
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // Template type definitions
  const templateTypes = [
    {
      value: 'email_signature',
      label: 'Email Signature',
      description: 'Body content only - no <html> or <body> tags needed',
      icon: <PenLine size={16} />
    },
    {
      value: 'email_template',
      label: 'Email Template',
      description: 'Full HTML email template',
      icon: <Mail size={16} />
    },
    {
      value: 'public_page',
      label: 'Public Page',
      description: 'Complete webpage with <html>, <head>, <body>',
      icon: <Globe size={16} />
    },
    {
      value: 'html_snippet',
      label: 'HTML Snippet',
      description: 'Reusable HTML block for embedding',
      icon: <Puzzle size={16} />
    }
  ];

  // Available template variables
  const availableVariables = [
    // Personal Info
    { key: 'firstName', label: 'First Name', example: 'John', category: 'Personal' },
    { key: 'lastName', label: 'Last Name', example: 'Doe', category: 'Personal' },
    { key: 'email', label: 'Email', example: 'john.doe@example.com', category: 'Personal' },
    { key: 'userPhoto', label: 'Profile Photo', example: '(photo URL)', category: 'Personal' },

    // Job Info
    { key: 'jobTitle', label: 'Job Title', example: 'Senior Developer', category: 'Job' },
    { key: 'department', label: 'Department', example: 'Engineering', category: 'Job' },
    { key: 'organizationalUnit', label: 'Organizational Unit', example: 'Sales Team', category: 'Job' },
    { key: 'employeeId', label: 'Employee ID', example: 'EMP001', category: 'Job' },

    // Contact
    { key: 'mobilePhone', label: 'Mobile Phone', example: '+1-555-0123', category: 'Contact' },
    { key: 'workPhone', label: 'Work Phone', example: '+1-555-0100', category: 'Contact' },
    { key: 'workPhoneExtension', label: 'Work Phone Extension', example: 'x1234', category: 'Contact' },
    { key: 'location', label: 'Location', example: 'San Francisco, CA', category: 'Contact' },

    // Personal Details
    { key: 'bio', label: 'Bio', example: 'Passionate about technology', category: 'Details' },
    { key: 'pronouns', label: 'Pronouns', example: 'he/him', category: 'Details' },
    { key: 'professionalDesignations', label: 'Professional Designations', example: 'MBA, PMP', category: 'Details' },

    // User Social
    { key: 'userLinkedIn', label: 'LinkedIn Profile', example: 'linkedin.com/in/johndoe', category: 'User Social' },
    { key: 'userTwitter', label: 'Twitter Profile', example: 'twitter.com/johndoe', category: 'User Social' },
    { key: 'userGitHub', label: 'GitHub Profile', example: 'github.com/johndoe', category: 'User Social' },
    { key: 'userPortfolio', label: 'Portfolio', example: 'johndoe.com', category: 'User Social' },
    { key: 'userInstagram', label: 'Instagram', example: 'instagram.com/johndoe', category: 'User Social' },
    { key: 'userFacebook', label: 'Facebook', example: 'facebook.com/johndoe', category: 'User Social' },

    // Company Social
    { key: 'companyLinkedIn', label: 'Company LinkedIn', example: 'linkedin.com/company/acme', category: 'Company Social' },
    { key: 'companyTwitter', label: 'Company Twitter', example: 'twitter.com/acmecorp', category: 'Company Social' },
    { key: 'companyFacebook', label: 'Company Facebook', example: 'facebook.com/acmecorp', category: 'Company Social' },
    { key: 'companyInstagram', label: 'Company Instagram', example: 'instagram.com/acmecorp', category: 'Company Social' },
    { key: 'companyYouTube', label: 'Company YouTube', example: 'youtube.com/acmecorp', category: 'Company Social' },
    { key: 'companyTikTok', label: 'Company TikTok', example: 'tiktok.com/@acmecorp', category: 'Company Social' },
    { key: 'companyWebsite', label: 'Company Website', example: 'acmecorp.com', category: 'Company Social' },
    { key: 'companyBlog', label: 'Company Blog', example: 'blog.acmecorp.com', category: 'Company Social' },

    // Company Info
    { key: 'companyName', label: 'Company Name', example: 'Acme Corporation', category: 'Company' },
    { key: 'companyLogo', label: 'Company Logo', example: '(logo URL)', category: 'Company' },
    { key: 'companyTagline', label: 'Company Tagline', example: 'Innovation at its best', category: 'Company' },
    { key: 'companyAddress', label: 'Company Address', example: '123 Main St, City', category: 'Company' },
    { key: 'companyPhone', label: 'Company Phone', example: '+1-555-0000', category: 'Company' },
    { key: 'companyEmail', label: 'Company Email', example: 'info@acmecorp.com', category: 'Company' }
  ];

  useEffect(() => {
    fetchTemplates();
    fetchUsers();
    fetchOrganization();
    if (activeTab === 'campaigns') {
      fetchCampaigns();
    }
  }, [organizationId, activeTab]);

  const fetchUsers = async () => {
    try {
      const response = await authFetch('/api/v1/organization/users');

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.users) {
          setUsers(data.users);
          if (data.users.length > 0) {
            setSelectedUserId(data.users[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchOrganization = async () => {
    try {
      const response = await authFetch('/api/v1/organization/settings');

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.organization) {
          setOrganizationData(data.organization);
        }
      }
    } catch (err) {
      console.error('Error fetching organization:', err);
    }
  };

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch('/api/v1/signatures/templates');

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setTemplates(data.data);
        } else {
          setTemplates([]);
        }
      } else {
        setTemplates([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const response = await authFetch('/api/v1/signatures/campaigns');

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setCampaigns(data.data);
        } else {
          setCampaigns([]);
        }
      } else {
        setCampaigns([]);
      }
    } catch (err: any) {
      console.error('Error fetching campaigns:', err);
      setCampaigns([]);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      setIsCreating(true);
      setCreateError(null);
      setTemplateWarning(null);

      if (!newTemplateName || !newTemplateHtml) {
        setCreateError('Name and HTML content are required');
        return;
      }

      // Validate template based on type
      const validationError = validateTemplate(newTemplateHtml, newTemplateType);
      if (validationError) {
        setCreateError(validationError);
        return;
      }

      // Process HTML based on template type
      let processedHtml = newTemplateHtml;
      if (newTemplateType === 'email_signature') {
        const { cleaned, wasStripped } = stripFullPageTags(newTemplateHtml);
        processedHtml = cleaned;
        if (wasStripped) {
          setTemplateWarning('Removed full page tags - signatures only need body content');
        }
      }

      const response = await authFetch('/api/v1/signatures/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newTemplateName,
          description: newTemplateDescription,
          category: newTemplateCategory,
          template_type: newTemplateType,
          html_content: processedHtml,
          is_active: true,
          is_default: false
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create template');
      }

      // Success - close modal and refresh list
      setShowCreateModal(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
      setNewTemplateCategory('email_signature');
      setNewTemplateType('email_signature');
      setNewTemplateHtml('');
      setTemplateWarning(null);
      await fetchTemplates();

    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditClick = (template: Template) => {
    setEditingTemplate(template);
    setNewTemplateName(template.name);
    setNewTemplateDescription(template.description || '');
    setNewTemplateCategory(template.category || 'email_signature');
    setNewTemplateType(template.template_type || 'email_signature');
    setNewTemplateHtml(template.html_content);
    setShowEditModal(true);
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;

    try {
      setIsCreating(true);
      setCreateError(null);
      setTemplateWarning(null);

      if (!newTemplateName || !newTemplateHtml) {
        setCreateError('Name and HTML content are required');
        return;
      }

      // Validate template based on type
      const validationError = validateTemplate(newTemplateHtml, newTemplateType);
      if (validationError) {
        setCreateError(validationError);
        return;
      }

      // Process HTML based on template type
      let processedHtml = newTemplateHtml;
      if (newTemplateType === 'email_signature') {
        const { cleaned, wasStripped } = stripFullPageTags(newTemplateHtml);
        processedHtml = cleaned;
        if (wasStripped) {
          setTemplateWarning('Removed full page tags - signatures only need body content');
        }
      }

      const response = await authFetch(`/api/v1/signatures/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newTemplateName,
          description: newTemplateDescription,
          category: newTemplateCategory,
          template_type: newTemplateType,
          html_content: processedHtml
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update template');
      }

      // Success - close modal and refresh list
      setShowEditModal(false);
      setEditingTemplate(null);
      setNewTemplateName('');
      setNewTemplateDescription('');
      setNewTemplateCategory('email_signature');
      setNewTemplateType('email_signature');
      setNewTemplateHtml('');
      setTemplateWarning(null);
      await fetchTemplates();

    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTemplate = (template: Template) => {
    if (template.usage_count > 0) {
      alert(`Cannot delete "${template.name}" - it is currently assigned to ${template.usage_count} user(s)`);
      return;
    }
    setTemplateToDelete(template);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      const response = await authFetch(`/api/v1/signatures/templates/${templateToDelete.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete template');
      }

      await fetchTemplates();
    } catch (err: any) {
      alert(`Error deleting template: ${err.message}`);
    } finally {
      setTemplateToDelete(null);
    }
  };

  const stripFullPageTags = (html: string): { cleaned: string; wasStripped: boolean } => {
    const original = html.trim();
    let cleaned = original;

    // Remove <!DOCTYPE>, <html>, <head>, and <body> tags
    cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/?html[^>]*>/gi, '');
    cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    cleaned = cleaned.replace(/<\/?body[^>]*>/gi, '');

    cleaned = cleaned.trim();

    return {
      cleaned,
      wasStripped: cleaned !== original
    };
  };

  const validateTemplate = (html: string, type: string): string | null => {
    if (!html || html.trim().length === 0) {
      return 'HTML content cannot be empty';
    }

    if (type === 'email_signature') {
      // Check if it contains full page tags
      if (/<html|<head|<body|<!DOCTYPE/i.test(html)) {
        return 'Email signatures should only contain body content (no <html>, <head>, or <body> tags)';
      }
    }

    if (type === 'public_page') {
      // Check if it has basic structure
      if (!/<html/i.test(html) || !/<body/i.test(html)) {
        return 'Public pages should include <html> and <body> tags';
      }
    }

    return null;
  };

  const getEditorHint = (type: string): string => {
    const hints: Record<string, string> = {
      email_signature: 'Body content only - no <html> or <body> tags needed. Use {{variables}} for dynamic content.',
      email_template: 'Full email HTML - include inline styles for email client compatibility.',
      public_page: 'Complete webpage with <html>, <head>, and <body> tags.',
      html_snippet: 'Reusable HTML block that can be embedded in other content.'
    };
    return hints[type] || 'Enter your HTML template code here';
  };

  const insertVariable = (variableKey: string) => {
    const variable = `{{${variableKey}}}`;
    setNewTemplateHtml(prev => prev + variable);
    setShowVariablePicker(false);
  };

  // Insert image from asset picker
  const handleAssetSelect = (asset: { publicUrl?: string; name: string }) => {
    if (asset.publicUrl) {
      const imgTag = `<img src="${asset.publicUrl}" alt="${asset.name}" style="max-width: 100%; height: auto;" />`;
      setNewTemplateHtml(prev => prev + imgTag);
    }
    setShowAssetPicker(false);
  };

  const renderTemplateWithUserData = (htmlContent: string, user: User | undefined): string => {
    if (!user && !organizationData) return htmlContent;

    const replacements: Record<string, string> = {
      // User personal info
      firstName: user?.first_name || '',
      lastName: user?.last_name || '',
      email: user?.email || '',
      userPhoto: user?.avatar_url || '',

      // User job info
      jobTitle: user?.job_title || '',
      department: user?.department || '',
      organizationalUnit: user?.organizational_unit || '',
      employeeId: user?.employee_id || '',

      // User contact
      mobilePhone: user?.mobile_phone || '',
      workPhone: user?.work_phone || '',
      workPhoneExtension: user?.work_phone_extension || '',
      location: user?.location || '',

      // User details
      bio: user?.bio || '',
      pronouns: user?.pronouns || '',
      professionalDesignations: user?.professional_designations || '',

      // User social
      userLinkedIn: user?.user_linkedin_url || '',
      userTwitter: user?.user_twitter_url || '',
      userGitHub: user?.user_github_url || '',
      userPortfolio: user?.user_portfolio_url || '',
      userInstagram: user?.user_instagram_url || '',
      userFacebook: user?.user_facebook_url || '',

      // Company info
      companyName: organizationData?.name || '',
      companyLogo: organizationData?.company_logo_url || '',
      companyTagline: organizationData?.company_tagline || '',
      companyAddress: organizationData?.company_address || '',
      companyPhone: organizationData?.company_phone || '',
      companyEmail: organizationData?.company_email || '',

      // Company social
      companyLinkedIn: organizationData?.company_linkedin_url || '',
      companyTwitter: organizationData?.company_twitter_url || '',
      companyFacebook: organizationData?.company_facebook_url || '',
      companyInstagram: organizationData?.company_instagram_url || '',
      companyYouTube: organizationData?.company_youtube_url || '',
      companyTikTok: organizationData?.company_tiktok_url || '',
      companyWebsite: organizationData?.company_website_url || '',
      companyBlog: organizationData?.company_blog_url || ''
    };

    let rendered = htmlContent;
    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, value);
    });

    return rendered;
  };

  const getCategoryBadge = (category: string | undefined) => {
    const badges: Record<string, { label: string; color: string }> = {
      email_signature: { label: 'Email Signature', color: '#1976d2' },
      banner: { label: 'Banner', color: '#388e3c' },
      announcement: { label: 'Announcement', color: '#f57c00' },
      promotional: { label: 'Promotional', color: '#c2185b' },
      default: { label: 'Other', color: '#666' }
    };
    return badges[category || 'default'] || badges.default;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; color: string; bg: string }> = {
      active: { label: 'Active', color: '#15803d', bg: '#dcfce7' },
      scheduled: { label: 'Scheduled', color: '#0369a1', bg: '#e0f2fe' },
      completed: { label: 'Completed', color: '#6b7280', bg: '#f3f4f6' },
      cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fee2e2' },
      draft: { label: 'Draft', color: '#a16207', bg: '#fef3c7' }
    };
    return badges[status] || badges.draft;
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || template.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const uniqueCategories = Array.from(new Set(templates.map(t => t.category).filter(Boolean)));

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="loading-spinner">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Template Studio</h1>
          <p>Create and manage email signature templates and campaigns</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Create Template
        </button>
      </div>

      {/* Tabs */}
      <div className="template-tabs">
        <button
          className={`tab-button ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <FileText size={16} /> Templates ({templates.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaigns')}
        >
          <Calendar size={16} /> Campaigns ({campaigns.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'assignments' ? 'active' : ''}`}
          onClick={() => setActiveTab('assignments')}
        >
          <Target size={16} /> Assignment Rules
        </button>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <>
          {/* Controls */}
          <div className="page-controls">
            <div className="search-box">
              <span className="search-icon"><Search size={16} /></span>
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {uniqueCategories.map(category => (
                <option key={category} value={category}>
                  {getCategoryBadge(category).label}
                </option>
              ))}
            </select>
            <button className="btn-secondary" onClick={fetchTemplates}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon"><FileText size={32} /></span>
              <h3>No templates found</h3>
              <p>
                {searchQuery || filterCategory !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first template to get started'
                }
              </p>
              {!searchQuery && filterCategory === 'all' && (
                <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
                  <Plus size={16} /> Create Template
                </button>
              )}
            </div>
          ) : (
            <div className="templates-grid">
              {filteredTemplates.map(template => {
                const category = getCategoryBadge(template.category);
                return (
                  <div key={template.id} className="template-card">
                    <div className="template-card-header">
                      {template.thumbnail_url ? (
                        <div
                          className="template-thumbnail"
                          style={{ backgroundImage: `url(${template.thumbnail_url})` }}
                        />
                      ) : (
                        <div className="template-thumbnail placeholder">
                          <span className="thumbnail-icon"><FileText size={24} /></span>
                        </div>
                      )}
                      {template.is_default && (
                        <span className="default-badge"><Star size={12} /> Default</span>
                      )}
                      {template.is_system_template && (
                        <span className="system-badge"><Palette size={12} /> Pre-built</span>
                      )}
                    </div>
                    <div className="template-card-body">
                      <h3 className="template-name">{template.name}</h3>
                      {template.description && (
                        <p className="template-description">{template.description}</p>
                      )}
                      <div className="template-meta">
                        <span
                          className="category-badge"
                          style={{ backgroundColor: category.color }}
                        >
                          {category.label}
                        </span>
                        <span className="template-stats">
                          {template.usage_count} user{template.usage_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="template-card-footer">
                      <button
                        className="btn-icon"
                        title="Preview template"
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowTemplatePreview(true);
                        }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        title="Edit template"
                        onClick={() => handleEditClick(template)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        title="Duplicate template"
                        onClick={() => alert('Duplicate functionality coming soon')}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        className="btn-icon danger"
                        title="Delete template"
                        onClick={() => handleDeleteTemplate(template)}
                        disabled={template.usage_count > 0}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <>
          <div className="page-controls">
            <button className="btn-primary" onClick={() => alert('Create campaign functionality coming soon')}>
              <Plus size={16} /> Create Campaign
            </button>
            <button className="btn-secondary" onClick={fetchCampaigns}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon"><Calendar size={32} /></span>
              <h3>No campaigns found</h3>
              <p>Create time-bound template campaigns to rollout signatures for events</p>
              <button className="btn-primary" onClick={() => alert('Create campaign functionality coming soon')}>
                <Plus size={16} /> Create Campaign
              </button>
            </div>
          ) : (
            <div className="data-grid">
              <div className="grid-header">
                <div>Campaign Name</div>
                <div>Template</div>
                <div>Target</div>
                <div>Dates</div>
                <div>Status</div>
                <div>Actions</div>
              </div>
              <div className="grid-body">
                {campaigns.map(campaign => {
                  const statusBadge = getStatusBadge(campaign.status);
                  return (
                    <div key={campaign.id} className="grid-row">
                      <div>{campaign.campaign_name}</div>
                      <div>{campaign.template_name}</div>
                      <div>{campaign.target_type}</div>
                      <div>
                        {new Date(campaign.start_date).toLocaleDateString()} -{' '}
                        {new Date(campaign.end_date).toLocaleDateString()}
                      </div>
                      <div>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: statusBadge.bg,
                            color: statusBadge.color
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      </div>
                      <div className="action-buttons">
                        <button className="btn-icon" title="View campaign">
                          <Eye size={16} />
                        </button>
                        <button className="btn-icon" title="Edit campaign">
                          <Pencil size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Assignments Tab */}
      {activeTab === 'assignments' && (
        <div className="empty-state">
          <span className="empty-icon"><Target size={32} /></span>
          <h3>Assignment Rules</h3>
          <p>Create rules to automatically assign templates to users, groups, or departments</p>
          <button className="btn-primary" onClick={() => alert('Create assignment rule functionality coming soon')}>
            <Plus size={16} /> Create Rule
          </button>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Template</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {createError && (
                <div className="error-message">{createError}</div>
              )}
              {templateWarning && (
                <div className="warning-message">{templateWarning}</div>
              )}

              <div className="form-group">
                <label>
                  Template Type <span className="required">*</span>
                </label>
                <div className="template-type-selector">
                  {templateTypes.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      className={`type-option ${newTemplateType === type.value ? 'selected' : ''}`}
                      onClick={() => setNewTemplateType(type.value)}
                      disabled={isCreating}
                    >
                      <span className="type-icon">{type.icon}</span>
                      <div className="type-info">
                        <div className="type-label">{type.label}</div>
                        <div className="type-description">{type.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>
                  Template Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Professional Signature 2024"
                  disabled={isCreating}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  placeholder="Standard email signature for all staff"
                  disabled={isCreating}
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value)}
                  disabled={isCreating}
                >
                  <option value="email_signature">Email Signature</option>
                  <option value="banner">Banner</option>
                  <option value="announcement">Announcement</option>
                  <option value="promotional">Promotional</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  HTML Content <span className="required">*</span>
                </label>
                <div className="editor-toolbar">
                  <button
                    type="button"
                    className="btn-toolbar"
                    onClick={() => setShowVariablePicker(!showVariablePicker)}
                    disabled={isCreating}
                  >
                    <Tag size={14} /> Insert Variable
                  </button>
                  <button
                    type="button"
                    className="btn-toolbar"
                    onClick={() => setShowAssetPicker(true)}
                    disabled={isCreating}
                  >
                    <Image size={14} /> Insert Image
                  </button>
                </div>
                {showVariablePicker && (
                  <div className="variable-picker">
                    <div className="variable-picker-header">
                      <strong>Available Variables</strong>
                      <button
                        type="button"
                        className="close-picker"
                        onClick={() => setShowVariablePicker(false)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="variable-list">
                      {availableVariables.map(variable => (
                        <button
                          key={variable.key}
                          type="button"
                          className="variable-item"
                          onClick={() => insertVariable(variable.key)}
                          disabled={isCreating}
                        >
                          <div className="variable-key">
                            {'{{' + variable.key + '}}'}
                          </div>
                          <div className="variable-info">
                            <span className="variable-label">{variable.label}</span>
                            <span className="variable-example">e.g., {variable.example}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  value={newTemplateHtml}
                  onChange={(e) => setNewTemplateHtml(e.target.value)}
                  placeholder="<div>Your HTML template here...</div>"
                  rows={12}
                  disabled={isCreating}
                  className="html-editor"
                />
                <p className="form-hint">
                  {getEditorHint(newTemplateType)}
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateTemplate}
                disabled={isCreating || !newTemplateName || !newTemplateHtml}
              >
                {isCreating ? <><Loader size={14} className="spin" /> Creating...</> : <><Check size={14} /> Create Template</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Template Modal */}
      {showEditModal && editingTemplate && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Template</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {createError && (
                <div className="error-message">{createError}</div>
              )}
              {templateWarning && (
                <div className="warning-message">{templateWarning}</div>
              )}

              <div className="form-group">
                <label>
                  Template Type <span className="required">*</span>
                </label>
                <div className="template-type-selector">
                  {templateTypes.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      className={`type-option ${newTemplateType === type.value ? 'selected' : ''}`}
                      onClick={() => setNewTemplateType(type.value)}
                      disabled={isCreating}
                    >
                      <span className="type-icon">{type.icon}</span>
                      <div className="type-info">
                        <div className="type-label">{type.label}</div>
                        <div className="type-description">{type.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>
                  Template Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Professional Signature 2024"
                  disabled={isCreating}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  placeholder="Standard email signature for all staff"
                  disabled={isCreating}
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value)}
                  disabled={isCreating}
                >
                  <option value="email_signature">Email Signature</option>
                  <option value="banner">Banner</option>
                  <option value="announcement">Announcement</option>
                  <option value="promotional">Promotional</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  HTML Content <span className="required">*</span>
                </label>
                <div className="editor-toolbar">
                  <button
                    type="button"
                    className="btn-toolbar"
                    onClick={() => setShowVariablePicker(!showVariablePicker)}
                    disabled={isCreating}
                  >
                    <Tag size={14} /> Insert Variable
                  </button>
                  <button
                    type="button"
                    className="btn-toolbar"
                    onClick={() => setShowAssetPicker(true)}
                    disabled={isCreating}
                  >
                    <Image size={14} /> Insert Image
                  </button>
                </div>
                {showVariablePicker && (
                  <div className="variable-picker">
                    <div className="variable-picker-header">
                      <strong>Available Variables</strong>
                      <button
                        type="button"
                        className="close-picker"
                        onClick={() => setShowVariablePicker(false)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="variable-list">
                      {availableVariables.map(variable => (
                        <button
                          key={variable.key}
                          type="button"
                          className="variable-item"
                          onClick={() => insertVariable(variable.key)}
                          disabled={isCreating}
                        >
                          <div className="variable-key">
                            {'{{' + variable.key + '}}'}
                          </div>
                          <div className="variable-info">
                            <span className="variable-label">{variable.label}</span>
                            <span className="variable-example">e.g., {variable.example}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  value={newTemplateHtml}
                  onChange={(e) => setNewTemplateHtml(e.target.value)}
                  placeholder="<div>Your HTML template here...</div>"
                  rows={12}
                  disabled={isCreating}
                  className="html-editor"
                />
                <p className="form-hint">
                  {getEditorHint(newTemplateType)}
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowEditModal(false)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleUpdateTemplate}
                disabled={isCreating || !newTemplateName || !newTemplateHtml}
              >
                {isCreating ? <><Loader size={14} className="spin" /> Updating...</> : <><Check size={14} /> Update Template</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {showTemplatePreview && selectedTemplate && (
        <div className="modal-overlay" onClick={() => setShowTemplatePreview(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedTemplate.name}</h2>
              <button className="modal-close" onClick={() => setShowTemplatePreview(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {selectedTemplate.description && (
                <p className="template-preview-description">{selectedTemplate.description}</p>
              )}

              {/* User Selection for Preview */}
              {users.length > 0 && (
                <div className="preview-user-selector">
                  <label>Preview with user data:</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="user-select"
                  >
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.first_name} {user.last_name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="template-preview-frame">
                <div dangerouslySetInnerHTML={{
                  __html: renderTemplateWithUserData(
                    selectedTemplate.html_content,
                    users.find(u => u.id === selectedUserId)
                  )
                }} />
              </div>
              <div className="template-preview-info">
                <div className="info-row">
                  <span className="info-label">Category:</span>
                  <span className="info-value">{getCategoryBadge(selectedTemplate.category).label}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Used by:</span>
                  <span className="info-value">{selectedTemplate.usage_count} user(s)</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Created:</span>
                  <span className="info-value">{new Date(selectedTemplate.created_at).toLocaleString()}</span>
                </div>
                {selectedTemplate.created_by_name && (
                  <div className="info-row">
                    <span className="info-label">Created by:</span>
                    <span className="info-value">{selectedTemplate.created_by_name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowTemplatePreview(false)}>
                Close
              </button>
              <button className="btn-primary" onClick={() => {
                setShowTemplatePreview(false);
                handleEditClick(selectedTemplate!);
              }}>
                <Pencil size={14} /> Edit Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Picker Modal */}
      <AssetPickerModal
        isOpen={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        onSelect={handleAssetSelect}
        title="Insert Image"
        acceptedTypes={['image/*']}
        category="signatures"
      />

      {/* Delete Template Confirmation */}
      <ConfirmDialog
        isOpen={templateToDelete !== null}
        title="Delete Template"
        message={`Are you sure you want to delete "${templateToDelete?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteTemplate}
        onCancel={() => setTemplateToDelete(null)}
      />
    </div>
  );
}
