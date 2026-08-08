# Specifications: Admin/User UI Separation

## SPEC-AUS-001: External Admin Navigation

**Requirement:** External admins (MSPs, IT consultants) should only see Admin Console features.

### Scenario: External admin login
```gherkin
Given I am an external admin (is_external_admin = true)
And I am not an employee in the organization
When I log in to the system
Then I should be directed to /admin/dashboard
And I should see the Admin Console navigation
And I should NOT see a view switcher
```

### Scenario: External admin navigation items
```gherkin
Given I am logged in as an external admin
When I view the sidebar navigation
Then I should see "Dashboard" link
And I should see "Directory" section with "Users", "Groups", "Devices"
And I should see "Security" section with "Audit Logs", "Policies"
And I should see "Settings" section
And I should NOT see "People", "My Team", "My Profile"
```

### Scenario: External admin blocked from user routes
```gherkin
Given I am logged in as an external admin
When I try to navigate to /people
Then I should be redirected to /admin/dashboard
And I should see a message "This feature is for employees only"

When I try to navigate to /my-team
Then I should be redirected to /admin/dashboard

When I try to navigate to /my-profile
Then I should be redirected to /admin/dashboard
```

---

## SPEC-AUS-002: Internal Admin Navigation

**Requirement:** Internal admins (employees with admin rights) can switch between Admin and Employee views.

### Scenario: Internal admin login
```gherkin
Given I am an internal admin (isAdmin = true AND isEmployee = true)
When I log in to the system
Then I should be directed to /admin/dashboard (or my last view)
And I should see the Admin Console navigation
And I should see a view switcher in the header
```

### Scenario: View switcher visibility
```gherkin
Given I am logged in as an internal admin
When I view the header
Then I should see a view switcher dropdown
And it should show "Admin Console" as the current view
And clicking it should show options: "Admin Console", "Employee View"
```

### Scenario: Switch to employee view
```gherkin
Given I am logged in as an internal admin
And I am in Admin Console view
When I click the view switcher
And I select "Employee View"
Then I should be redirected to /dashboard (user home)
And the navigation should change to user navigation
And I should see "People", "My Team", "My Profile"
And I should NOT see "Users", "Groups" admin items
And the view switcher should show "Employee View"
```

### Scenario: Switch back to admin view
```gherkin
Given I am in Employee View as an internal admin
When I click the view switcher
And I select "Admin Console"
Then I should be redirected to /admin/dashboard
And the navigation should change to admin navigation
And I should see admin features again
```

### Scenario: View preference persistence
```gherkin
Given I am an internal admin
And I switched to Employee View
When I log out and log back in
Then I should be directed to my last used view (Employee View)
And the view switcher should show "Employee View"
```

---

## SPEC-AUS-003: Regular User Navigation

**Requirement:** Regular employees should only see Employee View features.

### Scenario: Regular user login
```gherkin
Given I am a regular user (isAdmin = false AND isEmployee = true)
When I log in to the system
Then I should be directed to /dashboard (user home)
And I should see the Employee View navigation
And I should NOT see a view switcher
```

### Scenario: Regular user navigation items
```gherkin
Given I am logged in as a regular user
When I view the sidebar navigation
Then I should see "Home" link
And I should see "People" link
And I should see "My Team" link
And I should see "My Groups" link
And I should see "My Profile" link
And I should see "Settings" (personal preferences)
And I should NOT see "Users", "Groups", "Devices" admin items
And I should NOT see "Audit Logs", "Policies"
And I should NOT see admin "Settings" items
```

### Scenario: Regular user blocked from admin routes
```gherkin
Given I am logged in as a regular user
When I try to navigate to /admin/dashboard
Then I should be redirected to /dashboard
And I should see a message "You don't have admin access"

When I try to navigate to /admin/users
Then I should be redirected to /dashboard

When I try to navigate to /admin/settings
Then I should be redirected to /dashboard
```

---

## SPEC-AUS-004: Route Structure

**Requirement:** Admin and user routes should be clearly separated.

### Scenario: Admin route prefix
```gherkin
Given I am logged in as an admin
When I navigate to user management
Then the URL should be /admin/users

When I navigate to group management
Then the URL should be /admin/groups

When I navigate to system settings
Then the URL should be /admin/settings
```

### Scenario: User routes at root
```gherkin
Given I am logged in as an employee
When I navigate to People directory
Then the URL should be /people

When I navigate to My Team
Then the URL should be /my-team

When I navigate to My Profile
Then the URL should be /my-profile
```

### Scenario: Legacy URL redirects
```gherkin
Given old URLs exist in bookmarks or documentation
When I navigate to /users (old URL)
Then I should be redirected to /admin/users

When I navigate to /groups (old URL)
Then I should be redirected to /admin/groups

When I navigate to /settings/modules (old URL)
Then I should be redirected to /admin/settings/modules
```

---

## SPEC-AUS-005: API Access Control

**Requirement:** API endpoints should enforce access based on user type.

### Scenario: Admin API access
```gherkin
Given I am authenticated as an admin
When I call GET /api/organization/users
Then I should receive a 200 response with user list

Given I am authenticated as a regular user
When I call GET /api/organization/users
Then I should receive a 403 Forbidden response
```

### Scenario: Employee API access
```gherkin
Given I am authenticated as an employee (internal admin or regular user)
When I call GET /api/people
Then I should receive a 200 response with people list

Given I am authenticated as an external admin (not an employee)
When I call GET /api/people
Then I should receive a 403 Forbidden response
And the error message should say "This endpoint requires employee access"
```

### Scenario: My Team API access
```gherkin
Given I am authenticated as an employee
When I call GET /api/me/team
Then I should receive a 200 response with my team data

Given I am authenticated as an external admin
When I call GET /api/me/team
Then I should receive a 403 Forbidden response
```

---

## SPEC-AUS-006: Session and Authentication

**Requirement:** User session should include access flags.

### Scenario: Login response includes access flags
```gherkin
Given I am a valid user
When I successfully log in
Then the response should include:
  | Field | Description |
  | isAdmin | Whether user has admin rights |
  | isEmployee | Whether user has employee profile |
  | canAccessAdminUI | Derived from isAdmin |
  | canAccessUserUI | Derived from isEmployee |
  | defaultView | 'admin' or 'user' based on user type |
```

### Scenario: External admin session
```gherkin
Given I am an external admin
When I view my session data
Then isAdmin should be true
And isEmployee should be false
And canAccessAdminUI should be true
And canAccessUserUI should be false
And defaultView should be 'admin'
```

### Scenario: Internal admin session
```gherkin
Given I am an internal admin
When I view my session data
Then isAdmin should be true
And isEmployee should be true
And canAccessAdminUI should be true
And canAccessUserUI should be true
And defaultView should be 'admin' (or last preference)
```

### Scenario: Regular user session
```gherkin
Given I am a regular employee
When I view my session data
Then isAdmin should be false
And isEmployee should be true
And canAccessAdminUI should be false
And canAccessUserUI should be true
And defaultView should be 'user'
```

---

## SPEC-AUS-007: Navigation Components

**Requirement:** Navigation should render appropriate items based on current view.

### Scenario: Admin navigation structure
```gherkin
Given I am in Admin Console view
When the sidebar renders
Then I should see these sections in order:
  | Section | Items |
  | (top) | Dashboard |
  | Directory | Users, Groups, Devices |
  | Security | Audit Logs, Policies |
  | Settings | Modules, Master Data, Organization, Integrations |
```

### Scenario: User navigation structure
```gherkin
Given I am in Employee View
When the sidebar renders
Then I should see these items in order:
  | Item | Description |
  | Home | User dashboard/home |
  | People | Browse coworker directory |
  | My Team | Manager, peers, reports |
  | My Groups | Groups I belong to |
  | My Profile | Edit my profile |
  | Settings | Personal preferences |
```

### Scenario: Navigation highlighting
```gherkin
Given I am on the /admin/users page
When I view the sidebar
Then "Users" should be highlighted as active
And the "Directory" section should be expanded

Given I am on the /people page
When I view the sidebar
Then "People" should be highlighted as active
```

---

## SPEC-AUS-008: View Onboarding

**Requirement:** Internal admins should understand the dual-view system.

### Scenario: First-time internal admin onboarding
```gherkin
Given I am an internal admin
And this is my first login
When I reach the dashboard
Then I should see an onboarding tooltip or modal
And it should explain "You have access to both Admin Console and Employee View"
And it should show how to switch views
And I should be able to dismiss it
```

### Scenario: Remember onboarding completion
```gherkin
Given I completed the view onboarding
When I log in again
Then I should NOT see the onboarding tooltip
```

---

## SPEC-AUS-009: Error Handling

**Requirement:** Access denied should be handled gracefully.

### Scenario: Deep link to restricted admin page
```gherkin
Given I am a regular user
And I have a bookmark to /admin/settings
When I click the bookmark
Then I should be redirected to /dashboard
And I should see a toast message "Admin access required"
And the redirect should happen smoothly without errors
```

### Scenario: Deep link to restricted user page
```gherkin
Given I am an external admin
And I have a bookmark to /my-profile
When I click the bookmark
Then I should be redirected to /admin/dashboard
And I should see a toast message "This feature is for employees"
```

### Scenario: Session expires during view switch
```gherkin
Given I am an internal admin
And my session has expired
When I try to switch views
Then I should be redirected to the login page
And after logging in I should return to my intended view
```

---

## SPEC-AUS-010: Audit Logging

**Requirement:** View switches should be logged for security.

### Scenario: Log view switch
```gherkin
Given I am an internal admin
When I switch from Admin Console to Employee View
Then an audit log entry should be created
And it should include:
  | Field | Value |
  | action | view_switch |
  | from_view | admin |
  | to_view | user |
  | user_id | my user ID |
  | timestamp | current time |
```

### Scenario: Log failed access attempts
```gherkin
Given I am a regular user
When I try to access /admin/users via direct URL
Then an audit log entry should be created
And it should include:
  | Field | Value |
  | action | access_denied |
  | route | /admin/users |
  | reason | insufficient_permissions |
  | user_id | my user ID |
```
