# Entity Separation - Workspaces and Access Groups

## ADDED Requirements

### Requirement: Workspace Entity for Collaboration Spaces
The system SHALL provide a distinct Workspace entity for full collaboration environments with chat, files, and tasks.

#### Scenario: Workspace maps to Microsoft Teams
**Given** Microsoft 365 integration is enabled
**When** syncing Teams from M365
**Then** each Microsoft Team is stored as entity.workspace
**And** includes metadata for SharePoint site, Planner, etc.
**And** represents a full collaboration environment

#### Scenario: Workspace maps to Google Chat Spaces
**Given** Google Workspace integration is enabled
**When** syncing Chat Spaces from Google
**Then** each Google Chat Space is stored as entity.workspace
**And** can be linked to a Shared Drive
**And** provides chat and collaboration features

#### Scenario: Create workspace
**Given** an administrator wants to create a collaboration space
**When** they click "Create {labels.entity.workspace.singular}"
**Then** a workspace creation form appears
**And** workspace is created in the database
**And** can be provisioned in connected platforms (M365/GWS)

### Requirement: Access Group Entity for Permission and Mailing Lists
The system SHALL provide a distinct Access Group entity for managing permissions and communications without collaboration features.

#### Scenario: Access Group maps to Google Groups
**Given** Google Workspace integration is enabled
**When** syncing Groups from Google
**Then** each Google Group is stored as entity.access_group
**And** includes email address and membership
**And** represents a mailing list and permission container

#### Scenario: Access Group maps to M365 Security Groups
**Given** Microsoft 365 integration is enabled
**When** syncing Security Groups from M365
**Then** each Security Group is stored as entity.access_group
**And** includes membership and permissions
**And** represents an access control list

#### Scenario: Create access group
**Given** an administrator wants to create a mailing list
**When** they click "Create {labels.entity.access_group.singular}"
**Then** an access group creation form appears
**And** group is created in the database
**And** can be provisioned in connected platforms

### Requirement: Clear UI Distinction Between Entities
The system SHALL clearly distinguish Workspaces from Access Groups in the UI.

#### Scenario: Separate navigation items
**Given** a user views the navigation
**Then** Workspaces and Access Groups are separate navigation items
**And** each uses its own custom label
**And** clicking each navigates to different pages

#### Scenario: Different creation flows
**Given** an administrator creates a Workspace
**Then** the creation form is optimized for collaboration setup
**And** includes options for chat, file storage, tasks

**Given** an administrator creates an Access Group
**Then** the creation form is optimized for permissions
**And** includes options for email, member list, permissions

### Requirement: Migration of Existing Groups Data
The system SHALL migrate existing groups data to the Access Groups entity.

#### Scenario: Migrate Google Groups
**Given** existing groups from Google Workspace sync
**When** the migration runs
**Then** all groups are migrated to `access_groups` table
**And** classified as type 'google_group'
**And** all metadata and relationships are preserved
**And** no data is lost

#### Scenario: Backward compatibility during migration
**Given** migration is in progress
**When** users access the application
**Then** existing functionality continues to work
**And** groups data is accessible
**And** no downtime occurs

## MODIFIED Requirements

### Requirement: Google Workspace Sync Groups Classification
The system SHALL sync Google Groups to the Access Groups entity, not Workspaces.

#### Scenario: Sync Google Groups
**Given** Google Workspace sync is running
**When** fetching groups from Google Workspace
**Then** each group is stored in `access_groups` table
**And** classified as type 'google_group'
**And** includes email, description, members

### Requirement: Navigation Structure Update
The system SHALL update navigation to show Workspaces and Access Groups as separate items.

#### Scenario: Updated navigation
**Given** a user views the navigation
**Then** "Directory" section includes:
  - {labels.entity.user.plural} (e.g., "Users")
  - {labels.entity.workspace.plural} (e.g., "Teams")
  - {labels.entity.access_group.plural} (e.g., "Groups")
  - {labels.entity.policy_container.plural} (e.g., "Org Units")
**And** "Groups" is replaced with Workspaces + Access Groups

## REMOVED Requirements

### Requirement: Single Groups Entity
The system SHALL NOT use a single undifferentiated "Groups" entity.

#### Scenario: No ambiguous groups entity
**Given** the canonical data model
**Then** there is no entity.group
**And** collaboration spaces use entity.workspace
**And** permission lists use entity.access_group
**And** user intent is clear for each action

## ADDED Requirements (Database Schema)

### Requirement: Workspaces Table Schema
The system SHALL provide a workspaces table for collaboration space data.

#### Scenario: Workspaces table structure
**Given** the database schema
**Then** a `workspaces` table exists
**And** includes: id, organization_id, name, description
**And** includes: type (microsoft_team, google_chat_space)
**And** includes: external_id, metadata JSONB
**And** has indexes on organization_id and external_id

### Requirement: Access Groups Table Schema
The system SHALL provide an access_groups table for permission/mailing list data.

#### Scenario: Access Groups table structure
**Given** the database schema
**Then** an `access_groups` table exists
**And** includes: id, organization_id, name, email
**And** includes: type (google_group, m365_security_group, m365_distribution_group)
**And** includes: external_id, metadata JSONB
**And** has indexes on organization_id, external_id, email

### Requirement: Workspace Membership
The system SHALL track members of workspaces with roles.

#### Scenario: Workspace members junction table
**Given** the database schema
**Then** a `workspace_members` table exists
**And** includes: workspace_id, user_id, role
**And** role can be: owner, admin, member
**And** has indexes for efficient member lookups

### Requirement: Access Group Membership
The system SHALL track members of access groups.

#### Scenario: Access Group members junction table
**Given** the database schema
**Then** an `access_group_members` table exists
**And** includes: access_group_id, user_id
**And** has indexes for efficient member lookups
