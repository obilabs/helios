-- Migration: 064_create_resources_module.sql
-- Purpose: Create the Resources module (formerly IT Assets) with training support
-- Features: Media, documents, training courses, completion tracking, onboarding integration

-- =============================================================================
-- Resource Categories
-- =============================================================================
-- Hierarchical categories for organizing resources

CREATE TABLE IF NOT EXISTS resource_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES resource_categories(id) ON DELETE SET NULL,
  icon VARCHAR(50),
  color VARCHAR(20),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_resource_categories_org
  ON resource_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_resource_categories_parent
  ON resource_categories(parent_id);

-- =============================================================================
-- Resources (Files, Links, Training)
-- =============================================================================
-- Core resource table supporting multiple types

CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Classification
  type VARCHAR(20) NOT NULL,  -- 'media', 'document', 'html', 'training', 'link'
  category_id UUID REFERENCES resource_categories(id) ON DELETE SET NULL,

  -- Metadata
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url VARCHAR(500),
  tags TEXT[] DEFAULT '{}',

  -- Storage (for uploaded files)
  storage_type VARCHAR(20),  -- 's3', 'link', 'html', NULL
  storage_path VARCHAR(500),
  storage_bucket VARCHAR(100),
  file_name VARCHAR(255),
  file_size BIGINT,
  mime_type VARCHAR(100),

  -- For links
  external_url VARCHAR(500),

  -- For HTML content
  html_content TEXT,

  -- Media info (for video/audio)
  duration_seconds INT,
  width INT,
  height INT,

  -- Training specific
  is_training BOOLEAN DEFAULT FALSE,
  training_type VARCHAR(20),  -- 'video', 'document', 'course', 'quiz', 'interactive'
  passing_score INT,  -- For quizzes (0-100)
  estimated_duration_minutes INT,
  certificate_template_id UUID,

  -- Access control
  visibility VARCHAR(20) DEFAULT 'organization',  -- 'organization', 'department', 'role', 'specific'
  allowed_departments TEXT[] DEFAULT '{}',
  allowed_roles TEXT[] DEFAULT '{}',
  allowed_user_ids UUID[] DEFAULT '{}',

  -- Lifecycle
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  version INT DEFAULT 1,

  -- Audit
  created_by UUID NOT NULL REFERENCES organization_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_resource_type CHECK (type IN ('media', 'document', 'html', 'training', 'link')),
  CONSTRAINT valid_visibility CHECK (visibility IN ('organization', 'department', 'role', 'specific'))
);

CREATE INDEX IF NOT EXISTS idx_resources_org ON resources(organization_id);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(organization_id, type);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category_id);
CREATE INDEX IF NOT EXISTS idx_resources_training ON resources(organization_id, is_training) WHERE is_training = TRUE;
CREATE INDEX IF NOT EXISTS idx_resources_published ON resources(organization_id, is_published) WHERE is_published = TRUE;

-- =============================================================================
-- Resource Completions (Progress Tracking)
-- =============================================================================
-- Tracks user progress through resources

CREATE TABLE IF NOT EXISTS resource_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,

  -- Progress
  started_at TIMESTAMPTZ,
  last_access_at TIMESTAMPTZ,
  progress_percent INT DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  completed_at TIMESTAMPTZ,

  -- Video tracking
  watched_seconds INT DEFAULT 0,
  last_position_seconds INT DEFAULT 0,

  -- Quiz tracking
  quiz_attempts INT DEFAULT 0,
  quiz_best_score INT,
  quiz_passed BOOLEAN,
  quiz_last_attempt_at TIMESTAMPTZ,

  -- Document acknowledgment
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,

  -- Certificate
  certificate_issued BOOLEAN DEFAULT FALSE,
  certificate_url VARCHAR(500),
  certificate_issued_at TIMESTAMPTZ,

  -- Onboarding context (if assigned via onboarding)
  onboarding_instance_id UUID,
  deadline TIMESTAMPTZ,
  overdue_notified BOOLEAN DEFAULT FALSE,
  overdue_notified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_completions_user ON resource_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_completions_resource ON resource_completions(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_completions_incomplete
  ON resource_completions(user_id, completed_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resource_completions_overdue
  ON resource_completions(deadline) WHERE completed_at IS NULL AND deadline IS NOT NULL;

-- =============================================================================
-- Training Courses (Multi-module Training)
-- =============================================================================
-- For courses that contain multiple resources

CREATE TABLE IF NOT EXISTS training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url VARCHAR(500),
  category_id UUID REFERENCES resource_categories(id) ON DELETE SET NULL,

  -- Course settings
  estimated_duration_minutes INT,
  passing_score INT DEFAULT 80,
  require_sequential BOOLEAN DEFAULT FALSE,  -- Must complete modules in order
  certificate_template_id UUID,

  -- Access control (same as resources)
  visibility VARCHAR(20) DEFAULT 'organization',
  allowed_departments TEXT[] DEFAULT '{}',
  allowed_roles TEXT[] DEFAULT '{}',

  -- Lifecycle
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,

  created_by UUID NOT NULL REFERENCES organization_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_courses_org ON training_courses(organization_id);
CREATE INDEX IF NOT EXISTS idx_training_courses_published
  ON training_courses(organization_id, is_published) WHERE is_published = TRUE;

-- =============================================================================
-- Course Modules (Course <-> Resource Junction)
-- =============================================================================

CREATE TABLE IF NOT EXISTS course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,

  title VARCHAR(255),  -- Override resource title if needed
  description TEXT,    -- Override resource description if needed
  sort_order INT NOT NULL,
  is_required BOOLEAN DEFAULT TRUE,

  -- Time limits
  min_duration_seconds INT,  -- Minimum time to spend (anti-skip)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(course_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);

-- =============================================================================
-- Course Completions
-- =============================================================================

CREATE TABLE IF NOT EXISTS course_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  modules_completed INT DEFAULT 0,
  total_modules INT NOT NULL,

  -- Quiz/assessment
  final_score INT,
  passed BOOLEAN,

  -- Certificate
  certificate_url VARCHAR(500),
  certificate_issued_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_completions_user ON course_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_course_completions_course ON course_completions(course_id);

-- =============================================================================
-- Onboarding Template Resources (Link resources to onboarding)
-- =============================================================================

CREATE TABLE IF NOT EXISTS onboarding_template_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL,  -- References onboarding_templates (may not exist yet)

  -- Either a resource or a course
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  course_id UUID REFERENCES training_courses(id) ON DELETE CASCADE,

  step_order INT NOT NULL,
  step_type VARCHAR(20) NOT NULL,  -- 'training', 'document', 'acknowledge'
  step_title VARCHAR(255),  -- Display title for this step

  -- Deadline configuration
  deadline_type VARCHAR(20),  -- 'day_1', 'day_3', 'day_5', 'week_1', 'week_2', 'custom'
  deadline_days INT,  -- For custom deadlines

  is_required BOOLEAN DEFAULT TRUE,
  send_reminder BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT has_resource_or_course CHECK (
    (resource_id IS NOT NULL AND course_id IS NULL) OR
    (resource_id IS NULL AND course_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_onboarding_resources_template ON onboarding_template_resources(template_id);

-- =============================================================================
-- Default Categories (Seed Data)
-- =============================================================================

-- Insert default categories for organizations that don't have any
-- This is handled by application code, not migration, since it needs org_id

COMMENT ON TABLE resources IS 'Organizational resources including media, documents, and training materials';
COMMENT ON TABLE resource_completions IS 'Tracks user progress through resources and training';
COMMENT ON TABLE training_courses IS 'Multi-module training courses combining multiple resources';
COMMENT ON TABLE course_modules IS 'Links resources to courses with ordering';
COMMENT ON TABLE course_completions IS 'Tracks user progress through courses';
COMMENT ON TABLE onboarding_template_resources IS 'Links resources/courses to onboarding templates';
