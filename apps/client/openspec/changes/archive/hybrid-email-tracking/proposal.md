# Hybrid Email Tracking System

## Overview

Enhance the existing campaign-only tracking system to support both **always-on user tracking** and **campaign tracking**. This enables users to see their personal email engagement metrics while preserving the existing campaign analytics functionality.

## Problem Statement

Currently, email tracking only works during active campaigns:
- Users cannot see how engaging their emails are day-to-day
- No baseline data exists for comparing campaign performance
- Sales/support teams have no visibility into their email effectiveness
- Admins cannot identify users who may need communication training

## Solution

Implement a **hybrid tracking architecture**:

1. **User Tracking (Always-On)** - Permanent pixel in signature, shows personal engagement
2. **Campaign Tracking (Existing)** - Additional pixel during campaigns, for campaign analytics

```
┌─────────────────────────────────────────────────────────────┐
│                     SIGNATURE HTML                          │
├─────────────────────────────────────────────────────────────┤
│  John Smith                                                 │
│  Sales Manager | Acme Corp                                  │
│  john@acme.com | (555) 123-4567                            │
│                                                             │
│  <!-- Always-on user tracking pixel -->                     │
│  <img src="/api/t/u/abc123.gif" width="1" height="1">      │
│                                                             │
│  <!-- Campaign pixel (only when campaign active) -->        │
│  <img src="/api/t/p/xyz789.gif" width="1" height="1">      │
└─────────────────────────────────────────────────────────────┘
```

## Technical Architecture

### New Database Schema

```sql
-- Always-on user tracking tokens
CREATE TABLE signature_user_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES organization_users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pixel_token VARCHAR(64) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_tracking_org ON signature_user_tracking(organization_id);
CREATE INDEX idx_user_tracking_token ON signature_user_tracking(pixel_token);
```

### Modified Events Schema

```sql
-- Add tracking type to events
ALTER TABLE signature_tracking_events
    ADD COLUMN tracking_type VARCHAR(20) DEFAULT 'campaign'
        CHECK (tracking_type IN ('user', 'campaign')),
    ADD COLUMN user_tracking_id UUID REFERENCES signature_user_tracking(id) ON DELETE CASCADE;

-- Make campaign columns nullable for user tracking
ALTER TABLE signature_tracking_events
    ALTER COLUMN pixel_id DROP NOT NULL,
    ALTER COLUMN campaign_id DROP NOT NULL;

-- Constraint: must have source
ALTER TABLE signature_tracking_events
    ADD CONSTRAINT tracking_source_required CHECK (
        (tracking_type = 'campaign' AND pixel_id IS NOT NULL) OR
        (tracking_type = 'user' AND user_tracking_id IS NOT NULL)
    );
```

### Organization Settings

```sql
-- Add tracking settings to organization_settings
ALTER TABLE organization_settings
    ADD COLUMN tracking_settings JSONB DEFAULT '{
        "user_tracking_enabled": true,
        "campaign_tracking_enabled": true,
        "retention_days": 90,
        "show_user_dashboard": true,
        "exclude_bots": true
    }'::jsonb;
```

### API Endpoints

#### Tracking Pixel Endpoints

```
GET /api/t/u/:token.gif     # User tracking pixel (NEW)
GET /api/t/p/:token.gif     # Campaign tracking pixel (existing)
GET /api/t/health           # Health check (existing)
```

#### User Analytics Endpoints

```
GET /api/tracking/my-stats
  Response: {
    today: { opens: 12, unique: 8 },
    thisWeek: { opens: 47, unique: 32 },
    thisMonth: { opens: 186, unique: 124 },
    trend: { direction: "up", percentage: 12 },
    peakHours: [{ hour: 10, day: "Tuesday", avgOpens: 8.3 }],
    byDevice: { desktop: 65, mobile: 30, tablet: 5 }
  }

GET /api/tracking/my-stats/daily?days=30
  Response: {
    data: [
      { date: "2025-12-01", opens: 15, unique: 11 },
      { date: "2025-12-02", opens: 18, unique: 14 },
      ...
    ]
  }
```

#### Admin Analytics Endpoints

```
GET /api/admin/tracking/organization-stats
  Response: {
    totalOpens: 12847,
    uniqueOpens: 8932,
    activeUsers: 45,
    topPerformers: [
      { userId, name, opens: 342 },
      ...
    ],
    byDepartment: [
      { department: "Sales", opens: 4521, users: 12 },
      ...
    ]
  }

GET /api/admin/tracking/user/:userId/stats
  Response: { /* same as my-stats but for specific user */ }
```

### Token Generation

```typescript
// Token format: 24 character URL-safe random string
// Prefixed in URL path, not in token itself

function generateTrackingToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

// URL paths determine type:
// /api/t/u/{token}.gif = user tracking
// /api/t/p/{token}.gif = campaign tracking
```

### Tracking Event Flow

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Email Opened    │──────│  Pixel Request   │──────│  Record Event    │
│  by Recipient    │      │  /api/t/u/xxx    │      │  (async)         │
└──────────────────┘      └──────────────────┘      └──────────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  Return 1x1 GIF  │
                          │  (immediate)     │
                          └──────────────────┘
```

## User Interface

### Personal Dashboard Widget

```
┌─────────────────────────────────────────────────────────┐
│  📧 My Email Engagement                            ⚙️   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  This Week           vs Last Week                       │
│  ┌─────────────┐     ┌─────────────┐                   │
│  │     47      │     │    ↑ 12%    │                   │
│  │   opens     │     │   vs 42     │                   │
│  └─────────────┘     └─────────────┘                   │
│                                                         │
│  Daily Opens (Last 7 Days)                              │
│  ╭─────────────────────────────────────────────────╮   │
│  │    ▄▄                                           │   │
│  │ ▄▄ ██ ▄▄    ▄▄ ▄▄ ▄▄                           │   │
│  │ ██ ██ ██ ▄▄ ██ ██ ██                           │   │
│  │ M  T  W  Th F  S  Su                           │   │
│  ╰─────────────────────────────────────────────────╯   │
│                                                         │
│  💡 Peak engagement: Tuesdays at 10am                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Admin Team Analytics Page

```
┌─────────────────────────────────────────────────────────┐
│  Team Email Engagement                     Last 30 Days │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Organization Total: 12,847 opens                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Top Performers                                   │   │
│  │ 1. Sarah Chen (Sales)           342 opens       │   │
│  │ 2. Mike Johnson (Support)       298 opens       │   │
│  │ 3. Lisa Park (Marketing)        267 opens       │   │
│  │ 4. Tom Wilson (Sales)           245 opens       │   │
│  │ 5. Amy Lee (Support)            231 opens       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  By Department                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Sales        ████████████████████████  4,521    │   │
│  │ Support      ██████████████████        3,892    │   │
│  │ Marketing    ████████████              2,456    │   │
│  │ Engineering  ████████                  1,978    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Admin Settings Panel

```
┌─────────────────────────────────────────────────────────┐
│  Email Tracking Settings                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ☑️ Enable user engagement tracking                     │
│     Show individual users their email open metrics      │
│                                                         │
│  ☑️ Enable campaign tracking                            │
│     Track opens during signature campaigns              │
│                                                         │
│  ☑️ Show engagement dashboard to users                  │
│     Let users see their own tracking data               │
│                                                         │
│  Data Retention: [90 days ▼]                            │
│     Automatically delete tracking data older than this  │
│                                                         │
│  ☑️ Exclude bot/crawler traffic                         │
│     Filter out automated requests from analytics        │
│                                                         │
│  ⚠️ Privacy Notice                                      │
│  Tracking uses 1x1 pixel images. Some email clients    │
│  block images, so actual engagement may be higher.     │
│  Recipients are not individually identified.            │
│                                                         │
│  [Save Settings]                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Privacy & Compliance

### What We Track
- Open events (timestamp)
- IP address hash (SHA-256, not reversible)
- User agent (device type detection)
- Geographic region (optional, from IP)

### What We DON'T Track
- Recipient identity (who opened)
- Specific email content
- Raw IP addresses
- Cross-organization data

### Data Retention
- Default: 90 days
- Configurable per organization
- Background job purges old events daily

### Required UI Disclaimers

```
ℹ️ About Email Tracking

• Opens are tracked via image loading in signatures
• ~40% of email clients block images by default
• Actual engagement may be higher than shown
• We cannot identify WHO opened your emails
• Multiple opens from same person counted once daily
• Data is retained for [X] days, then automatically deleted
```

## Migration Strategy

### Phase 1: Schema Migration
1. Create `signature_user_tracking` table
2. Alter `signature_tracking_events` table
3. Add settings columns

### Phase 2: Token Generation
1. Generate user tracking tokens for all existing users
2. New users get tokens on creation

### Phase 3: API Implementation
1. Add `/api/t/u/:token.gif` endpoint
2. Add user analytics endpoints
3. Add admin analytics endpoints

### Phase 4: UI Implementation
1. Personal dashboard widget
2. Admin team analytics page
3. Settings panel

### Phase 5: Signature Integration
1. Update signature rendering to include user pixel
2. Conditional inclusion based on org settings

## Performance Considerations

### Event Recording
- Async recording (don't block GIF response)
- Rate limiting per IP (100/min)
- Bot filtering before DB insert

### Analytics Queries
- Denormalized columns for fast aggregation
- Partial indexes for common filters
- Materialized views for dashboard stats (refresh hourly)

### Data Volume Estimate
```
50 users × 20 emails/day × 30% open rate = 300 events/day
300 events × 90 days retention = 27,000 rows per org
```

Manageable for single-tenant deployment.

## Out of Scope

### Per-Email Tracking
Tracking if a SPECIFIC email was read requires:
- Hook into Gmail's send action (not available)
- Per-email unique tokens (not possible with static signatures)

This would require a different architecture (send-through proxy or browser extension).

### Recipient Identification
We intentionally DO NOT track who opened emails:
- Privacy concerns
- Legal implications (GDPR, CCPA)
- Technical limitations

## Success Metrics

1. **User Engagement**: % of users who view their tracking dashboard
2. **Data Quality**: % of events successfully recorded
3. **System Performance**: p99 latency for pixel endpoint < 50ms
4. **Adoption**: % of orgs with user tracking enabled

## Timeline Estimate

| Phase | Tasks | Effort |
|-------|-------|--------|
| 1. Schema | Migration, indexes | 2 hours |
| 2. Tokens | Generation service | 2 hours |
| 3. API | Endpoints, services | 6 hours |
| 4. UI | Dashboard, settings | 8 hours |
| 5. Integration | Signature rendering | 4 hours |
| 6. Testing | E2E, load testing | 4 hours |
| **Total** | | **~26 hours** |

## Dependencies

- Existing campaign tracking system (045_create_campaign_tables.sql)
- Signature rendering service
- Dashboard widget system
- Admin settings infrastructure
