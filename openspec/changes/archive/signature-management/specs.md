# Specifications: Email Signature Management

## SPEC-SIG-001: Template Management

**Requirement:** Admins can create and manage signature templates.

### Scenario: Create new template
```gherkin
Given I am logged in as a Signature Admin
When I navigate to Signatures > Templates
And I click "Create Template"
Then I should see the template editor
And I should see a rich text editor
And I should see a merge field picker
And I should see a preview panel
```

### Scenario: Insert merge field
```gherkin
Given I am editing a signature template
When I click the merge field picker
And I select "{{full_name}}"
Then "{{full_name}}" should be inserted at my cursor position
And the preview should show a sample name
```

### Scenario: Preview template with user data
```gherkin
Given I have created a template with merge fields
When I click "Preview"
And I select user "John Smith" from the dropdown
Then the preview should show John's actual data:
  | Field | Value |
  | {{full_name}} | John Smith |
  | {{job_title}} | Senior Engineer |
  | {{email}} | john@company.com |
```

### Scenario: Save template
```gherkin
Given I have created a valid template
When I enter name "Corporate Standard"
And I click "Save"
Then the template should be saved with status "draft"
And I should see it in the templates list
And I should see a success message
```

---

## SPEC-SIG-002: Template Assignment

**Requirement:** Templates can be assigned to users via multiple methods.

### Scenario: Assign to all users (organization default)
```gherkin
Given I have a template "Corporate Standard"
When I click "Assign"
And I select "All Users (organization default)"
And I click "Save Assignment"
Then all users should have this template assigned
And the preview should show the total user count
```

### Scenario: Assign by department
```gherkin
Given I have a template "Engineering Team"
When I click "Assign"
And I select "By Department"
And I check "Engineering" and "Product"
And I click "Save Assignment"
Then only users in Engineering or Product departments should be assigned
And the preview count should match department sizes
```

### Scenario: Assign by group
```gherkin
Given I have a template "Sales Promo"
And I have a group "Sales Team" with 15 members
When I assign the template to group "Sales Team"
Then 15 users should have this template assigned
```

### Scenario: Assign by dynamic group
```gherkin
Given I have a dynamic group "US Employees" with rule: location contains "USA"
When I assign a template to this dynamic group
Then all users matching the rule should be assigned
And new users matching the rule should automatically get the template
```

### Scenario: Assign specific users
```gherkin
Given I have a template "Executive"
When I click "Assign"
And I select "Specific Users"
And I search for "CEO"
And I check "Jane Doe (CEO)"
And I click "Save Assignment"
Then only Jane Doe should have this template assigned
```

### Scenario: Priority resolution
```gherkin
Given user "John" is in department "Engineering"
And department "Engineering" is assigned template "Engineering Team"
And user "John" is directly assigned template "Executive"
When the system resolves John's effective template
Then John should get "Executive" (direct assignment wins)
```

---

## SPEC-SIG-003: Google Workspace Sync

**Requirement:** Signatures are deployed to Google Workspace.

### Scenario: Deploy single user
```gherkin
Given user "John" is assigned template "Corporate Standard"
And John's signature has not been synced
When I click "Sync" on John's signature status
Then the system should call Gmail API to set John's signature
And John's status should change to "synced"
And last_synced_at should be updated
```

### Scenario: Deploy all pending
```gherkin
Given 10 users have pending signature changes
When I click "Deploy All"
Then the system should queue all 10 users for sync
And I should see a progress indicator
And successful syncs should show as "synced"
And failures should show error messages
```

### Scenario: Detect external change
```gherkin
Given user "John" has a synced signature
And John manually changed his signature in Gmail
When the system runs a sync check
Then John's status should change to "external_change"
And admin should see a warning indicator
```

---

## SPEC-SIG-004: Campaign Creation

**Requirement:** Admins can create time-limited signature campaigns.

### Scenario: Create campaign
```gherkin
Given I am a Campaign Manager
When I navigate to Signatures > Campaigns
And I click "Create Campaign"
Then I should see the campaign editor with:
  | Field | Type |
  | Name | Text input |
  | Description | Textarea |
  | Template | Dropdown |
  | Start Date | Date picker |
  | End Date | Date picker |
  | Banner Image | File upload |
  | Banner Link | URL input |
  | Tracking | Checkbox |
```

### Scenario: Schedule campaign
```gherkin
Given I have filled out campaign details:
  | Field | Value |
  | Name | Q4 Product Launch |
  | Start | 2025-01-15 09:00 |
  | End | 2025-02-15 23:59 |
  | Timezone | America/New_York |
When I click "Schedule Campaign"
Then the campaign status should be "scheduled"
And the campaign should appear in the campaigns list
And it should NOT be active yet
```

### Scenario: Campaign auto-start
```gherkin
Given I have a scheduled campaign starting at "2025-01-15 09:00 EST"
When the system time reaches "2025-01-15 09:00 EST"
Then the campaign status should change to "active"
And users in the audience should have their signatures updated
And the campaign template should override their normal template
```

### Scenario: Campaign auto-end
```gherkin
Given I have an active campaign ending at "2025-02-15 23:59 EST"
And "auto_revert" is enabled
When the system time reaches "2025-02-16 00:00 EST"
Then the campaign status should change to "completed"
And users should revert to their normal assigned templates
```

---

## SPEC-SIG-005: Campaign Banner Upload

**Requirement:** Campaign banners are uploaded to MinIO.

### Scenario: Upload banner image
```gherkin
Given I am creating a campaign
When I drag a PNG image to the banner upload area
Then I should see an upload progress indicator
And once complete, I should see the banner preview
And the image should be stored in MinIO at:
  signatures/campaigns/{campaign_id}/banner.png
```

### Scenario: Banner size validation
```gherkin
Given I try to upload a banner image
When the image is larger than 5MB
Then I should see an error "Image must be under 5MB"
And the upload should be rejected

When the image dimensions exceed 800x200px
Then I should see a warning "Recommended size: 600x100px"
But the upload should be allowed
```

---

## SPEC-SIG-006: Tracking Pixels

**Requirement:** Campaign emails can be tracked via 1px image.

### Scenario: Pixel generation
```gherkin
Given a campaign is active with tracking enabled
And user "John" is in the campaign audience
When John's signature is generated
Then a unique tracking pixel should be created for John
And the pixel URL should be embedded in the signature HTML
And the URL format should be:
  /api/t/p/{base64_encoded_token}.gif
```

### Scenario: Track email open
```gherkin
Given user "John" sent an email with a campaign signature
And the recipient's email client loads images
When the tracking pixel is requested
Then the system should log:
  | Field | Value |
  | campaign_id | {campaign_uuid} |
  | user_id | {john_uuid} |
  | timestamp | {current_time} |
  | ip_hash | {sha256_of_ip} |
And the response should be a 1x1 transparent GIF
And the response should be 43 bytes
```

### Scenario: Unique recipient detection
```gherkin
Given tracking pixel for John in Campaign X has been hit 5 times
And 3 hits were from IP hash "abc123"
And 2 hits were from IP hash "def456"
When viewing analytics
Then total opens should show 5
And unique recipients should show 2
```

### Scenario: Privacy protection
```gherkin
Given a tracking pixel is requested
Then the system should NOT store:
  - Recipient's email address
  - Full IP address
And the system SHOULD store:
  - SHA256 hash of IP (for uniqueness)
  - Country/region (from IP geolocation)
```

---

## SPEC-SIG-007: Campaign Analytics

**Requirement:** Campaign managers can view tracking analytics.

### Scenario: View analytics dashboard
```gherkin
Given campaign "Q4 Launch" has been active for 7 days
And it has received 2,847 total opens
When I navigate to the campaign analytics
Then I should see:
  | Metric | Value |
  | Total Opens | 2,847 |
  | Unique Recipients | ~1,234 |
  | Open Rate | 22.8 opens/user |
And I should see an opens-over-time chart
And I should see a top performers table
And I should see geographic distribution
```

### Scenario: Export analytics
```gherkin
Given I am viewing campaign analytics
When I click "Export CSV"
Then a CSV file should download with columns:
  | timestamp | user_email | country | is_unique |
And user emails should be included (internal data)
And recipient data should NOT be included (privacy)
```

---

## SPEC-SIG-008: Permissions

**Requirement:** Signature features have role-based access control.

### Scenario: Permission levels
```gherkin
Given these permission levels exist:
  | Level | Templates | Assign | Deploy | Campaigns | Analytics |
  | admin | full | full | full | full | full |
  | designer | create/edit | none | none | none | none |
  | campaign_manager | view | none | none | full | full |
  | helpdesk | view | none | resync | view | view |
  | viewer | view | none | none | view | view |
```

### Scenario: Designer cannot deploy
```gherkin
Given I have "designer" permission level
When I try to access the Deploy button
Then the button should be disabled or hidden
And if I call the API directly, I should get 403 Forbidden
```

### Scenario: Grant permission
```gherkin
Given I am a Signature Admin
When I navigate to Signatures > Permissions
And I search for user "Jane"
And I select permission level "campaign_manager"
And I click "Grant"
Then Jane should have campaign_manager permissions
And she should be able to create campaigns
```

---

## SPEC-SIG-009: Assignment Preview

**Requirement:** Admins can preview who will be affected by an assignment.

### Scenario: Preview affected users
```gherkin
Given I am creating an assignment for template "Sales Promo"
And I select assignment type "By Department"
And I check "Sales" (25 users) and "Marketing" (15 users)
When I click "Preview"
Then I should see "40 users will receive this template"
And I should see a list of affected users
And I should be able to search/filter the list
```

### Scenario: Preview conflicts
```gherkin
Given user "John" already has a direct assignment to "Executive"
And I am assigning "Corporate Standard" to his department
When I preview the assignment
Then John should be shown with a warning:
  "Has higher priority assignment: Executive"
And the preview count should exclude John
```

---

## SPEC-SIG-010: User Signature Status

**Requirement:** Admins can view and manage individual user signatures.

### Scenario: View user signature status
```gherkin
Given I am viewing user "John Smith" in the admin panel
When I go to the Signature tab
Then I should see:
  | Field | Value |
  | Current Template | Corporate Standard |
  | Assignment Source | Department: Engineering |
  | Active Campaign | Q4 Launch (until Feb 15) |
  | Sync Status | Synced |
  | Last Synced | 2 hours ago |
```

### Scenario: Re-sync single user
```gherkin
Given user "John" has sync status "failed"
And error message shows "Rate limit exceeded"
When I click "Re-sync"
Then the system should retry syncing John's signature
And if successful, status should change to "synced"
```

### Scenario: Preview user's actual signature
```gherkin
Given I am viewing user "John's" signature status
When I click "Preview Signature"
Then I should see John's signature as it would appear in Gmail
With all merge fields replaced with John's actual data
And campaign banner if a campaign is active
```
