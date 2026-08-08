import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

export interface PersonListOptions {
  organizationId: string;
  search?: string;
  department?: string;
  location?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'department' | 'startDate';
  sortOrder?: 'asc' | 'desc';
  newJoinersOnly?: boolean;
  hasMedia?: boolean;
}

export interface PersonProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  avatarUrl?: string;
  pronouns?: string;
  bio?: string;
  currentStatus?: string;
  startDate?: string;
  mobilePhone?: string;
  workPhone?: string;
  timezone?: string;
  organizationalUnit?: string;
  employeeType?: string;
  reportingManagerId?: string;
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle?: string;
  };
  funFacts?: Array<{
    id: string;
    emoji?: string;
    content: string;
  }>;
  interests?: Array<{
    id: string;
    interest: string;
    category?: string;
  }>;
  expertiseTopics?: Array<{
    id: string;
    topic: string;
    skillLevel?: string;
  }>;
  media?: {
    hasVoiceIntro: boolean;
    hasVideoIntro: boolean;
    hasNamePronunciation: boolean;
  };
  profileCompleteness?: number;
  isNewJoiner?: boolean;
}

export interface PersonCard {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  avatarUrl?: string;
  hasMedia: boolean;
  hasVoiceIntro: boolean;
  hasVideoIntro: boolean;
  interestCount: number;
  expertiseCount: number;
  isNewJoiner: boolean;
}

class PeopleService {
  /**
   * Get paginated list of people for the directory
   */
  async listPeople(options: PersonListOptions): Promise<{ people: PersonCard[]; total: number }> {
    const {
      organizationId,
      search,
      department,
      location,
      limit = 20,
      offset = 0,
      sortBy = 'name',
      sortOrder = 'asc',
      newJoinersOnly = false,
      hasMedia = false,
    } = options;

    try {
      // Build WHERE conditions
      const conditions: string[] = ['ou.organization_id = $1', 'ou.is_active = true'];
      const params: any[] = [organizationId];
      let paramIndex = 2;

      // Search by name or email
      if (search) {
        conditions.push(`(
          LOWER(ou.first_name || ' ' || ou.last_name) LIKE LOWER($${paramIndex}) OR
          LOWER(ou.email) LIKE LOWER($${paramIndex}) OR
          LOWER(ou.job_title) LIKE LOWER($${paramIndex})
        )`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Filter by department
      if (department) {
        conditions.push(`ou.department = $${paramIndex}`);
        params.push(department);
        paramIndex++;
      }

      // Filter by location
      if (location) {
        conditions.push(`ou.location = $${paramIndex}`);
        params.push(location);
        paramIndex++;
      }

      // Filter for new joiners (last 30 days)
      if (newJoinersOnly) {
        conditions.push(`ou.start_date >= NOW() - INTERVAL '30 days'`);
      }

      // Build ORDER BY clause
      let orderBy: string;
      const order = sortOrder.toUpperCase();
      switch (sortBy) {
        case 'department':
          orderBy = `ou.department ${order} NULLS LAST, ou.first_name ${order}`;
          break;
        case 'startDate':
          orderBy = `ou.start_date ${order} NULLS LAST`;
          break;
        case 'name':
        default:
          orderBy = `ou.first_name ${order}, ou.last_name ${order}`;
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM organization_users ou
        WHERE ${whereClause}
      `;
      const countResult = await db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total, 10);

      // Get people with media flags
      const query = `
        SELECT
          ou.id,
          ou.email,
          ou.first_name,
          ou.last_name,
          ou.job_title,
          ou.department,
          ou.location,
          ou.avatar_url,
          ou.start_date,
          EXISTS(SELECT 1 FROM user_media um WHERE um.user_id = ou.id AND um.media_type = 'voice_intro') as has_voice_intro,
          EXISTS(SELECT 1 FROM user_media um WHERE um.user_id = ou.id AND um.media_type = 'video_intro') as has_video_intro,
          (SELECT COUNT(*) FROM user_interests ui WHERE ui.user_id = ou.id) as interest_count,
          (SELECT COUNT(*) FROM user_expertise_topics uet WHERE uet.user_id = ou.id) as expertise_count,
          CASE WHEN ou.start_date >= NOW() - INTERVAL '30 days' THEN true ELSE false END as is_new_joiner
        FROM organization_users ou
        WHERE ${whereClause}
        ${hasMedia ? 'AND EXISTS(SELECT 1 FROM user_media um WHERE um.user_id = ou.id)' : ''}
        ORDER BY ${orderBy}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);
      const result = await db.query(query, params);

      const people: PersonCard[] = result.rows.map((row: any) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        jobTitle: row.job_title,
        department: row.department,
        location: row.location,
        avatarUrl: row.avatar_url,
        hasMedia: row.has_voice_intro || row.has_video_intro,
        hasVoiceIntro: row.has_voice_intro,
        hasVideoIntro: row.has_video_intro,
        interestCount: parseInt(row.interest_count, 10),
        expertiseCount: parseInt(row.expertise_count, 10),
        isNewJoiner: row.is_new_joiner,
      }));

      return { people, total };
    } catch (error: any) {
      logger.error('Error listing people:', error);
      throw error;
    }
  }

  /**
   * Get a single person's profile
   */
  async getPersonProfile(
    personId: string,
    viewerId: string,
    organizationId: string
  ): Promise<PersonProfile | null> {
    try {
      // Get basic profile
      const userResult = await db.query(
        `SELECT
          ou.id, ou.email, ou.first_name, ou.last_name,
          ou.job_title, ou.department, ou.location,
          ou.avatar_url, ou.pronouns, ou.bio, ou.current_status,
          ou.start_date, ou.mobile_phone, ou.work_phone,
          ou.timezone, ou.organizational_unit, ou.employee_type,
          ou.reporting_manager_id, ou.profile_completeness,
          CASE WHEN ou.start_date >= NOW() - INTERVAL '30 days' THEN true ELSE false END as is_new_joiner
        FROM organization_users ou
        WHERE ou.id = $1 AND ou.organization_id = $2 AND ou.is_active = true`,
        [personId, organizationId]
      );

      if (userResult.rows.length === 0) {
        return null;
      }

      const user = userResult.rows[0];

      // Get visibility settings for the person being viewed
      const visibilityResult = await db.query(
        `SELECT field_name, visibility FROM user_field_visibility WHERE user_id = $1`,
        [personId]
      );
      const visibility: Record<string, string> = {};
      visibilityResult.rows.forEach((row: any) => {
        visibility[row.field_name] = row.visibility;
      });

      // Check relationship for privacy filtering
      const relationship = await this.getRelationship(viewerId, personId);

      // Get manager info if exists
      let manager = undefined;
      if (user.reporting_manager_id) {
        const managerResult = await db.query(
          `SELECT id, first_name, last_name, email, job_title
           FROM organization_users WHERE id = $1 AND is_active = true`,
          [user.reporting_manager_id]
        );
        if (managerResult.rows.length > 0) {
          const m = managerResult.rows[0];
          manager = {
            id: m.id,
            firstName: m.first_name,
            lastName: m.last_name,
            email: m.email,
            jobTitle: m.job_title,
          };
        }
      }

      // Get fun facts (if visible)
      let funFacts: any[] = [];
      if (this.canViewField(visibility.fun_facts, relationship)) {
        const funFactsResult = await db.query(
          `SELECT id, emoji, content FROM user_fun_facts
           WHERE user_id = $1 ORDER BY display_order ASC`,
          [personId]
        );
        funFacts = funFactsResult.rows.map((row: any) => ({
          id: row.id,
          emoji: row.emoji,
          content: row.content,
        }));
      }

      // Get interests (if visible)
      let interests: any[] = [];
      if (this.canViewField(visibility.interests, relationship)) {
        const interestsResult = await db.query(
          `SELECT id, interest, category FROM user_interests
           WHERE user_id = $1 ORDER BY interest ASC`,
          [personId]
        );
        interests = interestsResult.rows.map((row: any) => ({
          id: row.id,
          interest: row.interest,
          category: row.category,
        }));
      }

      // Get expertise topics
      const expertiseResult = await db.query(
        `SELECT id, topic, skill_level FROM user_expertise_topics
         WHERE user_id = $1 ORDER BY topic ASC`,
        [personId]
      );
      const expertiseTopics = expertiseResult.rows.map((row: any) => ({
        id: row.id,
        topic: row.topic,
        skillLevel: row.skill_level,
      }));

      // Get media flags
      const mediaResult = await db.query(
        `SELECT media_type FROM user_media WHERE user_id = $1`,
        [personId]
      );
      const mediaTypes = mediaResult.rows.map((r: any) => r.media_type);

      // Apply privacy filtering to sensitive fields
      const profile: PersonProfile = {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        jobTitle: user.job_title,
        department: user.department,
        location: user.location,
        avatarUrl: user.avatar_url,
        pronouns: user.pronouns,
        bio: this.canViewField(visibility.bio, relationship) ? user.bio : undefined,
        currentStatus: user.current_status,
        startDate: user.start_date,
        timezone: user.timezone,
        organizationalUnit: user.organizational_unit,
        employeeType: user.employee_type,
        reportingManagerId: user.reporting_manager_id,
        manager,
        funFacts,
        interests,
        expertiseTopics,
        media: {
          hasVoiceIntro: mediaTypes.includes('voice_intro') &&
            this.canViewField(visibility.voice_intro, relationship),
          hasVideoIntro: mediaTypes.includes('video_intro') &&
            this.canViewField(visibility.video_intro, relationship),
          hasNamePronunciation: mediaTypes.includes('name_pronunciation'),
        },
        profileCompleteness: user.profile_completeness,
        isNewJoiner: user.is_new_joiner,
      };

      // Apply phone visibility
      if (this.canViewField(visibility.phone, relationship)) {
        profile.mobilePhone = user.mobile_phone;
        profile.workPhone = user.work_phone;
      }

      return profile;
    } catch (error: any) {
      logger.error('Error getting person profile:', error);
      throw error;
    }
  }

  /**
   * Search people by name, skills, or interests
   */
  async searchPeople(
    organizationId: string,
    query: string,
    options: { limit?: number; searchFields?: ('name' | 'skills' | 'interests')[] } = {}
  ): Promise<PersonCard[]> {
    const { limit = 10, searchFields = ['name', 'skills', 'interests'] } = options;

    try {
      const conditions: string[] = ['ou.organization_id = $1', 'ou.is_active = true'];
      const searchConditions: string[] = [];
      const params: any[] = [organizationId, `%${query.toLowerCase()}%`];

      if (searchFields.includes('name')) {
        searchConditions.push(`LOWER(ou.first_name || ' ' || ou.last_name) LIKE $2`);
        searchConditions.push(`LOWER(ou.job_title) LIKE $2`);
      }

      if (searchFields.includes('skills')) {
        searchConditions.push(`EXISTS(
          SELECT 1 FROM user_expertise_topics uet
          WHERE uet.user_id = ou.id AND LOWER(uet.topic) LIKE $2
        )`);
      }

      if (searchFields.includes('interests')) {
        searchConditions.push(`EXISTS(
          SELECT 1 FROM user_interests ui
          WHERE ui.user_id = ou.id AND LOWER(ui.interest) LIKE $2
        )`);
      }

      if (searchConditions.length > 0) {
        conditions.push(`(${searchConditions.join(' OR ')})`);
      }

      const whereClause = conditions.join(' AND ');

      const result = await db.query(
        `SELECT
          ou.id, ou.email, ou.first_name, ou.last_name,
          ou.job_title, ou.department, ou.location, ou.avatar_url,
          ou.start_date,
          EXISTS(SELECT 1 FROM user_media um WHERE um.user_id = ou.id AND um.media_type = 'voice_intro') as has_voice_intro,
          EXISTS(SELECT 1 FROM user_media um WHERE um.user_id = ou.id AND um.media_type = 'video_intro') as has_video_intro,
          (SELECT COUNT(*) FROM user_interests ui WHERE ui.user_id = ou.id) as interest_count,
          (SELECT COUNT(*) FROM user_expertise_topics uet WHERE uet.user_id = ou.id) as expertise_count,
          CASE WHEN ou.start_date >= NOW() - INTERVAL '30 days' THEN true ELSE false END as is_new_joiner
        FROM organization_users ou
        WHERE ${whereClause}
        ORDER BY ou.first_name, ou.last_name
        LIMIT $3`,
        [...params, limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        jobTitle: row.job_title,
        department: row.department,
        location: row.location,
        avatarUrl: row.avatar_url,
        hasMedia: row.has_voice_intro || row.has_video_intro,
        hasVoiceIntro: row.has_voice_intro,
        hasVideoIntro: row.has_video_intro,
        interestCount: parseInt(row.interest_count, 10),
        expertiseCount: parseInt(row.expertise_count, 10),
        isNewJoiner: row.is_new_joiner,
      }));
    } catch (error: any) {
      logger.error('Error searching people:', error);
      throw error;
    }
  }

  /**
   * Get new joiners (people who started in the last 30 days)
   */
  async getNewJoiners(organizationId: string, limit = 10): Promise<PersonCard[]> {
    return this.listPeople({
      organizationId,
      newJoinersOnly: true,
      limit,
      sortBy: 'startDate',
      sortOrder: 'desc',
    }).then((result) => result.people);
  }

  /**
   * Get available filter options (departments, locations)
   */
  async getFilterOptions(organizationId: string): Promise<{
    departments: string[];
    locations: string[];
  }> {
    try {
      const [deptResult, locResult] = await Promise.all([
        db.query(
          `SELECT DISTINCT department FROM organization_users
           WHERE organization_id = $1 AND is_active = true AND department IS NOT NULL
           ORDER BY department`,
          [organizationId]
        ),
        db.query(
          `SELECT DISTINCT location FROM organization_users
           WHERE organization_id = $1 AND is_active = true AND location IS NOT NULL
           ORDER BY location`,
          [organizationId]
        ),
      ]);

      return {
        departments: deptResult.rows.map((r: any) => r.department),
        locations: locResult.rows.map((r: any) => r.location),
      };
    } catch (error: any) {
      logger.error('Error getting filter options:', error);
      throw error;
    }
  }

  /**
   * Find people by expertise topic
   */
  async findByExpertise(
    organizationId: string,
    topic: string,
    limit = 10
  ): Promise<PersonCard[]> {
    try {
      const result = await db.query(
        `SELECT DISTINCT
          ou.id, ou.email, ou.first_name, ou.last_name,
          ou.job_title, ou.department, ou.location, ou.avatar_url,
          ou.start_date, uet.skill_level,
          EXISTS(SELECT 1 FROM user_media um WHERE um.user_id = ou.id AND um.media_type = 'voice_intro') as has_voice_intro,
          EXISTS(SELECT 1 FROM user_media um WHERE um.user_id = ou.id AND um.media_type = 'video_intro') as has_video_intro,
          (SELECT COUNT(*) FROM user_interests ui WHERE ui.user_id = ou.id) as interest_count,
          (SELECT COUNT(*) FROM user_expertise_topics uet2 WHERE uet2.user_id = ou.id) as expertise_count,
          CASE WHEN ou.start_date >= NOW() - INTERVAL '30 days' THEN true ELSE false END as is_new_joiner
        FROM organization_users ou
        JOIN user_expertise_topics uet ON uet.user_id = ou.id
        WHERE ou.organization_id = $1 AND ou.is_active = true
          AND LOWER(uet.topic) LIKE LOWER($2)
        ORDER BY
          CASE uet.skill_level
            WHEN 'expert' THEN 1
            WHEN 'advanced' THEN 2
            WHEN 'intermediate' THEN 3
            WHEN 'beginner' THEN 4
            ELSE 5
          END,
          ou.first_name
        LIMIT $3`,
        [organizationId, `%${topic}%`, limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        jobTitle: row.job_title,
        department: row.department,
        location: row.location,
        avatarUrl: row.avatar_url,
        hasMedia: row.has_voice_intro || row.has_video_intro,
        hasVoiceIntro: row.has_voice_intro,
        hasVideoIntro: row.has_video_intro,
        interestCount: parseInt(row.interest_count, 10),
        expertiseCount: parseInt(row.expertise_count, 10),
        isNewJoiner: row.is_new_joiner,
      }));
    } catch (error: any) {
      logger.error('Error finding people by expertise:', error);
      throw error;
    }
  }

  /**
   * Determine the relationship between two users for privacy filtering
   */
  private async getRelationship(
    viewerId: string,
    targetId: string
  ): Promise<'self' | 'manager' | 'team' | 'other'> {
    if (viewerId === targetId) {
      return 'self';
    }

    try {
      // Check if viewer is the target's manager
      const managerCheck = await db.query(
        `SELECT 1 FROM organization_users WHERE id = $1 AND reporting_manager_id = $2`,
        [targetId, viewerId]
      );
      if (managerCheck.rows.length > 0) {
        return 'manager';
      }

      // Check if they share the same manager (team members)
      const teamCheck = await db.query(
        `SELECT 1 FROM organization_users ou1
         JOIN organization_users ou2 ON ou1.reporting_manager_id = ou2.reporting_manager_id
         WHERE ou1.id = $1 AND ou2.id = $2`,
        [viewerId, targetId]
      );
      if (teamCheck.rows.length > 0) {
        return 'team';
      }

      return 'other';
    } catch (error) {
      logger.error('Error determining relationship:', error);
      return 'other';
    }
  }

  /**
   * Check if a field can be viewed based on visibility setting and relationship
   */
  private canViewField(
    visibility: string | undefined,
    relationship: 'self' | 'manager' | 'team' | 'other'
  ): boolean {
    // Default to 'everyone' if no visibility setting
    const vis = visibility || 'everyone';

    if (relationship === 'self') {
      return true;
    }

    switch (vis) {
      case 'everyone':
        return true;
      case 'team':
        return relationship === 'manager' || relationship === 'team';
      case 'manager':
        return relationship === 'manager';
      case 'none':
        return false;
      default:
        return true;
    }
  }
}

export const peopleService = new PeopleService();
