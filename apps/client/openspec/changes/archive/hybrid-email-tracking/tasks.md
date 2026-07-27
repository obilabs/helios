# Hybrid Email Tracking - Implementation Tasks

## Phase 1: Database Schema (2 hours)

### TASK-TRK-001: Create user tracking table migration
**File:** `database/migrations/048_create_user_tracking.sql`

```sql
-- Create signature_user_tracking table
CREATE TABLE IF NOT EXISTS signature_user_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES organization_users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pixel_token VARCHAR(64) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_tracking_org ON signature_user_tracking(organization_id);
CREATE INDEX idx_user_tracking_token ON signature_user_tracking(pixel_token);
CREATE INDEX idx_user_tracking_active ON signature_user_tracking(organization_id) WHERE is_active = true;
```

**Acceptance Criteria:**
- [x] Table created with proper constraints
- [x] Indexes created for performance
- [x] Foreign keys properly reference existing tables
- [x] Migration is idempotent (IF NOT EXISTS)
- **DONE**: Migration 048_create_user_tracking.sql created and run. 34 users tokenized.

---

### TASK-TRK-002: Modify tracking events table
**File:** `database/migrations/048_create_user_tracking.sql` (same file)

```sql
-- Add tracking type column
ALTER TABLE signature_tracking_events
    ADD COLUMN IF NOT EXISTS tracking_type VARCHAR(20) DEFAULT 'campaign'
        CHECK (tracking_type IN ('user', 'campaign'));

-- Add user tracking reference
ALTER TABLE signature_tracking_events
    ADD COLUMN IF NOT EXISTS user_tracking_id UUID REFERENCES signature_user_tracking(id) ON DELETE CASCADE;

-- Make campaign columns nullable
ALTER TABLE signature_tracking_events
    ALTER COLUMN pixel_id DROP NOT NULL,
    ALTER COLUMN campaign_id DROP NOT NULL;

-- Index for user tracking queries
CREATE INDEX IF NOT EXISTS idx_tracking_events_user_tracking
    ON signature_tracking_events(user_tracking_id, timestamp)
    WHERE tracking_type = 'user';
```

**Acceptance Criteria:**
- [x] tracking_type column added with check constraint
- [x] user_tracking_id column added with FK
- [x] Existing campaign tracking still works
- [x] New index for user tracking queries
- **DONE**: Columns added, pixel_id and campaign_id made nullable for user tracking.

---

### TASK-TRK-003: Add organization tracking settings
**File:** `database/migrations/048_create_user_tracking.sql` (same file)

```sql
-- Add tracking settings to organization_settings if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organization_settings'
        AND column_name = 'tracking_settings'
    ) THEN
        ALTER TABLE organization_settings
            ADD COLUMN tracking_settings JSONB DEFAULT '{
                "user_tracking_enabled": true,
                "campaign_tracking_enabled": true,
                "retention_days": 90,
                "show_user_dashboard": true,
                "exclude_bots": true
            }'::jsonb;
    END IF;
END $$;
```

**Acceptance Criteria:**
- [x] Settings column added if not exists
- [x] Default values sensible
- [x] Existing organizations get defaults
- **DONE**: Settings stored as key-value pairs in organization_settings (tracking_user_enabled, tracking_campaign_enabled, tracking_retention_days, tracking_show_user_dashboard, tracking_exclude_bots).

---

## Phase 2: Token Generation Service (2 hours)

### TASK-TRK-004: Create user tracking token service
**File:** `backend/src/services/user-tracking.service.ts`

```typescript
interface UserTrackingToken {
  id: string;
  userId: string;
  organizationId: string;
  pixelToken: string;
  isActive: boolean;
  createdAt: Date;
}

class UserTrackingService {
  generateToken(): string;
  getOrCreateToken(userId: string, organizationId: string): Promise<UserTrackingToken>;
  getTokenByPixel(pixelToken: string): Promise<UserTrackingToken | null>;
  deactivateToken(userId: string): Promise<void>;
  getTokenForUser(userId: string): Promise<UserTrackingToken | null>;
}
```

**Acceptance Criteria:**
- [x] Token generation uses crypto.randomBytes (URL-safe)
- [x] getOrCreateToken is idempotent
- [x] Token lookup is fast (uses index)
- [x] Service exported as singleton
- **DONE**: backend/src/services/user-tracking.service.ts with generateToken(), getOrCreateToken(), getTokenByPixel(), getTokenForUser(), deactivateToken(), activateToken(), getOrganizationTokens(), getUserTrackingSummary(), getOrganizationTrackingSummary(), getPixelUrl(), bulkCreateTokens()

---

### TASK-TRK-005: Generate tokens for existing users
**File:** `database/migrations/048_create_user_tracking.sql` (or separate 049)

```sql
-- Generate tokens for all existing users who don't have one
INSERT INTO signature_user_tracking (user_id, organization_id, pixel_token)
SELECT
    ou.id,
    ou.organization_id,
    encode(gen_random_bytes(18), 'base64')
FROM organization_users ou
WHERE NOT EXISTS (
    SELECT 1 FROM signature_user_tracking sut WHERE sut.user_id = ou.id
)
ON CONFLICT (user_id) DO NOTHING;
```

**Acceptance Criteria:**
- [x] All existing users get tokens
- [x] Tokens are unique
- [x] Migration is idempotent
- **DONE**: 34 existing users tokenized via migration 048.

---

### TASK-TRK-006: Auto-generate token on user creation
**File:** `backend/src/services/user.service.ts` (modify)

After creating a new user, call:
```typescript
await userTrackingService.getOrCreateToken(newUser.id, newUser.organizationId);
```

**Acceptance Criteria:**
- [x] New users automatically get tracking token
- [x] Token created in same transaction if possible
- [x] Failure to create token doesn't block user creation (log error)
- **DONE**: Database trigger `trigger_create_user_tracking` auto-creates tokens on INSERT to organization_users.

---

## Phase 3: Tracking API (6 hours)

### TASK-TRK-007: Add user tracking pixel endpoint
**File:** `backend/src/routes/tracking.routes.ts` (modify)

```typescript
// GET /api/t/u/:token.gif - User tracking pixel
router.get('/u/:token.gif', async (req, res) => {
  // Similar to campaign pixel but uses user_tracking table
  // Record event with tracking_type = 'user'
});
```

**Acceptance Criteria:**
- [x] Returns 1x1 transparent GIF immediately
- [x] Records event asynchronously
- [x] Rate limiting applied
- [x] Bot filtering applied
- [x] Works when user tracking disabled (returns GIF, no record)
- **DONE**: GET /api/t/u/:token.gif endpoint added with rate limiting, bot filtering, async event recording.

---

### TASK-TRK-008: Modify tracking events service for hybrid
**File:** `backend/src/services/tracking-events.service.ts` (modify)

```typescript
interface RecordUserEventInput {
  userTrackingToken: string;
  ipAddress?: string;
  userAgent?: string;
  // ... geo fields
}

async recordUserEvent(input: RecordUserEventInput): Promise<RecordEventResult>;
```

**Acceptance Criteria:**
- [x] New method for user tracking events
- [x] Sets tracking_type = 'user'
- [x] Sets user_tracking_id instead of pixel_id
- [x] Unique detection based on IP hash per user per day
- [x] Existing campaign tracking unchanged
- **DONE**: recordUserEvent(), getUserTrackingEvents(), getUserDailyStats() methods added to tracking-events.service.ts

---

### TASK-TRK-009: Create user analytics service
**File:** `backend/src/services/user-analytics.service.ts` (new)

```typescript
interface UserAnalytics {
  today: { opens: number; unique: number };
  thisWeek: { opens: number; unique: number };
  thisMonth: { opens: number; unique: number };
  trend: { direction: 'up' | 'down' | 'stable'; percentage: number };
  peakHours: Array<{ hour: number; day: string; avgOpens: number }>;
  byDevice: { desktop: number; mobile: number; tablet: number };
}

class UserAnalyticsService {
  getMyStats(userId: string): Promise<UserAnalytics>;
  getDailyStats(userId: string, days: number): Promise<DailyStats[]>;
}
```

**Acceptance Criteria:**
- [x] Efficient queries with proper indexes
- [x] Trend calculation compares current vs previous period
- [x] Peak hours based on historical data
- [x] Device breakdown from user_agent parsing
- **DONE**: backend/src/services/user-analytics.service.ts with getMyStats(), getDailyStats(), getQuickSummary(), getHourlyStats(), getPeriodStats(), getPeakHours(), getDeviceBreakdown(), calculateTrend()

---

### TASK-TRK-010: Create admin analytics service
**File:** `backend/src/services/admin-analytics.service.ts` (new)

```typescript
interface OrgAnalytics {
  totalOpens: number;
  uniqueOpens: number;
  activeUsers: number;
  topPerformers: Array<{ userId: string; name: string; opens: number }>;
  byDepartment: Array<{ department: string; opens: number; users: number }>;
}

class AdminAnalyticsService {
  getOrganizationStats(orgId: string, days: number): Promise<OrgAnalytics>;
  getUserStats(userId: string): Promise<UserAnalytics>;
}
```

**Acceptance Criteria:**
- [x] Aggregates across all users in org
- [x] Top performers sorted by opens
- [x] Department breakdown with user counts
- [x] Efficient queries (consider materialized views for large orgs)
- **DONE**: backend/src/services/admin-analytics.service.ts with getOrganizationStats(), getUserStats(), getEngagementTrend(), getOrgPeakHours(), getOrgDeviceStats(), getInactiveTrackedUsers()

---

### TASK-TRK-011: Create user analytics routes
**File:** `backend/src/routes/tracking-analytics.routes.ts` (new)

```typescript
// User endpoints
GET /api/tracking/my-stats
GET /api/tracking/my-stats/daily?days=30

// Admin endpoints
GET /api/admin/tracking/organization-stats?days=30
GET /api/admin/tracking/user/:userId/stats
```

**Acceptance Criteria:**
- [x] User endpoints require authentication
- [x] Admin endpoints require admin role
- [x] Proper error handling
- [x] Response format matches spec
- **DONE**: backend/src/routes/tracking-analytics.routes.ts with 12 endpoints: /my-stats, /my-stats/daily, /my-stats/summary, /admin/tracking/organization-stats, /admin/tracking/user/:userId/stats, /admin/tracking/trend, /admin/tracking/peak-hours, /admin/tracking/devices, /admin/tracking/inactive-users

---

### TASK-TRK-012: Add tracking settings endpoints
**File:** `backend/src/routes/settings.routes.ts` (modify)

```typescript
GET /api/settings/tracking
PUT /api/settings/tracking
```

**Acceptance Criteria:**
- [x] Get returns current tracking settings
- [x] Put validates and updates settings
- [x] Admin role required
- [x] Changes take effect immediately
- **DONE**: Added GET/PUT /api/v1/settings/tracking endpoints to tracking-analytics.routes.ts

---

## Phase 4: Frontend UI (8 hours)

### TASK-TRK-013: Create email engagement dashboard widget
**File:** `frontend/src/components/widgets/EmailEngagementWidget.tsx` (new)

```typescript
interface EmailEngagementWidgetProps {
  className?: string;
}

// Shows:
// - This week opens vs last week
// - 7-day chart
// - Peak engagement time
```

**Acceptance Criteria:**
- [x] Fetches data from /api/tracking/my-stats
- [x] Shows loading state
- [x] Shows error state gracefully
- [x] Responsive design
- [x] Follows design system (no emojis in prod)
- **DONE**: Created `frontend/src/components/widgets/EmailEngagementWidget.tsx` with CSS, fetches stats and daily data, shows 7-day mini bar chart, trend indicator, peak time

---

### TASK-TRK-014: Create engagement trend chart component
**File:** `frontend/src/components/charts/EngagementChart.tsx` (new)

```typescript
interface EngagementChartProps {
  data: Array<{ date: string; opens: number; unique: number }>;
  height?: number;
}
```

**Acceptance Criteria:**
- [x] Bar or line chart for daily opens
- [x] Tooltip on hover
- [x] Responsive sizing
- [x] Uses CSS-based bars (no external chart library needed)
- **DONE**: Created `frontend/src/components/charts/EngagementChart.tsx` with CSS, bar chart with y-axis labels, legend, responsive design

---

### TASK-TRK-015: Add widget to user dashboard
**File:** `frontend/src/App.tsx` (modify)

Add EmailEngagementWidget to the dashboard for all users.

**Acceptance Criteria:**
- [x] Widget appears in dashboard
- [x] Proper grid placement (below alerts section)
- [x] CSS styling added to App.css
- **DONE**: Added EmailEngagementWidget to dashboard in App.tsx with dashboard-engagement-section styling

---

### TASK-TRK-016: Create admin team analytics page
**File:** `frontend/src/pages/admin/TeamAnalytics.tsx` (new)

Full page showing:
- Organization total stats
- Top performers list
- Department breakdown
- Date range selector

**Acceptance Criteria:**
- [x] Fetches from /api/admin/tracking/organization-stats
- [x] Top performers shows name, department, opens
- [x] Department breakdown table
- [x] Date range filter (7, 30, 90 days)
- [x] Device breakdown with progress bars
- [x] Peak hours list
- **DONE**: Created `frontend/src/pages/admin/TeamAnalytics.tsx` with CSS, full analytics page with stats grid, charts, top performers, devices, peak hours, departments

---

### TASK-TRK-017: Create tracking settings panel
**File:** `frontend/src/components/settings/TrackingSettings.tsx` (new)

Admin settings panel for:
- Enable/disable user tracking
- Enable/disable campaign tracking
- Show/hide user dashboard
- Data retention period
- Bot filtering toggle

**Acceptance Criteria:**
- [x] Toggle switches for boolean settings
- [x] Dropdown for retention days
- [x] Save button with loading state
- [x] Success/error feedback
- [x] Privacy disclaimer text
- **DONE**: Created `frontend/src/components/settings/TrackingSettings.tsx` with CSS, toggle switches, retention dropdown, save/reset buttons, privacy notice

---

### TASK-TRK-018: Add tracking settings to admin settings page
**File:** `frontend/src/components/Settings.tsx` (modify)

Add TrackingSettings to the Advanced tab.

**Acceptance Criteria:**
- [x] Settings accessible from admin settings Advanced tab
- [x] Proper import and placement
- **DONE**: Added TrackingSettings import and component to Settings.tsx in the Advanced tab section

---

### TASK-TRK-019: Add navigation for team analytics
**File:** `frontend/src/components/navigation/AdminNavigation.tsx` (modify)

Add "Team Analytics" link under Insights section.

**Acceptance Criteria:**
- [x] Link visible only to admins
- [x] Proper icon (BarChart2)
- [x] Active state when on page
- [x] Route added to App.tsx
- **DONE**: Added Team Analytics nav item to AdminNavigation.tsx Insights section with BarChart2 icon, added lazy import and route in App.tsx

---

## Phase 5: Signature Integration (4 hours)

### TASK-TRK-020: Update signature rendering to include user pixel
**File:** `backend/src/services/signature-template.service.ts` (modify)

When rendering a signature, include the user tracking pixel if:
- Organization has user_tracking_enabled = true
- User has an active tracking token

```html
<!-- User tracking pixel -->
<img src="https://app.example.com/api/t/u/{token}.gif"
     width="1" height="1" alt="" style="display:none;">
```

**Acceptance Criteria:**
- [x] Pixel included when tracking enabled
- [x] Pixel excluded when tracking disabled
- [x] Uses correct domain from org settings (PUBLIC_URL env var)
- [x] Hidden with CSS (display:none, 1x1)
- [x] Does not interfere with campaign pixels
- **DONE**: Added `renderTemplateWithTracking()` method to signature-template.service.ts that:
  - Checks organization tracking settings from organization_settings table
  - Retrieves user tracking token from signature_user_tracking table
  - Appends hidden tracking pixel to rendered HTML
  - Updated signature-sync.service.ts to use this new method

---

### TASK-TRK-021: Update signature preview to show tracking indicator
**File:** `frontend/src/components/signatures/TemplatePreview.tsx` (modify)

Show indicator that tracking pixel is included (for transparency).

**Acceptance Criteria:**
- [x] Small indicator "Tracking enabled" when pixel included
- [x] Tooltip explaining what it means
- [x] Hidden in actual signature output
- **DONE**: Added tracking indicator to TemplatePreview component:
  - Green banner with Activity icon shows "Engagement tracking enabled"
  - Info tooltip explains tracking pixel will be included
  - Only shows when a real user (not sample data) is selected
  - Backend preview endpoint now returns trackingEnabled flag
  - CSS styling in TemplatePreview.css with pulse animation

---

## Phase 6: Data Retention & Maintenance (4 hours)

### TASK-TRK-022: Create data retention background job
**File:** `backend/src/jobs/tracking-retention.job.ts` (new)

```typescript
// Runs daily, deletes events older than retention period
async function purgeOldTrackingEvents(): Promise<number>;
```

**Acceptance Criteria:**
- [x] Respects per-org retention_days setting
- [x] Deletes in batches to avoid lock contention
- [x] Logs number of deleted records
- [x] Can be triggered manually
- **DONE**: Created tracking-retention.job.ts with:
  - Per-org retention settings (default 90 days)
  - Batch deletion (1000 records per batch)
  - Detailed logging
  - Manual trigger function `triggerTrackingRetention()`
  - Status reporting function `getRetentionStatus()`

---

### TASK-TRK-023: Add retention job to scheduler
**File:** `backend/src/index.ts` (modify)

Schedule purgeOldTrackingEvents to run daily at 3am.

**Acceptance Criteria:**
- [x] Job runs daily at 3am
- [x] Non-blocking (runs in background with setTimeout.unref())
- [x] Error handling and logging
- **DONE**: Added job to index.ts startup:
  - Import and start/stop functions
  - Configurable via TRACKING_RETENTION_ENABLED env var
  - Added to graceful shutdown handlers

---

### TASK-TRK-024: Create materialized view for analytics (optional)
**File:** `database/migrations/049_tracking_analytics_views.sql` (new)

```sql
-- Materialized view for faster dashboard queries
CREATE MATERIALIZED VIEW IF NOT EXISTS user_tracking_daily_stats AS
SELECT
    user_id,
    organization_id,
    DATE(timestamp) as day,
    COUNT(*) as total_opens,
    COUNT(DISTINCT ip_address_hash) as unique_opens
FROM signature_tracking_events
WHERE tracking_type = 'user'
GROUP BY user_id, organization_id, DATE(timestamp);

-- Refresh hourly via pg_cron or app scheduler
```

**Acceptance Criteria:**
- [ ] View created with proper indexes
- [ ] Refresh mechanism documented
- [ ] Queries use view when beneficial

---

## Phase 7: Testing (4 hours)

### TASK-TRK-025: Unit tests for user tracking service
**File:** `backend/src/__tests__/user-tracking.service.test.ts`

**Acceptance Criteria:**
- [x] Token generation uniqueness
- [x] getOrCreateToken idempotency
- [x] Token lookup by pixel
- [x] Deactivation
- **DONE**: 28 tests covering all service methods - 2025-12-11

---

### TASK-TRK-026: Unit tests for analytics services
**File:** `backend/src/__tests__/user-analytics.service.test.ts`, `backend/src/__tests__/admin-analytics.service.test.ts`

**Acceptance Criteria:**
- [x] Stats calculation correctness
- [x] Trend direction logic
- [x] Empty data handling
- **DONE**: 34 tests covering user and admin analytics services - 2025-12-11

---

### TASK-TRK-027: Integration tests for tracking endpoints
**File:** `backend/src/__tests__/tracking.routes.test.ts`

**Acceptance Criteria:**
- [x] User pixel returns GIF
- [x] Events recorded correctly
- [x] Rate limiting works
- [x] Bot filtering works
- **DONE**: 19 tests for tracking routes + 4 todo placeholders - 2025-12-11

---

### TASK-TRK-028: E2E tests for dashboard widget
**File:** `e2e/tests/email-tracking.spec.ts`

**Acceptance Criteria:**
- [x] Widget loads on dashboard
- [x] Shows correct data
- [x] Handles errors gracefully
- **DONE**: E2E tests for dashboard widget, team analytics, tracking settings, and pixel endpoints - 2025-12-11

---

### TASK-TRK-029: Load testing for pixel endpoint
**File:** `backend/src/__tests__/tracking.load.test.ts`

**Acceptance Criteria:**
- [ ] p99 < 50ms under load
- [ ] No errors under 1000 req/sec
- [ ] Memory stable

---

## Summary

| Phase | Tasks | Estimated Hours |
|-------|-------|-----------------|
| 1. Schema | TRK-001 to TRK-003 | 2 |
| 2. Tokens | TRK-004 to TRK-006 | 2 |
| 3. API | TRK-007 to TRK-012 | 6 |
| 4. UI | TRK-013 to TRK-019 | 8 |
| 5. Integration | TRK-020 to TRK-021 | 4 |
| 6. Retention | TRK-022 to TRK-024 | 4 |
| 7. Testing | TRK-025 to TRK-029 | 4 |
| **Total** | **29 tasks** | **~30 hours** |

## Task Dependencies

```
TRK-001 ─┬─> TRK-004 ─┬─> TRK-007 ─> TRK-013
TRK-002 ─┤            │
TRK-003 ─┘            ├─> TRK-008 ─> TRK-009 ─> TRK-011
                      │
                      └─> TRK-005 ─> TRK-006

TRK-009 ─> TRK-013 ─> TRK-015
TRK-010 ─> TRK-016

TRK-012 ─> TRK-017 ─> TRK-018

TRK-004 ─> TRK-020 ─> TRK-021

All implementation ─> TRK-022 to TRK-029 (Testing)
```

## Priority Order

1. **Must Have (P0):** TRK-001 to TRK-008, TRK-020 (core functionality)
2. **Should Have (P1):** TRK-009 to TRK-015 (analytics & UI)
3. **Nice to Have (P2):** TRK-016 to TRK-019, TRK-022 to TRK-024 (admin features)
4. **Testing (P0):** TRK-025 to TRK-029 (required before release)
