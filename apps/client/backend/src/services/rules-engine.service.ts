/**
 * Rules Engine Service
 *
 * Unified rules engine built on json-rules-engine library.
 * Provides:
 * - Named/saved conditions for reuse
 * - Automation rules for dynamic groups, templates, training, etc.
 * - Nesting depth validation (max 3 levels)
 * - Caching per organization
 */

import { Engine, Rule, RuleProperties, Almanac, EngineResult, TopLevelCondition, NestedCondition, AllConditions, AnyConditions, Fact } from 'json-rules-engine';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

// Types
export type RuleType = 'dynamic_group' | 'template_match' | 'training_assign' | 'notification' | 'workflow';

export type ConditionOperator =
  | 'equal' | 'notEqual'
  | 'lessThan' | 'lessThanInclusive'
  | 'greaterThan' | 'greaterThanInclusive'
  | 'in' | 'notIn'
  | 'contains' | 'doesNotContain'
  | 'startsWith' | 'endsWith'
  | 'isEmpty' | 'isNotEmpty'
  | 'isNull' | 'isNotNull'
  // Custom operators
  | 'isUnder' | 'isNotUnder'  // Hierarchy operators
  | 'matchesRegex';

export interface ConditionProperties {
  fact: string;
  operator: ConditionOperator;
  value: any;
  path?: string;  // For nested properties like custom_fields.hire_date
}

export interface ConditionGroup {
  all?: (ConditionProperties | ConditionGroup | NamedConditionReference)[];
  any?: (ConditionProperties | ConditionGroup | NamedConditionReference)[];
}

export interface NamedConditionReference {
  condition: string;  // References a named condition by name
}

export interface NamedCondition {
  id: string;
  organizationId: string;
  name: string;
  displayName: string;
  description: string | null;
  conditions: ConditionGroup;
  nestingDepth: number;
  referencesConditions: string[];
  usageCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRule {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  ruleType: RuleType;
  conditions: ConditionGroup;
  priority: number;
  isEnabled: boolean;
  nestingDepth: number;
  conditionCount: number;
  referencesConditions: string[];
  config: Record<string, any>;
  lastEvaluatedAt: string | null;
  lastMatchCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  nestingDepth: number;
  conditionCount: number;
  referencedConditions: string[];
}

export interface EvaluationContext {
  organizationId: string;
  triggeredBy?: string;
  userId?: string;
}

export interface EvaluationResult {
  matched: boolean;
  events: any[];
  almanac: Record<string, any>;
  evaluationTimeMs: number;
}

// Constants
const MAX_NESTING_DEPTH = 3;
const WARNING_NESTING_DEPTH = 2;
const MAX_CONDITIONS_PER_RULE = 20;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Single cached engine (single-organization platform)
let cachedEngine: { engine: Engine; timestamp: number; organizationId: string } | null = null;

class RulesEngineService {
  /**
   * Get or create the cached engine
   */
  private async getEngine(organizationId: string): Promise<Engine> {
    if (cachedEngine && Date.now() - cachedEngine.timestamp < CACHE_TTL_MS) {
      return cachedEngine.engine;
    }

    const engine = new Engine();

    // Register custom operators
    this.registerCustomOperators(engine);

    // Load named conditions as facts
    await this.loadNamedConditions(engine, organizationId);

    // Cache the engine
    cachedEngine = { engine, timestamp: Date.now(), organizationId };

    return engine;
  }

  /**
   * Invalidate cache (call when rules/conditions change)
   */
  invalidateCache(_organizationId?: string): void {
    cachedEngine = null;
    logger.debug('Rules engine cache invalidated');
  }

  /**
   * Register custom operators for the rules engine
   */
  private registerCustomOperators(engine: Engine): void {
    // isUnder - for hierarchical relationships (department tree, reporting chain)
    engine.addOperator('isUnder', (factValue: any, jsonValue: any) => {
      if (!factValue || !jsonValue) return false;

      // Handle path-based hierarchy (e.g., /Engineering/Platform)
      if (typeof factValue === 'string' && factValue.startsWith('/')) {
        return factValue.startsWith(jsonValue);
      }

      // Handle array-based ancestry
      if (Array.isArray(factValue)) {
        return factValue.includes(jsonValue);
      }

      return false;
    });

    // isNotUnder
    engine.addOperator('isNotUnder', (factValue: any, jsonValue: any) => {
      if (!factValue) return true;

      if (typeof factValue === 'string' && factValue.startsWith('/')) {
        return !factValue.startsWith(jsonValue);
      }

      if (Array.isArray(factValue)) {
        return !factValue.includes(jsonValue);
      }

      return true;
    });

    // matchesRegex
    engine.addOperator('matchesRegex', (factValue: any, jsonValue: any) => {
      if (!factValue || !jsonValue) return false;
      try {
        const regex = new RegExp(jsonValue);
        return regex.test(String(factValue));
      } catch {
        return false;
      }
    });

    // isEmpty
    engine.addOperator('isEmpty', (factValue: any) => {
      if (factValue === null || factValue === undefined) return true;
      if (typeof factValue === 'string') return factValue.trim() === '';
      if (Array.isArray(factValue)) return factValue.length === 0;
      if (typeof factValue === 'object') return Object.keys(factValue).length === 0;
      return false;
    });

    // isNotEmpty
    engine.addOperator('isNotEmpty', (factValue: any) => {
      if (factValue === null || factValue === undefined) return false;
      if (typeof factValue === 'string') return factValue.trim() !== '';
      if (Array.isArray(factValue)) return factValue.length > 0;
      if (typeof factValue === 'object') return Object.keys(factValue).length > 0;
      return true;
    });

    // isNull
    engine.addOperator('isNull', (factValue: any) => {
      return factValue === null || factValue === undefined;
    });

    // isNotNull
    engine.addOperator('isNotNull', (factValue: any) => {
      return factValue !== null && factValue !== undefined;
    });

    // startsWith
    engine.addOperator('startsWith', (factValue: any, jsonValue: any) => {
      if (typeof factValue !== 'string' || typeof jsonValue !== 'string') return false;
      return factValue.toLowerCase().startsWith(jsonValue.toLowerCase());
    });

    // endsWith
    engine.addOperator('endsWith', (factValue: any, jsonValue: any) => {
      if (typeof factValue !== 'string' || typeof jsonValue !== 'string') return false;
      return factValue.toLowerCase().endsWith(jsonValue.toLowerCase());
    });
  }

  /**
   * Load named conditions and register them as composite facts
   */
  private async loadNamedConditions(engine: Engine, organizationId: string): Promise<void> {
    const result = await db.query(
      `SELECT name, conditions FROM named_conditions WHERE organization_id = $1`,
      [organizationId]
    );

    for (const row of result.rows) {
      // Register each named condition as a dynamic fact
      engine.addFact(row.name, async (params: any, almanac: Almanac) => {
        // Evaluate the nested conditions
        const tempEngine = new Engine();
        this.registerCustomOperators(tempEngine);

        // Add a rule that uses these conditions
        tempEngine.addRule({
          conditions: row.conditions,
          event: { type: 'match' }
        });

        // Get all facts from the parent almanac
        const facts: Record<string, any> = {};
        // We need to evaluate with the same facts
        // This is a simplified approach - in practice, we'd pass through the almanac
        try {
          const result = await tempEngine.run(params);
          return result.events.length > 0;
        } catch {
          return false;
        }
      });
    }
  }

  // =====================
  // Named Conditions CRUD
  // =====================

  /**
   * List all named conditions for an organization
   */
  async listNamedConditions(organizationId: string): Promise<NamedCondition[]> {
    const result = await db.query(
      `SELECT
        id,
        organization_id as "organizationId",
        name,
        display_name as "displayName",
        description,
        conditions,
        nesting_depth as "nestingDepth",
        references_conditions as "referencesConditions",
        usage_count as "usageCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM named_conditions
      WHERE organization_id = $1
      ORDER BY display_name ASC`,
      [organizationId]
    );

    return result.rows;
  }

  /**
   * Get a single named condition
   */
  async getNamedCondition(organizationId: string, id: string): Promise<NamedCondition | null> {
    const result = await db.query(
      `SELECT
        id,
        organization_id as "organizationId",
        name,
        display_name as "displayName",
        description,
        conditions,
        nesting_depth as "nestingDepth",
        references_conditions as "referencesConditions",
        usage_count as "usageCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM named_conditions
      WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get a named condition by name
   */
  async getNamedConditionByName(organizationId: string, name: string): Promise<NamedCondition | null> {
    const result = await db.query(
      `SELECT
        id,
        organization_id as "organizationId",
        name,
        display_name as "displayName",
        description,
        conditions,
        nesting_depth as "nestingDepth",
        references_conditions as "referencesConditions",
        usage_count as "usageCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM named_conditions
      WHERE organization_id = $1 AND name = $2`,
      [organizationId, name]
    );

    return result.rows[0] || null;
  }

  /**
   * Create a named condition
   */
  async createNamedCondition(
    organizationId: string,
    data: {
      name: string;
      displayName: string;
      description?: string;
      conditions: ConditionGroup;
    },
    createdBy?: string
  ): Promise<{ condition: NamedCondition; validation: ValidationResult }> {
    // Validate the conditions
    const validation = await this.validateConditions(organizationId, data.conditions);

    if (!validation.valid) {
      throw new Error(`Invalid conditions: ${validation.errors.join(', ')}`);
    }

    const result = await db.query(
      `INSERT INTO named_conditions (
        organization_id,
        name,
        display_name,
        description,
        conditions,
        nesting_depth,
        references_conditions,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        organization_id as "organizationId",
        name,
        display_name as "displayName",
        description,
        conditions,
        nesting_depth as "nestingDepth",
        references_conditions as "referencesConditions",
        usage_count as "usageCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        organizationId,
        data.name,
        data.displayName,
        data.description || null,
        JSON.stringify(data.conditions),
        validation.nestingDepth,
        validation.referencedConditions,
        createdBy
      ]
    );

    // Invalidate cache
    this.invalidateCache(organizationId);

    logger.info('Named condition created', {
      organizationId,
      conditionId: result.rows[0].id,
      name: data.name
    });

    return {
      condition: result.rows[0],
      validation
    };
  }

  /**
   * Update a named condition
   */
  async updateNamedCondition(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      displayName?: string;
      description?: string;
      conditions?: ConditionGroup;
    },
    updatedBy?: string
  ): Promise<{ condition: NamedCondition; validation: ValidationResult } | null> {
    // If conditions are being updated, validate them
    let validation: ValidationResult | null = null;
    if (data.conditions) {
      validation = await this.validateConditions(organizationId, data.conditions, id);
      if (!validation.valid) {
        throw new Error(`Invalid conditions: ${validation.errors.join(', ')}`);
      }
    }

    const result = await db.query(
      `UPDATE named_conditions SET
        name = COALESCE($1, name),
        display_name = COALESCE($2, display_name),
        description = COALESCE($3, description),
        conditions = COALESCE($4, conditions),
        nesting_depth = COALESCE($5, nesting_depth),
        references_conditions = COALESCE($6, references_conditions),
        updated_by = $7
      WHERE organization_id = $8 AND id = $9
      RETURNING
        id,
        organization_id as "organizationId",
        name,
        display_name as "displayName",
        description,
        conditions,
        nesting_depth as "nestingDepth",
        references_conditions as "referencesConditions",
        usage_count as "usageCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        data.name,
        data.displayName,
        data.description,
        data.conditions ? JSON.stringify(data.conditions) : null,
        validation?.nestingDepth,
        validation?.referencedConditions,
        updatedBy,
        organizationId,
        id
      ]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Invalidate cache
    this.invalidateCache(organizationId);

    logger.info('Named condition updated', { organizationId, conditionId: id });

    return {
      condition: result.rows[0],
      validation: validation || await this.validateConditions(organizationId, result.rows[0].conditions)
    };
  }

  /**
   * Delete a named condition
   */
  async deleteNamedCondition(organizationId: string, id: string): Promise<boolean> {
    // Check usage first
    const usageResult = await db.query(
      `SELECT usage_count as "usageCount" FROM named_conditions WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    );

    if (usageResult.rows.length === 0) {
      return false;
    }

    if (usageResult.rows[0].usageCount > 0) {
      throw new Error(`Cannot delete condition that is in use by ${usageResult.rows[0].usageCount} rule(s)`);
    }

    const result = await db.query(
      `DELETE FROM named_conditions WHERE organization_id = $1 AND id = $2 RETURNING id`,
      [organizationId, id]
    );

    if (result.rows.length > 0) {
      this.invalidateCache(organizationId);
      logger.info('Named condition deleted', { organizationId, conditionId: id });
      return true;
    }

    return false;
  }

  /**
   * Get rules that use a named condition
   */
  async getConditionUsage(organizationId: string, conditionId: string): Promise<AutomationRule[]> {
    const result = await db.query(
      `SELECT
        id,
        organization_id as "organizationId",
        name,
        description,
        rule_type as "ruleType",
        conditions,
        priority,
        is_enabled as "isEnabled",
        nesting_depth as "nestingDepth",
        condition_count as "conditionCount",
        references_conditions as "referencesConditions",
        config,
        last_evaluated_at as "lastEvaluatedAt",
        last_match_count as "lastMatchCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM automation_rules
      WHERE organization_id = $1 AND $2 = ANY(references_conditions)
      ORDER BY name ASC`,
      [organizationId, conditionId]
    );

    return result.rows;
  }

  // ====================
  // Automation Rules CRUD
  // ====================

  /**
   * List automation rules
   */
  async listRules(
    organizationId: string,
    filters?: { ruleType?: RuleType; isEnabled?: boolean }
  ): Promise<AutomationRule[]> {
    let query = `SELECT
      id,
      organization_id as "organizationId",
      name,
      description,
      rule_type as "ruleType",
      conditions,
      priority,
      is_enabled as "isEnabled",
      nesting_depth as "nestingDepth",
      condition_count as "conditionCount",
      references_conditions as "referencesConditions",
      config,
      last_evaluated_at as "lastEvaluatedAt",
      last_match_count as "lastMatchCount",
      created_by as "createdBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM automation_rules
    WHERE organization_id = $1`;

    const params: any[] = [organizationId];

    if (filters?.ruleType) {
      params.push(filters.ruleType);
      query += ` AND rule_type = $${params.length}`;
    }

    if (filters?.isEnabled !== undefined) {
      params.push(filters.isEnabled);
      query += ` AND is_enabled = $${params.length}`;
    }

    query += ` ORDER BY priority DESC, name ASC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get a single rule
   */
  async getRule(organizationId: string, id: string): Promise<AutomationRule | null> {
    const result = await db.query(
      `SELECT
        id,
        organization_id as "organizationId",
        name,
        description,
        rule_type as "ruleType",
        conditions,
        priority,
        is_enabled as "isEnabled",
        nesting_depth as "nestingDepth",
        condition_count as "conditionCount",
        references_conditions as "referencesConditions",
        config,
        last_evaluated_at as "lastEvaluatedAt",
        last_match_count as "lastMatchCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM automation_rules
      WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    );

    return result.rows[0] || null;
  }

  /**
   * Create an automation rule
   */
  async createRule(
    organizationId: string,
    data: {
      name: string;
      description?: string;
      ruleType: RuleType;
      conditions: ConditionGroup;
      priority?: number;
      isEnabled?: boolean;
      config?: Record<string, any>;
    },
    createdBy?: string
  ): Promise<{ rule: AutomationRule; validation: ValidationResult }> {
    // Validate conditions
    const validation = await this.validateConditions(organizationId, data.conditions);

    if (!validation.valid) {
      throw new Error(`Invalid conditions: ${validation.errors.join(', ')}`);
    }

    const result = await db.query(
      `INSERT INTO automation_rules (
        organization_id,
        name,
        description,
        rule_type,
        conditions,
        priority,
        is_enabled,
        nesting_depth,
        condition_count,
        references_conditions,
        config,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING
        id,
        organization_id as "organizationId",
        name,
        description,
        rule_type as "ruleType",
        conditions,
        priority,
        is_enabled as "isEnabled",
        nesting_depth as "nestingDepth",
        condition_count as "conditionCount",
        references_conditions as "referencesConditions",
        config,
        last_evaluated_at as "lastEvaluatedAt",
        last_match_count as "lastMatchCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        organizationId,
        data.name,
        data.description || null,
        data.ruleType,
        JSON.stringify(data.conditions),
        data.priority ?? 0,
        data.isEnabled ?? true,
        validation.nestingDepth,
        validation.conditionCount,
        validation.referencedConditions,
        JSON.stringify(data.config || {}),
        createdBy
      ]
    );

    // Invalidate cache
    this.invalidateCache(organizationId);

    logger.info('Automation rule created', {
      organizationId,
      ruleId: result.rows[0].id,
      ruleType: data.ruleType,
      name: data.name
    });

    return {
      rule: result.rows[0],
      validation
    };
  }

  /**
   * Update an automation rule
   */
  async updateRule(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      description?: string;
      conditions?: ConditionGroup;
      priority?: number;
      isEnabled?: boolean;
      config?: Record<string, any>;
    },
    updatedBy?: string
  ): Promise<{ rule: AutomationRule; validation: ValidationResult } | null> {
    // If conditions are being updated, validate them
    let validation: ValidationResult | null = null;
    if (data.conditions) {
      validation = await this.validateConditions(organizationId, data.conditions);
      if (!validation.valid) {
        throw new Error(`Invalid conditions: ${validation.errors.join(', ')}`);
      }
    }

    const result = await db.query(
      `UPDATE automation_rules SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        conditions = COALESCE($3, conditions),
        priority = COALESCE($4, priority),
        is_enabled = COALESCE($5, is_enabled),
        nesting_depth = COALESCE($6, nesting_depth),
        condition_count = COALESCE($7, condition_count),
        references_conditions = COALESCE($8, references_conditions),
        config = COALESCE($9, config),
        updated_by = $10
      WHERE organization_id = $11 AND id = $12
      RETURNING
        id,
        organization_id as "organizationId",
        name,
        description,
        rule_type as "ruleType",
        conditions,
        priority,
        is_enabled as "isEnabled",
        nesting_depth as "nestingDepth",
        condition_count as "conditionCount",
        references_conditions as "referencesConditions",
        config,
        last_evaluated_at as "lastEvaluatedAt",
        last_match_count as "lastMatchCount",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        data.name,
        data.description,
        data.conditions ? JSON.stringify(data.conditions) : null,
        data.priority,
        data.isEnabled,
        validation?.nestingDepth,
        validation?.conditionCount,
        validation?.referencedConditions,
        data.config ? JSON.stringify(data.config) : null,
        updatedBy,
        organizationId,
        id
      ]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Invalidate cache
    this.invalidateCache(organizationId);

    logger.info('Automation rule updated', { organizationId, ruleId: id });

    return {
      rule: result.rows[0],
      validation: validation || await this.validateConditions(organizationId, result.rows[0].conditions)
    };
  }

  /**
   * Delete an automation rule
   */
  async deleteRule(organizationId: string, id: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM automation_rules WHERE organization_id = $1 AND id = $2 RETURNING id`,
      [organizationId, id]
    );

    if (result.rows.length > 0) {
      this.invalidateCache(organizationId);
      logger.info('Automation rule deleted', { organizationId, ruleId: id });
      return true;
    }

    return false;
  }

  // ==========
  // Validation
  // ==========

  /**
   * Validate conditions structure and nesting depth
   */
  async validateConditions(
    organizationId: string,
    conditions: ConditionGroup,
    excludeConditionId?: string  // Exclude self when updating named conditions
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const referencedConditions: string[] = [];
    let conditionCount = 0;

    // Calculate nesting depth and collect references
    const analyzeConditions = async (
      cond: ConditionGroup | ConditionProperties | NamedConditionReference,
      depth: number
    ): Promise<number> => {
      // Named condition reference
      if ('condition' in cond) {
        const named = await this.getNamedConditionByName(organizationId, cond.condition);
        if (!named) {
          errors.push(`Referenced condition "${cond.condition}" does not exist`);
          return depth;
        }

        // Check for self-reference
        if (named.id === excludeConditionId) {
          errors.push(`Condition cannot reference itself`);
          return depth;
        }

        referencedConditions.push(named.id);

        // The depth of a reference is the reference depth + the named condition's depth
        return depth + named.nestingDepth;
      }

      // Leaf condition
      if ('fact' in cond) {
        conditionCount++;
        return depth;
      }

      // Nested group
      let maxChildDepth = depth;

      if ('all' in cond && cond.all) {
        for (const child of cond.all) {
          const childDepth = await analyzeConditions(child, depth + 1);
          maxChildDepth = Math.max(maxChildDepth, childDepth);
        }
      }

      if ('any' in cond && cond.any) {
        for (const child of cond.any) {
          const childDepth = await analyzeConditions(child, depth + 1);
          maxChildDepth = Math.max(maxChildDepth, childDepth);
        }
      }

      return maxChildDepth;
    };

    const nestingDepth = await analyzeConditions(conditions, 0);

    // Check nesting depth
    if (nestingDepth > MAX_NESTING_DEPTH) {
      errors.push(`Nesting depth ${nestingDepth} exceeds maximum of ${MAX_NESTING_DEPTH}`);
    } else if (nestingDepth >= WARNING_NESTING_DEPTH) {
      warnings.push(`Nesting depth ${nestingDepth} is getting complex. Consider extracting to a named condition.`);
    }

    // Check condition count
    if (conditionCount > MAX_CONDITIONS_PER_RULE) {
      errors.push(`Condition count ${conditionCount} exceeds maximum of ${MAX_CONDITIONS_PER_RULE}`);
    }

    // Check for circular references in named conditions
    const checkCircular = async (condIds: string[], visited: Set<string>): Promise<boolean> => {
      for (const condId of condIds) {
        if (visited.has(condId)) {
          errors.push(`Circular reference detected in named conditions`);
          return true;
        }
        visited.add(condId);

        const cond = await this.getNamedCondition(organizationId, condId);
        if (cond && cond.referencesConditions.length > 0) {
          if (await checkCircular(cond.referencesConditions, visited)) {
            return true;
          }
        }
      }
      return false;
    };

    await checkCircular(referencedConditions, new Set());

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      nestingDepth,
      conditionCount,
      referencedConditions
    };
  }

  // ==========
  // Evaluation
  // ==========

  /**
   * Evaluate a rule against facts
   */
  async evaluateRule(
    organizationId: string,
    ruleId: string,
    facts: Record<string, any>,
    context?: EvaluationContext
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    const rule = await this.getRule(organizationId, ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    if (!rule.isEnabled) {
      return {
        matched: false,
        events: [],
        almanac: facts,
        evaluationTimeMs: Date.now() - startTime
      };
    }

    // Resolve named condition references
    const resolvedConditions = await this.resolveConditionReferences(organizationId, rule.conditions);

    // Create engine and add rule
    const engine = new Engine();
    this.registerCustomOperators(engine);

    engine.addRule({
      conditions: resolvedConditions as TopLevelCondition,
      event: { type: 'rule_matched', params: { ruleId: rule.id, ruleName: rule.name } }
    });

    // Run evaluation
    const result = await engine.run(facts);

    const evaluationTimeMs = Date.now() - startTime;
    const matched = result.events.length > 0;

    // Log evaluation
    if (context?.organizationId) {
      await db.query(
        `INSERT INTO rule_evaluation_log (
          organization_id, rule_id, rule_type, facts, matched, result, triggered_by, user_id, evaluation_time_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          organizationId,
          ruleId,
          rule.ruleType,
          JSON.stringify(facts),
          matched,
          JSON.stringify({ events: result.events }),
          context.triggeredBy,
          context.userId,
          evaluationTimeMs
        ]
      );
    }

    // Update rule stats
    await db.query(
      `UPDATE automation_rules SET last_evaluated_at = NOW(), last_match_count = last_match_count + $1 WHERE id = $2`,
      [matched ? 1 : 0, ruleId]
    );

    return {
      matched,
      events: result.events,
      almanac: facts,
      evaluationTimeMs
    };
  }

  /**
   * Evaluate all rules of a type against facts
   */
  async evaluateRulesByType(
    organizationId: string,
    ruleType: RuleType,
    facts: Record<string, any>,
    context?: EvaluationContext
  ): Promise<{ matchedRules: AutomationRule[]; evaluationTimeMs: number }> {
    const startTime = Date.now();

    // Get all enabled rules of this type, ordered by priority
    const rules = await this.listRules(organizationId, { ruleType, isEnabled: true });

    const matchedRules: AutomationRule[] = [];

    for (const rule of rules) {
      const result = await this.evaluateRule(organizationId, rule.id, facts, context);
      if (result.matched) {
        matchedRules.push(rule);
      }
    }

    return {
      matchedRules,
      evaluationTimeMs: Date.now() - startTime
    };
  }

  /**
   * Test a rule without persisting it
   */
  async testRule(
    organizationId: string,
    conditions: ConditionGroup,
    facts: Record<string, any>
  ): Promise<{ matched: boolean; errors?: string[] }> {
    // Validate first
    const validation = await this.validateConditions(organizationId, conditions);
    if (!validation.valid) {
      return { matched: false, errors: validation.errors };
    }

    // Resolve named condition references
    const resolvedConditions = await this.resolveConditionReferences(organizationId, conditions);

    // Create temporary engine
    const engine = new Engine();
    this.registerCustomOperators(engine);

    engine.addRule({
      conditions: resolvedConditions as TopLevelCondition,
      event: { type: 'test_matched' }
    });

    try {
      const result = await engine.run(facts);
      return { matched: result.events.length > 0 };
    } catch (error: any) {
      return { matched: false, errors: [error.message] };
    }
  }

  /**
   * Resolve named condition references to actual conditions
   */
  private async resolveConditionReferences(
    organizationId: string,
    conditions: ConditionGroup
  ): Promise<ConditionGroup> {
    const resolve = async (
      cond: ConditionGroup | ConditionProperties | NamedConditionReference
    ): Promise<ConditionGroup | ConditionProperties> => {
      // Named condition reference
      if ('condition' in cond) {
        const named = await this.getNamedConditionByName(organizationId, cond.condition);
        if (!named) {
          throw new Error(`Named condition "${cond.condition}" not found`);
        }
        // Recursively resolve any nested references
        return await this.resolveConditionReferences(organizationId, named.conditions);
      }

      // Leaf condition - return as is
      if ('fact' in cond) {
        return cond;
      }

      // Nested group - resolve children
      const resolved: ConditionGroup = {};

      if ('all' in cond && cond.all) {
        resolved.all = await Promise.all(cond.all.map(c => resolve(c)));
      }

      if ('any' in cond && cond.any) {
        resolved.any = await Promise.all(cond.any.map(c => resolve(c)));
      }

      return resolved;
    };

    return await resolve(conditions) as ConditionGroup;
  }

  // ================
  // User Fact Builder
  // ================

  /**
   * Build facts object from a user for rule evaluation
   */
  async buildUserFacts(organizationId: string, userId: string): Promise<Record<string, any>> {
    const result = await db.query(
      `SELECT
        ou.id,
        ou.email,
        ou.first_name,
        ou.last_name,
        ou.job_title,
        ou.department,
        ou.department_id,
        ou.location,
        ou.location_id,
        ou.user_type,
        ou.employee_type,
        ou.user_status,
        ou.cost_center,
        ou.organizational_unit,
        ou.reporting_manager_id,
        ou.hire_date,
        ou.termination_date,
        ou.custom_fields,
        d.name as department_name,
        d.parent_department_id,
        l.name as location_name,
        l.parent_id as location_parent_id,
        mgr.email as manager_email,
        mgr.first_name as manager_first_name,
        mgr.last_name as manager_last_name
      FROM organization_users ou
      LEFT JOIN departments d ON ou.department_id = d.id
      LEFT JOIN locations l ON ou.location_id = l.id
      LEFT JOIN organization_users mgr ON ou.reporting_manager_id = mgr.id
      WHERE ou.organization_id = $1 AND ou.id = $2`,
      [organizationId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    const user = result.rows[0];

    // Build department ancestry path
    const deptAncestry = await this.getDepartmentAncestry(organizationId, user.department_id);

    // Build manager chain
    const managerChain = await this.getManagerChain(organizationId, userId);

    return {
      // Core user fields
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name}`,
      jobTitle: user.job_title,
      userType: user.user_type,
      employeeType: user.employee_type,
      userStatus: user.user_status,
      costCenter: user.cost_center,
      organizationalUnit: user.organizational_unit,

      // Department
      department: user.department || user.department_name,
      departmentId: user.department_id,
      departmentAncestry: deptAncestry,  // Array of parent dept IDs

      // Location
      location: user.location || user.location_name,
      locationId: user.location_id,

      // Manager
      managerId: user.reporting_manager_id,
      managerEmail: user.manager_email,
      managerName: user.manager_first_name && user.manager_last_name
        ? `${user.manager_first_name} ${user.manager_last_name}`
        : null,
      managerChain: managerChain,  // Array of manager IDs up the chain

      // Dates
      hireDate: user.hire_date,
      terminationDate: user.termination_date,
      tenureDays: user.hire_date
        ? Math.floor((Date.now() - new Date(user.hire_date).getTime()) / (1000 * 60 * 60 * 24))
        : null,

      // Custom fields (flattened)
      ...this.flattenCustomFields(user.custom_fields || {})
    };
  }

  /**
   * Get department ancestry (all parent department IDs)
   */
  private async getDepartmentAncestry(organizationId: string, departmentId: string | null): Promise<string[]> {
    if (!departmentId) return [];

    const result = await db.query(
      `WITH RECURSIVE ancestry AS (
        SELECT id, parent_department_id, 0 as depth
        FROM departments
        WHERE id = $1

        UNION ALL

        SELECT d.id, d.parent_department_id, a.depth + 1
        FROM departments d
        JOIN ancestry a ON d.id = a.parent_department_id
        WHERE a.depth < 10
      )
      SELECT id FROM ancestry WHERE id != $1 ORDER BY depth`,
      [departmentId]
    );

    return result.rows.map((r: { id: string }) => r.id);
  }

  /**
   * Get manager chain (all managers up to root)
   */
  private async getManagerChain(organizationId: string, userId: string): Promise<string[]> {
    const result = await db.query(
      `WITH RECURSIVE manager_chain AS (
        SELECT reporting_manager_id as manager_id, 1 as depth
        FROM organization_users
        WHERE id = $1 AND organization_id = $2

        UNION ALL

        SELECT ou.reporting_manager_id, mc.depth + 1
        FROM organization_users ou
        JOIN manager_chain mc ON ou.id = mc.manager_id
        WHERE ou.organization_id = $2 AND mc.depth < 20 AND mc.manager_id IS NOT NULL
      )
      SELECT manager_id FROM manager_chain WHERE manager_id IS NOT NULL ORDER BY depth`,
      [userId, organizationId]
    );

    return result.rows.map((r: { manager_id: string }) => r.manager_id);
  }

  /**
   * Flatten custom fields for easy access in rules
   * Converts { "hire_type": "full_time" } to { "custom_hire_type": "full_time" }
   */
  private flattenCustomFields(customFields: Record<string, any>): Record<string, any> {
    const flattened: Record<string, any> = {};

    for (const [key, value] of Object.entries(customFields)) {
      flattened[`custom_${key}`] = value;
    }

    return flattened;
  }

  /**
   * Get available facts/fields for rule building UI
   */
  getAvailableFacts(): Array<{
    fact: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
    operators: ConditionOperator[];
    category: string;
  }> {
    return [
      // Identity
      { fact: 'email', label: 'Email', type: 'string', operators: ['equal', 'notEqual', 'contains', 'startsWith', 'endsWith', 'matchesRegex'], category: 'Identity' },
      { fact: 'firstName', label: 'First Name', type: 'string', operators: ['equal', 'notEqual', 'contains', 'startsWith'], category: 'Identity' },
      { fact: 'lastName', label: 'Last Name', type: 'string', operators: ['equal', 'notEqual', 'contains', 'startsWith'], category: 'Identity' },
      { fact: 'fullName', label: 'Full Name', type: 'string', operators: ['equal', 'notEqual', 'contains'], category: 'Identity' },

      // Job
      { fact: 'jobTitle', label: 'Job Title', type: 'string', operators: ['equal', 'notEqual', 'contains', 'in', 'notIn'], category: 'Job' },
      { fact: 'userType', label: 'User Type', type: 'string', operators: ['equal', 'notEqual', 'in', 'notIn'], category: 'Job' },
      { fact: 'employeeType', label: 'Employee Type', type: 'string', operators: ['equal', 'notEqual', 'in', 'notIn'], category: 'Job' },
      { fact: 'userStatus', label: 'Status', type: 'string', operators: ['equal', 'notEqual', 'in'], category: 'Job' },
      { fact: 'costCenter', label: 'Cost Center', type: 'string', operators: ['equal', 'notEqual', 'in', 'notIn'], category: 'Job' },

      // Organization
      { fact: 'department', label: 'Department', type: 'string', operators: ['equal', 'notEqual', 'in', 'notIn', 'isUnder', 'isNotUnder'], category: 'Organization' },
      { fact: 'departmentId', label: 'Department ID', type: 'string', operators: ['equal', 'notEqual', 'in', 'notIn'], category: 'Organization' },
      { fact: 'location', label: 'Location', type: 'string', operators: ['equal', 'notEqual', 'in', 'notIn', 'isUnder', 'isNotUnder'], category: 'Organization' },
      { fact: 'locationId', label: 'Location ID', type: 'string', operators: ['equal', 'notEqual', 'in', 'notIn'], category: 'Organization' },
      { fact: 'organizationalUnit', label: 'Org Unit Path', type: 'string', operators: ['equal', 'contains', 'startsWith', 'isUnder'], category: 'Organization' },

      // Manager
      { fact: 'managerId', label: 'Manager ID', type: 'string', operators: ['equal', 'notEqual', 'isNull', 'isNotNull'], category: 'Manager' },
      { fact: 'managerEmail', label: 'Manager Email', type: 'string', operators: ['equal', 'notEqual', 'contains'], category: 'Manager' },
      { fact: 'managerChain', label: 'Reports To (any level)', type: 'array', operators: ['in'], category: 'Manager' },

      // Dates
      { fact: 'hireDate', label: 'Hire Date', type: 'date', operators: ['equal', 'lessThan', 'greaterThan', 'isNull', 'isNotNull'], category: 'Dates' },
      { fact: 'tenureDays', label: 'Tenure (days)', type: 'number', operators: ['equal', 'lessThan', 'lessThanInclusive', 'greaterThan', 'greaterThanInclusive'], category: 'Dates' },
      { fact: 'terminationDate', label: 'Termination Date', type: 'date', operators: ['equal', 'lessThan', 'greaterThan', 'isNull', 'isNotNull'], category: 'Dates' },
    ];
  }
}

export const rulesEngineService = new RulesEngineService();
