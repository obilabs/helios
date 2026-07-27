# Custom Label System

## ADDED Requirements

### Requirement: Canonical Name and Display Label Separation
The system SHALL separate immutable canonical entity names from tenant-customizable display labels.

#### Scenario: Code uses canonical names
**Given** a tenant has customized "Users" to "People"
**When** backend code queries the database
**Then** it uses the canonical name `entity.user` in the query
**And** routes remain `/api/organization/users` (not `/people`)
**And** database table names remain unchanged

#### Scenario: UI displays custom labels
**Given** a tenant has customized "Users" to "People"
**When** the UI renders navigation
**Then** the navigation shows "People"
**And** page titles show "People"
**And** buttons show "Add Person" and "Manage People"

### Requirement: Custom Labels Storage
The system SHALL store custom labels in a database table associated with each organization.

#### Scenario: Store custom labels
**Given** an administrator customizes labels
**When** they save changes
**Then** labels are stored in the `custom_labels` table
**And** labels are associated with the organization_id
**And** both singular and plural forms are stored

#### Scenario: Default labels on organization creation
**Given** a new organization is created
**When** the organization setup completes
**Then** default labels are automatically created
**And** default labels include: entity.user, entity.workspace, entity.access_group, entity.policy_container, entity.device

### Requirement: Singular and Plural Label Forms
The system SHALL require both singular and plural forms for all entity labels.

#### Scenario: Singular label usage
**Given** a label has singular "Person" and plural "People"
**When** displaying a button to add one entity
**Then** the button shows "Add Person"
**And** a detail page title shows "Person Details"

#### Scenario: Plural label usage
**Given** a label has singular "Person" and plural "People"
**When** displaying a list page
**Then** the page title shows "Manage People"
**And** the navigation shows "People"
**And** stats show "5 People"

### Requirement: Label Validation
The system SHALL validate all custom labels to prevent UI breaking and security issues.

#### Scenario: Character limit enforcement
**Given** an administrator is customizing labels
**When** they enter a label longer than 30 characters
**Then** the system rejects the input
**And** shows an error message
**And** the form cannot be submitted

#### Scenario: XSS prevention
**Given** an administrator enters a label with HTML tags
**When** the label is submitted
**Then** the system sanitizes the input
**And** removes all HTML tags
**And** returns an error if sanitized value differs from input

#### Scenario: Special character validation
**Given** an administrator enters a label
**When** the label contains invalid special characters
**Then** the system rejects the input
**And** only allows alphanumeric, spaces, hyphens, and apostrophes

### Requirement: Label Service API
The system SHALL provide API endpoints for retrieving and updating custom labels.

#### Scenario: Get organization labels
**Given** an authenticated user
**When** they request GET /api/organization/labels
**Then** the system returns all custom labels for their organization
**And** returns both singular and plural forms
**And** returns all defined canonical entities

#### Scenario: Update labels (admin only)
**Given** an authenticated administrator
**When** they send PATCH /api/organization/labels with updated labels
**Then** the system validates all labels
**And** updates the custom_labels table
**And** returns the updated labels

#### Scenario: Non-admin cannot update labels
**Given** an authenticated non-admin user
**When** they attempt PATCH /api/organization/labels
**Then** the system returns HTTP 403 Forbidden
**And** labels are not updated

### Requirement: Labels Context for Frontend
The system SHALL provide a React context that makes custom labels available to all UI components.

#### Scenario: LabelsContext provides labels
**Given** a user is authenticated
**When** the application loads
**Then** the LabelsContext fetches labels from the API
**And** caches labels for the session
**And** makes labels available via useLabels() hook

#### Scenario: Labels update triggers re-render
**Given** a user is viewing the application
**When** an administrator updates labels
**And** the LabelsContext refreshes
**Then** all UI components using labels re-render
**And** display the updated labels immediately

### Requirement: Canonical Entity Definitions
The system SHALL define canonical names for all core entities.

#### Scenario: User entity
**Given** the canonical data model
**Then** users are identified as `entity.user`
**And** default labels are "User" (singular) and "Users" (plural)
**And** code references `entity.user` in all logic

#### Scenario: Workspace entity
**Given** the canonical data model
**Then** collaboration spaces are identified as `entity.workspace`
**And** default labels are "Team" (singular) and "Teams" (plural)
**And** workspaces include Microsoft Teams and Google Chat Spaces

#### Scenario: Access Group entity
**Given** the canonical data model
**Then** permission/mailing lists are identified as `entity.access_group`
**And** default labels are "Group" (singular) and "Groups" (plural)
**And** access groups include Google Groups and M365 Security/Distribution Groups

#### Scenario: Policy Container entity
**Given** the canonical data model
**Then** organizational units are identified as `entity.policy_container`
**And** default labels are "Org Unit" (singular) and "Org Units" (plural)
**And** policy containers include Google Organizational Units and M365 Administrative Units

## MODIFIED Requirements

### Requirement: Settings Customization UI
The system SHALL allow administrators to customize entity labels through the Settings page.

#### Scenario: Navigate to label customization
**Given** an administrator is logged in
**When** they navigate to Settings > Customization
**Then** the Label Customization section is displayed
**And** shows all customizable entities
**And** provides singular and plural fields for each entity

#### Scenario: Customize entity labels
**Given** an administrator is on the Customization page
**When** they change "Users" to "People" (plural) and "Person" (singular)
**And** click "Save Changes"
**Then** labels are updated in the database
**And** the UI immediately reflects "People" in navigation
**And** buttons show "Add Person"

#### Scenario: Contextual help for entities
**Given** an administrator is customizing labels
**When** viewing each entity field
**Then** contextual help text explains the entity's purpose
**And** provides examples of alternative labels
**And** clarifies singular vs plural usage

#### Scenario: Reset to defaults
**Given** an administrator has customized labels
**When** they click "Reset to Defaults"
**And** confirm the action
**Then** all labels revert to default values
**And** the UI updates immediately
**And** database is updated with defaults

## REMOVED Requirements

### Requirement: Department as Top-Level Navigation Entity
The Department field SHALL NOT be customizable as a top-level navigation entity.

#### Scenario: Department removed from customization
**Given** an administrator views Settings > Customization
**Then** "Department" does not appear in entity label fields
**And** Department is moved to User Profile Attributes section
**And** Department customization affects only user profile displays

### Requirement: Devices, Workflows, Templates in Customization
Non-implemented entities SHALL NOT appear in label customization.

#### Scenario: Only implemented entities shown
**Given** an administrator views Settings > Customization
**Then** only implemented entities are shown
**And** "Devices", "Workflows", and "Templates" do not appear
**And** only entity.user, entity.workspace, entity.access_group, entity.policy_container are present

## ADDED Requirements (Performance & Security)

### Requirement: Label Caching
The system SHALL cache custom labels to minimize API calls and improve performance.

#### Scenario: Labels cached on login
**Given** a user logs in
**When** the application initializes
**Then** labels are fetched once from the API
**And** stored in React Context for the session
**And** no additional API calls are made for label lookups

#### Scenario: Cache invalidation on update
**Given** labels are cached in the context
**When** an administrator updates labels
**Then** the cache is invalidated
**And** fresh labels are fetched from the API
**And** all components receive updated labels

### Requirement: Audit Trail for Label Changes
The system SHALL maintain an audit trail of all label customization changes.

#### Scenario: Log label updates
**Given** an administrator updates labels
**When** the update is saved
**Then** an audit log entry is created
**And** records: organizationId, userId, timestamp, old values, new values
**And** administrators can view the audit trail

#### Scenario: Track who changed labels
**Given** labels were updated
**When** reviewing audit logs
**Then** the log shows which user made the change
**And** shows the exact time of change
**And** shows before and after values for each label
