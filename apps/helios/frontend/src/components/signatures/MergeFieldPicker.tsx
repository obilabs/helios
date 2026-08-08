import React, { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronRight, Hash, User, Briefcase, Phone, Building2, Share2 } from 'lucide-react';
import { authFetch } from '../../config/api';
import './MergeFieldPicker.css';

export interface MergeField {
  key: string;
  displayName: string;
  description: string;
  category: string;
  example: string;
  databaseColumn?: string;
}

interface MergeFieldPickerProps {
  onSelect: (field: MergeField) => void;
  className?: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  Personal: <User size={14} />,
  Professional: <Briefcase size={14} />,
  Contact: <Phone size={14} />,
  Organization: <Building2 size={14} />,
  Social: <Share2 size={14} />,
};

const MergeFieldPicker: React.FC<MergeFieldPickerProps> = ({ onSelect, className }) => {
  const [mergeFields, setMergeFields] = useState<MergeField[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Personal', 'Professional']));

  useEffect(() => {
    fetchMergeFields();
  }, []);

  const fetchMergeFields = async () => {
    try {
      const response = await authFetch('/api/signatures/merge-fields/list');
      const data = await response.json();
      if (data.success) {
        setMergeFields(data.data);
      }
    } catch (error) {
      console.error('Error fetching merge fields:', error);
      // Use fallback data
      setMergeFields([
        { key: 'full_name', displayName: 'Full Name', description: 'The user\'s full name', category: 'Personal', example: 'John Smith' },
        { key: 'first_name', displayName: 'First Name', description: 'The user\'s first name', category: 'Personal', example: 'John' },
        { key: 'last_name', displayName: 'Last Name', description: 'The user\'s last name', category: 'Personal', example: 'Smith' },
        { key: 'job_title', displayName: 'Job Title', description: 'The user\'s job title', category: 'Professional', example: 'Software Engineer' },
        { key: 'department', displayName: 'Department', description: 'The user\'s department', category: 'Professional', example: 'Engineering' },
        { key: 'email', displayName: 'Email', description: 'The user\'s work email', category: 'Contact', example: 'john@company.com' },
        { key: 'work_phone', displayName: 'Work Phone', description: 'The user\'s work phone', category: 'Contact', example: '+1 555-123-4567' },
        { key: 'mobile_phone', displayName: 'Mobile Phone', description: 'The user\'s mobile phone', category: 'Contact', example: '+1 555-987-6543' },
        { key: 'company_name', displayName: 'Company Name', description: 'The organization name', category: 'Organization', example: 'Acme Inc.' },
        { key: 'company_website', displayName: 'Company Website', description: 'The company website URL', category: 'Organization', example: 'https://acme.com' },
        { key: 'linkedin_url', displayName: 'LinkedIn URL', description: 'The user\'s LinkedIn profile', category: 'Social', example: 'https://linkedin.com/in/johnsmith' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const filteredFields = mergeFields.filter(field =>
    field.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    field.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    field.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedFields = filteredFields.reduce<Record<string, MergeField[]>>((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {});

  const categories = Object.keys(groupedFields).sort((a, b) => {
    const order = ['Personal', 'Professional', 'Contact', 'Organization', 'Social'];
    return order.indexOf(a) - order.indexOf(b);
  });

  if (loading) {
    return (
      <div className={`merge-field-picker ${className || ''}`}>
        <div className="picker-loading">Loading merge fields...</div>
      </div>
    );
  }

  return (
    <div className={`merge-field-picker ${className || ''}`}>
      <div className="picker-header">
        <h4>Insert Merge Field</h4>
        <p>Click a field to insert it into your template</p>
      </div>

      <div className="picker-search">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search fields..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="picker-categories">
        {categories.map(category => (
          <div key={category} className="category-group">
            <button
              className="category-header"
              onClick={() => toggleCategory(category)}
            >
              <span className="category-icon">
                {categoryIcons[category] || <Hash size={14} />}
              </span>
              <span className="category-name">{category}</span>
              <span className="category-count">{groupedFields[category].length}</span>
              <span className="category-chevron">
                {expandedCategories.has(category) ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </span>
            </button>

            {expandedCategories.has(category) && (
              <div className="category-fields">
                {groupedFields[category].map(field => (
                  <button
                    key={field.key}
                    className="field-item"
                    onClick={() => onSelect(field)}
                    title={field.description}
                  >
                    <div className="field-main">
                      <span className="field-name">{field.displayName}</span>
                      <code className="field-key">{'{{' + field.key + '}}'}</code>
                    </div>
                    <span className="field-example">{field.example}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredFields.length === 0 && (
        <div className="picker-empty">
          <p>No fields match your search</p>
        </div>
      )}
    </div>
  );
};

export default MergeFieldPicker;
