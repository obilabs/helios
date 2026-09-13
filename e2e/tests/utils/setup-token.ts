import { execFileSync } from 'node:child_process';

/**
 * Read the first-run setup token the way an operator does: from the backend
 * container's log (`docker compose logs backend | grep 'setup token'`).
 *
 * The backend prints `Helios setup token: <token>` at boot while no organization
 * exists (backend/src/services/setup-token.service.ts). The LAST occurrence wins,
 * in case the container restarted.
 *
 * HELIOS_E2E_SETUP_TOKEN overrides the lookup (e.g. when the stack was started
 * with HELIOS_SETUP_TOKEN preset). The default container is the isolated e2e
 * stack's backend, never the dev stack's.
 */
const BACKEND_CONTAINER = process.env.HELIOS_E2E_BACKEND_CONTAINER || 'helios_e2e_backend';

export function readSetupTokenFromLogs(): string {
  const preset = process.env.HELIOS_E2E_SETUP_TOKEN;
  if (preset) return preset;

  let logs: string;
  try {
    // docker writes container stdout/stderr to our stdout/stderr respectively.
    const out = execFileSync('docker', ['logs', BACKEND_CONTAINER], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    logs = out;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    logs = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    if (!logs.trim()) {
      throw new Error(`Could not read logs of ${BACKEND_CONTAINER}: ${String(err)}`);
    }
  }

  const matches = [...logs.matchAll(/Helios setup token: ([A-Za-z0-9_-]{16,})/g)];
  if (matches.length === 0) {
    throw new Error(
      `No "Helios setup token:" line in the logs of ${BACKEND_CONTAINER}. ` +
        'The backend only prints it at boot while no organization exists.',
    );
  }
  return matches[matches.length - 1][1];
}
