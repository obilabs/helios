-- Migration 062: Create Onboarding Requests Table
-- Purpose: Store HR requests for onboarding/offboarding for approval workflow

CREATE TABLE IF NOT EXISTS onboarding_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Request Details
    type VARCHAR(50) NOT NULL CHECK (type IN ('onboarding', 'offboarding')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    data JSONB NOT NULL DEFAULT '{}', -- Stores candidate info, start date, etc.
    
    -- Actors
    requester_id UUID REFERENCES organization_users(id) ON DELETE SET NULL, -- HR User
    approver_id UUID REFERENCES organization_users(id) ON DELETE SET NULL, -- Admin who acted
    
    -- Metadata
    comments TEXT, -- Optional comments/rejection reason
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_onboarding_requests_org ON onboarding_requests(organization_id);
CREATE INDEX idx_onboarding_requests_status ON onboarding_requests(status);
CREATE INDEX idx_onboarding_requests_type ON onboarding_requests(type);
CREATE INDEX idx_onboarding_requests_requester ON onboarding_requests(requester_id);

-- Updated_at trigger
CREATE TRIGGER onboarding_requests_updated_at
    BEFORE UPDATE ON onboarding_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE onboarding_requests IS 'Stores onboarding/offboarding requests submitted by HR for admin approval';
