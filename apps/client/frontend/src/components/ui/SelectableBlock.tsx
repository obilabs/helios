import React from 'react';
import './ui.css';

export interface SelectableBlockProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: {
    text: string;
    variant: 'info' | 'success' | 'warning' | 'danger';
  };
  children?: React.ReactNode;
}

/**
 * SelectableBlock Component
 *
 * Expandable selection block with visual selection state.
 * Perfect for option lists that need to show additional content when selected.
 *
 * @example
 * ```tsx
 * <SelectableBlock
 *   selected={deleteOption === 'transfer'}
 *   onClick={() => setDeleteOption('transfer')}
 *   icon={<ArrowRightLeft size={20} />}
 *   title="Transfer & Delete"
 *   description="Transfer user data before deletion"
 *   badge={{ text: 'Recommended', variant: 'success' }}
 * >
 *   <UserSelector
 *     label="Transfer to user"
 *     value={transferUserId}
 *     onChange={setTransferUserId}
 *     organizationId={orgId}
 *   />
 * </SelectableBlock>
 * ```
 */
export const SelectableBlock: React.FC<SelectableBlockProps> = ({
  selected,
  onClick,
  icon,
  title,
  description,
  badge,
  children
}) => {
  return (
    <div
      className={`helios-selectable-block ${selected ? 'selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="helios-block-header">
        <div className="helios-block-icon">
          {icon}
        </div>

        <div className="helios-block-content">
          <div className="helios-block-title-row">
            <h4 className="helios-block-title">{title}</h4>
            {badge && (
              <span className={`helios-block-badge variant-${badge.variant}`}>
                {badge.text}
              </span>
            )}
          </div>

          <p className="helios-block-description">
            {description}
          </p>
        </div>
      </div>

      {selected && children && (
        <div
          className="helios-block-expanded"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
};
