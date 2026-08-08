# Specification: Google Workspace Focused Messaging

## Overview

All user-facing UI messaging should focus on Google Workspace as the primary integration. References to unimplemented integrations (Microsoft 365, Slack, Okta) should be removed from active UI areas.

---

## Requirements

### REQ-001: Setup Page Messaging

**Given** a new user is on the setup page
**Then** the page should mention Google Workspace
**And** the page should NOT mention Microsoft 365
**And** the page should NOT mention Slack
**And** the page should NOT mention "other SaaS platforms"

**Acceptance Criteria:**
- Domain hint focuses on Google Workspace
- "What's Next" section describes Google Workspace sync
- No promises of unimplemented features

### REQ-002: Login Page Messaging

**Given** a user is on the login page
**Then** the feature description should focus on Google Workspace
**And** the description should NOT mention Microsoft 365
**And** the description should NOT mention "multiple platforms"

**Acceptance Criteria:**
- Clear single-platform messaging
- Professional enterprise language
- No misleading feature claims

### REQ-003: Dashboard Widget Visibility

**Given** a logged-in admin user
**When** they view the dashboard
**Then** Microsoft 365 widgets should NOT be visible
**And** Google Workspace widgets should be visible (if GW enabled)
**And** System/Helios widgets should always be visible

**Acceptance Criteria:**
- Widget visibility tied to module enablement
- No empty or broken widget sections
- Graceful handling of disabled modules

### REQ-004: Dashboard Activity Feed

**Given** a logged-in admin user
**When** they view the dashboard activity section
**Then** Microsoft 365 sync activity should NOT be shown
**And** Microsoft 365 sync alerts should NOT be shown

**Acceptance Criteria:**
- Activity feed only shows real activities
- No mock/placeholder activities for disabled modules

### REQ-005: User List Empty State

**Given** a logged-in admin with no synced users
**When** they view the user directory
**Then** the empty state message should reference Google Workspace
**And** the empty state should NOT mention Microsoft 365

**Acceptance Criteria:**
- Clear call-to-action for Google Workspace setup
- No mention of unimplemented platforms

### REQ-006: Groups Platform Filter

**Given** a logged-in admin viewing the groups page
**When** they interact with the platform filter
**Then** Microsoft 365 should NOT be a filter option
**And** Google Workspace should be a filter option
**And** "All Sources" or "Local Only" may be options

**Acceptance Criteria:**
- Filter only shows platforms with actual data
- No misleading filter options

---

## Preserved Functionality

### Settings Page Module Cards

The Settings page should continue to show Microsoft 365 as a module option with "Coming Soon" status. This provides transparency about the product roadmap without implying current functionality.

### Developer Console

The Developer Console may retain M365 commands for development purposes. This is an admin-only tool not visible to regular users.

### Platform Icon Components

The PlatformIcon component should retain Microsoft and Slack icons for future use. These components cause no harm when unused.

---

## Test Scenarios

### Scenario 1: New User Setup Experience
```gherkin
Scenario: New user sees focused Google Workspace setup
  Given I am a new user
  When I navigate to the setup page
  Then I should see "Google Workspace" mentioned
  And I should not see "Microsoft 365" mentioned
  And I should not see "Slack" mentioned
  And the setup flow should guide me toward Google Workspace
```

### Scenario 2: Login Page First Impression
```gherkin
Scenario: Login page presents focused value proposition
  Given I am a visitor on the login page
  When I read the product description
  Then I should understand this is a Google Workspace tool
  And I should not expect Microsoft 365 functionality
```

### Scenario 3: Dashboard After Login
```gherkin
Scenario: Dashboard shows only enabled integrations
  Given I am logged in as an admin
  And Google Workspace is enabled
  And Microsoft 365 is not enabled
  When I view the dashboard
  Then I should see Google Workspace widgets
  And I should not see Microsoft 365 widgets
  And I should not see Microsoft 365 sync status
```

### Scenario 4: Empty User Directory
```gherkin
Scenario: Empty state guides to Google Workspace
  Given I am logged in as an admin
  And no users have been synced
  When I view the user directory
  Then I should see a message about connecting Google Workspace
  And I should not see mention of Microsoft 365
```

### Scenario 5: Groups Filtering
```gherkin
Scenario: Groups filter shows available platforms only
  Given I am logged in as an admin
  When I view the groups page
  And I open the platform filter
  Then I should see "Google Workspace" as an option
  And I should not see "Microsoft 365" as an option
```

---

## Non-Functional Requirements

### NFR-001: Consistency
All messaging changes must be consistent across the application. No partial implementations.

### NFR-002: Reversibility
Changes must be easily reversible via git revert. No database changes.

### NFR-003: No Breakage
Changes must not break existing functionality. All existing features must continue to work.

### NFR-004: Test Coverage
All requirements must have corresponding E2E tests that pass before completion.
