# Specifications: Group Management SlideOut

## SPEC-GMS-001: GroupSlideOut Opens on Row Click

**Requirement:** When a user clicks on a group row in the Groups list, the GroupSlideOut panel should open showing that group's details.

### Scenario: Open GroupSlideOut from Groups list
```gherkin
Given I am logged in as an admin
And I am on the Groups page
And there is at least one group in the list
When I click on a group row
Then the GroupSlideOut panel should slide in from the right
And the panel should display the group's name in the header
And the panel should display the group's email
And the panel should show the Overview tab as active
```

### Scenario: Close GroupSlideOut
```gherkin
Given the GroupSlideOut is open
When I click the X button in the panel header
Then the panel should slide out to the right
And the Groups list should be visible
```

---

## SPEC-GMS-002: GroupSlideOut Tabs Navigation

**Requirement:** The GroupSlideOut should have tabs for Overview, Members, Rules, Sync, Settings, and Danger.

### Scenario: Navigate between tabs
```gherkin
Given the GroupSlideOut is open for a static group
When I click on the "Members" tab
Then the Members tab content should be displayed
And the Members tab should be visually active

When I click on the "Sync" tab
Then the Sync tab content should be displayed
And the Sync tab should be visually active
```

### Scenario: Rules tab visibility for dynamic groups
```gherkin
Given the GroupSlideOut is open for a dynamic group
Then the "Rules" tab should be visible

Given the GroupSlideOut is open for a static group
Then the "Rules" tab should NOT be visible
```

---

## SPEC-GMS-003: Edit Group Basic Info

**Requirement:** Admins can edit group name, description, and email from the Overview tab.

### Scenario: Edit group name
```gherkin
Given the GroupSlideOut is open on Overview tab
And I am in view mode
When I click the "Edit" button
Then the form should switch to edit mode
And the name field should be editable

When I change the name to "Updated Group Name"
And I click "Save"
Then the API should receive PUT /api/organization/access-groups/:id
And the group name should update to "Updated Group Name"
And a success toast should appear
```

### Scenario: Cancel edit
```gherkin
Given I am in edit mode
And I have changed the group name
When I click "Cancel"
Then the changes should be discarded
And the original group name should be displayed
```

---

## SPEC-GMS-004: Manage Group Members

**Requirement:** View, add, and remove members from a group.

### Scenario: View members list
```gherkin
Given the GroupSlideOut is open on Members tab
Then I should see a list of current group members
And each member should show their name and email
And each member should have a "Remove" action
```

### Scenario: Add member to group
```gherkin
Given the GroupSlideOut is open on Members tab
When I click "Add Member"
Then a user search modal should appear

When I search for "john@example.com"
And I select John Smith from the results
And I click "Add"
Then John Smith should appear in the members list
And the API should receive POST /api/organization/access-groups/:id/members
```

### Scenario: Remove member from group
```gherkin
Given the GroupSlideOut is open on Members tab
And the group has member "Jane Doe"
When I click "Remove" next to Jane Doe
And I confirm the removal
Then Jane Doe should be removed from the members list
And the API should receive DELETE /api/organization/access-groups/:id/members/:userId
```

---

## SPEC-GMS-005: Dynamic Group Rules

**Requirement:** Configure dynamic membership rules for automatic group membership.

### Scenario: Add a rule
```gherkin
Given the GroupSlideOut is open for a dynamic group
And I am on the Rules tab
When I click "Add Rule"
Then a new rule row should appear
And I should see a field dropdown with options like "Department", "Location", "Job Title"
And I should see an operator dropdown
And I should see a value input
```

### Scenario: Configure department rule with dropdown
```gherkin
Given I am adding a rule
When I select "Department" as the field
Then the value input should become a department dropdown
And the dropdown should show the organization's departments in a tree structure

When I select "Engineering" from the department dropdown
And I select "is under" as the operator
Then the rule should match all users in Engineering and its sub-departments
```

### Scenario: Preview rule results
```gherkin
Given I have configured one or more rules
When I click "Preview"
Then the API should receive POST /api/organization/access-groups/:id/evaluate
And the preview should show "X users match these rules"
And I should be able to see a sample of matching users
```

### Scenario: Rule logic (AND/OR)
```gherkin
Given I have multiple rules configured
When I select "Match ALL rules" (AND logic)
Then users must match every rule to be included

When I select "Match ANY rule" (OR logic)
Then users matching at least one rule should be included
```

---

## SPEC-GMS-006: Google Workspace Sync Settings

**Requirement:** Configure group sync to Google Workspace.

### Scenario: Enable Google Workspace sync
```gherkin
Given the GroupSlideOut is open on Sync tab
And Google Workspace module is enabled for the organization
When I toggle "Sync to Google Workspace" ON
Then the sync direction options should appear
And I should see "Last synced" status
```

### Scenario: Sync direction options
```gherkin
Given Google Workspace sync is enabled
Then I should see three sync direction options:
| Option | Description |
| Push only | Helios → Google |
| Pull only | Google → Helios |
| Bidirectional | Both directions |

When I select "Bidirectional"
And I click "Save"
Then the sync direction should be saved
```

### Scenario: Manual sync trigger
```gherkin
Given Google Workspace sync is enabled
When I click "Sync Now"
Then a loading indicator should appear
And the API should receive POST /api/organization/access-groups/:id/sync/google
And on success, "Last synced" should update to current time
```

---

## SPEC-GMS-007: Microsoft 365 Feature Flag

**Requirement:** Microsoft 365 sync should be feature-flagged and show "Coming Soon".

### Scenario: Microsoft 365 section disabled
```gherkin
Given the GroupSlideOut is open on Sync tab
Then the Microsoft 365 section should show "Coming Soon"
And the toggle should be disabled
And there should be a message explaining the feature is not yet available
```

---

## SPEC-DPT-001: Department Management

**Requirement:** Manage departments with hierarchical structure.

### Scenario: View departments list
```gherkin
Given I am on Settings > Master Data > Departments
Then I should see a tree view of departments
And each department should show its user count
And child departments should be indented under parents
```

### Scenario: Create department
```gherkin
Given I am on the Departments page
When I click "Add Department"
Then a modal should appear with fields:
| Field | Type |
| Name | Text input |
| Parent Department | Dropdown (optional) |
| Manager | User picker (optional) |
| Description | Text area |

When I fill in "Product Design" as the name
And I select "Design" as the parent
And I click "Create"
Then the department should appear under Design in the tree
```

### Scenario: Edit department
```gherkin
Given I click on a department in the tree
When I click "Edit"
And I change the name to "UX Design"
And I click "Save"
Then the department name should update
And the tree should refresh
```

### Scenario: Delete department with users
```gherkin
Given there is a department with assigned users
When I try to delete the department
Then I should see a warning about affected users
And I should be prompted to reassign users to another department
```

---

## SPEC-DPT-002: Data Quality Dashboard

**Requirement:** Show data quality issues like orphaned values.

### Scenario: View orphan detection
```gherkin
Given some users have department values not in master data
When I view the Data Quality dashboard
Then I should see "X orphaned values found" for departments
And I should see the orphaned values listed
And each should show how many users have that value
```

### Scenario: Resolve orphan by mapping
```gherkin
Given there is an orphaned department value "Engneering" (typo)
When I click "Fix" on that orphan
Then a modal should appear with options:
| Option | Description |
| Map to existing | Select correct department |
| Create new | Create "Engneering" as new department |
| Ignore | Leave as-is |

When I select "Map to existing"
And I choose "Engineering"
And I click "Apply"
Then users with "Engneering" should be updated to "Engineering"
And the orphan should be removed from the list
```

---

## SPEC-DPT-003: Dropdown Rule Builder with Master Data

**Requirement:** Dynamic group rules should use dropdowns for managed fields.

### Scenario: Department field uses tree dropdown
```gherkin
Given I am adding a dynamic group rule
When I select "Department" as the field
Then the value selector should be a hierarchical dropdown
And it should show all departments in tree structure
And selecting a parent should show "is under" operator option
```

### Scenario: Reports To field uses user picker
```gherkin
Given I am adding a dynamic group rule
When I select "Reports To" as the field
Then the value selector should be a user search/picker
And I should be able to search by name or email
And selecting a manager should enable "Include nested reports" checkbox
```

### Scenario: Location field uses tree dropdown
```gherkin
Given I am adding a dynamic group rule
And locations have been configured
When I select "Location" as the field
Then the value selector should show locations in tree structure
And regions should contain offices
```
