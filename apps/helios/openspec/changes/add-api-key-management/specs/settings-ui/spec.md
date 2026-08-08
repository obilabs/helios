# Settings UI - Integrations Tab

## ADDED Requirements

### Requirement: Integrations Tab in Settings
The system SHALL provide an "Integrations" tab in the Settings page for managing external integrations and API keys.

#### Scenario: Navigate to Integrations tab
**Given** a user is logged in as an administrator
**When** the user navigates to Settings
**And** clicks the "Integrations" tab
**Then** the Integrations management interface is displayed

### Requirement: API Keys Section
The Integrations tab SHALL include an "API Keys" section that lists all API keys for the organization.

#### Scenario: View API keys list
**Given** an administrator is on the Integrations tab
**When** the API Keys section loads
**Then** all API keys are displayed in a list
**And** each key shows: name, type, status, last used, expires at

### Requirement: API Key Type Badges
The system SHALL visually distinguish Service keys and Vendor keys with type badges.

#### Scenario: Service key badge
**Given** a Service API key exists
**When** viewing the API keys list
**Then** the key displays a "Service" badge
**And** uses Bot icon (not emoji)

#### Scenario: Vendor key badge
**Given** a Vendor API key exists
**When** viewing the API keys list
**Then** the key displays a "Vendor" badge
**And** uses Users icon (not emoji)

### Requirement: API Key Status Indicators
The system SHALL display clear status indicators for Active, Expiring Soon, Expired, and Revoked keys.

#### Scenario: Active key indicator
**Given** an API key is active and not expiring soon
**When** viewing the key in the list
**Then** a green "Active" badge is displayed

#### Scenario: Expiring soon indicator
**Given** an API key expires in less than 14 days
**When** viewing the key in the list
**Then** an amber "Expiring Soon" badge is displayed
**And** the days until expiration are shown

#### Scenario: Expired key indicator
**Given** an API key has expired
**When** viewing the key in the list
**Then** a red "Expired" badge is displayed
**And** a "Renew" button is available

#### Scenario: Revoked key indicator
**Given** an API key has been revoked
**When** viewing the key in the list
**Then** a gray "Revoked" badge is displayed
**And** no action buttons are available except "View History"

### Requirement: Create API Key Wizard
The system SHALL provide a multi-step wizard for creating new API keys.

#### Scenario: Start key creation
**Given** an administrator is on the Integrations tab
**When** clicking "+ Create New Key"
**Then** the API Key Creation Wizard opens

#### Scenario: Type selection step
**Given** the creation wizard is open
**When** on the type selection step
**Then** two options are presented: Service and Vendor
**And** each option has a clear description and icon
**And** selecting one advances to configuration

#### Scenario: Service configuration
**Given** "Service" type was selected
**When** on the configuration step
**Then** the form requests: name, description, permissions, expiration
**And** actor fields are not shown

#### Scenario: Vendor configuration
**Given** "Vendor" type was selected
**When** on the configuration step
**Then** the form requests: name, vendor contact, description, permissions, expiration
**And** shows "Actor Information Required" notice
**And** provides optional pre-approved actors list
**And** provides optional client reference requirement toggle

### Requirement: Show Once Modal
The system SHALL display the new API key exactly once in a modal after creation with copy functionality.

#### Scenario: Key shown once
**Given** an API key was just created
**When** the creation completes successfully
**Then** a modal displays the full API key
**And** a "Copy to Clipboard" button is provided
**And** a warning states "This will only be shown once"
**And** a confirmation checkbox "I've saved the key securely" must be checked
**And** the modal cannot be closed until confirmed

#### Scenario: Copy key to clipboard
**Given** the Show Once modal is displayed
**When** clicking "Copy to Clipboard"
**Then** the key is copied to clipboard
**And** a "✓ Copied" indicator is shown

### Requirement: API Key Detail View
The system SHALL provide a detailed view for each API key with tabs for Overview, Usage, and Settings.

#### Scenario: Open key details
**Given** an API key exists in the list
**When** clicking the key row or "View Details" button
**Then** the API Key Detail View opens

#### Scenario: Overview tab
**Given** the API Key Detail View is open
**When** on the Overview tab
**Then** key metadata is displayed: name, type, created, expires, last used
**And** permissions list is shown
**And** configuration details are shown (service/vendor specific)

#### Scenario: Usage tab
**Given** the API Key Detail View is open
**When** clicking the Usage tab
**Then** recent API calls are listed
**And** actor attribution is shown (for vendor keys)
**And** success/failure rates are displayed
**And** a usage chart for the last 30 days is shown
**And** an export button is available

#### Scenario: Settings tab
**Given** the API Key Detail View is open
**When** clicking the Settings tab
**Then** editable fields are shown: permissions, expiration, IP whitelist
**And** a "Save Changes" button is provided
**And** changes trigger audit log entries

### Requirement: API Key Renewal Workflow
The system SHALL provide an intuitive renewal workflow for expired keys.

#### Scenario: Renew expired key
**Given** an API key is expired
**When** clicking "Renew Key"
**Then** a confirmation dialog appears
**And** explains the renewal process
**And** allows setting new expiration date
**When** confirmed
**Then** a new API key is generated
**And** the new key is shown in the Show Once modal
**And** the old key is marked as revoked
**And** the audit log records the renewal

### Requirement: API Key Revocation
The system SHALL provide immediate revocation of API keys with confirmation.

#### Scenario: Revoke active key
**Given** an active API key exists
**When** clicking "Revoke Key"
**Then** a confirmation dialog appears
**And** warns about immediate effect
**When** confirmed
**Then** the key is immediately revoked
**And** displays "Revoked" status
**And** cannot be used for authentication
**And** the audit log records the revocation

### Requirement: Design System Compliance
The system SHALL use Lucide React icons and follow the Helios design system for all UI components.

#### Scenario: Icon usage
**Given** any API Key management UI component
**When** rendering icons
**Then** Lucide React icons are used (16px, monochrome, stroke-based)
**And** NO emojis are used

#### Scenario: Color palette
**Given** any API Key management UI component
**When** rendering colors
**Then** the purple primary color (#8b5cf6) is used for interactive elements
**And** status colors follow the design system:
  - Success: #10b981 (green)
  - Warning: #f59e0b (amber)
  - Danger: #ef4444 (red)
  - Neutral: Subtle grays

#### Scenario: Spacing and typography
**Given** any API Key management UI component
**When** rendering layout
**Then** spacing follows the 4px-48px scale
**And** typography follows the 11px-28px scale
**And** table rows are 48px fixed height

### Requirement: Responsive Design
The system SHALL ensure all API Key management UI is responsive across desktop, tablet, and mobile viewports.

#### Scenario: Mobile API keys list
**Given** viewing the API Keys section on mobile
**When** the viewport width is < 768px
**Then** the list adapts to a stacked card layout
**And** essential information remains visible
**And** action buttons are accessible

### Requirement: Loading and Error States
The system SHALL provide clear loading and error states for all API Key operations.

#### Scenario: Loading state
**Given** an API Key operation is in progress
**When** waiting for the response
**Then** a loading spinner or skeleton is displayed
**And** interaction is disabled until complete

#### Scenario: Error state
**Given** an API Key operation fails
**When** the error occurs
**Then** an error message is displayed
**And** the message is user-friendly (not technical jargon)
**And** recovery options are provided when applicable

### Requirement: Permission Selection Interface
The system SHALL provide a clear checkbox interface for selecting API key permissions.

#### Scenario: Permission categories
**Given** configuring API key permissions
**When** the permissions interface is shown
**Then** permissions are grouped by resource type:
  - Users (read:users, write:users, delete:users)
  - Groups (read:groups, write:groups, delete:groups)
  - Settings (read:settings, write:settings)
**And** dangerous permissions are marked with warning indicators

### Requirement: Expiration Date Selection
The system SHALL provide intuitive expiration date selection with presets and custom options.

#### Scenario: Expiration presets
**Given** configuring API key expiration
**When** the expiration interface is shown
**Then** preset options are available:
  - 30 days
  - 90 days (recommended for vendors)
  - 365 days
  - Never expires (for services only)
  - Custom date picker

### Requirement: Search and Filter
The system SHALL provide search and filter capabilities for the API keys list.

#### Scenario: Search by name
**Given** multiple API keys exist
**When** entering text in the search box
**Then** the list filters to keys matching the search term
**And** matches name, description, or vendor name

#### Scenario: Filter by status
**Given** multiple API keys exist
**When** selecting a status filter (Active/Expired/Revoked)
**Then** the list shows only keys with that status

#### Scenario: Filter by type
**Given** multiple API keys exist
**When** selecting a type filter (Service/Vendor)
**Then** the list shows only keys of that type
