# Specifications: Org Chart Seed Data & Remove UI Placeholders

## SPEC-SEED-001: Seed Data Population

**Requirement:** Database contains realistic test users with proper org structure.

### Scenario: Seed migration creates users
```gherkin
Given the database has an organization
When I run migration 039_seed_test_users_and_org_chart.sql
Then 28 users should exist in organization_users
And each user should have an email, first_name, last_name
And each user should have a department assignment
```

### Scenario: Manager hierarchy is correct
```gherkin
Given seed data has been loaded
When I query users with their managers
Then Jack Chen (CEO) should have manager_id = NULL
And Sarah Chen (CTO) should report to Jack Chen
And Michael Rodriguez (VP Engineering) should report to Sarah Chen
And David Kim (Engineering Manager) should report to Michael Rodriguez
And Emily Watson (Senior Engineer) should report to David Kim
```

### Scenario: Orphaned users exist
```gherkin
Given seed data has been loaded
When I query for users with reporting_manager_id = NULL
Then I should find exactly 4 users (1 CEO + 3 orphans)
And the orphans should be:
  | Name | Reason |
  | Frank Thompson | Contractor |
  | Grace Liu | New hire |
  | Jake Roberts | Intern |
```

### Scenario: Migration is idempotent
```gherkin
Given seed data has been loaded once
When I run the migration again
Then no errors should occur
And the user count should still be 28
And existing data should not be duplicated
```

---

## SPEC-SEED-002: Org Chart Query

**Requirement:** Org chart can be queried recursively.

### Scenario: Get full org hierarchy
```gherkin
Given seed data has been loaded
When I call get_org_hierarchy(NULL)
Then I should receive all users in hierarchical order
And level 0 should contain CEO
And level 1 should contain C-Suite (4 users)
And level 2 should contain VPs (2 users)
And level 3 should contain Managers (7 users)
And level 4 should contain Staff (11 users)
```

### Scenario: Get subtree from manager
```gherkin
Given seed data has been loaded
When I call get_org_hierarchy(michael_rodriguez_id)
Then I should receive Michael Rodriguez and all reports
And result should include David Kim, Rachel Green
And result should include their direct reports
And result should NOT include Sarah Chen (his manager)
```

### Scenario: Get direct reports count
```gherkin
Given seed data has been loaded
When I call get_direct_reports_count(david_kim_id)
Then I should receive 3
Because David Kim has 3 direct reports (Emily, James, Lisa)
```

### Scenario: Get total reports count (including indirect)
```gherkin
Given seed data has been loaded
When I call get_total_reports_count(sarah_chen_id)
Then I should receive the count of all people under CTO
Including VPs, Managers, and Staff in Tech org
```

---

## SPEC-SEED-003: Department Assignment

**Requirement:** Users are assigned to correct departments.

### Scenario: Department counts
```gherkin
Given seed data has been loaded
When I count users by department
Then Executive should have 5 users
And Engineering should have 8 users
And Product should have 4 users
And Finance should have 3 users
And Marketing should have 4 users
And Operations should have 2 users
And Human Resources should have 2 users
```

### Scenario: User has one department
```gherkin
Given seed data has been loaded
When I query any user
Then they should have exactly one department_id
And department_id should reference a valid department
```

---

## SPEC-SEED-004: Groups and Teams

**Requirement:** Static and dynamic groups exist with correct membership.

### Scenario: Leadership Team group
```gherkin
Given seed data has been loaded
When I query the Leadership Team group
Then it should be a static group
And it should contain all C-Suite members (5 users)
And it should contain all VPs (2 users)
And total membership should be 7
```

### Scenario: Tech Team dynamic group
```gherkin
Given seed data has been loaded
And Tech Team has rule: department = Engineering OR Product
When I evaluate the dynamic group rules
Then membership should include all Engineering users (8)
And membership should include all Product users (4)
And total should be 12 users
```

### Scenario: Project Phoenix cross-functional team
```gherkin
Given seed data has been loaded
When I query Project Phoenix group
Then it should contain:
  | User | Department |
  | Emily Watson | Engineering |
  | Sophia Garcia | Product |
  | Jessica Chen | Marketing |
  | Nathan Brown | Product |
And members should be from different departments
```

---

## SPEC-SEED-005: No Placeholder Data in UI

**Requirement:** UI shows real data from database, not hardcoded values.

### Scenario: Dashboard shows real user count
```gherkin
Given seed data has been loaded (28 users)
When I navigate to the Dashboard
Then the Users stat card should show "28"
And it should NOT show a hardcoded value like "25"
And the data should come from an API call
```

### Scenario: Dashboard shows real group count
```gherkin
Given seed data has been loaded
And 4 groups exist
When I navigate to the Dashboard
Then the Groups stat card should show the actual count
And it should NOT show "0" or a hardcoded value
```

### Scenario: Roles section shows real counts
```gherkin
Given seed data has been loaded
When I navigate to Settings > Roles
Then each role should show the actual user count
And the count should match database query
And it should NOT say "25 users" if there are 28
```

### Scenario: No placeholder role descriptions
```gherkin
Given I am viewing the Roles section
Then I should NOT see "System role: Standard user with access to personal profile and assigned resources"
Unless that is genuinely a dynamic description
And static placeholder text should be removed
```

---

## SPEC-SEED-006: Orphan Detection

**Requirement:** System can identify and display orphaned users.

### Scenario: API returns orphaned users
```gherkin
Given seed data has been loaded
When I call GET /api/users/orphans
Then I should receive 3 users
And response should include Frank Thompson, Grace Liu, Jake Roberts
And response should NOT include Jack Chen (CEO is intentionally top-level)
```

### Scenario: Dashboard shows orphan warning
```gherkin
Given there are 3 orphaned users
When I navigate to the Dashboard as admin
Then I should see a warning indicator
And clicking it should show orphaned user list
And I should be able to assign managers
```

### Scenario: Assigning manager removes orphan status
```gherkin
Given Grace Liu is an orphan (no manager)
When I assign Stephanie Davis as her manager
Then Grace Liu should no longer appear in orphans list
And org chart should show her under Stephanie
```

---

## SPEC-SEED-007: API Endpoint Correctness

**Requirement:** API endpoints return correct data.

### Scenario: GET /api/users/count
```gherkin
Given seed data has been loaded
When I call GET /api/users/count
Then response should include total: 28
And response should include active: 28
And response should include by_department breakdown
```

### Scenario: GET /api/users with filters
```gherkin
Given seed data has been loaded
When I call GET /api/users?department=Engineering
Then I should receive 8 users
And all should have department = "Engineering"
```

### Scenario: GET /api/org-chart
```gherkin
Given seed data has been loaded
When I call GET /api/org-chart
Then I should receive hierarchical structure
And CEO should be at root
And each user should have children array
And orphans should be in separate array
```
