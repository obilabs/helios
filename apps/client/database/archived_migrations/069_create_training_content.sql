-- Migration: 069_create_training_content.sql
-- Description: Create tables for training content management and user progress tracking
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-28

-- Create training_content table for storing training materials
CREATE TABLE IF NOT EXISTS training_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic info
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content_type VARCHAR(50) NOT NULL, -- 'video', 'document', 'terms', 'quiz', 'link', 'checklist'

  -- Content storage
  url TEXT, -- For videos, links, or hosted documents
  file_path TEXT, -- For uploaded files
  embedded_content TEXT, -- For inline HTML content (terms, policies)

  -- Configuration
  estimated_duration_minutes INTEGER DEFAULT 0,
  passing_score INTEGER, -- For quizzes (0-100)
  requires_acknowledgment BOOLEAN DEFAULT false,
  requires_signature BOOLEAN DEFAULT false,
  allow_skip BOOLEAN DEFAULT false,

  -- Categorization
  category VARCHAR(100), -- 'compliance', 'security', 'onboarding', 'role_specific', 'general'
  tags JSONB DEFAULT '[]'::jsonb,

  -- Targeting
  applies_to_roles JSONB DEFAULT '[]'::jsonb, -- Empty = all roles
  applies_to_departments JSONB DEFAULT '[]'::jsonb, -- Empty = all departments

  -- Versioning
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  is_mandatory BOOLEAN DEFAULT false,

  -- Metadata
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_training_content_org ON training_content(organization_id);
CREATE INDEX IF NOT EXISTS idx_training_content_type ON training_content(organization_id, content_type);
CREATE INDEX IF NOT EXISTS idx_training_content_active ON training_content(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_training_content_category ON training_content(organization_id, category);

-- Create user_training_progress table for tracking completion
CREATE TABLE IF NOT EXISTS user_training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES training_content(id) ON DELETE CASCADE,

  -- Progress tracking
  status VARCHAR(20) NOT NULL DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed', 'failed'
  progress_percent INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  time_spent_seconds INTEGER DEFAULT 0,

  -- For quizzes
  quiz_attempts INTEGER DEFAULT 0,
  quiz_score INTEGER,
  quiz_passed BOOLEAN,
  quiz_answers JSONB,

  -- For acknowledgments/signatures
  acknowledged_at TIMESTAMP,
  signature_data TEXT, -- Base64 encoded signature image
  signature_ip VARCHAR(45),
  signature_user_agent TEXT,

  -- Assignment tracking
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES organization_users(id),
  due_date DATE,
  request_id UUID REFERENCES user_requests(id), -- If part of lifecycle

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Ensure one progress record per user per content
  UNIQUE(user_id, content_id)
);

-- Create indexes for progress queries
CREATE INDEX IF NOT EXISTS idx_training_progress_user ON user_training_progress(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_content ON user_training_progress(content_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_status ON user_training_progress(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_training_progress_request ON user_training_progress(request_id);

-- Create training_quiz_questions table for quiz content
CREATE TABLE IF NOT EXISTS training_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES training_content(id) ON DELETE CASCADE,

  question_text TEXT NOT NULL,
  question_type VARCHAR(20) NOT NULL DEFAULT 'single_choice', -- 'single_choice', 'multiple_choice', 'true_false', 'text'
  options JSONB, -- Array of {id, text, isCorrect}
  correct_answer TEXT, -- For text questions
  points INTEGER DEFAULT 1,
  explanation TEXT, -- Shown after answering
  sequence_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_content ON training_quiz_questions(content_id);

-- Add comments
COMMENT ON TABLE training_content IS 'Training materials that can be assigned to users during onboarding or ongoing';
COMMENT ON TABLE user_training_progress IS 'Tracks user progress and completion of training content';
COMMENT ON TABLE training_quiz_questions IS 'Quiz questions for training content with type=quiz';
COMMENT ON COLUMN training_content.content_type IS 'Type of content: video, document, terms, quiz, link, checklist';
COMMENT ON COLUMN user_training_progress.signature_data IS 'Base64 encoded signature for terms acceptance';
