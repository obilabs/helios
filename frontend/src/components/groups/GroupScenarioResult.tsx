/**
 * Result of creating a group from a scenario. The outcome is always shown in
 * full: steps, every mismatch between the scenario and Google's read-back,
 * warnings, manual steps and the email checklist. Nothing here reads as success
 * unless the service said "verified".
 */
import { CheckCircle2, CircleSlash, XCircle } from 'lucide-react';
import type { CreateFromScenarioResult } from '../../hooks/queries/useGroupScenarios';
import { outcomeView, stepLabel } from './groupScenarioView';
import './GroupScenarios.css';

export function GroupScenarioResult({ result }: { result: CreateFromScenarioResult }) {
  const view = outcomeView(result);
  return (
    <div className="gs-result">
      <div className={`gs-banner gs-tone-${view.tone}`} role="status">
        <div>
          <strong>{view.title}</strong>
          <p>{view.message}</p>
        </div>
      </div>

      <h4 className="gs-subhead">Steps</h4>
      <ul className="gs-steps">
        {result.steps.map((s) => (
          <li key={s.step} className={`gs-step gs-step-${s.status}`}>
            {s.status === 'ok' && <CheckCircle2 size={16} aria-label="ok" />}
            {s.status === 'failed' && <XCircle size={16} aria-label="failed" />}
            {s.status === 'skipped' && <CircleSlash size={16} aria-label="skipped" />}
            <span>{stepLabel(s.step)}</span>
            {s.detail && <span className="gs-muted"> {s.detail}</span>}
          </li>
        ))}
      </ul>

      {result.mismatches.length > 0 && (
        <>
          <h4 className="gs-subhead">Read back from Google does not match</h4>
          <div className="gs-table-wrap">
            <table className="gs-table">
              <thead>
                <tr>
                  <th>What</th>
                  <th>Expected</th>
                  <th>Google has</th>
                </tr>
              </thead>
              <tbody>
                {result.mismatches.map((m) => (
                  <tr key={`${m.area}:${m.field}`}>
                    <td><code>{m.field}</code></td>
                    <td><code>{m.expected}</code></td>
                    <td><code>{m.actual ?? '(not set)'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {result.warnings.length > 0 && (
        <div className="gs-banner gs-tone-warning">
          <div>{result.warnings.map((w) => <p key={w}>{w}</p>)}</div>
        </div>
      )}

      {result.manualSteps.length > 0 && (
        <>
          <h4 className="gs-subhead">Finish in Google</h4>
          <ol className="gs-list">
            {result.manualSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </>
      )}

      {result.emailChecklist.length > 0 && (
        <>
          <h4 className="gs-subhead">Email test checklist</h4>
          <ul className="gs-checklist">
            {result.emailChecklist.map((s) => (
              <li key={s}>
                <label>
                  <input type="checkbox" /> <span>{s}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="gs-hint">Test from an account that is not a member: Gmail hides your own posts to a group you belong to.</p>
        </>
      )}
    </div>
  );
}
