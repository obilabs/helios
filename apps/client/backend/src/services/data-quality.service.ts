import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface OrphanedValue {
  value: string;
  userCount: number;
  suggestedMatch?: string;
  users: string[];
}

interface EntityQuality {
  managed: number;
  orphaned: OrphanedValue[];
  unmapped: number;
}

interface ManagerQuality {
  valid: number;
  orphaned: number;
  circular: number;
}

interface DataQualityReport {
  departments: EntityQuality;
  locations: EntityQuality;
  costCenters: EntityQuality;
  managers: ManagerQuality;
  timestamp: string;
}

/**
 * Service for analyzing and improving data quality in master data
 */
export class DataQualityService {
  /**
   * Generate a comprehensive data quality report for an organization
   */
  async getDataQualityReport(organizationId: string): Promise<DataQualityReport> {
    const [departments, locations, costCenters, managers] = await Promise.all([
      this.getDepartmentQuality(organizationId),
      this.getLocationQuality(organizationId),
      this.getCostCenterQuality(organizationId),
      this.getManagerQuality(organizationId)
    ]);

    return {
      departments,
      locations,
      costCenters,
      managers,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get department data quality metrics
   */
  async getDepartmentQuality(organizationId: string): Promise<EntityQuality> {
    // Count managed departments
    const managedResult = await db.query(
      'SELECT COUNT(*) as count FROM departments WHERE organization_id = $1 AND is_active = true',
      [organizationId]
    );
    const managed = parseInt(managedResult.rows[0].count) || 0;

    // Find orphaned department values (users with department text not matching any master data)
    const orphanedResult = await db.query(`
      SELECT
        ou.department as value,
        COUNT(*) as user_count,
        ARRAY_AGG(ou.email ORDER BY ou.email LIMIT 5) as users
      FROM organization_users ou
      WHERE ou.organization_id = $1
        AND ou.department IS NOT NULL
        AND ou.department != ''
        AND ou.department_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM departments d
          WHERE d.organization_id = $1
          AND LOWER(d.name) = LOWER(ou.department)
        )
      GROUP BY ou.department
      ORDER BY COUNT(*) DESC
    `, [organizationId]);

    // For each orphan, try to find a fuzzy match suggestion
    const orphaned: OrphanedValue[] = await Promise.all(
      orphanedResult.rows.map(async (row: any) => {
        const suggestion = await this.findFuzzyDepartmentMatch(organizationId, row.value);
        return {
          value: row.value,
          userCount: parseInt(row.user_count) || 0,
          suggestedMatch: suggestion,
          users: row.users || []
        };
      })
    );

    // Count users with no department at all
    const unmappedResult = await db.query(`
      SELECT COUNT(*) as count
      FROM organization_users
      WHERE organization_id = $1
        AND (department IS NULL OR department = '')
        AND department_id IS NULL
        AND is_active = true
    `, [organizationId]);
    const unmapped = parseInt(unmappedResult.rows[0].count) || 0;

    return { managed, orphaned, unmapped };
  }

  /**
   * Get location data quality metrics
   */
  async getLocationQuality(organizationId: string): Promise<EntityQuality> {
    // Count managed locations
    const managedResult = await db.query(
      'SELECT COUNT(*) as count FROM locations WHERE organization_id = $1 AND is_active = true',
      [organizationId]
    );
    const managed = parseInt(managedResult.rows[0].count) || 0;

    // Find orphaned location values
    const orphanedResult = await db.query(`
      SELECT
        ou.location as value,
        COUNT(*) as user_count,
        ARRAY_AGG(ou.email ORDER BY ou.email LIMIT 5) as users
      FROM organization_users ou
      WHERE ou.organization_id = $1
        AND ou.location IS NOT NULL
        AND ou.location != ''
        AND ou.location_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM locations l
          WHERE l.organization_id = $1
          AND LOWER(l.name) = LOWER(ou.location)
        )
      GROUP BY ou.location
      ORDER BY COUNT(*) DESC
    `, [organizationId]);

    const orphaned: OrphanedValue[] = await Promise.all(
      orphanedResult.rows.map(async (row: any) => {
        const suggestion = await this.findFuzzyLocationMatch(organizationId, row.value);
        return {
          value: row.value,
          userCount: parseInt(row.user_count) || 0,
          suggestedMatch: suggestion,
          users: row.users || []
        };
      })
    );

    // Count users with no location at all
    const unmappedResult = await db.query(`
      SELECT COUNT(*) as count
      FROM organization_users
      WHERE organization_id = $1
        AND (location IS NULL OR location = '')
        AND location_id IS NULL
        AND is_active = true
    `, [organizationId]);
    const unmapped = parseInt(unmappedResult.rows[0].count) || 0;

    return { managed, orphaned, unmapped };
  }

  /**
   * Get cost center data quality metrics
   */
  async getCostCenterQuality(organizationId: string): Promise<EntityQuality> {
    // Count managed cost centers
    const managedResult = await db.query(
      'SELECT COUNT(*) as count FROM cost_centers WHERE organization_id = $1 AND is_active = true',
      [organizationId]
    );
    const managed = parseInt(managedResult.rows[0].count) || 0;

    // Find orphaned cost center values
    const orphanedResult = await db.query(`
      SELECT
        ou.cost_center as value,
        COUNT(*) as user_count,
        ARRAY_AGG(ou.email ORDER BY ou.email LIMIT 5) as users
      FROM organization_users ou
      WHERE ou.organization_id = $1
        AND ou.cost_center IS NOT NULL
        AND ou.cost_center != ''
        AND ou.cost_center_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM cost_centers cc
          WHERE cc.organization_id = $1
          AND (LOWER(cc.code) = LOWER(ou.cost_center) OR LOWER(cc.name) = LOWER(ou.cost_center))
        )
      GROUP BY ou.cost_center
      ORDER BY COUNT(*) DESC
    `, [organizationId]);

    const orphaned: OrphanedValue[] = orphanedResult.rows.map((row: any) => ({
      value: row.value,
      userCount: parseInt(row.user_count) || 0,
      users: row.users || []
    }));

    // Count users with no cost center at all
    const unmappedResult = await db.query(`
      SELECT COUNT(*) as count
      FROM organization_users
      WHERE organization_id = $1
        AND (cost_center IS NULL OR cost_center = '')
        AND cost_center_id IS NULL
        AND is_active = true
    `, [organizationId]);
    const unmapped = parseInt(unmappedResult.rows[0].count) || 0;

    return { managed, orphaned, unmapped };
  }

  /**
   * Get manager relationship quality metrics
   */
  async getManagerQuality(organizationId: string): Promise<ManagerQuality> {
    // Count valid manager relationships
    const validResult = await db.query(`
      SELECT COUNT(*) as count
      FROM organization_users ou
      WHERE ou.organization_id = $1
        AND ou.reporting_manager_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM organization_users m
          WHERE m.id = ou.reporting_manager_id
          AND m.organization_id = $1
          AND m.is_active = true
        )
    `, [organizationId]);
    const valid = parseInt(validResult.rows[0].count) || 0;

    // Count orphaned manager relationships (reporting_manager_id points to non-existent or inactive user)
    const orphanedResult = await db.query(`
      SELECT COUNT(*) as count
      FROM organization_users ou
      WHERE ou.organization_id = $1
        AND ou.reporting_manager_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM organization_users m
          WHERE m.id = ou.reporting_manager_id
          AND m.organization_id = $1
          AND m.is_active = true
        )
    `, [organizationId]);
    const orphaned = parseInt(orphanedResult.rows[0].count) || 0;

    // Detect circular relationships (A reports to B reports to A)
    const circularResult = await db.query(`
      WITH RECURSIVE manager_chain AS (
        SELECT id, reporting_manager_id, ARRAY[id] as chain, false as is_circular
        FROM organization_users
        WHERE organization_id = $1 AND reporting_manager_id IS NOT NULL

        UNION ALL

        SELECT mc.id, ou.reporting_manager_id, mc.chain || ou.id, ou.id = ANY(mc.chain)
        FROM manager_chain mc
        JOIN organization_users ou ON ou.id = mc.reporting_manager_id
        WHERE NOT mc.is_circular AND array_length(mc.chain, 1) < 10
      )
      SELECT COUNT(DISTINCT id) as count
      FROM manager_chain
      WHERE is_circular
    `, [organizationId]);
    const circular = parseInt(circularResult.rows[0].count) || 0;

    return { valid, orphaned, circular };
  }

  /**
   * Find a fuzzy match for a department name
   */
  private async findFuzzyDepartmentMatch(organizationId: string, value: string): Promise<string | undefined> {
    const result = await db.query(`
      SELECT name,
        similarity(LOWER(name), LOWER($2)) as sim
      FROM departments
      WHERE organization_id = $1
        AND is_active = true
        AND similarity(LOWER(name), LOWER($2)) > 0.3
      ORDER BY sim DESC
      LIMIT 1
    `, [organizationId, value]);

    return result.rows[0]?.name;
  }

  /**
   * Find a fuzzy match for a location name
   */
  private async findFuzzyLocationMatch(organizationId: string, value: string): Promise<string | undefined> {
    const result = await db.query(`
      SELECT name,
        similarity(LOWER(name), LOWER($2)) as sim
      FROM locations
      WHERE organization_id = $1
        AND is_active = true
        AND similarity(LOWER(name), LOWER($2)) > 0.3
      ORDER BY sim DESC
      LIMIT 1
    `, [organizationId, value]);

    return result.rows[0]?.name;
  }

  /**
   * Resolve an orphaned department value by mapping it to existing department
   */
  async resolveOrphanedDepartment(
    organizationId: string,
    orphanedValue: string,
    resolution: 'map' | 'create' | 'ignore',
    targetDepartmentId?: string
  ): Promise<{ affected: number }> {
    if (resolution === 'ignore') {
      return { affected: 0 };
    }

    let departmentId: string;

    if (resolution === 'create') {
      // Create a new department with the orphaned value as name
      const createResult = await db.query(`
        INSERT INTO departments (organization_id, name)
        VALUES ($1, $2)
        RETURNING id
      `, [organizationId, orphanedValue]);
      departmentId = createResult.rows[0].id;
      logger.info('Created new department from orphan', { organizationId, name: orphanedValue, departmentId });
    } else if (resolution === 'map' && targetDepartmentId) {
      departmentId = targetDepartmentId;
    } else {
      throw new Error('Target department ID required for mapping');
    }

    // Update all users with this orphaned value
    const updateResult = await db.query(`
      UPDATE organization_users
      SET department_id = $1
      WHERE organization_id = $2
        AND LOWER(department) = LOWER($3)
        AND department_id IS NULL
    `, [departmentId, organizationId, orphanedValue]);

    logger.info('Resolved orphaned department', {
      organizationId,
      orphanedValue,
      resolution,
      targetDepartmentId: departmentId,
      affected: updateResult.rowCount
    });

    return { affected: updateResult.rowCount || 0 };
  }

  /**
   * Resolve an orphaned location value by mapping it to existing location
   */
  async resolveOrphanedLocation(
    organizationId: string,
    orphanedValue: string,
    resolution: 'map' | 'create' | 'ignore',
    targetLocationId?: string
  ): Promise<{ affected: number }> {
    if (resolution === 'ignore') {
      return { affected: 0 };
    }

    let locationId: string;

    if (resolution === 'create') {
      // Create a new location with the orphaned value as name
      const createResult = await db.query(`
        INSERT INTO locations (organization_id, name, type)
        VALUES ($1, $2, 'office')
        RETURNING id
      `, [organizationId, orphanedValue]);
      locationId = createResult.rows[0].id;
      logger.info('Created new location from orphan', { organizationId, name: orphanedValue, locationId });
    } else if (resolution === 'map' && targetLocationId) {
      locationId = targetLocationId;
    } else {
      throw new Error('Target location ID required for mapping');
    }

    // Update all users with this orphaned value
    const updateResult = await db.query(`
      UPDATE organization_users
      SET location_id = $1
      WHERE organization_id = $2
        AND LOWER(location) = LOWER($3)
        AND location_id IS NULL
    `, [locationId, organizationId, orphanedValue]);

    logger.info('Resolved orphaned location', {
      organizationId,
      orphanedValue,
      resolution,
      targetLocationId: locationId,
      affected: updateResult.rowCount
    });

    return { affected: updateResult.rowCount || 0 };
  }

  /**
   * Auto-import unique values from user records into master data tables
   */
  async autoImportMasterData(organizationId: string, entityType: 'departments' | 'locations' | 'cost_centers'): Promise<{ imported: number }> {
    let imported = 0;

    if (entityType === 'departments') {
      const result = await db.query(`
        INSERT INTO departments (organization_id, name)
        SELECT DISTINCT $1, department
        FROM organization_users
        WHERE organization_id = $1
          AND department IS NOT NULL
          AND department != ''
          AND NOT EXISTS (
            SELECT 1 FROM departments d
            WHERE d.organization_id = $1
            AND LOWER(d.name) = LOWER(organization_users.department)
          )
        RETURNING id
      `, [organizationId]);
      imported = result.rowCount || 0;

      // Now link users to the newly created departments
      if (imported > 0) {
        await db.query(`
          UPDATE organization_users ou
          SET department_id = d.id
          FROM departments d
          WHERE ou.organization_id = $1
            AND d.organization_id = $1
            AND LOWER(d.name) = LOWER(ou.department)
            AND ou.department_id IS NULL
        `, [organizationId]);
      }
    } else if (entityType === 'locations') {
      const result = await db.query(`
        INSERT INTO locations (organization_id, name, type)
        SELECT DISTINCT $1, location, 'office'
        FROM organization_users
        WHERE organization_id = $1
          AND location IS NOT NULL
          AND location != ''
          AND NOT EXISTS (
            SELECT 1 FROM locations l
            WHERE l.organization_id = $1
            AND LOWER(l.name) = LOWER(organization_users.location)
          )
        RETURNING id
      `, [organizationId]);
      imported = result.rowCount || 0;

      // Link users to the newly created locations
      if (imported > 0) {
        await db.query(`
          UPDATE organization_users ou
          SET location_id = l.id
          FROM locations l
          WHERE ou.organization_id = $1
            AND l.organization_id = $1
            AND LOWER(l.name) = LOWER(ou.location)
            AND ou.location_id IS NULL
        `, [organizationId]);
      }
    } else if (entityType === 'cost_centers') {
      const result = await db.query(`
        INSERT INTO cost_centers (organization_id, code, name)
        SELECT DISTINCT $1, cost_center, cost_center
        FROM organization_users
        WHERE organization_id = $1
          AND cost_center IS NOT NULL
          AND cost_center != ''
          AND NOT EXISTS (
            SELECT 1 FROM cost_centers cc
            WHERE cc.organization_id = $1
            AND (LOWER(cc.code) = LOWER(organization_users.cost_center) OR LOWER(cc.name) = LOWER(organization_users.cost_center))
          )
        RETURNING id
      `, [organizationId]);
      imported = result.rowCount || 0;

      // Link users to the newly created cost centers
      if (imported > 0) {
        await db.query(`
          UPDATE organization_users ou
          SET cost_center_id = cc.id
          FROM cost_centers cc
          WHERE ou.organization_id = $1
            AND cc.organization_id = $1
            AND (LOWER(cc.code) = LOWER(ou.cost_center) OR LOWER(cc.name) = LOWER(ou.cost_center))
            AND ou.cost_center_id IS NULL
        `, [organizationId]);
      }
    }

    logger.info('Auto-imported master data', { organizationId, entityType, imported });
    return { imported };
  }
}

export const dataQualityService = new DataQualityService();
