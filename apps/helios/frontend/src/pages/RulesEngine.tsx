/**
 * Rules Engine Management Page
 *
 * Admin page for managing automation rules and named conditions.
 * Part of the unified rules engine for dynamic groups, template matching,
 * training assignment, and workflow automation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  RefreshCw,
  Zap,
  GitBranch,
  Play,
  AlertCircle,
  CheckCircle,
  X,
  ToggleLeft,
  ToggleRight,
  Info,
  Layers,
} from 'lucide-react';
import { authFetch } from '../config/api';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import './RulesEngine.css';

// Types
interface NamedCondition {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  conditions: ConditionGroup;
  nestingDepth: number;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: RuleType;
  conditions: ConditionGroup;
  priority: number;
  isEnabled: boolean;
  nestingDepth: number;
  conditionCount: number;
  config: Record<string, any>;
  lastEvaluatedAt: string | null;
  lastMatchCount: number;
  createdAt: string;
  updatedAt: string;
}

type RuleType = 'dynamic_group' | 'template_match' | 'training_assign' | 'notification' | 'workflow';

interface ConditionGroup {
  all?: (ConditionProperties | ConditionGroup | NamedConditionRef)[];
  any?: (ConditionProperties | ConditionGroup | NamedConditionRef)[];
}

interface ConditionProperties {
  fact: string;
  operator: string;
  value: any;
  path?: string;
}

interface NamedConditionRef {
  condition: string;
}

interface AvailableFact {
  fact: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array';
  operators: string[];
  category: string;
}

type TabType = 'conditions' | 'rules';

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  dynamic_group: 'Dynamic Group',
  template_match: 'Template Match',
  training_assign: 'Training Assignment',
  notification: 'Notification',
  workflow: 'Workflow',
};

const RULE_TYPE_COLORS: Record<RuleType, string> = {
  dynamic_group: 'type-group',
  template_match: 'type-template',
  training_assign: 'type-training',
  notification: 'type-notification',
  workflow: 'type-workflow',
};

const OPERATOR_LABELS: Record<string, string> = {
  equal: 'equals',
  notEqual: 'not equals',
  contains: 'contains',
  doesNotContain: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  in: 'is one of',
  notIn: 'is not one of',
  lessThan: 'less than',
  lessThanInclusive: 'less than or equal',
  greaterThan: 'greater than',
  greaterThanInclusive: 'greater than or equal',
  isNull: 'is empty',
  isNotNull: 'is not empty',
  isUnder: 'is under (hierarchy)',
  isNotUnder: 'is not under',
  matchesRegex: 'matches pattern',
};

const RulesEnginePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('conditions');
  const [conditions, setConditions] = useState<NamedCondition[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [_availableFacts, setAvailableFacts] = useState<AvailableFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ruleTypeFilter, setRuleTypeFilter] = useState<RuleType | 'all'>('all');

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingCondition, setEditingCondition] = useState<NamedCondition | null>(null);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'condition' | 'rule'; item: NamedCondition | AutomationRule } | null>(null);

  // Test modal
  const [showTestModal, setShowTestModal] = useState(false);
  const [testRule, setTestRule] = useState<AutomationRule | null>(null);
  const [testFacts, setTestFacts] = useState('{}');
  const [testResult, setTestResult] = useState<{ matched: boolean; errors?: string[] } | null>(null);

  // Fetch data
  const fetchConditions = useCallback(async () => {
    try {
      const response = await authFetch('/api/v1/automation/conditions');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConditions(data.data.conditions || []);
        }
      }
    } catch (error) {
      console.error('Error fetching conditions:', error);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (ruleTypeFilter !== 'all') params.append('ruleType', ruleTypeFilter);

      const response = await authFetch(`/api/v1/automation/rules?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRules(data.data.rules || []);
        }
      }
    } catch (error) {
      console.error('Error fetching rules:', error);
    }
  }, [ruleTypeFilter]);

  const fetchFacts = useCallback(async () => {
    try {
      const response = await authFetch('/api/v1/automation/facts');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAvailableFacts(data.data.facts || []);
        }
      }
    } catch (error) {
      console.error('Error fetching facts:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchConditions(), fetchRules(), fetchFacts()]);
      setLoading(false);
    };
    loadData();
  }, [fetchConditions, fetchRules, fetchFacts]);

  // Filter data based on search
  const filteredConditions = conditions.filter(c =>
    c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.description?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredRules = rules.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Handlers
  const handleDelete = async () => {
    if (!deleteTarget) return;

    const endpoint = deleteTarget.type === 'condition'
      ? `/api/v1/automation/conditions/${deleteTarget.item.id}`
      : `/api/v1/automation/rules/${deleteTarget.item.id}`;

    try {
      const response = await authFetch(endpoint, { method: 'DELETE' });
      if (response.ok) {
        if (deleteTarget.type === 'condition') {
          setConditions(prev => prev.filter(c => c.id !== deleteTarget.item.id));
        } else {
          setRules(prev => prev.filter(r => r.id !== deleteTarget.item.id));
        }
        setShowDeleteConfirm(false);
        setDeleteTarget(null);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const handleToggleRule = async (rule: AutomationRule) => {
    try {
      const response = await authFetch(`/api/v1/automation/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !rule.isEnabled }),
      });

      if (response.ok) {
        setRules(prev => prev.map(r =>
          r.id === rule.id ? { ...r, isEnabled: !r.isEnabled } : r
        ));
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const handleTestRule = async () => {
    if (!testRule) return;

    try {
      const facts = JSON.parse(testFacts);
      const response = await authFetch(`/api/v1/automation/rules/${testRule.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts }),
      });

      const data = await response.json();
      if (data.success) {
        setTestResult({ matched: data.data.matched });
      } else {
        setTestResult({ matched: false, errors: [data.error] });
      }
    } catch (error: any) {
      setTestResult({ matched: false, errors: [error.message || 'Invalid JSON'] });
    }
  };

  const openTestModal = (rule: AutomationRule) => {
    setTestRule(rule);
    setTestFacts('{\n  "email": "user@example.com",\n  "department": "Engineering",\n  "jobTitle": "Software Engineer"\n}');
    setTestResult(null);
    setShowTestModal(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Render condition preview (simplified)
  const renderConditionPreview = (conditions: ConditionGroup, depth = 0): React.ReactNode => {
    if (depth > 2) return <span className="truncated">...</span>;

    const items = conditions.all || conditions.any || [];
    const logic = conditions.all ? 'AND' : 'OR';

    if (items.length === 0) return <span className="empty-condition">No conditions</span>;

    return (
      <div className={`condition-preview depth-${depth}`}>
        {items.slice(0, 3).map((item, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="logic-badge">{logic}</span>}
            {'condition' in item ? (
              <span className="named-ref">@{item.condition}</span>
            ) : 'fact' in item ? (
              <span className="leaf-condition">
                {item.fact} {OPERATOR_LABELS[item.operator] || item.operator} {JSON.stringify(item.value)}
              </span>
            ) : (
              renderConditionPreview(item as ConditionGroup, depth + 1)
            )}
          </React.Fragment>
        ))}
        {items.length > 3 && <span className="more-badge">+{items.length - 3} more</span>}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="rules-engine-page loading">
        <RefreshCw className="spin" size={24} />
        <span>Loading rules engine...</span>
      </div>
    );
  }

  return (
    <div className="rules-engine-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>Rules Engine</h1>
          <p>Manage automation rules and reusable conditions</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            if (activeTab === 'conditions') {
              setEditingCondition(null);
            } else {
              setEditingRule(null);
            }
            setShowEditor(true);
          }}
        >
          <Plus size={16} />
          {activeTab === 'conditions' ? 'New Condition' : 'New Rule'}
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'conditions' ? 'active' : ''}`}
            onClick={() => setActiveTab('conditions')}
          >
            <Layers size={16} />
            Named Conditions
            <span className="count">{conditions.length}</span>
          </button>
          <button
            className={`tab ${activeTab === 'rules' ? 'active' : ''}`}
            onClick={() => setActiveTab('rules')}
          >
            <Zap size={16} />
            Automation Rules
            <span className="count">{rules.length}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder={activeTab === 'conditions' ? 'Search conditions...' : 'Search rules...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {activeTab === 'rules' && (
          <div className="filter-group">
            <Filter size={16} />
            <select
              value={ruleTypeFilter}
              onChange={(e) => setRuleTypeFilter(e.target.value as RuleType | 'all')}
            >
              <option value="all">All Types</option>
              <option value="dynamic_group">Dynamic Groups</option>
              <option value="template_match">Template Matching</option>
              <option value="training_assign">Training Assignment</option>
              <option value="notification">Notifications</option>
              <option value="workflow">Workflows</option>
            </select>
          </div>
        )}

        <button className="btn-icon" onClick={() => activeTab === 'conditions' ? fetchConditions() : fetchRules()}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Content */}
      {activeTab === 'conditions' ? (
        <div className="conditions-list">
          {filteredConditions.length === 0 ? (
            <div className="empty-state">
              <GitBranch size={48} />
              <h3>No Named Conditions</h3>
              <p>Create reusable conditions that can be referenced across multiple rules.</p>
              <button className="btn-primary" onClick={() => { setEditingCondition(null); setShowEditor(true); }}>
                <Plus size={16} /> Create First Condition
              </button>
            </div>
          ) : (
            <div className="items-grid">
              {filteredConditions.map((condition) => (
                <div key={condition.id} className="condition-card">
                  <div className="card-header">
                    <div className="card-title">
                      <h3>{condition.displayName}</h3>
                      <code className="name-slug">@{condition.name}</code>
                    </div>
                    <div className="card-actions">
                      <button className="btn-icon" onClick={() => { setEditingCondition(condition); setShowEditor(true); }}>
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn-icon danger"
                        onClick={() => { setDeleteTarget({ type: 'condition', item: condition }); setShowDeleteConfirm(true); }}
                        disabled={condition.usageCount > 0}
                        title={condition.usageCount > 0 ? `Used by ${condition.usageCount} rule(s)` : 'Delete'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {condition.description && (
                    <p className="card-description">{condition.description}</p>
                  )}

                  <div className="condition-preview-wrapper">
                    {renderConditionPreview(condition.conditions)}
                  </div>

                  <div className="card-footer">
                    <span className="meta">
                      <Layers size={12} /> Depth: {condition.nestingDepth}
                    </span>
                    <span className="meta">
                      <Zap size={12} /> Used: {condition.usageCount}
                    </span>
                    <span className="meta">
                      Updated {formatDate(condition.updatedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rules-list">
          {filteredRules.length === 0 ? (
            <div className="empty-state">
              <Zap size={48} />
              <h3>No Automation Rules</h3>
              <p>Create rules to automate group membership, template selection, training assignment, and more.</p>
              <button className="btn-primary" onClick={() => { setEditingRule(null); setShowEditor(true); }}>
                <Plus size={16} /> Create First Rule
              </button>
            </div>
          ) : (
            <div className="rules-table">
              <div className="table-header">
                <span className="col-status">Status</span>
                <span className="col-name">Name</span>
                <span className="col-type">Type</span>
                <span className="col-conditions">Conditions</span>
                <span className="col-stats">Stats</span>
                <span className="col-actions">Actions</span>
              </div>
              <div className="table-body">
                {filteredRules.map((rule) => (
                  <div key={rule.id} className={`table-row ${!rule.isEnabled ? 'disabled' : ''}`}>
                    <div className="col-status">
                      <button
                        className={`toggle-btn ${rule.isEnabled ? 'on' : 'off'}`}
                        onClick={() => handleToggleRule(rule)}
                        title={rule.isEnabled ? 'Disable' : 'Enable'}
                      >
                        {rule.isEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                    </div>
                    <div className="col-name">
                      <span className="rule-name">{rule.name}</span>
                      {rule.description && <span className="rule-desc">{rule.description}</span>}
                    </div>
                    <div className="col-type">
                      <span className={`type-badge ${RULE_TYPE_COLORS[rule.ruleType]}`}>
                        {RULE_TYPE_LABELS[rule.ruleType]}
                      </span>
                    </div>
                    <div className="col-conditions">
                      <span className="condition-count">{rule.conditionCount} conditions</span>
                      <span className="nesting-depth">Depth: {rule.nestingDepth}</span>
                    </div>
                    <div className="col-stats">
                      {rule.lastEvaluatedAt ? (
                        <>
                          <span className="last-run">Last: {formatDate(rule.lastEvaluatedAt)}</span>
                          <span className="match-count">{rule.lastMatchCount} matches</span>
                        </>
                      ) : (
                        <span className="never-run">Never evaluated</span>
                      )}
                    </div>
                    <div className="col-actions">
                      <button className="btn-icon" onClick={() => openTestModal(rule)} title="Test Rule">
                        <Play size={14} />
                      </button>
                      <button className="btn-icon" onClick={() => { setEditingRule(rule); setShowEditor(true); }} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn-icon danger"
                        onClick={() => { setDeleteTarget({ type: 'rule', item: rule }); setShowDeleteConfirm(true); }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={`Delete ${deleteTarget?.type === 'condition' ? 'Condition' : 'Rule'}?`}
        message={deleteTarget?.type === 'condition'
          ? `Are you sure you want to delete "${(deleteTarget?.item as NamedCondition)?.displayName}"? This cannot be undone.`
          : `Are you sure you want to delete "${(deleteTarget?.item as AutomationRule)?.name}"? This cannot be undone.`
        }
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
      />

      {/* Test Modal */}
      {showTestModal && testRule && (
        <div className="modal-overlay" onClick={() => setShowTestModal(false)}>
          <div className="modal test-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Test Rule: {testRule.name}</h2>
              <button className="btn-icon" onClick={() => setShowTestModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Test Facts (JSON)</label>
                <textarea
                  value={testFacts}
                  onChange={(e) => setTestFacts(e.target.value)}
                  rows={10}
                  placeholder='{"email": "user@example.com", "department": "Engineering"}'
                />
                <p className="hint">
                  Enter the facts object to test against this rule. Use the available fields like email, department, jobTitle, etc.
                </p>
              </div>

              {testResult && (
                <div className={`test-result ${testResult.matched ? 'matched' : 'not-matched'}`}>
                  {testResult.matched ? (
                    <>
                      <CheckCircle size={20} />
                      <span>Rule matched!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={20} />
                      <span>Rule did not match</span>
                      {testResult.errors && testResult.errors.length > 0 && (
                        <ul className="errors">
                          {testResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowTestModal(false)}>
                Close
              </button>
              <button className="btn-primary" onClick={handleTestRule}>
                <Play size={16} /> Run Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Modal - Placeholder for now */}
      {showEditor && (
        <div className="modal-overlay" onClick={() => setShowEditor(false)}>
          <div className="modal editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {activeTab === 'conditions'
                  ? (editingCondition ? 'Edit Condition' : 'New Condition')
                  : (editingRule ? 'Edit Rule' : 'New Rule')
                }
              </h2>
              <button className="btn-icon" onClick={() => setShowEditor(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="editor-placeholder">
                <Info size={48} />
                <h3>Rule Builder Coming Soon</h3>
                <p>
                  The visual rule builder is under development. For now, you can use the API directly
                  or contact your administrator to configure rules.
                </p>
                <div className="api-hint">
                  <code>POST /api/v1/automation/{activeTab === 'conditions' ? 'conditions' : 'rules'}</code>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEditor(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RulesEnginePage;
