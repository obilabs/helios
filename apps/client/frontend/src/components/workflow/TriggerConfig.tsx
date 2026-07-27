import { Play, Clock, Calendar, CheckCircle } from 'lucide-react';
import type { WorkflowTrigger, TriggerType } from './types';

interface TriggerConfigProps {
  trigger: WorkflowTrigger;
  workflowType: 'onboarding' | 'offboarding';
  onChange: (trigger: WorkflowTrigger) => void;
  readOnly?: boolean;
}

interface TriggerOption {
  type: TriggerType;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hasOffset?: boolean;
  offsetLabel?: string;
}

const ONBOARDING_TRIGGERS: TriggerOption[] = [
  {
    type: 'on_request_submitted',
    label: 'When Request Submitted',
    description: 'Run immediately when onboarding request is created',
    icon: Play,
  },
  {
    type: 'on_request_approved',
    label: 'When Request Approved',
    description: 'Run when the request is approved by manager/HR',
    icon: CheckCircle,
  },
  {
    type: 'days_before_start',
    label: 'Days Before Start Date',
    description: 'Run X days before the user\'s start date',
    icon: Clock,
    hasOffset: true,
    offsetLabel: 'days before',
  },
  {
    type: 'on_start_date',
    label: 'On Start Date',
    description: 'Run on the user\'s first day',
    icon: Calendar,
  },
  {
    type: 'days_after_start',
    label: 'Days After Start Date',
    description: 'Run X days after the user starts',
    icon: Clock,
    hasOffset: true,
    offsetLabel: 'days after',
  },
];

const OFFBOARDING_TRIGGERS: TriggerOption[] = [
  {
    type: 'on_request_submitted',
    label: 'When Request Submitted',
    description: 'Run immediately when offboarding request is created',
    icon: Play,
  },
  {
    type: 'on_request_approved',
    label: 'When Request Approved',
    description: 'Run when the offboarding is approved',
    icon: CheckCircle,
  },
  {
    type: 'days_before_start',
    label: 'Days Before Last Day',
    description: 'Run X days before the user\'s last day',
    icon: Clock,
    hasOffset: true,
    offsetLabel: 'days before',
  },
  {
    type: 'on_last_day',
    label: 'On Last Day',
    description: 'Run on the user\'s last day',
    icon: Calendar,
  },
  {
    type: 'days_after_end',
    label: 'Days After Last Day',
    description: 'Run X days after the user\'s last day',
    icon: Clock,
    hasOffset: true,
    offsetLabel: 'days after',
  },
];

export function TriggerConfig({
  trigger,
  workflowType,
  onChange,
  readOnly,
}: TriggerConfigProps) {
  const triggers = workflowType === 'onboarding' ? ONBOARDING_TRIGGERS : OFFBOARDING_TRIGGERS;
  const selectedTrigger = triggers.find(t => t.type === trigger.type);

  const handleTypeChange = (type: TriggerType) => {
    const newTrigger = triggers.find(t => t.type === type);
    onChange({
      type,
      offsetDays: newTrigger?.hasOffset ? (trigger.offsetDays || 1) : undefined,
    });
  };

  const handleOffsetChange = (days: number) => {
    onChange({
      ...trigger,
      offsetDays: Math.max(1, days),
    });
  };

  return (
    <div className="trigger-config">
      <div className="trigger-config-header">
        <Play size={16} />
        <span>Workflow Trigger</span>
      </div>

      <div className="trigger-config-content">
        <div className="trigger-select">
          <select
            value={trigger.type}
            onChange={(e) => handleTypeChange(e.target.value as TriggerType)}
            disabled={readOnly}
          >
            {triggers.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {selectedTrigger?.hasOffset && (
          <div className="trigger-offset">
            <input
              type="number"
              min={1}
              max={365}
              value={trigger.offsetDays || 1}
              onChange={(e) => handleOffsetChange(parseInt(e.target.value) || 1)}
              disabled={readOnly}
            />
            <span>{selectedTrigger.offsetLabel}</span>
          </div>
        )}

        {selectedTrigger && (
          <p className="trigger-description">{selectedTrigger.description}</p>
        )}
      </div>
    </div>
  );
}

export default TriggerConfig;
