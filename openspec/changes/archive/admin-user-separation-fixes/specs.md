# Specifications: Admin/User Separation Bug Fixes

## SPEC-FIX-001: Persistent ViewSwitcher

**Requirement:** Internal admins must always see the ViewSwitcher in the header.

### Scenario: ViewSwitcher visible after login
```gherkin
Given I am an internal admin (isAdmin=true AND isEmployee=true)
When I log in to the system
Then I should see the ViewSwitcher in the header
And it should display my current view (e.g., "Admin Console")
And the ViewSwitcher should be positioned before my avatar
```

### Scenario: ViewSwitcher persists across pages
```gherkin
Given I am logged in as an internal admin
And I can see the ViewSwitcher in the header
When I navigate to different pages (Dashboard, Users, Settings)
Then the ViewSwitcher should remain visible on every page
And it should always show my current view
```

### Scenario: ViewSwitcher after onboarding
```gherkin
Given I am an internal admin
And I have completed the initial view onboarding
When I log in on subsequent sessions
Then I should NOT see the onboarding modal again
And I should see the ViewSwitcher in the header immediately
```

### Scenario: Switch from Admin to User view
```gherkin
Given I am logged in as an internal admin
And I am currently in Admin Console view
When I click the ViewSwitcher dropdown
And I select "Employee View"
Then I should be navigated to /dashboard (user home)
And the navigation sidebar should show user items (People, My Team, My Profile)
And the ViewSwitcher should now show "Employee View"
```

### Scenario: Switch from User to Admin view
```gherkin
Given I am logged in as an internal admin
And I am currently in Employee View
When I click the ViewSwitcher dropdown
And I select "Admin Console"
Then I should be navigated to /admin/dashboard
And the navigation sidebar should show admin items (Users, Groups, Settings)
And the ViewSwitcher should now show "Admin Console"
```

### Scenario: ViewSwitcher not visible for external admins
```gherkin
Given I am an external admin (isAdmin=true AND isEmployee=false)
When I log in to the system
Then I should NOT see a ViewSwitcher in the header
And I should only have access to Admin Console
```

### Scenario: ViewSwitcher not visible for regular users
```gherkin
Given I am a regular user (isAdmin=false AND isEmployee=true)
When I log in to the system
Then I should NOT see a ViewSwitcher in the header
And I should only have access to Employee View
```

---

## SPEC-FIX-002: Context-Aware Settings Link

**Requirement:** Settings link in avatar dropdown must respect current view context.

### Scenario: Settings link in Admin view
```gherkin
Given I am logged in as an internal admin
And I am in Admin Console view
When I click my avatar/initials in the header
And I click "Settings" from the dropdown
Then I should be navigated to /admin/settings
And I should see system configuration options (Modules, Master Data, etc.)
```

### Scenario: Settings link in User view
```gherkin
Given I am logged in as an internal admin
And I am in Employee View
When I click my avatar/initials in the header
And I click "Settings" from the dropdown
Then I should be navigated to /my-profile OR /settings
And I should see personal settings options (Profile, Privacy, Notifications)
And I should NOT see admin configuration (Modules, Master Data, etc.)
```

### Scenario: Regular user settings
```gherkin
Given I am logged in as a regular user
When I click my avatar/initials in the header
And I click "Settings" from the dropdown
Then I should be navigated to /my-profile OR /settings
And I should see personal settings only
And I should NOT see any admin configuration options
```

### Scenario: Settings dropdown shows correct label
```gherkin
Given I am in Employee View
When I click my avatar dropdown
Then the Settings option should be labeled "Settings" or "My Settings"
And it should NOT be labeled "Admin Settings" or "System Settings"
```

---

## SPEC-FIX-003: Dashboard Modern Design

**Requirement:** Dashboard must display modern sleek widget design per DESIGN-SYSTEM.md.

### Scenario: Dashboard widget styling
```gherkin
Given I am logged in
When I navigate to the Dashboard
Then I should see stat widgets with:
  | Property | Expected |
  | Border radius | 8px or rounded-lg |
  | Shadow | Subtle shadow (shadow-sm) |
  | Background | White (#ffffff) |
  | Padding | Consistent (16px or 24px) |
  | Typography | Clean, professional fonts |
```

### Scenario: Dashboard responsive layout
```gherkin
Given I am on the Dashboard
When I view on desktop (>1024px)
Then widgets should be in a multi-column grid layout

When I view on tablet (768px-1024px)
Then widgets should adjust to fewer columns

When I view on mobile (<768px)
Then widgets should stack vertically
```

### Scenario: Dashboard color scheme
```gherkin
Given I am on the Dashboard
Then widget accent colors should use purple (#8b5cf6) for primary elements
And text should use neutral grays per DESIGN-SYSTEM.md
And there should be no chunky borders or heavy shadows
```

---

## SPEC-FIX-004: Dashboard Stats Display

**Requirement:** Dashboard must display accurate stats from the database.

### Scenario: User count displays correctly
```gherkin
Given there are 5 users in the organization_users table
When I navigate to the Dashboard
Then the "Users" stat widget should display "5"
And it should NOT display "0" or be empty
```

### Scenario: Group count displays correctly
```gherkin
Given there are 3 groups in the access_groups table
When I navigate to the Dashboard
Then the "Groups" stat widget should display "3"
And it should NOT display "0" or be empty
```

### Scenario: Stats refresh on page load
```gherkin
Given I am on the Dashboard
And a new user was added to the database
When I refresh the Dashboard page
Then the user count should reflect the new total
```

### Scenario: Stats loading state
```gherkin
Given I navigate to the Dashboard
When the stats are being fetched from the API
Then I should see a loading indicator (spinner or skeleton)
And once loaded, the actual numbers should appear
```

### Scenario: Stats error handling
```gherkin
Given the dashboard API endpoint is unavailable
When I navigate to the Dashboard
Then I should see an error message or fallback state
And the page should NOT crash or show blank widgets
```

---

## SPEC-FIX-005: View Preference Persistence

**Requirement:** User's view preference must persist across sessions.

### Scenario: Remember last used view
```gherkin
Given I am an internal admin
And I switched to Employee View
When I log out
And I log back in
Then I should start in Employee View (my last preference)
And the ViewSwitcher should show "Employee View"
```

### Scenario: Preference stored via API
```gherkin
Given I am an internal admin
When I switch views using the ViewSwitcher
Then a PUT request should be made to /api/me/view-preference
And my preference should be stored in the database
```

### Scenario: Preference survives browser clear
```gherkin
Given I am an internal admin with preference set to Employee View
And I clear my browser localStorage
When I log in again
Then my view preference should be fetched from the server
And I should start in Employee View
```
