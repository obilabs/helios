/**
 * Condition Builder Component
 *
 * A wrapper around RuleBuilder specifically for creating/editing
 * named (reusable) conditions.
 */

import React from 'react';
import RuleBuilder from './RuleBuilder';
import type { ConditionGroup } from './RuleBuilder';
import './RuleBuilder.css';

export interface NamedConditionData {
  id?: string;
  name: string;
  displayName: string;
  description: string;
  conditions: ConditionGroup;
}

interface ConditionBuilderProps {
  condition?: NamedConditionData | null;
  onSave: (condition: NamedConditionData) => Promise<void>;
  onCancel: () => void;
}

/**
 * Condition Builder
 *
 * Uses the RuleBuilder component with isConditionEditor=true to provide
 * a simplified interface for creating/editing named conditions.
 */
export const ConditionBuilder: React.FC<ConditionBuilderProps> = ({
  condition,
  onSave,
  onCancel,
}) => {
  return (
    <RuleBuilder
      rule={condition ? {
        id: condition.id,
        name: condition.displayName,
        description: condition.description,
        ruleType: 'dynamic_group',
        conditions: condition.conditions,
        priority: 0,
        isEnabled: true,
        config: { _conditionName: condition.name },
      } : null}
      onSave={async (ruleData) => {
        await onSave({
          id: condition?.id,
          name: ruleData.config._conditionName || ruleData.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          displayName: ruleData.name,
          description: ruleData.description,
          conditions: ruleData.conditions,
        });
      }}
      onCancel={onCancel}
      isConditionEditor={true}
    />
  );
};

// Export as both named and default for flexibility
export const StandaloneConditionBuilder = ConditionBuilder;
export default ConditionBuilder;
