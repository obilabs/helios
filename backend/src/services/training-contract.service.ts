/**
 * Training contract v1 — the service half.
 *
 * Owns three things and nothing else: creating a requirement, ingesting a completion,
 * and deciding whether the second satisfies the first. Content, players and scoring are
 * out of scope by design; see backend/src/lib/training/contract.ts for why.
 */
import type { PoolClient } from 'pg';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { encryptionService } from './encryption.service.js';
import {
  DUE_SOON_LEAD_DAYS,
  TRAINING_SPEC_VERSION,
  canonicalMbox,
  effectiveStatus,
  toTrainingRecord,
  verbSatisfies,
  type RequirementReason,
  type TrainingRecord,
  type WebhookEvent,
} from '../lib/training/contract.js';
import type { ParsedCompletion } from '../lib/training/statement.js';
import { generateWebhookSecret, signWebhook } from '../lib/training/webhook.js';

export interface CreateRequirementInput {
  userId: string;
  title: string;
  reason: RequirementReason;
  reasonRef?: string | null;
  provider?: string;
  externalCourseId?: string | null;
  dueAt?: Date | string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface IngestContext {
  idempotencyKey: string;
  apiKeyId: string | null;
  raw: unknown;
}

export interface IngestResult {
  completionId: string;
  /** True when this exact call was already stored — a replayed webhook, not new evidence. */
  duplicate: boolean;
  requirementId: string | null;
  matched: boolean;
  satisfied: boolean;
  userId: string | null;
}

class TrainingContractService {
  // -------------------------------------------------------------------------
  // Flag
  // -------------------------------------------------------------------------

  /**
   * The contract ships inert. Every route asks this first, so an installation that has
   * not opted in behaves as though the endpoints do not exist.
   */
  async isEnabled(organizationId: string): Promise<boolean> {
    const result = await db.query(
      `SELECT training_contract_enabled FROM organization_settings WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows[0]?.training_contract_enabled === true;
  }

  // -------------------------------------------------------------------------
  // Requirements
  // -------------------------------------------------------------------------

  async createRequirement(
    organizationId: string,
    input: CreateRequirementInput,
  ): Promise<{ id: string }> {
    const user = await db.query(
      `SELECT id, email FROM organization_users WHERE id = $1 AND organization_id = $2`,
      [input.userId, organizationId],
    );
    if (user.rows.length === 0) {
      throw new Error(`No such user in this organization: ${input.userId}`);
    }

    // One transaction: a requirement that exists without its `created` webhook is a
    // receiver silently missing an obligation. Observed for real while proving this
    // live — the insert succeeded, the enqueue threw, and the row was left behind.
    return db.transaction<{ id: string }>(async (client) => {
    const inserted = await client.query(
      `INSERT INTO training_requirements
         (organization_id, user_id, subject_email, provider, external_course_id, title,
          reason, reason_ref, due_at, metadata, spec_version, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        organizationId,
        input.userId,
        user.rows[0].email,
        input.provider ?? 'helios',
        input.externalCourseId ?? null,
        input.title,
        input.reason,
        input.reasonRef ?? null,
        input.dueAt ?? null,
        JSON.stringify(input.metadata ?? {}),
        TRAINING_SPEC_VERSION,
        input.createdBy ?? null,
      ],
    );

      const requirementId = inserted.rows[0].id;
      await this.enqueueEvent(organizationId, 'training.requirement.created', requirementId, client);
      return { id: requirementId };
    });
  }

  async waiveRequirement(
    organizationId: string,
    requirementId: string,
    waivedBy: string,
    reason: string,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE training_requirements
          SET status = 'waived', waived_at = now(), waived_by = $3, waived_reason = $4, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND status = 'pending'
        RETURNING id`,
      [requirementId, organizationId, waivedBy, reason],
    );
    if (result.rows.length === 0) return false;
    await this.enqueueEvent(organizationId, 'training.requirement.waived', requirementId);
    return true;
  }

  async cancelRequirement(organizationId: string, requirementId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE training_requirements
          SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND status = 'pending'
        RETURNING id`,
      [requirementId, organizationId],
    );
    if (result.rows.length === 0) return false;
    await this.enqueueEvent(organizationId, 'training.requirement.cancelled', requirementId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Completion ingest
  // -------------------------------------------------------------------------

  /**
   * Store a completion and, if it answers a requirement, satisfy it.
   *
   * The whole path runs in one transaction. A completion stored without its requirement
   * being satisfied is the split-brain this codebase keeps rediscovering: the vendor
   * believes the person is done, Helios reports them overdue, and nothing looks broken.
   */
  async ingestCompletion(
    organizationId: string,
    parsed: ParsedCompletion,
    context: IngestContext,
  ): Promise<IngestResult> {
    return db.transaction<IngestResult>(async (client): Promise<IngestResult> => {
      // Resolve the actor to a Helios user. Unresolved is recorded, not refused: the raw
      // statement is still evidence, and a contractor who exists only in the vendor's
      // console is a real case.
      const userId = await this.resolveActor(client, organizationId, parsed);

      // Matched BEFORE the insert, deliberately. training_completions is append-only, so
      // there is no second pass that could fill this in afterwards — a completion that
      // goes in unlinked stays unlinked forever.
      const requirementId = await this.matchRequirement(client, organizationId, parsed, userId);

      const insert = await client.query(
        `INSERT INTO training_completions
           (organization_id, requirement_id, user_id, actor_identifier, actor_type, provider,
            verb, object_id, object_name, result_completion, result_success,
            result_score_scaled, result_duration_seconds, occurred_at, idempotency_key,
            api_key_id, spec_version, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (organization_id, api_key_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [
          organizationId,
          requirementId,
          userId,
          parsed.actorIdentifier,
          parsed.actorType,
          parsed.provider ?? 'unknown',
          parsed.verb,
          parsed.objectId,
          parsed.objectName,
          parsed.resultCompletion,
          parsed.resultSuccess,
          parsed.resultScoreScaled,
          parsed.resultDurationSeconds,
          parsed.occurredAt,
          context.idempotencyKey,
          context.apiKeyId,
          parsed.specVersion,
          JSON.stringify(context.raw),
        ],
      );

      // A replay. Return what we stored the first time rather than doing the work again —
      // that is what makes the endpoint safe for a vendor that retries on any 5xx.
      if (insert.rows.length === 0) {
        const existing = await client.query(
          `SELECT id, requirement_id, user_id FROM training_completions
            WHERE organization_id = $1
              AND api_key_id IS NOT DISTINCT FROM $2
              AND idempotency_key = $3`,
          [organizationId, context.apiKeyId, context.idempotencyKey],
        );
        const row = existing.rows[0];
        return {
          completionId: row.id,
          duplicate: true,
          requirementId: row.requirement_id,
          matched: row.requirement_id !== null,
          satisfied: row.requirement_id !== null,
          userId: row.user_id,
        };
      }

      const completionId = insert.rows[0].id;

      if (!requirementId) {
        return {
          completionId,
          duplicate: false,
          requirementId: null,
          matched: false,
          satisfied: false,
          userId,
        };
      }

      // A `failed` completion is linked to the requirement but does not satisfy it: the
      // attempt is evidence, and the obligation stands.
      await client.query(
        `UPDATE training_requirements
            SET status = CASE WHEN $3 THEN 'satisfied' ELSE status END,
                satisfied_at = CASE WHEN $3 THEN $4 ELSE satisfied_at END,
                satisfied_by_completion_id = CASE WHEN $3 THEN $2 ELSE satisfied_by_completion_id END,
                updated_at = now()
          WHERE id = $1`,
        [requirementId, completionId, verbSatisfies(parsed.verb), parsed.occurredAt],
      );

      const satisfied = verbSatisfies(parsed.verb);
      if (satisfied) {
        await this.enqueueEvent(
          organizationId,
          'training.requirement.satisfied',
          requirementId,
          client,
        );
      }

      logger.info('Training completion ingested', {
        organizationId,
        completionId,
        requirementId,
        verb: parsed.verb,
        provider: parsed.provider,
        satisfied,
      });

      return { completionId, duplicate: false, requirementId, matched: true, satisfied, userId };
    });
  }

  /** Actor -> Helios user. Only the mbox form can resolve; account ids are provider-local. */
  private async resolveActor(
    client: PoolClient,
    organizationId: string,
    parsed: ParsedCompletion,
  ): Promise<string | null> {
    if (!parsed.actorEmail) return null;
    const result = await client.query(
      `SELECT id FROM organization_users
        WHERE organization_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL
        LIMIT 1`,
      [organizationId, parsed.actorEmail],
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Which requirement, if any, this completion answers.
   *
   * Three rules, in order, and no fourth:
   *   1. An explicit `helios.requirement_id` wins — but only if it belongs to this
   *      organization and to this person. A provider naming someone else's requirement is
   *      refused rather than honoured.
   *   2. Otherwise the oldest pending requirement for this user whose external course id
   *      matches the object.
   *   3. Otherwise unmatched.
   *
   * There is deliberately no "just satisfy their oldest pending requirement" fallback.
   * Guessing would mean a completion of one course closing an unrelated obligation, and
   * the resulting record would look perfectly fine to everyone reading it.
   */
  private async matchRequirement(
    client: PoolClient,
    organizationId: string,
    parsed: ParsedCompletion,
    userId: string | null,
  ): Promise<string | null> {
    if (parsed.requirementId) {
      const explicit = await client.query(
        `SELECT id, user_id, subject_email, status FROM training_requirements
          WHERE id = $1 AND organization_id = $2`,
        [parsed.requirementId, organizationId],
      );
      const row = explicit.rows[0];
      if (!row) return null;

      const sameUser = userId !== null && row.user_id === userId;
      const sameEmail = canonicalMbox(row.subject_email) === parsed.actorIdentifier;
      if (!sameUser && !sameEmail) {
        logger.warn('Training completion named a requirement belonging to someone else', {
          organizationId,
          requirementId: parsed.requirementId,
          actor: parsed.actorIdentifier,
        });
        return null;
      }
      return row.status === 'pending' ? row.id : null;
    }

    if (!userId) return null;

    const byCourse = await client.query(
      `SELECT id FROM training_requirements
        WHERE organization_id = $1 AND user_id = $2 AND status = 'pending'
          AND external_course_id IS NOT NULL AND external_course_id = $3
        ORDER BY assigned_at ASC
        LIMIT 1`,
      [organizationId, userId, parsed.objectId],
    );
    return byCourse.rows[0]?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // Read projection
  // -------------------------------------------------------------------------

  async listRecords(
    organizationId: string,
    options: { userId?: string; status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ records: TrainingRecord[]; total: number }> {
    const limit = Math.min(options.limit ?? 100, 500);
    const offset = options.offset ?? 0;
    const params: unknown[] = [organizationId];
    let where = 'organization_id = $1';

    if (options.userId) {
      params.push(options.userId);
      where += ` AND user_id = $${params.length}`;
    }
    if (options.status) {
      params.push(options.status);
      where += ` AND status = $${params.length}`;
    }

    const total = await db.query(
      `SELECT count(*)::int AS n FROM training_requirement_records WHERE ${where}`,
      params,
    );
    const rows = await db.query(
      `SELECT * FROM training_requirement_records
        WHERE ${where}
        ORDER BY due_at ASC NULLS LAST, assigned_at ASC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    return {
      records: rows.rows.map((row: any) => toTrainingRecord(row)),
      total: total.rows[0].n,
    };
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /**
   * Queue an event for every active endpoint subscribed to it.
   *
   * Writing to an outbox rather than calling out inline is the point: the requirement
   * transition must commit whether or not the customer's receiver is reachable, and a
   * slow receiver must never hold open the transaction that records compliance evidence.
   */
  async enqueueEvent(
    organizationId: string,
    event: WebhookEvent,
    requirementId: string,
    client?: PoolClient,
  ): Promise<number> {
    const exec = client ?? db;
    const record = await exec.query(
      `SELECT * FROM training_requirement_records WHERE id = $1 AND organization_id = $2`,
      [requirementId, organizationId],
    );
    if (record.rows.length === 0) return 0;

    const payload = {
      spec_version: TRAINING_SPEC_VERSION,
      event,
      occurred_at: new Date().toISOString(),
      organization_id: organizationId,
      data: { record: toTrainingRecord(record.rows[0]) },
    };

    const queued = await exec.query(
      `INSERT INTO training_webhook_deliveries
         (organization_id, endpoint_id, event, requirement_id, payload)
       SELECT $1, e.id, $2::text, $3, $4
         FROM training_webhook_endpoints e
        WHERE e.organization_id = $1 AND e.is_active = true AND $2::text = ANY(e.events)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [organizationId, event, requirementId, JSON.stringify(payload)],
    );
    return queued.rows.length;
  }

  /**
   * Sweep for requirements that have crossed a due date and emit the transition events.
   *
   * The stored status is not touched: `overdue` is derived, so the read API is already
   * correct before this runs. This exists only so a receiver hears about it, which is why
   * a missed run degrades to a late notification rather than a wrong record.
   */
  async sweepDueEvents(organizationId: string): Promise<{ dueSoon: number; overdue: number }> {
    const overdue = await db.query(
      `SELECT id FROM training_requirements
        WHERE organization_id = $1 AND status = 'pending'
          AND due_at IS NOT NULL AND due_at < now()`,
      [organizationId],
    );
    const dueSoon = await db.query(
      `SELECT id FROM training_requirements
        WHERE organization_id = $1 AND status = 'pending'
          AND due_at IS NOT NULL AND due_at >= now()
          AND due_at < now() + ($2 || ' days')::interval`,
      [organizationId, DUE_SOON_LEAD_DAYS],
    );

    let overdueSent = 0;
    for (const row of overdue.rows) {
      overdueSent += await this.enqueueEvent(organizationId, 'training.requirement.overdue', row.id);
    }
    let dueSoonSent = 0;
    for (const row of dueSoon.rows) {
      dueSoonSent += await this.enqueueEvent(organizationId, 'training.requirement.due_soon', row.id);
    }
    return { dueSoon: dueSoonSent, overdue: overdueSent };
  }

  async createEndpoint(
    organizationId: string,
    input: { name: string; url: string; events: WebhookEvent[]; createdBy?: string | null },
  ): Promise<{ id: string; secret: string }> {
    const secret = generateWebhookSecret();
    const result = await db.query(
      `INSERT INTO training_webhook_endpoints
         (organization_id, name, url, secret_encrypted, events, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        organizationId,
        input.name,
        input.url,
        encryptionService.encrypt(secret),
        input.events,
        input.createdBy ?? null,
      ],
    );
    // Returned once, at creation, and never readable again — the customer stores it.
    return { id: result.rows[0].id, secret };
  }

  /**
   * Sign one queued delivery. Returns the exact bytes and headers to send.
   *
   * The body is serialised once here and signed as those bytes: re-serialising before the
   * request would let key ordering differ from what was signed, and the receiver would
   * see an invalid signature for a payload we actually sent.
   */
  async prepareDelivery(
    deliveryId: string,
  ): Promise<{ url: string; body: string; headers: Record<string, string> } | null> {
    const result = await db.query(
      `SELECT d.id, d.event_id, d.payload, e.url, e.secret_encrypted
         FROM training_webhook_deliveries d
         JOIN training_webhook_endpoints e ON e.id = d.endpoint_id
        WHERE d.id = $1`,
      [deliveryId],
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const body = JSON.stringify({ ...row.payload, id: row.event_id });
    const secret = encryptionService.decrypt(row.secret_encrypted);
    const signed = signWebhook(body, secret);

    return {
      url: row.url,
      body,
      headers: {
        'content-type': 'application/json',
        'x-helios-signature': signed.header,
        'x-helios-event-id': row.event_id,
      },
    };
  }
}

export const trainingContractService = new TrainingContractService();
export { effectiveStatus };
