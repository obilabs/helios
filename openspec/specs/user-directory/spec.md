# user-directory Specification

## Purpose
TBD - created by archiving change add-google-workspace-user-indicator. Update Purpose after archive.
## Requirements
### Requirement: Google Workspace User Indicator
The system SHALL display a visual indicator for users synced from Google Workspace in the user list.

#### Scenario: User with Google Workspace ID shows indicator
- **WHEN** a user has `googleWorkspaceId` populated in the database
- **THEN** a blue "G" icon (color #4285F4) SHALL appear in the PLATFORMS column
- **AND** the icon title SHALL be "Google Workspace"

#### Scenario: Platform filter includes Google Workspace users
- **WHEN** the platform filter is set to 'google_workspace'
- **THEN** all users with `googleWorkspaceId` populated SHALL be included in the filtered results
- **AND** users with 'google_workspace' in their platforms array SHALL also be included

#### Scenario: User with multiple platforms
- **WHEN** a user has both `googleWorkspaceId` and other platforms (e.g., 'local')
- **THEN** multiple platform icons SHALL be displayed
- **AND** the icons SHALL overlap slightly (margin-left: -6px) with proper z-index
- **AND** each icon SHALL have a white border for separation

#### Scenario: User without Google Workspace connection
- **WHEN** a user has no `googleWorkspaceId`
- **THEN** no Google Workspace icon SHALL be displayed
- **AND** other platform indicators SHALL display normally

