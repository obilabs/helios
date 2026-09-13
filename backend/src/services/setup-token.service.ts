/**
 * First-run setup token.
 *
 * The same pattern as Jenkins' initialAdminPassword or Gitea's install lock: the
 * one-time bootstrap endpoint (POST /organization/setup) is only usable by
 * someone who can read the server's own output.
 *
 *   - At boot, while no organization exists yet, the backend holds a random
 *     one-time token. It is printed to the log
 *     (`Helios setup token: ...`) and written to a file (0600) in the data
 *     directory, so an operator finds it with
 *     `docker compose logs backend | grep 'setup token'`.
 *   - HELIOS_SETUP_TOKEN may pre-set the value (automation, e2e stacks).
 *   - An existing token file is reused across restarts, so a restart before
 *     setup does not invalidate the value the operator already copied.
 *   - The setup endpoint compares the presented token in constant time.
 *   - Completing setup destroys the token (memory and file). After that the
 *     endpoint is closed by the existing 409 "organization already exists".
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const SETUP_TOKEN_HEADER = 'x-helios-setup-token';

/** Minimum length accepted for an operator-supplied HELIOS_SETUP_TOKEN. */
const MIN_PRESET_LENGTH = 16;

type Log = (message: string) => void;

export interface SetupTokenOptions {
  /** Where the token file is written. Defaults to HELIOS_SETUP_TOKEN_FILE or <HELIOS_DATA_DIR|cwd/data>/setup-token. */
  filePath?: string;
  /** Operator-supplied token. Defaults to process.env.HELIOS_SETUP_TOKEN. */
  presetToken?: string;
  info?: Log;
  warn?: Log;
}

export function defaultSetupTokenFile(): string {
  if (process.env['HELIOS_SETUP_TOKEN_FILE']) return process.env['HELIOS_SETUP_TOKEN_FILE'];
  const dataDir = process.env['HELIOS_DATA_DIR'] || path.join(process.cwd(), 'data');
  return path.join(dataDir, 'setup-token');
}

export class SetupTokenStore {
  private token: string | null = null;
  private readonly fileOverride: string | undefined;
  private readonly presetOverride: string | undefined;
  private readonly info: Log;
  private readonly warn: Log;

  constructor(opts: SetupTokenOptions = {}) {
    // Resolved lazily so environment loaded after import (.env) is honoured.
    this.fileOverride = opts.filePath;
    this.presetOverride = opts.presetToken;
    this.info = opts.info ?? ((m) => console.log(m));
    this.warn = opts.warn ?? ((m) => console.warn(m));
  }

  private get filePath(): string {
    return this.fileOverride ?? defaultSetupTokenFile();
  }

  /** True while a token is armed (setup not yet completed). */
  isActive(): boolean {
    return this.token !== null;
  }

  /**
   * Arm the token if setup is still required; otherwise make sure no stale token
   * is left behind. Returns the armed token (for tests), or null.
   */
  initialize(setupRequired: boolean): string | null {
    if (!setupRequired) {
      this.destroy();
      return null;
    }

    const preset = (this.presetOverride ?? process.env['HELIOS_SETUP_TOKEN'] ?? '').trim();
    if (preset) {
      if (preset.length < MIN_PRESET_LENGTH) {
        throw new Error(
          `HELIOS_SETUP_TOKEN must be at least ${MIN_PRESET_LENGTH} characters (got ${preset.length}).`,
        );
      }
      this.token = preset;
    } else {
      this.token = this.readExistingFile() ?? crypto.randomBytes(24).toString('base64url');
    }

    this.writeFile(this.token);
    this.announce(this.token);
    return this.token;
  }

  /** Constant-time comparison of a presented token against the armed one. */
  verify(candidate: unknown): boolean {
    if (this.token === null || typeof candidate !== 'string' || candidate.length === 0) {
      return false;
    }
    const expected = crypto.createHash('sha256').update(this.token).digest();
    const given = crypto.createHash('sha256').update(candidate.trim()).digest();
    return crypto.timingSafeEqual(expected, given);
  }

  /** Forget the token and remove its file. Safe to call repeatedly. */
  destroy(): void {
    this.token = null;
    try {
      fs.rmSync(this.filePath, { force: true });
    } catch (error) {
      this.warn(`Could not remove setup token file ${this.filePath}: ${(error as Error).message}`);
    }
  }

  private readExistingFile(): string | null {
    try {
      const value = fs.readFileSync(this.filePath, 'utf8').trim();
      return value.length >= MIN_PRESET_LENGTH ? value : null;
    } catch {
      return null;
    }
  }

  private writeFile(token: string): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, `${token}\n`, { mode: 0o600 });
    } catch (error) {
      this.warn(
        `Could not write setup token file ${this.filePath} (${(error as Error).message}); ` +
          'the token is still available in this log.',
      );
    }
  }

  private announce(token: string): void {
    const bar = '='.repeat(72);
    this.info(
      [
        '',
        bar,
        'Helios has no organization yet. Open the web UI to run first-time setup.',
        `Helios setup token: ${token}`,
        `(also written to ${this.filePath}; it stops working once setup completes)`,
        bar,
        '',
      ].join('\n'),
    );
  }
}

/** Process-wide store used by the server and the setup route. */
export const setupTokenStore = new SetupTokenStore();

/** Read the token a client presented: header first, then JSON body `setupToken`. */
export function presentedSetupToken(headers: Record<string, unknown>, body: unknown): string | undefined {
  const header = headers[SETUP_TOKEN_HEADER];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const fromBody = (body as { setupToken?: unknown } | null | undefined)?.setupToken;
  return typeof fromBody === 'string' && fromBody.trim() ? fromBody.trim() : undefined;
}
