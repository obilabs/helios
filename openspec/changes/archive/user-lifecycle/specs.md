# Specifications: User Lifecycle Management

## SPEC-LIFE-001: Onboarding Templates

**Requirement:** Admins can create and manage onboarding templates.

### Scenario: Create onboarding template
```gherkin
Given I am an admin on the Onboarding Templates page
When I click "Create Template"
And I enter name "Sales Representative"
And I select department "Sales"
And I configure Google Workspace settings:
  | Setting | Value |
  | License | Business Standard |
  | Org Unit | /Sales |
  | Gmail | Enabled |
  | Drive | Enabled |
And I select groups: "All Employees", "Sales Team"
And I select signature template "Sales Standard"
And I click "Save"
Then the template should be created
And it should appear in the template list
```

### Scenario: Edit onboarding template
```gherkin
Given an onboarding template "Sales Representative" exists
When I click "Edit" on the template
And I add group "CRM Users"
And I click "Save"
Then the template should be updated
And it should now include "CRM Users" group
```

### Scenario: Delete onboarding template
```gherkin
Given an onboarding template "Intern" exists
And no users have been onboarded with this template
When I click "Delete" on the template
And I confirm deletion
Then the template should be removed
And it should no longer appear in the list
```

---

## SPEC-LIFE-002: One-Click Onboarding

**Requirement:** New users can be provisioned with a single workflow.

### Scenario: Onboard user with template
```gherkin
Given I am on the "New User Onboarding" page
And onboarding template "Sales Representative" exists
When I enter first name "John"
And I enter last name "Smith"
And I enter personal email "john.smith@gmail.com"
And I select template "Sales Representative"
And I click "Create User & Provision"
Then a Google Workspace account should be created
And email should be "john.smith@company.com"
And user should be in "Sales" org unit
And user should be member of "All Employees" group
And user should be member of "Sales Team" group
And signature should be assigned
And welcome email should be sent to personal email
```

### Scenario: Onboard user with customizations
```gherkin
Given I am onboarding a new user
And I select template "Software Engineer"
When I override the job title to "Senior Software Engineer"
And I add additional group "Architecture Team"
And I click "Create User & Provision"
Then the user should be created with customized settings
And the additional group should be applied
```

### Scenario: Schedule future onboarding
```gherkin
Given I am onboarding a new user
And the start date is January 15, 2025
When I select "Schedule for start date"
And I complete the onboarding form
And I click "Schedule"
Then a scheduled action should be created
And status should be "pending"
And scheduled_for should be January 15, 2025
And the user should NOT be created yet
```

### Scenario: Onboarding validation
```gherkin
Given I am onboarding a new user
When I enter an email that already exists
And I click "Create User"
Then I should see an error "Email already in use"
And the user should NOT be created
```

---

## SPEC-LIFE-003: Offboarding Workflow

**Requirement:** Users can be offboarded with data handling and access revocation.

### Scenario: Offboard user immediately
```gherkin
Given user "Jane Doe" (jane.doe@company.com) exists
When I navigate to User Offboarding
And I select user "Jane Doe"
And I select data handling:
  | Option | Value |
  | Drive Files | Transfer to manager |
  | Email | Forward to manager for 30 days |
  | Calendar | Decline future meetings |
And I select access revocation:
  | Option |
  | Remove from all groups |
  | Revoke OAuth tokens |
  | Sign out all devices |
  | Reset password |
And I select "Suspend immediately"
And I click "Begin Offboarding"
Then Drive files should transfer to manager
And email forwarding should be set up
And future meetings should be declined
And user should be removed from all groups
And OAuth tokens should be revoked
And user should be signed out
And password should be reset
And account should be suspended
And audit log should record all actions
```

### Scenario: Schedule offboarding for last day
```gherkin
Given user "Bob Wilson" has last day January 31, 2025
When I offboard Bob with "Suspend on last day"
Then a scheduled action should be created for January 31
And Bob's account should remain active until then
And on January 31, the offboarding should execute
```

### Scenario: Offboard with auto-reply
```gherkin
Given I am offboarding user "Alice Brown"
When I select email action "Auto-reply with departure message"
And I enter auto-reply text "Alice is no longer with the company..."
And I complete offboarding
Then vacation responder should be set with the message
And incoming emails should receive the auto-reply
```

---

## SPEC-LIFE-004: Offboarding Templates

**Requirement:** Offboarding templates can be pre-configured and reused.

### Scenario: Create offboarding template
```gherkin
Given I am on Offboarding Templates page
When I click "Create Template"
And I enter name "Standard Offboarding"
And I configure settings:
  | Setting | Value |
  | Drive Action | Transfer to manager |
  | Email Action | Forward to manager |
  | Forward Duration | 30 days |
  | Remove from groups | Yes |
  | Revoke tokens | Yes |
  | Account Action | Suspend |
And I click "Save"
Then the template should be created
And it can be used for future offboardings
```

### Scenario: Set default offboarding template
```gherkin
Given offboarding template "Standard Offboarding" exists
When I click "Set as Default"
Then the template should be marked as default
And new offboardings should pre-select this template
```

### Scenario: Apply template with overrides
```gherkin
Given default offboarding template has "Forward 30 days"
When I offboard a user
And I override forward duration to 60 days
And I complete offboarding
Then email should forward for 60 days (not 30)
```

---

## SPEC-LIFE-005: Scheduled Actions

**Requirement:** Actions can be scheduled for future execution.

### Scenario: View scheduled actions
```gherkin
Given there are scheduled actions:
  | Date | Action | User | Type |
  | Jan 15 | Onboard | John Smith | Sales Rep |
  | Jan 31 | Suspend | Jane Doe | Last day |
  | Feb 15 | Onboard | Alice Brown | Engineer |
When I navigate to Scheduled Actions page
Then I should see all scheduled actions
And they should be sorted by date
And I should see action type and user for each
```

### Scenario: Cancel scheduled action
```gherkin
Given a scheduled onboarding for "John Smith" on Jan 15
When I click "Cancel" on the action
And I confirm cancellation
Then the action should be cancelled
And status should be "cancelled"
And the user should NOT be created on Jan 15
```

### Scenario: Reschedule action
```gherkin
Given a scheduled onboarding for "John Smith" on Jan 15
When I click "Edit" on the action
And I change the date to Jan 20
And I click "Save"
Then the scheduled_for should be Jan 20
And the action should execute on the new date
```

### Scenario: Scheduled action executes
```gherkin
Given a scheduled action exists:
  | scheduled_for | 2025-01-15 09:00:00 |
  | action_type | onboard |
  | status | pending |
When the current time reaches 2025-01-15 09:00:00
Then the background job should pick up the action
And status should change to "in_progress"
And the onboarding should execute
And status should change to "completed"
And executed_at should be set
```

---

## SPEC-LIFE-006: Action Logging

**Requirement:** All lifecycle actions are logged step-by-step.

### Scenario: Log successful onboarding
```gherkin
Given I onboard user "John Smith"
When the onboarding completes successfully
Then lifecycle logs should contain:
  | Step | Status |
  | create_account | success |
  | set_org_unit | success |
  | add_to_group:all-employees | success |
  | add_to_group:sales-team | success |
  | assign_signature | success |
  | send_welcome_email | success |
```

### Scenario: Log partial failure
```gherkin
Given I onboard user "John Smith"
And the signature service is unavailable
When the onboarding executes
Then account should be created
And groups should be added
But signature assignment should fail
And logs should show:
  | Step | Status |
  | create_account | success |
  | assign_signature | failed |
And error_message should indicate the failure reason
```

### Scenario: View logs for user
```gherkin
Given user "John Smith" was onboarded on Jan 15
And user "John Smith" was offboarded on Dec 1
When I view lifecycle logs for "John Smith"
Then I should see all historical actions
And I should see step-by-step details for each
And I should be able to filter by action type
```

---

## SPEC-LIFE-007: Google Workspace Integration

**Requirement:** Lifecycle actions integrate with Google Workspace APIs.

### Scenario: Create user in Google Workspace
```gherkin
Given Google Workspace is configured
When I onboard a new user with:
  | Field | Value |
  | Email | john.smith@company.com |
  | First Name | John |
  | Last Name | Smith |
  | Org Unit | /Sales |
Then Admin SDK should create the user
And the user should have a temporary password
And changePasswordAtNextLogin should be true
And the org unit should be set correctly
```

### Scenario: Transfer Drive ownership
```gherkin
Given user "Jane Doe" is being offboarded
And manager is "Bob Wilson"
When Drive action is "Transfer to manager"
Then all Drive files owned by Jane should transfer to Bob
And Bob should see Jane's files in his Drive
And Jane should no longer own the files
```

### Scenario: Revoke OAuth tokens
```gherkin
Given user "Jane Doe" is being offboarded
And Jane has authorized 5 third-party apps
When offboarding revokes OAuth tokens
Then all 5 app authorizations should be revoked
And Jane should be signed out of those apps
```

### Scenario: Set email forwarding
```gherkin
Given user "Jane Doe" is being offboarded
And forward destination is "bob@company.com"
And forward duration is 30 days
When email forwarding is configured
Then emails to jane.doe@company.com should forward to bob@company.com
And original emails should be archived
```

---

## SPEC-LIFE-008: Error Handling

**Requirement:** Errors are handled gracefully with retry options.

### Scenario: Handle Google API error
```gherkin
Given I am onboarding a new user
And the Google Admin API returns a rate limit error
Then the step should be marked as "failed"
And the error should be logged
And I should see a "Retry" button
When I click "Retry"
Then the failed step should re-attempt
```

### Scenario: Partial completion recovery
```gherkin
Given onboarding failed after creating account but before adding groups
When I view the action details
Then I should see which steps completed
And I should see which steps failed
And I should be able to "Resume" from the failed step
```

### Scenario: Rollback on critical failure
```gherkin
Given account creation succeeds
But group addition fails with "Group not found"
Then the error should be logged
And the user should be notified
But the created account should NOT be deleted
And admin should be able to fix and retry
```

---

## SPEC-LIFE-009: Notifications

**Requirement:** Stakeholders are notified of lifecycle events.

### Scenario: Send welcome email
```gherkin
Given I onboard user "John Smith"
And personal email is "john.smith@gmail.com"
When onboarding completes
Then a welcome email should be sent to john.smith@gmail.com
And it should contain the work email address
And it should contain a temporary password
And it should contain login instructions
```

### Scenario: Notify manager of offboarding
```gherkin
Given "Jane Doe" reports to "Bob Wilson"
When Jane is offboarded
And "Notify manager" is checked
Then Bob should receive an email notification
And it should summarize the offboarding actions
And it should indicate what data was transferred
```

### Scenario: Notify IT admin of scheduled action
```gherkin
Given a scheduled offboarding for Jan 31
And "Notify IT admin" is checked
When Jan 31 arrives and offboarding executes
Then IT admins should receive a notification
And it should confirm successful completion
Or it should alert about failures
```
