-- Migration: 036_add_user_dashboard_widgets
-- Description: Add user_dashboard_widgets table for customizable dashboard

-- Create user_dashboard_widgets table if not exists
CREATE TABLE IF NOT EXISTS user_dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  widget_id VARCHAR(100) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, widget_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_dashboard_widgets_user_id
  ON user_dashboard_widgets(user_id);

CREATE INDEX IF NOT EXISTS idx_user_dashboard_widgets_position
  ON user_dashboard_widgets(user_id, position);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_dashboard_widgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_dashboard_widgets_updated_at ON user_dashboard_widgets;
DROP TRIGGER IF EXISTS update_user_dashboard_widgets_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_user_dashboard_widgets_updated_at
  BEFORE UPDATE ON user_dashboard_widgets
  FOR EACH ROW
  EXECUTE FUNCTION update_user_dashboard_widgets_updated_at();

-- Add comment
COMMENT ON TABLE user_dashboard_widgets IS 'Stores user customizable dashboard widget preferences';
