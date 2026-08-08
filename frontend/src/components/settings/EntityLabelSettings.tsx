import { useState, useEffect } from 'react';
import { Tag, RotateCcw, Save, Loader, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { useLabels } from '../../contexts/LabelsContext';
import { ENTITIES, ENTITY_METADATA, DEFAULT_LABELS } from '../../config/entities';
import type { EntityName } from '../../config/entities';
import { authFetch } from '../../config/api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import './EntityLabelSettings.css';

interface EntityLabelSettingsProps {
  isAdmin: boolean;
}

interface LabelEdit {
  singular: string;
  plural: string;
}

type LabelsState = Record<EntityName, LabelEdit>;

export function EntityLabelSettings({ isAdmin }: EntityLabelSettingsProps) {
  const { labels, refreshLabels, isEntityAvailable } = useLabels();
  const [editedLabels, setEditedLabels] = useState<LabelsState>({} as LabelsState);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Initialize edited labels from context
  useEffect(() => {
    const initial: Partial<LabelsState> = {};
    Object.values(ENTITIES).forEach((entityName) => {
      const label = labels[entityName] || DEFAULT_LABELS[entityName as EntityName];
      initial[entityName as EntityName] = {
        singular: label?.singular || '',
        plural: label?.plural || '',
      };
    });
    setEditedLabels(initial as LabelsState);
    setHasChanges(false);
  }, [labels]);

  // Check for changes
  useEffect(() => {
    const changed = Object.values(ENTITIES).some((entityName) => {
      const current = labels[entityName];
      const edited = editedLabels[entityName as EntityName];
      if (!current || !edited) return false;
      return current.singular !== edited.singular || current.plural !== edited.plural;
    });
    setHasChanges(changed);
  }, [editedLabels, labels]);

  const handleLabelChange = (entityName: EntityName, field: 'singular' | 'plural', value: string) => {
    // Enforce 30 character limit
    if (value.length > 30) return;

    setEditedLabels((prev) => ({
      ...prev,
      [entityName]: {
        ...prev[entityName],
        [field]: value,
      },
    }));
    setSaveStatus('idle');
    setErrorMessage('');
  };

  const handleSave = async () => {
    if (!isAdmin) return;

    setIsSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');

    try {
      const response = await authFetch('/api/v1/organization/labels', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: editedLabels }),
      });

      const data = await response.json();

      if (data.success) {
        setSaveStatus('success');
        await refreshLabels();
        // Trigger storage event to notify other tabs
        localStorage.setItem('helios_labels_updated', Date.now().toString());
      } else {
        setSaveStatus('error');
        setErrorMessage(data.message || 'Failed to save labels');
      }
    } catch (error: any) {
      setSaveStatus('error');
      setErrorMessage(error.message || 'Failed to save labels');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!isAdmin) return;
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    setShowResetConfirm(false);
    setIsResetting(true);
    setSaveStatus('idle');
    setErrorMessage('');

    try {
      const response = await authFetch('/api/v1/organization/labels/reset', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        setSaveStatus('success');
        await refreshLabels();
        localStorage.setItem('helios_labels_updated', Date.now().toString());
      } else {
        setSaveStatus('error');
        setErrorMessage(data.message || 'Failed to reset labels');
      }
    } catch (error: any) {
      setSaveStatus('error');
      setErrorMessage(error.message || 'Failed to reset labels');
    } finally {
      setIsResetting(false);
    }
  };

  // Get entities in a specific order
  const orderedEntities: EntityName[] = [
    ENTITIES.USER,
    ENTITIES.ACCESS_GROUP,
    ENTITIES.WORKSPACE,
    ENTITIES.POLICY_CONTAINER,
    ENTITIES.DEVICE,
  ];

  return (
    <div className="entity-label-settings">
      <div className="settings-header">
        <div className="header-content">
          <h3>
            <Tag size={18} />
            Entity Labels
          </h3>
          <p>Customize how entities are named throughout the application</p>
        </div>
        {isAdmin && (
          <div className="header-actions">
            <button
              className="btn-secondary"
              onClick={handleReset}
              disabled={isResetting || isSaving}
            >
              {isResetting ? <Loader size={16} className="spin" /> : <RotateCcw size={16} />}
              Reset to Defaults
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? <Loader size={16} className="spin" /> : <Save size={16} />}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {saveStatus === 'success' && (
        <div className="status-message success">
          <CheckCircle size={16} />
          Labels saved successfully
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="status-message error">
          <AlertCircle size={16} />
          {errorMessage || 'An error occurred'}
        </div>
      )}

      <div className="info-box">
        <Info size={16} />
        <span>
          Labels are used in navigation, buttons, and headings throughout the application.
          Changes will take effect immediately after saving.
        </span>
      </div>

      <div className="entity-grid">
        {orderedEntities.map((entityName) => {
          const metadata = ENTITY_METADATA[entityName];
          const isAvailable = isEntityAvailable(entityName);
          const edited = editedLabels[entityName];
          const defaults = DEFAULT_LABELS[entityName];

          if (!edited) return null;

          return (
            <div
              key={entityName}
              className={`entity-card ${!isAvailable ? 'unavailable' : ''}`}
            >
              <div className="entity-header">
                <h4>{defaults.plural}</h4>
                {!isAvailable && (
                  <span className="unavailable-badge">Module not enabled</span>
                )}
              </div>
              <p className="entity-description">{metadata.description}</p>
              <p className="entity-examples">
                <strong>Examples:</strong> {metadata.examples.join(', ')}
              </p>

              <div className="label-fields">
                <div className="label-field">
                  <label htmlFor={`${entityName}-singular`}>
                    Singular
                    <span className="char-count">{edited.singular.length}/30</span>
                  </label>
                  <input
                    id={`${entityName}-singular`}
                    type="text"
                    value={edited.singular}
                    onChange={(e) => handleLabelChange(entityName, 'singular', e.target.value)}
                    placeholder={defaults.singular}
                    disabled={!isAdmin}
                    maxLength={30}
                  />
                </div>
                <div className="label-field">
                  <label htmlFor={`${entityName}-plural`}>
                    Plural
                    <span className="char-count">{edited.plural.length}/30</span>
                  </label>
                  <input
                    id={`${entityName}-plural`}
                    type="text"
                    value={edited.plural}
                    onChange={(e) => handleLabelChange(entityName, 'plural', e.target.value)}
                    placeholder={defaults.plural}
                    disabled={!isAdmin}
                    maxLength={30}
                  />
                </div>
              </div>

              <div className="label-preview">
                <span className="preview-label">Preview:</span>
                <span className="preview-text">
                  "Add {edited.singular || defaults.singular}" |
                  "All {edited.plural || defaults.plural}"
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {!isAdmin && (
        <div className="admin-only-notice">
          <Info size={16} />
          Only administrators can modify entity labels.
        </div>
      )}

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset Entity Labels"
        message="Reset all labels to their default values? This will undo any customizations you've made."
        variant="warning"
        confirmText="Reset to Defaults"
        onConfirm={confirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
