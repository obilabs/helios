interface FeatureNotEnabledProps {
  /** Page title from config/navigation.ts. */
  title: string;
  isAdmin: boolean;
  onGoHome: () => void;
  onOpenSettings?: () => void;
}

/**
 * Shown when a page's feature flag is off — including when someone follows a
 * bookmark or direct URL to it. Distinct from "Page Not Found": the page exists,
 * this installation just does not have it switched on.
 */
export function FeatureNotEnabled({ title, isAdmin, onGoHome, onOpenSettings }: FeatureNotEnabledProps) {
  return (
    <div className="page-placeholder" data-testid="feature-not-enabled">
      <div className="placeholder-content">
        <h2>{title} is not enabled</h2>
        <p>
          {isAdmin
            ? 'This feature is switched off for your organization. Features that can be turned on are listed in Settings \u25B8 Advanced \u25B8 Features.'
            : 'This feature is switched off for your organization. Ask an administrator if you need it.'}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn-primary" onClick={onGoHome}>Go to Home</button>
          {isAdmin && onOpenSettings && (
            <button className="btn-secondary" onClick={onOpenSettings}>Open Settings</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default FeatureNotEnabled;
