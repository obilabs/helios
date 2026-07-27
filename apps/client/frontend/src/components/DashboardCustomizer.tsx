import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { WIDGET_REGISTRY, type WidgetId, type WidgetCategory } from '../config/widgets';
import './DashboardCustomizer.css';

interface DashboardCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWidgets: WidgetId[];
  onSave: (widgets: WidgetId[]) => void;
  connectedPlatforms: {
    google: boolean;
    microsoft: boolean;
  };
}

export const DashboardCustomizer: React.FC<DashboardCustomizerProps> = ({
  isOpen,
  onClose,
  selectedWidgets,
  onSave,
  connectedPlatforms,
}) => {
  const [tempSelection, setTempSelection] = useState<WidgetId[]>(selectedWidgets);

  // Sync tempSelection when selectedWidgets changes (e.g., after refresh/load)
  useEffect(() => {
    setTempSelection(selectedWidgets);
  }, [selectedWidgets]);

  if (!isOpen) return null;

  const toggleWidget = (widgetId: WidgetId) => {
    if (tempSelection.includes(widgetId)) {
      setTempSelection(tempSelection.filter(id => id !== widgetId));
    } else {
      setTempSelection([...tempSelection, widgetId]);
    }
  };

  const handleSave = () => {
    onSave(tempSelection);
    onClose();
  };

  const handleCancel = () => {
    setTempSelection(selectedWidgets); // Reset to original
    onClose();
  };

  const getCategoryTitle = (category: WidgetCategory) => {
    const titles: Record<WidgetCategory, string> = {
      google: 'Google Workspace',
      microsoft: 'Microsoft 365',
      helios: 'Helios Portal',
      system: 'System',
      security: 'Security',
    };
    return titles[category];
  };

  const isCategoryEnabled = (category: WidgetCategory) => {
    if (category === 'google') return connectedPlatforms.google;
    if (category === 'microsoft') return connectedPlatforms.microsoft;
    return true; // Helios, system, and security always enabled
  };

  const categories: WidgetCategory[] = ['google', 'microsoft', 'helios', 'system', 'security'];

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content dashboard-customizer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>Customize Dashboard</h2>
          <button className="modal-close-btn" onClick={handleCancel}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <p className="customizer-description">
            Select which widgets to display on your dashboard. Changes will be saved to your user preferences.
          </p>

          {categories.map(category => {
            const categoryWidgets = WIDGET_REGISTRY.filter(w => w.category === category);
            const isEnabled = isCategoryEnabled(category);

            if (!isEnabled) return null; // Don't show disabled platform categories

            return (
              <div key={category} className="widget-category">
                <h3 className="category-title">{getCategoryTitle(category)}</h3>
                <div className="widget-list">
                  {categoryWidgets.map(widget => (
                    <label key={widget.id} className="widget-checkbox-item">
                      <input
                        type="checkbox"
                        checked={tempSelection.includes(widget.id)}
                        onChange={() => toggleWidget(widget.id)}
                      />
                      <div className="widget-checkbox-content">
                        <div className="widget-checkbox-icon">{widget.icon}</div>
                        <span className="widget-checkbox-label">{widget.title}</span>
                      </div>
                      {tempSelection.includes(widget.id) && (
                        <Check size={16} className="widget-check-icon" />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
