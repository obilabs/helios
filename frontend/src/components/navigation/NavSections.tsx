import React from 'react';
import { useLabels } from '../../contexts/LabelsContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { PAGES, type NavSectionDef } from '../../config/navigation';

interface NavSectionsProps {
  sections: NavSectionDef[];
  currentPage: string;
  onNavigate: (page: string) => void;
  labelsLoading?: boolean;
}

/**
 * Renders a navigation table from config/navigation.ts. An item is shown only
 * when its page's feature flag is on (and, where required, a connected module
 * provides its entity); a section with no visible items is not rendered.
 */
export const NavSections: React.FC<NavSectionsProps> = ({ sections, currentPage, onNavigate, labelsLoading }) => {
  const { labels, isEntityAvailable } = useLabels();
  const { isEnabled } = useFeatureFlags();

  return (
    <nav className="nav">
      {sections.map((section, index) => {
        const items = section.items.filter(
          (item) => isEnabled(PAGES[item.page].flag) && (!item.requiresEntity || isEntityAvailable(item.requiresEntity)),
        );
        if (items.length === 0) return null;

        const buttons = items.map((item) => {
          const Icon = item.icon;
          const label = (item.labelEntity && labels[item.labelEntity]?.plural) || item.label;
          return (
            <button
              key={item.page}
              className={`nav-item ${currentPage === item.page ? 'active' : ''}`}
              onClick={() => onNavigate(item.page)}
              data-testid={item.testId}
            >
              <Icon size={16} className="nav-icon" />
              <span>{label}</span>
            </button>
          );
        });

        if (section.title === null) {
          return <React.Fragment key={`top-${index}`}>{buttons}</React.Fragment>;
        }
        return (
          <div
            key={section.title}
            className="nav-section"
            data-labels-loaded={labelsLoading === undefined ? undefined : labelsLoading ? 'false' : 'true'}
          >
            <div className="nav-section-title">{section.title}</div>
            {buttons}
          </div>
        );
      })}
    </nav>
  );
};

export default NavSections;
