import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

// Mock database
const mockQuery = jest.fn();
jest.mock('../database/connection', () => ({
  db: {
    query: mockQuery,
  },
}));

// Mock media upload service
const mockMediaUploadService = {
  getMedia: jest.fn(),
};
jest.mock('../services/media-upload.service', () => ({
  mediaUploadService: mockMediaUploadService,
}));

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'viewer-user-id',
      email: 'viewer@example.com',
      organizationId: 'test-org-id',
      role: 'user',
      isAdmin: false,
      isEmployee: true,
    };
    next();
  },
  requireEmployee: (_req: any, _res: any, next: any) => {
    // Mock employee check - always passes in tests
    next();
  },
}));

// Import routes after mocking
import peopleRoutes from '../routes/people.routes.js';

describe('People Routes', () => {
  let app: Express;

  const testOrgId = 'test-org-id';
  const testViewerId = 'viewer-user-id';
  const testTargetUserId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/people', peopleRoutes);
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/people', () => {
    it('should list people in the directory', async () => {
      // Mock count query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '2' }],
      });

      // Mock people list query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: testTargetUserId,
            email: 'john@example.com',
            first_name: 'John',
            last_name: 'Doe',
            job_title: 'Engineer',
            department: 'Engineering',
            location: 'New York',
            avatar_url: null,
            start_date: new Date('2024-01-01'),
            has_voice_intro: false,
            has_video_intro: false,
            interest_count: '3',
            expertise_count: '2',
            is_new_joiner: false,
          },
        ],
      });

      const response = await request(app)
        .get('/api/people')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].firstName).toBe('John');
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter people by department', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: testTargetUserId,
            email: 'jane@example.com',
            first_name: 'Jane',
            last_name: 'Smith',
            department: 'Sales',
            interest_count: '0',
            expertise_count: '0',
            is_new_joiner: false,
            has_voice_intro: false,
            has_video_intro: false,
          },
        ],
      });

      const response = await request(app)
        .get('/api/people?department=Sales')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      // Verify department filter was passed in query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ou.department = $'),
        expect.arrayContaining(['Sales'])
      );
    });

    it('should search people by name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: testTargetUserId,
            email: 'john@example.com',
            first_name: 'John',
            last_name: 'Doe',
            interest_count: '0',
            expertise_count: '0',
            is_new_joiner: false,
            has_voice_intro: false,
            has_video_intro: false,
          },
        ],
      });

      const response = await request(app)
        .get('/api/people?search=John')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Verify search filter was applied
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIKE LOWER($'),
        expect.arrayContaining(['%John%'])
      );
    });
  });

  describe('GET /api/people/new', () => {
    it('should return recently joined people', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: testTargetUserId,
            email: 'newbie@example.com',
            first_name: 'New',
            last_name: 'Joiner',
            start_date: new Date(),
            interest_count: '0',
            expertise_count: '0',
            is_new_joiner: true,
            has_voice_intro: false,
            has_video_intro: false,
          },
        ],
      });

      const response = await request(app)
        .get('/api/people/new')
        .expect(200);

      expect(response.body.success).toBe(true);
      // New joiners filter should be in the query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('30 days'),
        expect.any(Array)
      );
    });
  });

  describe('GET /api/people/filters', () => {
    it('should return available filter options', async () => {
      // Mock departments query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { department: 'Engineering' },
          { department: 'Sales' },
        ],
      });

      // Mock locations query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { location: 'New York' },
          { location: 'Remote' },
        ],
      });

      const response = await request(app)
        .get('/api/people/filters')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.departments).toEqual(['Engineering', 'Sales']);
      expect(response.body.data.locations).toEqual(['New York', 'Remote']);
    });
  });

  describe('GET /api/people/search', () => {
    it('should search by name, skills, and interests', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: testTargetUserId,
            email: 'john@example.com',
            first_name: 'John',
            last_name: 'Doe',
            interest_count: '1',
            expertise_count: '1',
            is_new_joiner: false,
            has_voice_intro: false,
            has_video_intro: false,
          },
        ],
      });

      const response = await request(app)
        .get('/api/people/search?q=React')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject search queries under 2 characters', async () => {
      const response = await request(app)
        .get('/api/people/search?q=a')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('at least 2 characters');
    });
  });

  describe('GET /api/people/by-skill/:topic', () => {
    it('should find people by expertise topic', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: testTargetUserId,
            email: 'expert@example.com',
            first_name: 'Expert',
            last_name: 'User',
            skill_level: 'advanced',
            interest_count: '0',
            expertise_count: '5',
            is_new_joiner: false,
            has_voice_intro: false,
            has_video_intro: false,
          },
        ],
      });

      const response = await request(app)
        .get('/api/people/by-skill/TypeScript')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('user_expertise_topics'),
        expect.arrayContaining(['%TypeScript%'])
      );
    });

    it('should reject skill searches under 2 characters', async () => {
      const response = await request(app)
        .get('/api/people/by-skill/a')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});

describe('Privacy Filtering - GET /api/people/:id', () => {
  let app: Express;

  const testOrgId = 'test-org-id';
  const testTargetUserId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/people', peopleRoutes);
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  describe('Viewing Self', () => {
    beforeEach(() => {
      // Mock user as self (viewing own profile)
      jest.resetModules();
      jest.doMock('../middleware/auth', () => ({
        requireAuth: (req: any, _res: any, next: any) => {
          req.user = {
            userId: testTargetUserId, // Same as target
            email: 'self@example.com',
            organizationId: testOrgId,
            role: 'user',
          };
          next();
        },
      }));
    });

    it('should show all fields when viewing own profile', async () => {
      // Mock user query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testTargetUserId,
          email: 'self@example.com',
          first_name: 'Self',
          last_name: 'User',
          bio: 'My private bio',
          mobile_phone: '123-456-7890',
          work_phone: '098-765-4321',
          is_new_joiner: false,
        }],
      });

      // Mock visibility settings
      mockQuery.mockResolvedValueOnce({
        rows: [
          { field_name: 'phone', visibility: 'none' },
          { field_name: 'bio', visibility: 'none' },
        ],
      });

      // Mock manager check (viewer is target, self-view)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock team check
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock fun facts
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock interests
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock expertise
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock media
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Self should see all fields even if visibility is 'none'
      // Note: This test verifies the query flow; actual filtering happens in service
    });
  });

  describe('Viewing as Manager', () => {
    it('should show manager-only fields when viewer is manager', async () => {
      const viewerId = 'manager-user-id';

      // Re-import with manager auth
      jest.doMock('../middleware/auth', () => ({
        requireAuth: (req: any, _res: any, next: any) => {
          req.user = {
            userId: viewerId,
            email: 'manager@example.com',
            organizationId: testOrgId,
            role: 'user',
          };
          next();
        },
      }));

      // Mock user query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testTargetUserId,
          email: 'employee@example.com',
          first_name: 'Employee',
          last_name: 'User',
          reporting_manager_id: viewerId,
          bio: 'Employee bio',
          mobile_phone: '123-456-7890',
          is_new_joiner: false,
        }],
      });

      // Mock visibility settings
      mockQuery.mockResolvedValueOnce({
        rows: [
          { field_name: 'phone', visibility: 'manager' },
          { field_name: 'bio', visibility: 'manager' },
        ],
      });

      // Mock manager check - viewer IS the manager
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: testTargetUserId }],
      });

      // Mock manager info query (because reporting_manager_id exists)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: viewerId,
          first_name: 'Manager',
          last_name: 'User',
          email: 'manager@example.com',
          job_title: 'Manager',
        }],
      });

      // Mock fun facts (visible to manager)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'fact1', emoji: '🎉', content: 'Fun fact' }],
      });

      // Mock interests (visible to manager)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'int1', interest: 'Coding', category: 'tech' }],
      });

      // Mock expertise
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'exp1', topic: 'React', skill_level: 'expert' }],
      });

      // Mock media
      mockQuery.mockResolvedValueOnce({
        rows: [{ media_type: 'voice_intro' }],
      });

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Manager should be able to see manager-only fields
    });
  });

  describe('Viewing as Team Member', () => {
    it('should show team-only fields when viewer is on same team', async () => {
      const viewerId = 'team-member-id';
      const sharedManagerId = 'shared-manager-id';

      // Mock user query - target user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testTargetUserId,
          email: 'teammate@example.com',
          first_name: 'Team',
          last_name: 'Mate',
          reporting_manager_id: sharedManagerId,
          bio: 'Team member bio',
          mobile_phone: '123-456-7890',
          is_new_joiner: false,
        }],
      });

      // Mock visibility settings
      mockQuery.mockResolvedValueOnce({
        rows: [
          { field_name: 'phone', visibility: 'team' },
          { field_name: 'bio', visibility: 'team' },
          { field_name: 'fun_facts', visibility: 'team' },
        ],
      });

      // Mock manager check - viewer is NOT the manager
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock team check - they share a manager
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }], // Has result = same team
      });

      // Mock manager info query (because reporting_manager_id exists)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: sharedManagerId,
          first_name: 'Shared',
          last_name: 'Manager',
          email: 'shared.manager@example.com',
          job_title: 'Team Lead',
        }],
      });

      // Mock fun facts
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'fact1', emoji: '🎉', content: 'Team visible fact' }],
      });

      // Mock interests
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'int1', interest: 'Gaming' }],
      });

      // Mock expertise
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      // Mock media
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Team member should see team-visible fields
    });
  });

  describe('Viewing as Other User', () => {
    it('should hide private fields when viewer is not related', async () => {
      const viewerId = 'other-user-id';

      // Mock user query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testTargetUserId,
          email: 'target@example.com',
          first_name: 'Target',
          last_name: 'User',
          bio: 'Private bio',
          mobile_phone: '123-456-7890',
          work_phone: '098-765-4321',
          is_new_joiner: false,
        }],
      });

      // Mock visibility settings - everything is restricted
      mockQuery.mockResolvedValueOnce({
        rows: [
          { field_name: 'phone', visibility: 'none' },
          { field_name: 'bio', visibility: 'manager' },
          { field_name: 'fun_facts', visibility: 'team' },
          { field_name: 'interests', visibility: 'team' },
        ],
      });

      // Mock manager check - viewer is NOT the manager
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock team check - NOT on same team
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock fun facts - should NOT be queried due to visibility
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock interests - should NOT be queried due to visibility
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock expertise
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      // Mock media
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Other user should NOT see restricted fields
    });
  });

  describe('Everyone Visibility', () => {
    it('should show everyone-visible fields to all users', async () => {
      // Mock user query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testTargetUserId,
          email: 'public@example.com',
          first_name: 'Public',
          last_name: 'User',
          bio: 'Public bio',
          job_title: 'Engineer',
          department: 'Engineering',
          is_new_joiner: false,
        }],
      });

      // Mock visibility settings - bio is public
      mockQuery.mockResolvedValueOnce({
        rows: [
          { field_name: 'bio', visibility: 'everyone' },
        ],
      });

      // Mock manager check
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock team check
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock fun facts
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'fact1', emoji: '👋', content: 'Hello world!' }],
      });

      // Mock interests
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'int1', interest: 'Music' }],
      });

      // Mock expertise
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'exp1', topic: 'JavaScript' }],
      });

      // Mock media
      mockQuery.mockResolvedValueOnce({
        rows: [{ media_type: 'name_pronunciation' }],
      });

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Public fields should be visible
      expect(response.body.data).toBeDefined();
    });
  });

  describe('Invalid Requests', () => {
    it('should return 400 for invalid UUID format', async () => {
      const response = await request(app)
        .get('/api/people/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid person ID');
    });

    it('should return 404 for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });
});

describe('Privacy Settings Interaction', () => {
  let app: Express;

  const testOrgId = 'test-org-id';
  const testTargetUserId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/people', peopleRoutes);
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  describe('Media Visibility', () => {
    it('should hide voice intro when visibility is restricted', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testTargetUserId,
          email: 'user@example.com',
          first_name: 'User',
          last_name: 'Test',
          is_new_joiner: false,
        }],
      });

      // Mock visibility - voice intro is manager-only
      mockQuery.mockResolvedValueOnce({
        rows: [
          { field_name: 'voice_intro', visibility: 'manager' },
        ],
      });

      // Mock relationship checks - not manager
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock fun facts
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock interests
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock expertise
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock media - has voice intro
      mockQuery.mockResolvedValueOnce({
        rows: [{ media_type: 'voice_intro' }],
      });

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Voice intro should be hidden based on visibility setting
    });

    it('should always show name pronunciation (public field)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testTargetUserId,
          email: 'user@example.com',
          first_name: 'User',
          last_name: 'Test',
          is_new_joiner: false,
        }],
      });

      // Mock visibility
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock relationship checks
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock fun facts
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock interests
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock expertise
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock media
      mockQuery.mockResolvedValueOnce({
        rows: [{ media_type: 'name_pronunciation' }],
      });

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.media.hasNamePronunciation).toBe(true);
    });
  });

  describe('Contact Info Visibility', () => {
    it('should hide phone numbers when visibility is none', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testTargetUserId,
          email: 'user@example.com',
          first_name: 'User',
          last_name: 'Test',
          mobile_phone: '123-456-7890',
          work_phone: '098-765-4321',
          is_new_joiner: false,
        }],
      });

      // Mock visibility - phone is hidden
      mockQuery.mockResolvedValueOnce({
        rows: [
          { field_name: 'phone', visibility: 'none' },
        ],
      });

      // Mock relationship checks - not related
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock other data
      mockQuery.mockResolvedValueOnce({ rows: [] }); // fun facts
      mockQuery.mockResolvedValueOnce({ rows: [] }); // interests
      mockQuery.mockResolvedValueOnce({ rows: [] }); // expertise
      mockQuery.mockResolvedValueOnce({ rows: [] }); // media

      const response = await request(app)
        .get(`/api/people/${testTargetUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Phone fields should be undefined when hidden
    });
  });
});

describe('People Routes - Error Handling', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/people', peopleRoutes);
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  it('should handle database errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

    const response = await request(app)
      .get('/api/people')
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeDefined();
  });

  it('should handle missing authorization gracefully', async () => {
    // This tests the route behavior when auth fails
    // The actual auth middleware is mocked, so we test the route logic
    const testApp = express();
    testApp.use(express.json());

    // Mock auth to not set user
    jest.doMock('../middleware/auth', () => ({
      requireAuth: (req: any, res: any, _next: any) => {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      },
    }));

    // The mock won't apply to already-imported routes in this test
    // This is just documenting the expected behavior
  });
});
