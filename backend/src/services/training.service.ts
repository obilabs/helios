/**
 * Training Service
 *
 * Manages training content and user progress tracking.
 * Supports videos, documents, terms acceptance, quizzes, and checklists.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

// Types
export type ContentType = 'video' | 'document' | 'terms' | 'quiz' | 'link' | 'checklist';
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

export interface TrainingContent {
  id: string;
  organization_id: string;
  title: string;
  description?: string;
  content_type: ContentType;
  url?: string;
  file_path?: string;
  embedded_content?: string;
  estimated_duration_minutes: number;
  passing_score?: number;
  requires_acknowledgment: boolean;
  requires_signature: boolean;
  allow_skip: boolean;
  category?: string;
  tags: string[];
  applies_to_roles: string[];
  applies_to_departments: string[];
  version: number;
  is_active: boolean;
  is_mandatory: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateContentDTO {
  organization_id: string;
  title: string;
  description?: string;
  content_type: ContentType;
  url?: string;
  file_path?: string;
  embedded_content?: string;
  estimated_duration_minutes?: number;
  passing_score?: number;
  requires_acknowledgment?: boolean;
  requires_signature?: boolean;
  allow_skip?: boolean;
  category?: string;
  tags?: string[];
  applies_to_roles?: string[];
  applies_to_departments?: string[];
  is_mandatory?: boolean;
  created_by?: string;
}

export interface UpdateContentDTO {
  title?: string;
  description?: string;
  url?: string;
  file_path?: string;
  embedded_content?: string;
  estimated_duration_minutes?: number;
  passing_score?: number;
  requires_acknowledgment?: boolean;
  requires_signature?: boolean;
  allow_skip?: boolean;
  category?: string;
  tags?: string[];
  applies_to_roles?: string[];
  applies_to_departments?: string[];
  is_mandatory?: boolean;
  is_active?: boolean;
}

export interface UserProgress {
  id: string;
  organization_id: string;
  user_id: string;
  content_id: string;
  status: ProgressStatus;
  progress_percent: number;
  started_at?: string;
  completed_at?: string;
  time_spent_seconds: number;
  quiz_attempts: number;
  quiz_score?: number;
  quiz_passed?: boolean;
  quiz_answers?: Record<string, unknown>;
  acknowledged_at?: string;
  signature_data?: string;
  assigned_at: string;
  assigned_by?: string;
  due_date?: string;
  request_id?: string;
  content?: TrainingContent;
}

export interface QuizQuestion {
  id: string;
  content_id: string;
  question_text: string;
  question_type: 'single_choice' | 'multiple_choice' | 'true_false' | 'text';
  options?: Array<{ id: string; text: string; isCorrect: boolean }>;
  correct_answer?: string;
  points: number;
  explanation?: string;
  sequence_order: number;
}

export interface ListContentOptions {
  content_type?: ContentType;
  category?: string;
  is_active?: boolean;
  is_mandatory?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

class TrainingService {
  // ===== Content Management =====

  /**
   * Create training content
   */
  async createContent(dto: CreateContentDTO): Promise<TrainingContent> {
    const result = await db.query(
      `INSERT INTO training_content (
        organization_id, title, description, content_type, url, file_path,
        embedded_content, estimated_duration_minutes, passing_score,
        requires_acknowledgment, requires_signature, allow_skip,
        category, tags, applies_to_roles, applies_to_departments,
        is_mandatory, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        dto.organization_id,
        dto.title,
        dto.description || null,
        dto.content_type,
        dto.url || null,
        dto.file_path || null,
        dto.embedded_content || null,
        dto.estimated_duration_minutes || 0,
        dto.passing_score || null,
        dto.requires_acknowledgment || false,
        dto.requires_signature || false,
        dto.allow_skip || false,
        dto.category || null,
        JSON.stringify(dto.tags || []),
        JSON.stringify(dto.applies_to_roles || []),
        JSON.stringify(dto.applies_to_departments || []),
        dto.is_mandatory || false,
        dto.created_by || null,
      ]
    );

    logger.info('Created training content', { contentId: result.rows[0].id, title: dto.title });
    return result.rows[0];
  }

  /**
   * Get content by ID
   */
  async getContent(contentId: string, organizationId: string): Promise<TrainingContent | null> {
    const result = await db.query(
      `SELECT * FROM training_content WHERE id = $1 AND organization_id = $2`,
      [contentId, organizationId]
    );
    return result.rows[0] || null;
  }

  /**
   * List content with filters
   */
  async listContent(
    organizationId: string,
    options: ListContentOptions = {}
  ): Promise<{ content: TrainingContent[]; total: number }> {
    const { content_type, category, is_active, is_mandatory, search, limit = 50, offset = 0 } = options;

    let whereClause = 'organization_id = $1';
    const values: (string | boolean | number)[] = [organizationId];
    let paramIndex = 2;

    if (content_type) {
      whereClause += ` AND content_type = $${paramIndex}`;
      values.push(content_type);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      values.push(category);
      paramIndex++;
    }

    if (is_active !== undefined) {
      whereClause += ` AND is_active = $${paramIndex}`;
      values.push(is_active);
      paramIndex++;
    }

    if (is_mandatory !== undefined) {
      whereClause += ` AND is_mandatory = $${paramIndex}`;
      values.push(is_mandatory);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM training_content WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    values.push(limit, offset);
    const result = await db.query(
      `SELECT * FROM training_content
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      values
    );

    return { content: result.rows, total };
  }

  /**
   * Update content
   */
  async updateContent(
    contentId: string,
    organizationId: string,
    dto: UpdateContentDTO
  ): Promise<TrainingContent | null> {
    const fields: string[] = [];
    const values: (string | boolean | number | null)[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      title: 'title',
      description: 'description',
      url: 'url',
      file_path: 'file_path',
      embedded_content: 'embedded_content',
      estimated_duration_minutes: 'estimated_duration_minutes',
      passing_score: 'passing_score',
      requires_acknowledgment: 'requires_acknowledgment',
      requires_signature: 'requires_signature',
      allow_skip: 'allow_skip',
      category: 'category',
      is_mandatory: 'is_mandatory',
      is_active: 'is_active',
    };

    for (const [key, dbField] of Object.entries(fieldMappings)) {
      const value = (dto as Record<string, unknown>)[key];
      if (value !== undefined) {
        fields.push(`${dbField} = $${paramIndex}`);
        values.push(value as string | boolean | number | null);
        paramIndex++;
      }
    }

    // Handle JSON fields
    if (dto.tags !== undefined) {
      fields.push(`tags = $${paramIndex}`);
      values.push(JSON.stringify(dto.tags));
      paramIndex++;
    }
    if (dto.applies_to_roles !== undefined) {
      fields.push(`applies_to_roles = $${paramIndex}`);
      values.push(JSON.stringify(dto.applies_to_roles));
      paramIndex++;
    }
    if (dto.applies_to_departments !== undefined) {
      fields.push(`applies_to_departments = $${paramIndex}`);
      values.push(JSON.stringify(dto.applies_to_departments));
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.getContent(contentId, organizationId);
    }

    // Increment version on update
    fields.push('version = version + 1');
    fields.push('updated_at = NOW()');

    values.push(contentId, organizationId);

    const result = await db.query(
      `UPDATE training_content
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Delete content (soft delete by deactivating)
   */
  async deleteContent(contentId: string, organizationId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE training_content SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [contentId, organizationId]
    );
    return (result.rowCount || 0) > 0;
  }

  // ===== Quiz Management =====

  /**
   * Add question to quiz content
   */
  async addQuizQuestion(
    contentId: string,
    question: Omit<QuizQuestion, 'id' | 'content_id'>
  ): Promise<QuizQuestion> {
    const result = await db.query(
      `INSERT INTO training_quiz_questions (
        content_id, question_text, question_type, options, correct_answer,
        points, explanation, sequence_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        contentId,
        question.question_text,
        question.question_type,
        question.options ? JSON.stringify(question.options) : null,
        question.correct_answer || null,
        question.points || 1,
        question.explanation || null,
        question.sequence_order || 0,
      ]
    );
    return result.rows[0];
  }

  /**
   * Get quiz questions
   */
  async getQuizQuestions(contentId: string): Promise<QuizQuestion[]> {
    const result = await db.query(
      `SELECT * FROM training_quiz_questions
       WHERE content_id = $1
       ORDER BY sequence_order ASC`,
      [contentId]
    );
    return result.rows;
  }

  /**
   * Update quiz question
   */
  async updateQuizQuestion(
    questionId: string,
    updates: Partial<Omit<QuizQuestion, 'id' | 'content_id'>>
  ): Promise<QuizQuestion | null> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    let paramIndex = 1;

    if (updates.question_text !== undefined) {
      fields.push(`question_text = $${paramIndex}`);
      values.push(updates.question_text);
      paramIndex++;
    }
    if (updates.question_type !== undefined) {
      fields.push(`question_type = $${paramIndex}`);
      values.push(updates.question_type);
      paramIndex++;
    }
    if (updates.options !== undefined) {
      fields.push(`options = $${paramIndex}`);
      values.push(JSON.stringify(updates.options));
      paramIndex++;
    }
    if (updates.correct_answer !== undefined) {
      fields.push(`correct_answer = $${paramIndex}`);
      values.push(updates.correct_answer);
      paramIndex++;
    }
    if (updates.points !== undefined) {
      fields.push(`points = $${paramIndex}`);
      values.push(updates.points);
      paramIndex++;
    }
    if (updates.explanation !== undefined) {
      fields.push(`explanation = $${paramIndex}`);
      values.push(updates.explanation);
      paramIndex++;
    }
    if (updates.sequence_order !== undefined) {
      fields.push(`sequence_order = $${paramIndex}`);
      values.push(updates.sequence_order);
      paramIndex++;
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = NOW()');
    values.push(questionId);

    const result = await db.query(
      `UPDATE training_quiz_questions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Delete quiz question
   */
  async deleteQuizQuestion(questionId: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM training_quiz_questions WHERE id = $1`,
      [questionId]
    );
    return (result.rowCount || 0) > 0;
  }

  // ===== User Progress =====

  /**
   * Assign content to user
   */
  async assignToUser(
    organizationId: string,
    userId: string,
    contentId: string,
    options: {
      assignedBy?: string;
      dueDate?: string;
      requestId?: string;
    } = {}
  ): Promise<UserProgress> {
    const result = await db.query(
      `INSERT INTO user_training_progress (
        organization_id, user_id, content_id, assigned_by, due_date, request_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, content_id)
      DO UPDATE SET due_date = COALESCE($5, user_training_progress.due_date),
                    request_id = COALESCE($6, user_training_progress.request_id),
                    updated_at = NOW()
      RETURNING *`,
      [
        organizationId,
        userId,
        contentId,
        options.assignedBy || null,
        options.dueDate || null,
        options.requestId || null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Get user progress for a content item
   */
  async getUserProgress(userId: string, contentId: string): Promise<UserProgress | null> {
    const result = await db.query(
      `SELECT p.*, c.title, c.content_type, c.estimated_duration_minutes
       FROM user_training_progress p
       JOIN training_content c ON p.content_id = c.id
       WHERE p.user_id = $1 AND p.content_id = $2`,
      [userId, contentId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all progress for a user
   */
  async getUserAllProgress(
    organizationId: string,
    userId: string,
    options: { status?: ProgressStatus; requestId?: string } = {}
  ): Promise<UserProgress[]> {
    let whereClause = 'p.organization_id = $1 AND p.user_id = $2';
    const values: (string)[] = [organizationId, userId];
    let paramIndex = 3;

    if (options.status) {
      whereClause += ` AND p.status = $${paramIndex}`;
      values.push(options.status);
      paramIndex++;
    }

    if (options.requestId) {
      whereClause += ` AND p.request_id = $${paramIndex}`;
      values.push(options.requestId);
    }

    const result = await db.query(
      `SELECT p.*, c.title, c.content_type, c.estimated_duration_minutes,
              c.requires_acknowledgment, c.requires_signature, c.passing_score
       FROM user_training_progress p
       JOIN training_content c ON p.content_id = c.id
       WHERE ${whereClause}
       ORDER BY p.due_date ASC NULLS LAST, c.title ASC`,
      values
    );
    return result.rows;
  }

  /**
   * Start training content
   */
  async startProgress(userId: string, contentId: string): Promise<UserProgress | null> {
    const result = await db.query(
      `UPDATE user_training_progress
       SET status = 'in_progress',
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE user_id = $1 AND content_id = $2
       RETURNING *`,
      [userId, contentId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update progress percentage
   */
  async updateProgress(
    userId: string,
    contentId: string,
    progressPercent: number,
    timeSpentSeconds?: number
  ): Promise<UserProgress | null> {
    const result = await db.query(
      `UPDATE user_training_progress
       SET progress_percent = $3,
           time_spent_seconds = COALESCE(time_spent_seconds, 0) + COALESCE($4, 0),
           updated_at = NOW()
       WHERE user_id = $1 AND content_id = $2
       RETURNING *`,
      [userId, contentId, progressPercent, timeSpentSeconds || 0]
    );
    return result.rows[0] || null;
  }

  /**
   * Complete training content
   */
  async completeProgress(userId: string, contentId: string): Promise<UserProgress | null> {
    const result = await db.query(
      `UPDATE user_training_progress
       SET status = 'completed',
           progress_percent = 100,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1 AND content_id = $2
       RETURNING *`,
      [userId, contentId]
    );

    if (result.rows[0]) {
      logger.info('User completed training', { userId, contentId });
    }

    return result.rows[0] || null;
  }

  /**
   * Record acknowledgment
   */
  async recordAcknowledgment(
    userId: string,
    contentId: string,
    signatureData?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<UserProgress | null> {
    const result = await db.query(
      `UPDATE user_training_progress
       SET status = 'completed',
           progress_percent = 100,
           acknowledged_at = NOW(),
           signature_data = $3,
           signature_ip = $4,
           signature_user_agent = $5,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1 AND content_id = $2
       RETURNING *`,
      [userId, contentId, signatureData || null, ipAddress || null, userAgent || null]
    );

    if (result.rows[0]) {
      logger.info('User acknowledged training content', { userId, contentId });
    }

    return result.rows[0] || null;
  }

  /**
   * Submit quiz answers
   */
  async submitQuiz(
    userId: string,
    contentId: string,
    answers: Record<string, string | string[]>
  ): Promise<{ passed: boolean; score: number; progress: UserProgress | null }> {
    // Get questions
    const questions = await this.getQuizQuestions(contentId);

    // Get content for passing score
    const content = await db.query(
      `SELECT passing_score FROM training_content WHERE id = $1`,
      [contentId]
    );
    const passingScore = content.rows[0]?.passing_score || 70;

    // Calculate score
    let totalPoints = 0;
    let earnedPoints = 0;

    for (const question of questions) {
      totalPoints += question.points;
      const userAnswer = answers[question.id];

      let isCorrect = false;
      if (question.question_type === 'single_choice' || question.question_type === 'true_false') {
        const correctOption = question.options?.find((o: { isCorrect: boolean }) => o.isCorrect);
        isCorrect = correctOption?.id === userAnswer;
      } else if (question.question_type === 'multiple_choice') {
        const correctIds = question.options?.filter((o: { isCorrect: boolean }) => o.isCorrect).map((o: { id: string }) => o.id) || [];
        const userIds = Array.isArray(userAnswer) ? userAnswer : [];
        isCorrect = correctIds.length === userIds.length && correctIds.every((id: string) => userIds.includes(id));
      } else if (question.question_type === 'text') {
        isCorrect = question.correct_answer?.toLowerCase().trim() === String(userAnswer).toLowerCase().trim();
      }

      if (isCorrect) {
        earnedPoints += question.points;
      }
    }

    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= passingScore;

    // Update progress
    const result = await db.query(
      `UPDATE user_training_progress
       SET quiz_attempts = quiz_attempts + 1,
           quiz_score = $3,
           quiz_passed = $4,
           quiz_answers = $5,
           status = CASE WHEN $4 THEN 'completed' ELSE 'failed' END,
           completed_at = CASE WHEN $4 THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE user_id = $1 AND content_id = $2
       RETURNING *`,
      [userId, contentId, score, passed, JSON.stringify(answers)]
    );

    logger.info('Quiz submitted', { userId, contentId, score, passed });

    return { passed, score, progress: result.rows[0] || null };
  }

  // ===== Reporting =====

  /**
   * Get content completion stats
   */
  async getContentStats(contentId: string, organizationId: string): Promise<{
    totalAssigned: number;
    notStarted: number;
    inProgress: number;
    completed: number;
    failed: number;
    avgScore?: number;
    avgTimeSeconds?: number;
  }> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_assigned,
        COUNT(*) FILTER (WHERE status = 'not_started') as not_started,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        AVG(quiz_score) FILTER (WHERE quiz_score IS NOT NULL) as avg_score,
        AVG(time_spent_seconds) FILTER (WHERE time_spent_seconds > 0) as avg_time
       FROM user_training_progress
       WHERE content_id = $1 AND organization_id = $2`,
      [contentId, organizationId]
    );

    const row = result.rows[0];
    return {
      totalAssigned: parseInt(row.total_assigned, 10),
      notStarted: parseInt(row.not_started, 10),
      inProgress: parseInt(row.in_progress, 10),
      completed: parseInt(row.completed, 10),
      failed: parseInt(row.failed, 10),
      avgScore: row.avg_score ? parseFloat(row.avg_score) : undefined,
      avgTimeSeconds: row.avg_time ? parseFloat(row.avg_time) : undefined,
    };
  }

  /**
   * Get user training summary
   */
  async getUserSummary(organizationId: string, userId: string): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    overdue: number;
  }> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status != 'completed' AND due_date < CURRENT_DATE) as overdue
       FROM user_training_progress
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId]
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      completed: parseInt(row.completed, 10),
      inProgress: parseInt(row.in_progress, 10),
      overdue: parseInt(row.overdue, 10),
    };
  }
}

export const trainingService = new TrainingService();
export default trainingService;
