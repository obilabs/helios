/**
 * Scenario picker for the Create Group dialog (D-048): a dropdown of use cases,
 * the plain-language explainer, and a technical drill-in listing every Google
 * setting the scenario applies. Scenario content comes from the API.
 */
import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info, Settings2 } from 'lucide-react';
import type { GroupScenario } from '../../hooks/queries/useGroupScenarios';
import { useSetScenarioDisabled } from '../../hooks/queries/useGroupScenarios';
import { scenarioOptions, type ScopeView } from './groupScenarioView';
import './GroupScenarios.css';

interface GroupScenarioPanelProps {
  scenarios: GroupScenario[];
  loading: boolean;
  loadError: string | null;
  scope: ScopeView;
  selectedKey: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
}

export function GroupScenarioPanel({ scenarios, loading, loadError, scope, selectedKey, onSelect, disabled }: GroupScenarioPanelProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const options = scenarioOptions(scenarios, scope);
  const selected = scenarios.find((s) => s.key === selectedKey);

  return (
    <div className="gs-panel">
      <label className="gs-label" htmlFor="group-scenario-select">Scenario</label>
      <select
        id="group-scenario-select"
        className="gs-select"
        value={selectedKey}
        onChange={(e) => {
          onSelect(e.target.value);
          setShowTechnical(false);
        }}
        disabled={disabled || loading}
      >
        <option value="">No scenario: plain group with Google's default settings</option>
        {options.map(({ scenario, usable, reason }) => (
          <option key={scenario.key} value={scenario.key} disabled={!usable}>
            {scenario.name}
            {scenario.source === 'custom' ? ' (custom)' : ''}
            {usable ? '' : ` (unavailable: ${reason})`}
          </option>
        ))}
      </select>

      {loadError && <div className="gs-banner gs-tone-error">{loadError}</div>}
      {scope.message && (
        <div className={`gs-banner gs-tone-${scope.tone}`} role="status">
          <AlertTriangle size={16} aria-hidden />
          <span>{scope.message}</span>
        </div>
      )}

      {!selected && (
        <p className="gs-hint">
          A plain group gets Google's defaults, which often block or hold mail from outside senders. Pick a scenario to have
          Helios apply and verify the right settings.
        </p>
      )}

      {selected && (
        <div className="gs-explainer">
          <p className="gs-story">{selected.userStory}</p>

          <h4 className="gs-subhead">What will happen</h4>
          <ul className="gs-list">
            {selected.whatHappens.map((line) => <li key={line}>{line}</li>)}
          </ul>

          <div className="gs-audiences">
            <div>
              <h4 className="gs-subhead">Outside senders see</h4>
              <p>{selected.outsideSendersSee}</p>
            </div>
            <div>
              <h4 className="gs-subhead">Members see</h4>
              <p>{selected.membersSee}</p>
            </div>
          </div>

          <button type="button" className="gs-disclosure" onClick={() => setShowTechnical((v) => !v)} aria-expanded={showTechnical}>
            {showTechnical ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            Technical details: every Google setting this applies
          </button>

          {showTechnical && (
            <div className="gs-technical">
              {selected.settingsDetail.length === 0 ? (
                <p className="gs-hint">This scenario changes no Groups Settings API values.</p>
              ) : (
                <div className="gs-table-wrap">
                  <table className="gs-table">
                    <thead>
                      <tr>
                        <th>Google setting</th>
                        <th>Value</th>
                        <th>API field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.settingsDetail.map((row) => (
                        <tr key={row.field}>
                          <td>
                            {row.label}
                            <div className="gs-muted">{row.location}</div>
                          </td>
                          <td>{row.valueLabel}</td>
                          <td><code>{row.field} = {row.value}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selected.memberDeliveryDetail.length > 0 && (
                <>
                  <h4 className="gs-subhead">Delivery for members added here (Directory API members.delivery_settings)</h4>
                  <ul className="gs-list">
                    {selected.memberDeliveryDetail.map((d) => (
                      <li key={d.role}>{d.role}: {d.valueLabel} (<code>{d.value}</code>)</li>
                    ))}
                  </ul>
                </>
              )}

              {selected.suggestedAliases.length > 0 && (
                <p className="gs-hint">
                  Suggested aliases: {selected.suggestedAliases.map((a) => `${a}@`).join(', ')} (Google allows up to 30 per group).
                </p>
              )}

              {selected.manualSteps.length > 0 && (
                <>
                  <h4 className="gs-subhead">Not settable through the API: finish these in Google</h4>
                  <ol className="gs-list">
                    {selected.manualSteps.map((s) => <li key={s}>{s}</li>)}
                  </ol>
                </>
              )}

              {selected.kbApiNotes.length > 0 && (
                <div className="gs-banner gs-tone-info">
                  <Info size={16} aria-hidden />
                  <div>
                    {selected.kbApiNotes.map((n) => <p key={n}>{n}</p>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button type="button" className="gs-disclosure gs-manage-toggle" onClick={() => setShowManage((v) => !v)} aria-expanded={showManage}>
        <Settings2 size={16} aria-hidden />
        {showManage ? 'Hide scenario list' : 'Manage scenarios'}
      </button>
      {showManage && <ScenarioManageList scenarios={scenarios} />}
    </div>
  );
}

function ScenarioManageList({ scenarios }: { scenarios: GroupScenario[] }) {
  const setDisabled = useSetScenarioDisabled();
  return (
    <div className="gs-manage">
      <p className="gs-hint">Built-in scenarios can be turned off but not deleted. Turned-off scenarios are hidden from the list above.</p>
      {setDisabled.error && <div className="gs-banner gs-tone-error">{(setDisabled.error as Error).message}</div>}
      <ul className="gs-manage-list">
        {scenarios.map((s) => (
          <li key={s.key}>
            <label>
              <input
                type="checkbox"
                checked={!s.disabled}
                disabled={setDisabled.isPending}
                onChange={(e) => setDisabled.mutate({ key: s.key, disabled: !e.target.checked })}
              />
              <span>{s.name}</span>
              <span className="gs-muted">{s.source === 'builtin' ? 'Built-in' : 'Custom'}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
