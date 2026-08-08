import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

// Types
export type DynamicGroupField =
  | 'department' | 'department_id'
  | 'location' | 'location_id'
  | 'job_title'
  | 'reports_to' | 'manager_id'
  | 'org_unit_path'
  | 'employee_type' | 'user_type'
  | 'cost_center'
  | 'email'
  | 'custom_field';

export type DynamicGroupOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'regex'
  | 'in_list' | 'not_in_list'
  | 'is_empty' | 'is_not_empty'
  | 'is_under' | 'is_not_under';

export type RuleLogic = 'AND' | 'OR';

export interface DynamicGroupRule {
  id: string;
  accessGroupId: string;
  field: DynamicGroupField;
  operator: DynamicGroupOperator;
  value: string;
  caseSensitive: boolean;
  includeNested: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DynamicGroupConfig {
  membershipType: 'static' | 'dynamic';
  ruleLogic: RuleLogic;
  refreshInterval: number;
  lastRuleEvaluation: string | null;
}

export interface EvaluationResult {
  matchingUserIds: string[];
  matchingUserCount: number;
  evaluatedAt: string;
}

export interface MatchingUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  jobTitle?: string;
}

class DynamicGroupService {
  /**
   * Get all rules for a group
   */
  async getRules(groupId: string): Promise<DynamicGroupRule[]> {
    const result = await db.query(
      `SELECT
        id,
        access_group_id as "accessGroupId",
        field,
        operator,
        value,
        case_sensitive as "caseSensitive",
        include_nested as "includeNested",
        sort_order as "sortOrder",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM dynamic_group_rules
      WHERE access_group_id = $1
      ORDER BY sort_order ASC, created_at ASC`,
      [groupId]
    );

    return result.rows;
  }

  /**
   * Add a rule to a group
   */
  async addRule(
    groupId: string,
    rule: {
      field: DynamicGroupField;
      operator: DynamicGroupOperator;
      value: string;
      caseSensitive?: boolean;
      includeNested?: boolean;
    },
    userId?: string
  ): Promise<DynamicGroupRule> {
    // Get the next sort order
    const orderResult = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM dynamic_group_rules WHERE access_group_id = $1',
      [groupId]
    );
    const nextOrder = orderResult.rows[0].next_order;

    const result = await db.query(
      `INSERT INTO dynamic_group_rules (
        access_group_id,
        field,
        operator,
        value,
        case_sensitive,
        include_nested,
        sort_order,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        access_group_id as "accessGroupId",
        field,
        operator,
        value,
        case_sensitive as "caseSensitive",
        include_nested as "includeNested",
        sort_order as "sortOrder",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        groupId,
        rule.field,
        rule.operator,
        rule.value,
        rule.caseSensitive ?? false,
        rule.includeNested ?? false,
        nextOrder,
        userId
      ]
    );

    logger.info('Dynamic group rule added', {
      groupId,
      ruleId: result.rows[0].id,
      field: rule.field,
      operator: rule.operator
    });

    return result.rows[0];
  }

  /**
   * Update a rule
   */
  async updateRule(
    ruleId: string,
    updates: Partial<{
      field: DynamicGroupField;
      operator: DynamicGroupOperator;
      value: string;
      caseSensitive: boolean;
      includeNested: boolean;
      sortOrder: number;
    }>
  ): Promise<DynamicGroupRule | null> {
    const result = await db.query(
      `UPDATE dynamic_group_rules SET
        field = COALESCE($1, field),
        operator = COALESCE($2, operator),
        value = COALESCE($3, value),
        case_sensitive = COALESCE($4, case_sensitive),
        include_nested = COALESCE($5, include_nested),
        sort_order = COALESCE($6, sort_order),
        updated_at = NOW()
      WHERE id = $7
      RETURNING
        id,
        access_group_id as "accessGroupId",
        field,
        operator,
        value,
        case_sensitive as "caseSensitive",
        include_nested as "includeNested",
        sort_order as "sortOrder",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        updates.field,
        updates.operator,
        updates.value,
        updates.caseSensitive,
        updates.includeNested,
        updates.sortOrder,
        ruleId
      ]
    );

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Dynamic group rule updated', { ruleId });
    return result.rows[0];
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleId: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM dynamic_group_rules WHERE id = $1 RETURNING id',
      [ruleId]
    );

    if (result.rows.length > 0) {
      logger.info('Dynamic group rule deleted', { ruleId });
      return true;
    }
    return false;
  }

  /**
   * Evaluate rules and return matching users
   */
  async evaluateRules(
    groupId: string,
    options: { returnUsers?: boolean; limit?: number } = {}
  ): Promise<{
    matchingUserIds: string[];
    matchingUserCount: number;
    matchingUsers?: MatchingUser[];
    evaluatedAt: string;
  }> {
    // Get group config
    const groupResult = await db.query(
      `SELECT
        organization_id as "organizationId",
        membership_type as "membershipType",
        rule_logic as "ruleLogic"
      FROM access_groups
      WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      throw new Error('Group not found');
    }

    const { organizationId, ruleLogic } = groupResult.rows[0];

    // Get all rules for the group
    const rules = await this.getRules(groupId);

    if (rules.length === 0) {
      // No rules = no matching users for dynamic groups
      return {
        matchingUserIds: [],
        matchingUserCount: 0,
        matchingUsers: [],
        evaluatedAt: new Date().toISOString()
      };
    }

    // Build the combined query
    const matchingUserIds = await this.evaluateRulesForOrg(
      organizationId,
      rules,
      ruleLogic
    );

    // Update last evaluation time
    await db.query(
      'UPDATE access_groups SET last_rule_evaluation = NOW() WHERE id = $1',
      [groupId]
    );

    // Optionally fetch user details
    let matchingUsers: MatchingUser[] | undefined;
    if (options.returnUsers && matchingUserIds.length > 0) {
      const limit = options.limit || 50;
      const usersResult = await db.query(
        `SELECT
          id,
          email,
          first_name as "firstName",
          last_name as "lastName",
          department,
          job_title as "jobTitle"
        FROM organization_users
        WHERE id = ANY($1::uuid[])
        LIMIT $2`,
        [matchingUserIds, limit]
      );
      matchingUsers = usersResult.rows;
    }

    return {
      matchingUserIds,
      matchingUserCount: matchingUserIds.length,
      matchingUsers,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Evaluate rules against organization users
   */
  private async evaluateRulesForOrg(
    organizationId: string,
    rules: DynamicGroupRule[],
    ruleLogic: RuleLogic
  ): Promise<string[]> {
    if (rules.length === 0) {
      return [];
    }

    // For AND logic, we need users that match ALL rules
    // For OR logic, we need users that match ANY rule

    if (ruleLogic === 'OR') {
      // UNION all rule results
      const allMatchingIds = new Set<string>();

      for (const rule of rules) {
        const ids = await this.evaluateSingleRule(organizationId, rule);
        ids.forEach(id => allMatchingIds.add(id));
      }

      return Array.from(allMatchingIds);
    } else {
      // AND logic - INTERSECT all rule results
      let matchingIds: Set<string> | null = null;

      for (const rule of rules) {
        const ids = await this.evaluateSingleRule(organizationId, rule);
        const idSet = new Set(ids);

        if (matchingIds === null) {
          matchingIds = idSet;
        } else {
          // Intersect with previous results
          matchingIds = new Set(
            Array.from(matchingIds).filter(id => idSet.has(id))
          );
        }

        // Early exit if no matches
        if (matchingIds.size === 0) {
          return [];
        }
      }

      return matchingIds ? Array.from(matchingIds) : [];
    }
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateSingleRule(
    organizationId: string,
    rule: DynamicGroupRule
  ): Promise<string[]> {
    // Map field names to database columns
    const fieldMap: Record<string, string> = {
      'department': 'department',
      'department_id': 'department_id',
      'location': 'location',
      'location_id': 'location_id',
      'job_title': 'job_title',
      'reports_to': 'reporting_manager_id',
      'manager_id': 'reporting_manager_id',
      'org_unit_path': 'organizational_unit',
      'employee_type': 'employee_type',
      'user_type': 'user_type',
      'cost_center': 'cost_center',
      'email': 'email'
    };

    const dbField = fieldMap[rule.field] || rule.field;

    // Build the WHERE clause based on operator
    let condition: string;
    const params: any[] = [organizationId];

    switch (rule.operator) {
      case 'equals':
        if (rule.caseSensitive) {
          condition = `${dbField} = $2`;
        } else {
          condition = `LOWER(${dbField}) = LOWER($2)`;
        }
        params.push(rule.value);
        break;

      case 'not_equals':
        if (rule.caseSensitive) {
          condition = `(${dbField} IS NULL OR ${dbField} != $2)`;
        } else {
          condition = `(${dbField} IS NULL OR LOWER(${dbField}) != LOWER($2))`;
        }
        params.push(rule.value);
        break;

      case 'contains':
        if (rule.caseSensitive) {
          condition = `${dbField} LIKE '%' || $2 || '%'`;
        } else {
          condition = `LOWER(${dbField}) LIKE '%' || LOWER($2) || '%'`;
        }
        params.push(rule.value);
        break;

      case 'not_contains':
        if (rule.caseSensitive) {
          condition = `(${dbField} IS NULL OR ${dbField} NOT LIKE '%' || $2 || '%')`;
        } else {
          condition = `(${dbField} IS NULL OR LOWER(${dbField}) NOT LIKE '%' || LOWER($2) || '%')`;
        }
        params.push(rule.value);
        break;

      case 'starts_with':
        if (rule.caseSensitive) {
          condition = `${dbField} LIKE $2 || '%'`;
        } else {
          condition = `LOWER(${dbField}) LIKE LOWER($2) || '%'`;
        }
        params.push(rule.value);
        break;

      case 'ends_with':
        if (rule.caseSensitive) {
          condition = `${dbField} LIKE '%' || $2`;
        } else {
          condition = `LOWER(${dbField}) LIKE '%' || LOWER($2)`;
        }
        params.push(rule.value);
        break;

      case 'is_empty':
        condition = `(${dbField} IS NULL OR ${dbField} = '')`;
        break;

      case 'is_not_empty':
        condition = `${dbField} IS NOT NULL AND ${dbField} != ''`;
        break;

      case 'in_list':
        // Split comma-separated values
        const values = rule.value.split(',').map(v => v.trim());
        if (rule.caseSensitive) {
          condition = `${dbField} = ANY($2::text[])`;
        } else {
          condition = `LOWER(${dbField}) = ANY($2::text[])`;
          values.forEach((v, i) => values[i] = v.toLowerCase());
        }
        params.push(values);
        break;

      case 'not_in_list':
        const notValues = rule.value.split(',').map(v => v.trim());
        if (rule.caseSensitive) {
          condition = `(${dbField} IS NULL OR ${dbField} != ALL($2::text[]))`;
        } else {
          condition = `(${dbField} IS NULL OR LOWER(${dbField}) != ALL($2::text[]))`;
          notValues.forEach((v, i) => notValues[i] = v.toLowerCase());
        }
        params.push(notValues);
        break;

      case 'is_under':
        // For hierarchical fields - includes the value itself and all children
        if (rule.field === 'department' || rule.field === 'department_id') {
          // Use recursive CTE to get all child departments
          // The value can be department ID or department name
          condition = `department_id IN (
            WITH RECURSIVE dept_tree AS (
              SELECT id FROM departments WHERE id::text = $2 OR LOWER(name) = LOWER($2)
              UNION ALL
              SELECT d.id FROM departments d
              JOIN dept_tree dt ON d.parent_department_id = dt.id
            )
            SELECT id FROM dept_tree
          )`;
        } else if (rule.field === 'reports_to' || rule.field === 'manager_id') {
          // Include direct and nested reports
          // The value can be user ID, email, or name
          // First, we find the manager by ID, email, or name, then get their reports
          if (rule.includeNested) {
            // Recursive query to get all direct and indirect reports
            condition = `id IN (
              WITH RECURSIVE
                -- First find the manager by ID, email, or name
                manager AS (
                  SELECT id FROM organization_users
                  WHERE organization_id = $1
                    AND (
                      id::text = $2
                      OR LOWER(email) = LOWER($2)
                      OR LOWER(CONCAT(first_name, ' ', last_name)) = LOWER($2)
                    )
                  LIMIT 1
                ),
                -- Then recursively get all reports (direct and nested)
                reports AS (
                  SELECT ou.id, ou.reporting_manager_id, 1 as depth
                  FROM organization_users ou
                  JOIN manager m ON ou.reporting_manager_id = m.id
                  WHERE ou.organization_id = $1 AND ou.user_status = 'active'
                  UNION ALL
                  SELECT ou.id, ou.reporting_manager_id, r.depth + 1
                  FROM organization_users ou
                  JOIN reports r ON ou.reporting_manager_id = r.id
                  WHERE ou.organization_id = $1 AND ou.user_status = 'active'
                    AND r.depth < 20  -- Prevent infinite loops with max depth
                )
              SELECT id FROM reports
            )`;
          } else {
            // Direct reports only
            condition = `reporting_manager_id IN (
              SELECT id FROM organization_users
              WHERE organization_id = $1
                AND (
                  id::text = $2
                  OR LOWER(email) = LOWER($2)
                  OR LOWER(CONCAT(first_name, ' ', last_name)) = LOWER($2)
                )
            )`;
          }
        } else if (rule.field === 'org_unit_path') {
          // Org unit paths use path-based hierarchy (e.g., /Engineering/Platform)
          // "is under" means the path starts with the value
          condition = `${dbField} LIKE $2 || '%'`;
        } else if (rule.field === 'location' || rule.field === 'location_id') {
          // Use recursive CTE to get all child locations
          condition = `location_id IN (
            WITH RECURSIVE loc_tree AS (
              SELECT id FROM locations WHERE id::text = $2 OR LOWER(name) = LOWER($2)
              UNION ALL
              SELECT l.id FROM locations l
              JOIN loc_tree lt ON l.parent_id = lt.id
            )
            SELECT id FROM loc_tree
          )`;
        } else {
          // Default to starts_with for paths
          condition = `${dbField} LIKE $2 || '%'`;
        }
        params.push(rule.value);
        break;

      case 'is_not_under':
        if (rule.caseSensitive) {
          condition = `(${dbField} IS NULL OR ${dbField} NOT LIKE $2 || '%')`;
        } else {
          condition = `(${dbField} IS NULL OR LOWER(${dbField}) NOT LIKE LOWER($2) || '%')`;
        }
        params.push(rule.value);
        break;

      case 'regex':
        condition = `${dbField} ~ $2`;
        params.push(rule.value);
        break;

      default:
        // Fallback to equals
        condition = `LOWER(${dbField}) = LOWER($2)`;
        params.push(rule.value);
    }

    const query = `
      SELECT id
      FROM organization_users
      WHERE organization_id = $1
        AND user_status = 'active'
        AND deleted_at IS NULL
        AND ${condition}
    `;

    try {
      const result = await db.query(query, params);
      return result.rows.map((r: { id: string }) => r.id);
    } catch (error: any) {
      logger.error('Error evaluating dynamic group rule', {
        ruleId: rule.id,
        field: rule.field,
        operator: rule.operator,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Apply dynamic group rules - update membership based on current rules
   */
  async applyRules(groupId: string, actorId?: string): Promise<{
    added: number;
    removed: number;
    unchanged: number;
  }> {
    // Evaluate current rules
    const { matchingUserIds } = await this.evaluateRules(groupId);
    const matchingSet = new Set(matchingUserIds);

    // Get current dynamic members
    const currentResult = await db.query(
      `SELECT user_id FROM access_group_members
       WHERE access_group_id = $1 AND membership_source = 'dynamic' AND is_active = true`,
      [groupId]
    );
    const currentMembers = new Set<string>(currentResult.rows.map((r: { user_id: string }) => r.user_id));

    // Calculate changes
    const toAdd = matchingUserIds.filter(id => !currentMembers.has(id));
    const toRemove = Array.from(currentMembers).filter((id: string) => !matchingSet.has(id));

    // Add new members
    if (toAdd.length > 0) {
      await db.query(
        `INSERT INTO access_group_members (access_group_id, user_id, membership_source, rule_matched_at)
         SELECT $1, unnest($2::uuid[]), 'dynamic', NOW()
         ON CONFLICT (access_group_id, user_id) DO UPDATE SET
           is_active = true,
           membership_source = 'dynamic',
           rule_matched_at = NOW()`,
        [groupId, toAdd]
      );
    }

    // Remove members no longer matching
    if (toRemove.length > 0) {
      await db.query(
        `UPDATE access_group_members SET is_active = false, removed_at = NOW()
         WHERE access_group_id = $1 AND user_id = ANY($2::uuid[]) AND membership_source = 'dynamic'`,
        [groupId, toRemove]
      );
    }

    logger.info('Dynamic group rules applied', {
      groupId,
      added: toAdd.length,
      removed: toRemove.length,
      unchanged: matchingUserIds.length - toAdd.length,
      actorId
    });

    return {
      added: toAdd.length,
      removed: toRemove.length,
      unchanged: matchingUserIds.length - toAdd.length
    };
  }

  /**
   * Set group as dynamic or static
   */
  async setMembershipType(
    groupId: string,
    membershipType: 'static' | 'dynamic',
    config?: { ruleLogic?: RuleLogic; refreshInterval?: number }
  ): Promise<void> {
    await db.query(
      `UPDATE access_groups SET
        membership_type = $1,
        rule_logic = COALESCE($2, rule_logic),
        refresh_interval = COALESCE($3, refresh_interval),
        updated_at = NOW()
      WHERE id = $4`,
      [
        membershipType,
        config?.ruleLogic,
        config?.refreshInterval,
        groupId
      ]
    );

    logger.info('Group membership type updated', {
      groupId,
      membershipType,
      config
    });
  }

  /**
   * Get groups that need automatic refresh
   */
  async getGroupsNeedingRefresh(): Promise<string[]> {
    const result = await db.query(
      `SELECT id FROM access_groups
       WHERE membership_type = 'dynamic'
         AND refresh_interval > 0
         AND is_active = true
         AND (
           last_rule_evaluation IS NULL
           OR last_rule_evaluation < NOW() - (refresh_interval || ' minutes')::interval
         )`
    );

    return result.rows.map((r: { id: string }) => r.id);
  }

  /**
   * Get all users in a manager's reporting chain (both direct and nested reports)
   * Useful for visualizing org hierarchy and debugging rules
   */
  async getReportingChain(
    organizationId: string,
    managerId: string,
    options: { includeManager?: boolean; maxDepth?: number } = {}
  ): Promise<{
    managerId: string;
    reports: Array<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      depth: number;
      directManagerId: string | null;
    }>;
  }> {
    const { includeManager = false, maxDepth = 20 } = options;

    const result = await db.query(
      `WITH RECURSIVE reports AS (
        -- Direct reports (depth 1)
        SELECT
          ou.id,
          ou.email,
          ou.first_name as "firstName",
          ou.last_name as "lastName",
          ou.reporting_manager_id as "directManagerId",
          1 as depth
        FROM organization_users ou
        WHERE ou.organization_id = $1
          AND ou.reporting_manager_id = $2
          AND ou.user_status = 'active'
          AND ou.deleted_at IS NULL

        UNION ALL

        -- Nested reports
        SELECT
          ou.id,
          ou.email,
          ou.first_name,
          ou.last_name,
          ou.reporting_manager_id,
          r.depth + 1
        FROM organization_users ou
        JOIN reports r ON ou.reporting_manager_id = r.id
        WHERE ou.organization_id = $1
          AND ou.user_status = 'active'
          AND ou.deleted_at IS NULL
          AND r.depth < $3
      )
      SELECT * FROM reports ORDER BY depth, "lastName", "firstName"`,
      [organizationId, managerId, maxDepth]
    );

    return {
      managerId,
      reports: result.rows
    };
  }

  /**
   * Check if a user reports to a manager (directly or through the chain)
   */
  async userReportsTo(
    organizationId: string,
    userId: string,
    managerId: string,
    includeNested: boolean = true
  ): Promise<boolean> {
    if (includeNested) {
      // Check the full reporting chain
      const result = await db.query(
        `WITH RECURSIVE manager_chain AS (
          -- Start with the user's direct manager
          SELECT reporting_manager_id as manager_id, 1 as depth
          FROM organization_users
          WHERE id = $1 AND organization_id = $2

          UNION ALL

          -- Walk up the chain
          SELECT ou.reporting_manager_id, mc.depth + 1
          FROM organization_users ou
          JOIN manager_chain mc ON ou.id = mc.manager_id
          WHERE ou.organization_id = $2
            AND mc.depth < 20
            AND mc.manager_id IS NOT NULL
        )
        SELECT 1 FROM manager_chain WHERE manager_id = $3 LIMIT 1`,
        [userId, organizationId, managerId]
      );

      return result.rows.length > 0;
    } else {
      // Check direct manager only
      const result = await db.query(
        `SELECT 1 FROM organization_users
         WHERE id = $1 AND organization_id = $2 AND reporting_manager_id = $3`,
        [userId, organizationId, managerId]
      );

      return result.rows.length > 0;
    }
  }

  /**
   * Get a user's management chain (their manager, their manager's manager, etc.)
   */
  async getManagementChain(
    organizationId: string,
    userId: string,
    maxDepth: number = 20
  ): Promise<Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    depth: number;
  }>> {
    const result = await db.query(
      `WITH RECURSIVE manager_chain AS (
        -- Start with the user's direct manager
        SELECT
          ou.id,
          ou.email,
          ou.first_name as "firstName",
          ou.last_name as "lastName",
          ou.reporting_manager_id,
          1 as depth
        FROM organization_users ou
        WHERE ou.id = (
          SELECT reporting_manager_id FROM organization_users WHERE id = $1 AND organization_id = $2
        )
        AND ou.organization_id = $2

        UNION ALL

        -- Walk up the chain
        SELECT
          ou.id,
          ou.email,
          ou.first_name,
          ou.last_name,
          ou.reporting_manager_id,
          mc.depth + 1
        FROM organization_users ou
        JOIN manager_chain mc ON ou.id = mc.reporting_manager_id
        WHERE ou.organization_id = $2
          AND mc.depth < $3
      )
      SELECT id, email, "firstName", "lastName", depth
      FROM manager_chain
      ORDER BY depth`,
      [userId, organizationId, maxDepth]
    );

    return result.rows;
  }
}

export const dynamicGroupService = new DynamicGroupService();
