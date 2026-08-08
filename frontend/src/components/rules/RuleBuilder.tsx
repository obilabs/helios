/**
 * Rule Builder Component
 *
 * A visual interface for creating and editing automation rules.
 * Supports nested conditions with AND/OR logic, various operators,
 * and references to named conditions.
 *
 * Structure: IF [conditions] THEN [action]
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Copy,
  Layers,
  ArrowRight,
  Users,
  FileText,
  GraduationCap,
  Bell,
  GitBranch,
} from 'lucide-react';
import { authFetch } from '../../config/api';
import './RuleBuilder.css';

// Types
export type RuleType = 'dynamic_group' | 'template_match' | 'training_assign' | 'notification' | 'workflow';

export interface ConditionProperties {
  fact: string;
  operator: string;
  value: any;
  path?: string;
}

export interface ConditionGroup {
  all?: (ConditionProperties | ConditionGroup | NamedConditionRef)[];
  any?: (ConditionProperties | ConditionGroup | NamedConditionRef)[];
}

export interface NamedConditionRef {
  condition: string;
}

export interface AvailableFact {
  fact: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array';
  operators: string[];
  category: string;
}

export interface NamedCondition {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
}

export interface GroupOption {
  id: string;
  name: string;
  email: string;
}

export interface TemplateOption {
  id: string;
  name: string;
  description?: string;
}

export interface TrainingOption {
  id: string;
  name: string;
  description?: string;
}

export interface RuleData {
  id?: string;
  name: string;
  description: string;
  ruleType: RuleType;
  conditions: ConditionGroup;
  priority: number;
  isEnabled: boolean;
  config: Record<string, any>;
}

interface RuleBuilderProps {
  rule?: RuleData | null;
  onSave: (rule: RuleData) => Promise<void>;
  onCancel: () => void;
  isConditionEditor?: boolean; // For editing named conditions instead of rules
}

const RULE_TYPES: { value: RuleType; label: string; description: string; actionLabel: string }[] = [
  { value: 'dynamic_group', label: 'Dynamic Group', description: 'Automatically assign users to groups based on attributes', actionLabel: 'Add to group' },
  { value: 'template_match', label: 'Template Match', description: 'Match users to email signature templates', actionLabel: 'Apply template' },
  { value: 'training_assign', label: 'Training Assignment', description: 'Assign training courses based on user attributes', actionLabel: 'Assign training' },
  { value: 'notification', label: 'Notification', description: 'Send notifications when conditions are met', actionLabel: 'Send notification' },
  { value: 'workflow', label: 'Workflow', description: 'Trigger workflow actions based on conditions', actionLabel: 'Run workflow' },
];

const OPERATOR_LABELS: Record<string, string> = {
  equal: 'equals',
  notEqual: 'does not equal',
  contains: 'contains',
  doesNotContain: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  in: 'is one of',
  notIn: 'is not one of',
  lessThan: 'is less than',
  lessThanInclusive: 'is less than or equal to',
  greaterThan: 'is greater than',
  greaterThanInclusive: 'is greater than or equal to',
  isNull: 'is empty',
  isNotNull: 'is not empty',
  isUnder: 'is under (hierarchy)',
  isNotUnder: 'is not under',
  matchesRegex: 'matches pattern',
};

const DEFAULT_CONDITION: ConditionProperties = {
  fact: 'email',
  operator: 'contains',
  value: '',
};

const DEFAULT_CONDITIONS: ConditionGroup = {
  all: [{ ...DEFAULT_CONDITION }],
};

export const RuleBuilder: React.FC<RuleBuilderProps> = ({
  rule,
  onSave,
  onCancel,
  isConditionEditor = false,
}) => {
  // Form state
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [ruleType, setRuleType] = useState<RuleType>(rule?.ruleType || 'dynamic_group');
  const [conditions, setConditions] = useState<ConditionGroup>(
    rule?.conditions || { ...DEFAULT_CONDITIONS }
  );
  const [priority, setPriority] = useState(rule?.priority || 0);
  const [isEnabled, setIsEnabled] = useState(rule?.isEnabled ?? true);
  const [config, setConfig] = useState<Record<string, any>>(rule?.config || {});

  // Available facts and named conditions
  const [availableFacts, setAvailableFacts] = useState<AvailableFact[]>([]);
  const [namedConditions, setNamedConditions] = useState<NamedCondition[]>([]);
  const [factsGrouped, setFactsGrouped] = useState<Record<string, AvailableFact[]>>({});

  // Options for action targets
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [trainingCourses, setTrainingCourses] = useState<TrainingOption[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch available facts, named conditions, and action options
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [factsRes, conditionsRes, groupsRes, templatesRes, trainingRes] = await Promise.all([
          authFetch('/api/v1/automation/facts'),
          authFetch('/api/v1/automation/conditions'),
          authFetch('/api/v1/organization/access-groups'),
          authFetch('/api/v1/templates').catch(() => null),
          authFetch('/api/v1/training/courses').catch(() => null),
        ]);

        if (factsRes.ok) {
          const factsData = await factsRes.json();
          if (factsData.success) {
            setAvailableFacts(factsData.data.facts || []);
            setFactsGrouped(factsData.data.grouped || {});
          }
        }

        if (conditionsRes.ok) {
          const conditionsData = await conditionsRes.json();
          if (conditionsData.success) {
            setNamedConditions(conditionsData.data.conditions || []);
          }
        }

        // Fetch groups for dynamic group rules
        if (groupsRes && groupsRes.ok) {
          const groupsData = await groupsRes.json();
          if (groupsData.success && groupsData.data) {
            setGroups(groupsData.data.map((g: any) => ({
              id: g.id,
              name: g.name,
              email: g.email,
            })));
          }
        }

        // Fetch templates for template match rules
        if (templatesRes && templatesRes.ok) {
          const templatesData = await templatesRes.json();
          if (templatesData.success && templatesData.data) {
            setTemplates(templatesData.data.map((t: any) => ({
              id: t.id,
              name: t.name,
              description: t.description,
            })));
          }
        }

        // Fetch training courses for training assignment rules
        if (trainingRes && trainingRes.ok) {
          const trainingData = await trainingRes.json();
          if (trainingData.success && trainingData.data) {
            setTrainingCourses(trainingData.data.map((t: any) => ({
              id: t.id,
              name: t.name,
              description: t.description,
            })));
          }
        }
      } catch (err) {
        console.error('Error fetching rule builder data:', err);
      }
    };

    fetchData();
  }, []);

  // Get operators for a fact
  const getOperatorsForFact = useCallback((factName: string): string[] => {
    const fact = availableFacts.find(f => f.fact === factName);
    return fact?.operators || ['equal', 'notEqual', 'contains'];
  }, [availableFacts]);

  // Get fact type
  const getFactType = useCallback((factName: string): string => {
    const fact = availableFacts.find(f => f.fact === factName);
    return fact?.type || 'string';
  }, [availableFacts]);

  // Validate conditions
  const validateConditions = async () => {
    setValidating(true);
    setValidationResult(null);

    try {
      const response = await authFetch('/api/v1/automation/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions }),
      });

      const data = await response.json();
      if (data.success) {
        setValidationResult(data.data.validation);
      } else {
        setValidationResult({ valid: false, errors: [data.error], warnings: [] });
      }
    } catch (err: any) {
      setValidationResult({ valid: false, errors: [err.message], warnings: [] });
    } finally {
      setValidating(false);
    }
  };

  // Handle save
  const handleSave = async () => {
    setError(null);

    // Basic validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);

    try {
      await onSave({
        id: rule?.id,
        name: name.trim(),
        description: description.trim(),
        ruleType,
        conditions,
        priority,
        isEnabled,
        config,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  // Update a condition in the tree
  const updateCondition = (
    path: number[],
    updater: (item: ConditionProperties | ConditionGroup | NamedConditionRef) => ConditionProperties | ConditionGroup | NamedConditionRef
  ) => {
    const update = (group: ConditionGroup, pathIndex: number): ConditionGroup => {
      const items = group.all || group.any || [];
      const key = group.all ? 'all' : 'any';
      const index = path[pathIndex];

      if (pathIndex === path.length - 1) {
        // Update this item
        const newItems = [...items];
        newItems[index] = updater(items[index]);
        return { [key]: newItems };
      } else {
        // Recurse into nested group
        const newItems = [...items];
        newItems[index] = update(items[index] as ConditionGroup, pathIndex + 1);
        return { [key]: newItems };
      }
    };

    setConditions(update(conditions, 0));
  };

  // Add a condition at path
  const addCondition = (path: number[], type: 'condition' | 'group' | 'reference') => {
    const newItem: ConditionProperties | ConditionGroup | NamedConditionRef =
      type === 'condition'
        ? { ...DEFAULT_CONDITION }
        : type === 'group'
        ? { all: [{ ...DEFAULT_CONDITION }] }
        : { condition: namedConditions[0]?.name || '' };

    const add = (group: ConditionGroup, pathIndex: number): ConditionGroup => {
      const items = group.all || group.any || [];
      const key = group.all ? 'all' : 'any';

      if (pathIndex === path.length) {
        // Add at this level
        return { [key]: [...items, newItem] };
      } else {
        // Recurse into nested group
        const newItems = [...items];
        newItems[path[pathIndex]] = add(items[path[pathIndex]] as ConditionGroup, pathIndex + 1);
        return { [key]: newItems };
      }
    };

    setConditions(add(conditions, 0));
  };

  // Remove a condition at path
  const removeCondition = (path: number[]) => {
    const remove = (group: ConditionGroup, pathIndex: number): ConditionGroup => {
      const items = group.all || group.any || [];
      const key = group.all ? 'all' : 'any';
      const index = path[pathIndex];

      if (pathIndex === path.length - 1) {
        // Remove at this level
        const newItems = items.filter((_, i) => i !== index);
        return { [key]: newItems.length > 0 ? newItems : [{ ...DEFAULT_CONDITION }] };
      } else {
        // Recurse into nested group
        const newItems = [...items];
        newItems[index] = remove(items[index] as ConditionGroup, pathIndex + 1);
        return { [key]: newItems };
      }
    };

    setConditions(remove(conditions, 0));
  };

  // Toggle logic type (all/any)
  const toggleLogic = (path: number[]) => {
    const toggle = (group: ConditionGroup, pathIndex: number): ConditionGroup => {
      const items = group.all || group.any || [];
      const key = group.all ? 'all' : 'any';

      if (pathIndex === path.length) {
        // Toggle this group
        return group.all ? { any: items } : { all: items };
      } else {
        // Recurse into nested group
        const newItems = [...items];
        newItems[path[pathIndex]] = toggle(items[path[pathIndex]] as ConditionGroup, pathIndex + 1);
        return { [key]: newItems };
      }
    };

    setConditions(toggle(conditions, 0));
  };

  // Render a single condition
  const renderCondition = (
    item: ConditionProperties,
    path: number[],
    _isLast: boolean
  ) => {
    const operators = getOperatorsForFact(item.fact);
    const factType = getFactType(item.fact);
    const needsValue = !['isNull', 'isNotNull', 'isEmpty', 'isNotEmpty'].includes(item.operator);

    return (
      <div className="condition-row">
        <div className="condition-fields">
          {/* Fact selector */}
          <select
            className="condition-select fact-select"
            value={item.fact}
            onChange={(e) => {
              const newFact = e.target.value;
              const newOperators = getOperatorsForFact(newFact);
              updateCondition(path, () => ({
                fact: newFact,
                operator: newOperators.includes(item.operator) ? item.operator : newOperators[0],
                value: '',
              }));
            }}
          >
            {Object.entries(factsGrouped).map(([category, facts]) => (
              <optgroup key={category} label={category}>
                {facts.map(f => (
                  <option key={f.fact} value={f.fact}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Operator selector */}
          <select
            className="condition-select operator-select"
            value={item.operator}
            onChange={(e) => updateCondition(path, (c) => ({ ...c as ConditionProperties, operator: e.target.value }))}
          >
            {operators.map(op => (
              <option key={op} value={op}>{OPERATOR_LABELS[op] || op}</option>
            ))}
          </select>

          {/* Value input */}
          {needsValue && (
            <>
              {item.operator === 'in' || item.operator === 'notIn' ? (
                <input
                  type="text"
                  className="condition-input value-input"
                  value={Array.isArray(item.value) ? item.value.join(', ') : item.value}
                  onChange={(e) => updateCondition(path, (c) => ({
                    ...c as ConditionProperties,
                    value: e.target.value.split(',').map(v => v.trim()).filter(Boolean),
                  }))}
                  placeholder="value1, value2, value3"
                />
              ) : factType === 'number' ? (
                <input
                  type="number"
                  className="condition-input value-input"
                  value={item.value || ''}
                  onChange={(e) => updateCondition(path, (c) => ({
                    ...c as ConditionProperties,
                    value: e.target.value ? Number(e.target.value) : '',
                  }))}
                  placeholder="Enter number"
                />
              ) : factType === 'boolean' ? (
                <select
                  className="condition-select value-select"
                  value={String(item.value)}
                  onChange={(e) => updateCondition(path, (c) => ({
                    ...c as ConditionProperties,
                    value: e.target.value === 'true',
                  }))}
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : factType === 'date' ? (
                <input
                  type="date"
                  className="condition-input value-input"
                  value={item.value || ''}
                  onChange={(e) => updateCondition(path, (c) => ({
                    ...c as ConditionProperties,
                    value: e.target.value,
                  }))}
                />
              ) : (
                <input
                  type="text"
                  className="condition-input value-input"
                  value={item.value || ''}
                  onChange={(e) => updateCondition(path, (c) => ({
                    ...c as ConditionProperties,
                    value: e.target.value,
                  }))}
                  placeholder="Enter value"
                />
              )}
            </>
          )}
        </div>

        <button
          className="condition-remove"
          onClick={() => removeCondition(path)}
          title="Remove condition"
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

  // Render a named condition reference
  const renderReference = (
    item: NamedConditionRef,
    path: number[]
  ) => {
    return (
      <div className="condition-row reference-row">
        <div className="condition-fields">
          <span className="reference-label">
            <Layers size={14} />
            Use condition:
          </span>
          <select
            className="condition-select reference-select"
            value={item.condition}
            onChange={(e) => updateCondition(path, () => ({ condition: e.target.value }))}
          >
            {namedConditions.map(nc => (
              <option key={nc.id} value={nc.name}>
                {nc.displayName} (@{nc.name})
              </option>
            ))}
          </select>
        </div>
        <button
          className="condition-remove"
          onClick={() => removeCondition(path)}
          title="Remove reference"
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

  // Render a condition group
  const renderGroup = (
    group: ConditionGroup,
    path: number[],
    depth: number = 0
  ) => {
    const items = group.all || group.any || [];
    const isAll = !!group.all;

    return (
      <div className={`condition-group depth-${depth}`}>
        {/* Logic toggle */}
        <div className="group-header">
          <button
            className={`logic-toggle ${isAll ? 'all' : 'any'}`}
            onClick={() => toggleLogic(path)}
          >
            {isAll ? 'Match ALL' : 'Match ANY'}
            <ChevronDown size={14} />
          </button>
          <span className="logic-hint">
            {isAll ? 'All conditions must be true' : 'At least one condition must be true'}
          </span>
        </div>

        {/* Conditions list */}
        <div className="conditions-list">
          {items.map((item, index) => {
            const itemPath = [...path, index];
            const isLast = index === items.length - 1;

            return (
              <div key={index} className="condition-wrapper">
                {'fact' in item ? (
                  renderCondition(item as ConditionProperties, itemPath, isLast)
                ) : 'condition' in item ? (
                  renderReference(item as NamedConditionRef, itemPath)
                ) : (
                  <div className="nested-group">
                    {renderGroup(item as ConditionGroup, itemPath, depth + 1)}
                  </div>
                )}

                {!isLast && (
                  <div className="condition-connector">
                    <span className={`connector-badge ${isAll ? 'and' : 'or'}`}>
                      {isAll ? 'AND' : 'OR'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add buttons */}
        <div className="group-actions">
          <button
            className="add-btn"
            onClick={() => addCondition(path, 'condition')}
          >
            <Plus size={14} />
            Add Condition
          </button>
          {depth < 2 && (
            <button
              className="add-btn add-group"
              onClick={() => addCondition(path, 'group')}
            >
              <Plus size={14} />
              Add Group
            </button>
          )}
          {namedConditions.length > 0 && (
            <button
              className="add-btn add-reference"
              onClick={() => addCondition(path, 'reference')}
            >
              <Copy size={14} />
              Use Named Condition
            </button>
          )}
        </div>
      </div>
    );
  };

  // Get the action icon for the current rule type
  const getActionIcon = () => {
    switch (ruleType) {
      case 'dynamic_group': return <Users size={18} />;
      case 'template_match': return <FileText size={18} />;
      case 'training_assign': return <GraduationCap size={18} />;
      case 'notification': return <Bell size={18} />;
      case 'workflow': return <GitBranch size={18} />;
      default: return <ArrowRight size={18} />;
    }
  };

  // Get the selected group name for display
  const getSelectedGroupName = () => {
    const group = groups.find(g => g.id === config.targetGroupId);
    return group ? group.name : null;
  };

  // Get the selected template name for display
  const getSelectedTemplateName = () => {
    const template = templates.find(t => t.id === config.targetTemplateId);
    return template ? template.name : null;
  };

  // Get the selected training name for display
  const getSelectedTrainingName = () => {
    const training = trainingCourses.find(t => t.id === config.targetTrainingId);
    return training ? training.name : null;
  };

  // Render the action configuration section based on rule type
  const renderActionConfig = () => {
    switch (ruleType) {
      case 'dynamic_group':
        return (
          <div className="action-config">
            <div className="action-config-header">
              <Users size={20} />
              <span>Add matching users to group</span>
            </div>
            <div className="form-group">
              <label htmlFor="target-group">Select Target Group *</label>
              <select
                id="target-group"
                className="form-select"
                value={config.targetGroupId || ''}
                onChange={(e) => setConfig({ ...config, targetGroupId: e.target.value })}
              >
                <option value="">-- Select a group --</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.email})</option>
                ))}
              </select>
              {groups.length === 0 && (
                <p className="form-hint">No groups available. Create groups in the Directory section first.</p>
              )}
            </div>
            {config.targetGroupId && getSelectedGroupName() && (
              <div className="action-preview">
                <span className="action-label">Action:</span>
                <span className="action-value">Users will be added to <strong>{getSelectedGroupName()}</strong></span>
              </div>
            )}
          </div>
        );

      case 'template_match':
        return (
          <div className="action-config">
            <div className="action-config-header">
              <FileText size={20} />
              <span>Apply email signature template</span>
            </div>
            <div className="form-group">
              <label htmlFor="target-template">Select Template *</label>
              <select
                id="target-template"
                className="form-select"
                value={config.targetTemplateId || ''}
                onChange={(e) => setConfig({ ...config, targetTemplateId: e.target.value })}
              >
                <option value="">-- Select a template --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {templates.length === 0 && (
                <p className="form-hint">No templates available. Create templates in the Template Studio first.</p>
              )}
            </div>
            {config.targetTemplateId && getSelectedTemplateName() && (
              <div className="action-preview">
                <span className="action-label">Action:</span>
                <span className="action-value">Template <strong>{getSelectedTemplateName()}</strong> will be applied</span>
              </div>
            )}
          </div>
        );

      case 'training_assign':
        return (
          <div className="action-config">
            <div className="action-config-header">
              <GraduationCap size={20} />
              <span>Assign training course</span>
            </div>
            <div className="form-group">
              <label htmlFor="target-training">Select Training Course *</label>
              <select
                id="target-training"
                className="form-select"
                value={config.targetTrainingId || ''}
                onChange={(e) => setConfig({ ...config, targetTrainingId: e.target.value })}
              >
                <option value="">-- Select a course --</option>
                {trainingCourses.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {trainingCourses.length === 0 && (
                <p className="form-hint">No training courses available. Create courses in the Training section first.</p>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="training-due">Due Date (optional)</label>
              <select
                id="training-due"
                className="form-select"
                value={config.dueDays || ''}
                onChange={(e) => setConfig({ ...config, dueDays: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">No due date</option>
                <option value="7">Within 7 days</option>
                <option value="14">Within 14 days</option>
                <option value="30">Within 30 days</option>
                <option value="60">Within 60 days</option>
                <option value="90">Within 90 days</option>
              </select>
            </div>
            {config.targetTrainingId && getSelectedTrainingName() && (
              <div className="action-preview">
                <span className="action-label">Action:</span>
                <span className="action-value">
                  Course <strong>{getSelectedTrainingName()}</strong> will be assigned
                  {config.dueDays && ` (due in ${config.dueDays} days)`}
                </span>
              </div>
            )}
          </div>
        );

      case 'notification':
        return (
          <div className="action-config">
            <div className="action-config-header">
              <Bell size={20} />
              <span>Send notification</span>
            </div>
            <div className="form-group">
              <label htmlFor="notify-channel">Notification Channel *</label>
              <select
                id="notify-channel"
                className="form-select"
                value={config.channel || 'email'}
                onChange={(e) => setConfig({ ...config, channel: e.target.value })}
              >
                <option value="email">Email</option>
                <option value="slack">Slack</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="notify-recipients">Recipients *</label>
              <input
                id="notify-recipients"
                type="text"
                className="form-input"
                value={config.recipients || ''}
                onChange={(e) => setConfig({ ...config, recipients: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
              />
              <p className="form-hint">Separate multiple recipients with commas</p>
            </div>
            <div className="form-group">
              <label htmlFor="notify-subject">Subject</label>
              <input
                id="notify-subject"
                type="text"
                className="form-input"
                value={config.subject || ''}
                onChange={(e) => setConfig({ ...config, subject: e.target.value })}
                placeholder="Notification subject..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="notify-message">Message Template *</label>
              <textarea
                id="notify-message"
                className="form-textarea"
                value={config.messageTemplate || ''}
                onChange={(e) => setConfig({ ...config, messageTemplate: e.target.value })}
                placeholder="The message to send when the rule matches..."
                rows={3}
              />
              <p className="form-hint">Use {'{{user.email}}'}, {'{{user.name}}'} for dynamic values</p>
            </div>
            {config.recipients && config.messageTemplate && (
              <div className="action-preview">
                <span className="action-label">Action:</span>
                <span className="action-value">
                  Send {config.channel || 'email'} to <strong>{config.recipients}</strong>
                </span>
              </div>
            )}
          </div>
        );

      case 'workflow':
        return (
          <div className="action-config">
            <div className="action-config-header">
              <GitBranch size={20} />
              <span>Trigger workflow action</span>
            </div>
            <div className="form-group">
              <label htmlFor="workflow-action">Workflow Action *</label>
              <select
                id="workflow-action"
                className="form-select"
                value={config.workflowAction || ''}
                onChange={(e) => setConfig({ ...config, workflowAction: e.target.value })}
              >
                <option value="">-- Select an action --</option>
                <option value="suspend_user">Suspend User</option>
                <option value="activate_user">Activate User</option>
                <option value="update_attributes">Update Attributes</option>
                <option value="send_welcome_email">Send Welcome Email</option>
                <option value="trigger_webhook">Trigger Webhook</option>
              </select>
            </div>
            {config.workflowAction === 'trigger_webhook' && (
              <div className="form-group">
                <label htmlFor="webhook-url">Webhook URL *</label>
                <input
                  id="webhook-url"
                  type="url"
                  className="form-input"
                  value={config.webhookUrl || ''}
                  onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}
            {config.workflowAction === 'update_attributes' && (
              <div className="form-group">
                <label htmlFor="attributes-json">Attributes to Update (JSON)</label>
                <textarea
                  id="attributes-json"
                  className="form-textarea"
                  value={config.attributes || ''}
                  onChange={(e) => setConfig({ ...config, attributes: e.target.value })}
                  placeholder='{"department": "Sales", "title": "Account Manager"}'
                  rows={3}
                />
              </div>
            )}
            {config.workflowAction && (
              <div className="action-preview">
                <span className="action-label">Action:</span>
                <span className="action-value">
                  {config.workflowAction === 'suspend_user' && 'Matching users will be suspended'}
                  {config.workflowAction === 'activate_user' && 'Matching users will be activated'}
                  {config.workflowAction === 'update_attributes' && 'User attributes will be updated'}
                  {config.workflowAction === 'send_welcome_email' && 'Welcome email will be sent'}
                  {config.workflowAction === 'trigger_webhook' && `Webhook will be called: ${config.webhookUrl || '(not set)'}`}
                </span>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="rule-builder">
      <div className="rule-builder-header">
        <h2>{rule ? (isConditionEditor ? 'Edit Condition' : 'Edit Rule') : (isConditionEditor ? 'New Condition' : 'New Rule')}</h2>
        <button className="close-btn" onClick={onCancel}>
          <X size={20} />
        </button>
      </div>

      <div className="rule-builder-body">
        {/* Basic Info */}
        <div className="form-section">
          <h3>Basic Information</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rule-name">Name *</label>
              <input
                id="rule-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isConditionEditor ? 'e.g., engineering_team' : 'e.g., Assign to Engineering Group'}
              />
              {isConditionEditor && (
                <p className="form-hint">Use lowercase letters, numbers, and underscores only</p>
              )}
            </div>

            {!isConditionEditor && (
              <div className="form-group">
                <label htmlFor="rule-type">Rule Type *</label>
                <select
                  id="rule-type"
                  className="form-select"
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as RuleType)}
                >
                  {RULE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <p className="form-hint">{RULE_TYPES.find(t => t.value === ruleType)?.description}</p>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="rule-desc">Description</label>
            <textarea
              id="rule-desc"
              className="form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this rule does..."
              rows={2}
            />
          </div>

          {!isConditionEditor && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="rule-priority">Priority</label>
                <input
                  id="rule-priority"
                  type="number"
                  className="form-input"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  min={0}
                  max={100}
                />
                <p className="form-hint">Higher priority rules are evaluated first</p>
              </div>

              <div className="form-group">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => setIsEnabled(e.target.checked)}
                  />
                  <span>Enable this rule</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* IF-THEN Structure for Rules */}
        {!isConditionEditor && (
          <div className="if-then-container">
            {/* IF Section - Conditions */}
            <div className="if-section">
              <div className="section-badge if-badge">
                <span className="badge-text">IF</span>
              </div>
              <div className="section-content">
                <div className="section-header">
                  <h3>Conditions</h3>
                  <button
                    className="validate-btn"
                    onClick={validateConditions}
                    disabled={validating}
                  >
                    {validating ? <RefreshCw size={14} className="spin" /> : <CheckCircle size={14} />}
                    Validate
                  </button>
                </div>
                <p className="section-description">Define the conditions that must be met for this rule to trigger</p>

                {validationResult && (
                  <div className={`validation-result ${validationResult.valid ? 'valid' : 'invalid'}`}>
                    {validationResult.valid ? (
                      <span className="result-success">
                        <CheckCircle size={16} />
                        Conditions are valid
                      </span>
                    ) : (
                      <span className="result-error">
                        <AlertCircle size={16} />
                        {validationResult.errors.join(', ')}
                      </span>
                    )}
                    {validationResult.warnings.length > 0 && (
                      <span className="result-warning">
                        <AlertCircle size={16} />
                        {validationResult.warnings.join(', ')}
                      </span>
                    )}
                  </div>
                )}

                {renderGroup(conditions, [])}
              </div>
            </div>

            {/* Arrow connector */}
            <div className="if-then-connector">
              <ArrowRight size={24} />
            </div>

            {/* THEN Section - Action */}
            <div className="then-section">
              <div className="section-badge then-badge">
                <span className="badge-text">THEN</span>
              </div>
              <div className="section-content">
                <div className="section-header">
                  <h3>
                    {getActionIcon()}
                    <span style={{ marginLeft: '8px' }}>
                      {RULE_TYPES.find(t => t.value === ruleType)?.actionLabel || 'Action'}
                    </span>
                  </h3>
                </div>
                <p className="section-description">Configure what happens when conditions are met</p>

                {renderActionConfig()}
              </div>
            </div>
          </div>
        )}

        {/* Conditions for Condition Editor (simplified view) */}
        {isConditionEditor && (
          <div className="form-section">
            <div className="section-header">
              <h3>Conditions</h3>
              <button
                className="validate-btn"
                onClick={validateConditions}
                disabled={validating}
              >
                {validating ? <RefreshCw size={14} className="spin" /> : <CheckCircle size={14} />}
                Validate
              </button>
            </div>

            {validationResult && (
              <div className={`validation-result ${validationResult.valid ? 'valid' : 'invalid'}`}>
                {validationResult.valid ? (
                  <span className="result-success">
                    <CheckCircle size={16} />
                    Conditions are valid
                  </span>
                ) : (
                  <span className="result-error">
                    <AlertCircle size={16} />
                    {validationResult.errors.join(', ')}
                  </span>
                )}
                {validationResult.warnings.length > 0 && (
                  <span className="result-warning">
                    <AlertCircle size={16} />
                    {validationResult.warnings.join(', ')}
                  </span>
                )}
              </div>
            )}

            {renderGroup(conditions, [])}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="rule-builder-footer">
        {error && (
          <div className="error-message">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="footer-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw size={16} className="spin" />
                Saving...
              </>
            ) : (
              rule ? 'Save Changes' : 'Create'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RuleBuilder;
