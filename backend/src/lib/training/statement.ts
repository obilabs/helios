/**
 * Parsing and validating an incoming completion statement.
 *
 * Separate from contract.ts on purpose: that file is the frozen vocabulary and must stay
 * readable as a specification. This one is the fallible edge where a vendor's payload
 * meets it, and it will change as we meet vendors.
 *
 * The rule throughout: refuse rather than guess. A completion is compliance evidence, and
 * a record that is quietly wrong is worse than a 400 the integrator has to fix — this
 * codebase has already paid twice for accepting something and looking successful.
 */
import {
  ACTOR_TYPES,
  MAX_FUTURE_TIMESTAMP_MS,
  TRAINING_SPEC_VERSION,
  canonicalAccount,
  canonicalMbox,
  durationToSeconds,
  emailFromMbox,
  verbFromIri,
  type ActorType,
  type CompletionStatement,
  type TrainingVerb,
} from './contract.js';

export interface ParsedCompletion {
  actorIdentifier: string;
  actorType: ActorType;
  actorEmail: string | null;
  verb: TrainingVerb;
  objectId: string;
  objectName: string | null;
  resultCompletion: boolean | null;
  resultSuccess: boolean | null;
  resultScoreScaled: number | null;
  resultDurationSeconds: number | null;
  occurredAt: Date;
  requirementId: string | null;
  provider: string | null;
  specVersion: number;
}

export class StatementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'StatementError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pick the first value from an xAPI language map, for a human-readable name. */
function firstLanguageValue(map: Record<string, string> | undefined): string | null {
  if (!map) return null;
  const values = Object.values(map).filter((v) => typeof v === 'string' && v.trim() !== '');
  return values.length > 0 ? values[0] : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new StatementError('invalid_statement', `${field} must be a non-empty string`, field);
  }
  return value.trim();
}

/**
 * Turn a submitted body into a record we are willing to store, or throw.
 *
 * @param body   the request body, untrusted
 * @param now    injected so tests can pin clock-skew behaviour
 */
export function parseCompletionStatement(
  body: unknown,
  now: Date = new Date(),
): ParsedCompletion {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new StatementError('invalid_statement', 'body must be a JSON object');
  }
  const statement = body as CompletionStatement;

  // --- spec version -------------------------------------------------------
  // A caller announcing a version we do not implement is refused rather than
  // best-efforted: they believe they are sending something we understand.
  const specVersion = statement.spec_version ?? TRAINING_SPEC_VERSION;
  if (!Number.isInteger(specVersion) || specVersion < 1) {
    throw new StatementError('invalid_spec_version', 'spec_version must be a positive integer', 'spec_version');
  }
  if (specVersion > TRAINING_SPEC_VERSION) {
    throw new StatementError(
      'unsupported_spec_version',
      `spec_version ${specVersion} is newer than this installation supports (${TRAINING_SPEC_VERSION})`,
      'spec_version',
    );
  }

  // --- actor --------------------------------------------------------------
  if (!statement.actor || typeof statement.actor !== 'object') {
    throw new StatementError('invalid_statement', 'actor is required', 'actor');
  }
  const hasMbox = typeof statement.actor.mbox === 'string';
  const hasAccount = !!statement.actor.account && typeof statement.actor.account === 'object';
  if (hasMbox && hasAccount) {
    // Two identifiers means two possible people. Choosing one silently is how a
    // completion gets attributed to the wrong employee.
    throw new StatementError(
      'ambiguous_actor',
      'actor must carry exactly one of mbox or account, not both',
      'actor',
    );
  }
  if (!hasMbox && !hasAccount) {
    throw new StatementError(
      'invalid_actor',
      `actor must carry one of: ${ACTOR_TYPES.join(', ')}`,
      'actor',
    );
  }

  let actorIdentifier: string;
  let actorType: ActorType;
  let actorEmail: string | null = null;

  if (hasMbox) {
    const raw = requireString(statement.actor.mbox, 'actor.mbox');
    const email = raw.startsWith('mailto:') ? raw.slice('mailto:'.length) : raw;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new StatementError('invalid_actor', 'actor.mbox must be a mailto: email address', 'actor.mbox');
    }
    actorIdentifier = canonicalMbox(email);
    actorType = 'mbox';
    actorEmail = emailFromMbox(actorIdentifier);
  } else {
    const account = statement.actor.account!;
    const homePage = requireString(account.homePage, 'actor.account.homePage');
    const name = requireString(account.name, 'actor.account.name');
    actorIdentifier = canonicalAccount(homePage, name);
    actorType = 'account';
  }

  // --- verb ---------------------------------------------------------------
  if (!statement.verb || typeof statement.verb !== 'object') {
    throw new StatementError('invalid_statement', 'verb is required', 'verb');
  }
  const verbIri = requireString(statement.verb.id, 'verb.id');
  const verb = verbFromIri(verbIri);
  if (!verb) {
    // Naming the accepted set in the error matters: the most likely caller mistake is
    // sending `attempted` or `experienced`, which are valid xAPI and meaningless here.
    throw new StatementError(
      'unsupported_verb',
      `verb.id must be one of the three accepted training verbs; got ${verbIri}`,
      'verb.id',
    );
  }

  // --- object -------------------------------------------------------------
  if (!statement.object || typeof statement.object !== 'object') {
    throw new StatementError('invalid_statement', 'object is required', 'object');
  }
  const objectId = requireString(statement.object.id, 'object.id');
  const objectName = firstLanguageValue(statement.object.definition?.name);

  // --- result -------------------------------------------------------------
  const result = statement.result;
  let resultScoreScaled: number | null = null;
  let resultDurationSeconds: number | null = null;

  if (result !== undefined) {
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw new StatementError('invalid_statement', 'result must be an object', 'result');
    }
    if (result.score?.scaled !== undefined) {
      const scaled = result.score.scaled;
      if (typeof scaled !== 'number' || Number.isNaN(scaled) || scaled < 0 || scaled > 1) {
        // xAPI defines scaled as 0..1. A vendor sending 85 means 85%, but assuming that
        // would record a passing score for someone who scored 0.85% on another vendor.
        throw new StatementError(
          'invalid_score',
          'result.score.scaled must be a number between 0 and 1',
          'result.score.scaled',
        );
      }
      resultScoreScaled = Math.round(scaled * 1000) / 1000;
    }
    if (result.duration !== undefined) {
      const seconds = durationToSeconds(requireString(result.duration, 'result.duration'));
      if (seconds === null) {
        throw new StatementError(
          'invalid_duration',
          'result.duration must be an ISO 8601 duration without year or month components',
          'result.duration',
        );
      }
      resultDurationSeconds = seconds;
    }
    for (const field of ['completion', 'success'] as const) {
      if (result[field] !== undefined && typeof result[field] !== 'boolean') {
        throw new StatementError('invalid_statement', `result.${field} must be a boolean`, `result.${field}`);
      }
    }
  }

  // --- timestamp ----------------------------------------------------------
  let occurredAt: Date;
  if (statement.timestamp === undefined) {
    occurredAt = now;
  } else {
    const parsed = new Date(requireString(statement.timestamp, 'timestamp'));
    if (Number.isNaN(parsed.getTime())) {
      throw new StatementError('invalid_timestamp', 'timestamp must be an ISO 8601 date-time', 'timestamp');
    }
    if (parsed.getTime() - now.getTime() > MAX_FUTURE_TIMESTAMP_MS) {
      // A future completion date would let a misconfigured integration satisfy a
      // requirement before the training happened, and it would survive in the audit trail.
      throw new StatementError('invalid_timestamp', 'timestamp is too far in the future', 'timestamp');
    }
    occurredAt = parsed;
  }

  // --- helios block -------------------------------------------------------
  let requirementId: string | null = null;
  let provider: string | null = null;
  if (statement.helios !== undefined) {
    if (typeof statement.helios !== 'object' || statement.helios === null) {
      throw new StatementError('invalid_statement', 'helios must be an object', 'helios');
    }
    if (statement.helios.requirement_id !== undefined) {
      const id = requireString(statement.helios.requirement_id, 'helios.requirement_id');
      if (!UUID_RE.test(id)) {
        throw new StatementError('invalid_statement', 'helios.requirement_id must be a UUID', 'helios.requirement_id');
      }
      requirementId = id;
    }
    if (statement.helios.provider !== undefined) {
      provider = requireString(statement.helios.provider, 'helios.provider').slice(0, 64);
    }
  }

  return {
    actorIdentifier,
    actorType,
    actorEmail,
    verb,
    objectId,
    objectName,
    resultCompletion: result?.completion ?? null,
    resultSuccess: result?.success ?? null,
    resultScoreScaled,
    resultDurationSeconds,
    occurredAt,
    requirementId,
    provider,
    specVersion,
  };
}
