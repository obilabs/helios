# Specifications: Infrastructure Fixes

## SPEC-INFRA-001: Media Upload Functionality

**Requirement:** Media uploads must work reliably.

### Scenario: Upload voice recording
```gherkin
Given I am on My Profile page
And MinIO is properly configured
When I record my name pronunciation
And I click Save
Then the recording should upload successfully
And I should see a success message
And the recording should be playable
And I should NOT see "InvalidAccessKeyId" error
```

### Scenario: Upload profile photo
```gherkin
Given I am on My Profile page
When I click to change my profile photo
And I select an image file
Then the image should upload to MinIO
And my profile photo should update
And the photo should be visible on my profile
```

### Scenario: S3 connection error handling
```gherkin
Given MinIO service is temporarily unavailable
When I try to upload a file
Then I should see a user-friendly error message
And the error should NOT expose internal details
And the backend should log the actual error for debugging
```

---

## SPEC-INFRA-002: Dashboard Loading

**Requirement:** Dashboard must load without errors.

### Scenario: Dashboard loads successfully
```gherkin
Given I am logged in as an admin
When I navigate to the Dashboard
Then the page should load without errors
And I should NOT see blank/broken widgets
And the browser console should NOT show errors
```

### Scenario: Dashboard stats display
```gherkin
Given there are 5 users in the organization
And there are 3 groups
When I view the Dashboard
Then the Users stat should show "5"
And the Groups stat should show "3"
And the stats should NOT show "0" or be empty
```

### Scenario: Dashboard with missing tables
```gherkin
Given the user_dashboard_widgets table exists
When I load the Dashboard
Then the widgets should render correctly
And I should be able to customize widget visibility
```

---

## SPEC-INFRA-003: Field Visibility Settings

**Requirement:** Users can control visibility of all personal fields.

### Scenario: Pronouns visibility setting
```gherkin
Given I am on My Profile > Privacy tab
Then I should see a visibility setting for "Pronouns"
And the options should be: Everyone, My Team, My Manager, Only Me

When I set Pronouns to "My Team"
And I click Save
Then my pronouns should only be visible to my team members
```

### Scenario: All visibility fields present
```gherkin
Given I am on My Profile > Privacy tab
Then I should see visibility settings for:
  | Field |
  | Email |
  | Phone |
  | Mobile Phone |
  | Pronouns |
  | Location |
  | Job Title |
  | Work Phone |
  | Timezone |
  | Bio |
  | Fun Facts |
  | Interests |
  | Voice Intro |
  | Video Intro |
```

### Scenario: Visibility respected in People directory
```gherkin
Given user "John" has set Pronouns to "Only Me"
And I am viewing John's profile in the People directory
And I am NOT John
Then I should NOT see John's pronouns
```

---

## SPEC-INFRA-004: MinIO Bucket Initialization

**Requirement:** MinIO buckets are created automatically.

### Scenario: Bucket auto-creation on startup
```gherkin
Given the MinIO container is running
And the helios-uploads bucket does not exist
When the backend starts
Then the helios-uploads bucket should be created
And the helios-public bucket should be created
And appropriate access policies should be set
```

### Scenario: Bucket already exists
```gherkin
Given the MinIO container is running
And the helios-uploads bucket already exists
When the backend starts
Then no error should occur
And existing files should remain intact
```

---

## SPEC-INFRA-005: Available Modules Table

**Requirement:** Module catalog is properly seeded.

### Scenario: Modules are available
```gherkin
Given the available_modules table is seeded
When I query for available modules
Then I should see:
  | Slug | Name |
  | google-workspace | Google Workspace |
  | microsoft-365 | Microsoft 365 |
  | signature-management | Signature Management |
```

### Scenario: Module status in dashboard
```gherkin
Given Google Workspace module is enabled
When I view the Dashboard
Then the Google Workspace module card should show "Enabled"
And it should show the last sync time
```
