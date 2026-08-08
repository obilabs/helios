# Feature Flags and Module Integration

## ADDED Requirements

### Requirement: Entity Visibility Based on Module Enablement
The system SHALL show or hide entities in navigation based on enabled modules.

#### Scenario: Workspaces hidden when no collaboration modules enabled
**Given** no collaboration modules are enabled (Teams/Chat)
**When** viewing the navigation
**Then** the Workspaces navigation item is hidden
**And** the Workspaces page is not accessible

#### Scenario: Workspaces shown when Microsoft Teams enabled
**Given** Microsoft 365 module is enabled
**When** viewing the navigation
**Then** the {labels.entity.workspace.plural} navigation item is visible
**And** clicking it shows workspaces synced from Microsoft Teams

#### Scenario: Access Groups visibility with Google Workspace
**Given** Google Workspace module is enabled
**When** viewing the navigation
**Then** the {labels.entity.access_group.plural} navigation item is visible
**And** shows Google Groups synced from workspace

### Requirement: Feature-Specific Settings Visibility
The system SHALL show module-specific settings only when the module is enabled.

#### Scenario: Google Workspace settings appear when enabled
**Given** Google Workspace module is enabled
**When** viewing Settings > Modules
**Then** Google Workspace configuration options are visible
**And** sync settings are accessible
**And** test connection button is available

#### Scenario: Google Workspace settings hidden when disabled
**Given** Google Workspace module is disabled
**When** viewing Settings > Modules
**Then** only the "Enable" button is visible
**And** configuration options are hidden
**And** sync settings are not accessible

### Requirement: Dashboard Stats Based on Enabled Modules
The system SHALL display statistics only for enabled entity types.

#### Scenario: User stats always shown (core entity)
**Given** any module configuration
**When** viewing the dashboard
**Then** user statistics are always displayed
**And** shows total users, active users, suspended users

#### Scenario: Workspace stats only when module enabled
**Given** no collaboration modules are enabled
**When** viewing the dashboard
**Then** workspace statistics are not displayed
**And** workspace stat cards are hidden

**Given** Microsoft 365 module is enabled
**When** viewing the dashboard
**Then** workspace statistics are displayed
**And** shows total workspaces, active members

### Requirement: Module-Entity Mapping
The system SHALL define which modules enable which entities.

#### Scenario: Google Workspace enables Access Groups
**Given** the module-entity mapping configuration
**Then** Google Workspace module enables entity.access_group
**And** provides Google Groups in the Access Groups list

#### Scenario: Microsoft 365 enables Workspaces and Access Groups
**Given** the module-entity mapping configuration
**Then** Microsoft 365 module enables entity.workspace
**And** Microsoft 365 module enables entity.access_group
**And** provides Teams in Workspaces and Security Groups in Access Groups

#### Scenario: Core entities always available
**Given** the module-entity mapping configuration
**Then** entity.user is always available (no module required)
**And** entity.policy_container is always available
**And** these cannot be disabled

### Requirement: Graceful Degradation When Module Disabled
The system SHALL gracefully handle module disablement without data loss.

#### Scenario: Disable Google Workspace
**Given** Google Workspace is enabled with synced data
**When** an administrator disables the module
**Then** Access Groups from Google are marked as inactive
**And** data is preserved in the database
**And** Access Groups navigation may be hidden if no other source
**And** sync stops immediately

#### Scenario: Re-enable module shows previous data
**Given** a module was disabled with existing data
**When** an administrator re-enables the module
**Then** previously synced entities become visible again
**And** sync resumes from last state
**And** no data was lost during disabled period

### Requirement: Feature Flag Configuration Service
The system SHALL provide a service to check module enablement and entity availability.

#### Scenario: Check if entity is available
**Given** module configuration for the organization
**When** code checks if entity.workspace is available
**Then** returns true if any module providing workspaces is enabled
**And** returns false if all workspace modules are disabled

#### Scenario: Get available entity types
**Given** an organization with specific modules enabled
**When** requesting available entity types
**Then** returns list of canonical entities available
**And** includes which modules provide each entity
**And** used to determine navigation items to show

### Requirement: Module Dependencies for Entity Features
The system SHALL enforce module dependencies when entities require specific features.

#### Scenario: Email signatures require public assets
**Given** Email Signatures module depends on Public Assets module
**When** attempting to enable Email Signatures
**Then** system checks if Public Assets is enabled
**And** auto-enables Public Assets if needed
**And** shows dependency relationship to user

#### Scenario: Workspace features require collaboration module
**Given** workspace features require Microsoft 365 or Google Chat
**When** attempting to create a workspace
**Then** system checks if any collaboration module is enabled
**And** shows error if no modules available
**And** prompts to enable a module first

## ADDED Requirements (Frontend)

### Requirement: ModulesContext Integration with LabelsContext
The system SHALL integrate module enablement with label resolution.

#### Scenario: LabelsContext includes entity availability
**Given** the LabelsContext provides labels
**When** components request labels
**Then** each entity label includes an `isAvailable` flag
**And** flag is based on module enablement
**And** components can conditionally render based on availability

#### Scenario: Dynamic navigation based on modules
**Given** modules change state (enabled/disabled)
**When** the UI updates
**Then** navigation items appear or disappear dynamically
**And** uses smooth transitions
**And** preserves user's current page if still available

### Requirement: Settings Page Module-Entity Awareness
The system SHALL show entity customization only for available entities.

#### Scenario: Hide workspace labels when unavailable
**Given** no collaboration modules are enabled
**When** viewing Settings > Customization
**Then** entity.workspace label fields are hidden or disabled
**And** shows "(Requires Microsoft 365 or Google Chat)"
**And** prevents customization of unavailable entities

#### Scenario: Show all labels when modules enabled
**Given** Google Workspace and Microsoft 365 are both enabled
**When** viewing Settings > Customization
**Then** all entity label fields are available
**And** entity.workspace customization is enabled
**And** entity.access_group customization is enabled

## MODIFIED Requirements

### Requirement: Module Enablement UI Shows Entity Impact
The system SHALL show which entities will become available when enabling a module.

#### Scenario: Google Workspace enablement preview
**Given** Google Workspace is disabled
**When** viewing the "Enable" button
**Then** hovering shows tooltip or help text
**And** explains: "Enables Access Groups synced from Google Groups"
**And** explains: "Enables Org Units synced from Organizational Units"

#### Scenario: Microsoft 365 enablement preview
**Given** Microsoft 365 is disabled
**When** viewing the "Enable" button
**Then** tooltip explains: "Enables Workspaces synced from Microsoft Teams"
**And** explains: "Enables Access Groups synced from Security Groups"

## ADDED Requirements (Backend)

### Requirement: Entity Availability Service
The system SHALL provide backend API to query entity availability per organization.

#### Scenario: Get available entities
**Given** an organization with specific modules enabled
**When** requesting GET /api/organization/available-entities
**Then** returns list of canonical entities with availability:
```json
{
  "entity.user": { available: true, providedBy: ["core"] },
  "entity.workspace": { available: true, providedBy: ["microsoft_365"] },
  "entity.access_group": { available: true, providedBy: ["google_workspace", "microsoft_365"] },
  "entity.policy_container": { available: true, providedBy: ["google_workspace"] }
}
```

### Requirement: Module-Entity Registry
The system SHALL maintain a registry mapping modules to the entities they provide.

#### Scenario: Module-entity registry structure
**Given** the system configuration
**Then** a registry defines entity providers:
```typescript
{
  "core": ["entity.user"],
  "google_workspace": ["entity.access_group", "entity.policy_container"],
  "microsoft_365": ["entity.workspace", "entity.access_group"],
  "google_chat": ["entity.workspace"],
  "device_management": ["entity.device"]
}
```

#### Scenario: Query entities provided by module
**Given** the module-entity registry
**When** querying which entities "google_workspace" provides
**Then** returns ["entity.access_group", "entity.policy_container"]
**And** can be used to show/hide navigation dynamically
