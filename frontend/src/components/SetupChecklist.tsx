import { CheckCircle2, Circle, RefreshCw } from 'lucide-react';

interface SetupChecklistProps {
  googleConnected: boolean;
  googleSynced: boolean;
  syncing: boolean;
  onConnectGoogle: () => void;
  onRunFirstSync: () => void;
  onReviewUsers: () => void;
}

/** Home shows this until Google Workspace is connected and has synced once. */
export function isSetupComplete(googleConnected: boolean, googleSynced: boolean): boolean {
  return googleConnected && googleSynced;
}

/**
 * First-run checklist for the Home page. Each step names one concrete action;
 * the dashboard's alerts and activity replace it once setup is complete.
 */
export function SetupChecklist({ googleConnected, googleSynced, syncing, onConnectGoogle, onRunFirstSync, onReviewUsers }: SetupChecklistProps) {
  const steps = [
    {
      done: googleConnected,
      title: 'Connect Google Workspace',
      detail: 'Upload a service-account key with domain-wide delegation in Settings.',
      action: !googleConnected ? { label: 'Connect', onClick: onConnectGoogle } : undefined,
    },
    {
      done: googleSynced,
      title: 'Run the first sync',
      detail: 'Pull users, groups and org units from Google Workspace.',
      action: googleConnected && !googleSynced
        ? { label: syncing ? 'Syncing\u2026' : 'Sync now', onClick: onRunFirstSync, disabled: syncing }
        : undefined,
    },
    {
      done: false,
      title: 'Review your users',
      detail: 'Check the synced directory before making changes.',
      action: googleSynced ? { label: 'Open Users', onClick: onReviewUsers } : undefined,
    },
  ];

  return (
    <div className="dashboard-card setup-checklist" data-testid="setup-checklist">
      <h2 className="section-title">Get started</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {steps.map((step) => (
          <li key={step.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {step.done
              ? <CheckCircle2 size={16} style={{ color: 'var(--color-success)', marginTop: 2, flexShrink: 0 }} aria-label="Done" />
              : <Circle size={16} style={{ color: 'var(--color-gray-400)', marginTop: 2, flexShrink: 0 }} aria-label="Not done" />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{step.title}</div>
              <div style={{ fontSize: 13, color: 'var(--color-gray-500)' }}>{step.detail}</div>
            </div>
            {step.action && (
              <button className="quick-action-btn primary" onClick={step.action.onClick} disabled={step.action.disabled}>
                {step.action.label === 'Sync now' && <RefreshCw size={16} />}
                {step.action.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default SetupChecklist;
