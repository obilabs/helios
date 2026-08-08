# Navigation - Spec Delta

## ADDED Requirements

### Requirement: URL-Based Navigation
The system SHALL use URL-based routing for all page navigation within the application.

#### Scenario: Page refresh maintains current location
- **WHEN** a user is on any page (e.g., `/users`)
- **AND** the user refreshes the browser
- **THEN** the user SHALL remain on the same page
- **AND** the application state SHALL be restored appropriately

#### Scenario: Browser back button works
- **WHEN** a user navigates from page A to page B
- **AND** clicks the browser back button
- **THEN** the user SHALL return to page A
- **AND** the page SHALL render correctly

#### Scenario: Browser forward button works
- **WHEN** a user has navigated back using the browser back button
- **AND** clicks the browser forward button
- **THEN** the user SHALL return to the next page in history
- **AND** the page SHALL render correctly

#### Scenario: Direct URL access to pages
- **WHEN** a user enters a URL directly (e.g., `http://localhost:3000/groups`)
- **AND** the user is authenticated
- **THEN** the requested page SHALL load directly
- **AND** authentication SHALL be verified before rendering

#### Scenario: Deep linking to resources
- **WHEN** a user enters a URL with parameters (e.g., `/groups/abc-123`)
- **AND** the user is authenticated
- **THEN** the specific resource page SHALL load
- **AND** the correct data SHALL be fetched and displayed

#### Scenario: Bookmarking pages
- **WHEN** a user bookmarks a page URL
- **AND** later clicks the bookmark
- **THEN** the user SHALL be taken directly to that page
- **AND** authentication SHALL be checked and maintained

### Requirement: Protected Routes
The system SHALL protect authenticated pages and redirect unauthenticated users to login.

#### Scenario: Unauthenticated access to protected page
- **WHEN** a user without authentication token accesses a protected route
- **THEN** the user SHALL be redirected to the login page
- **AND** the intended destination SHALL be stored for post-login redirect

#### Scenario: Authenticated access to protected page
- **WHEN** a user with valid authentication token accesses a protected route
- **THEN** the user SHALL be granted access to the page
- **AND** the page SHALL render normally

#### Scenario: Token expiry during navigation
- **WHEN** a user's authentication token expires while navigating
- **THEN** the user SHALL be redirected to login
- **AND** an appropriate message SHALL be displayed

#### Scenario: Post-login redirect
- **WHEN** a user is redirected to login from a protected page
- **AND** successfully logs in
- **THEN** the user SHALL be redirected to their originally intended page
- **AND** NOT to the default dashboard

### Requirement: Public Routes
The system SHALL allow access to specific public routes without authentication.

#### Scenario: Password setup page access
- **WHEN** a user accesses `/setup-password` with a valid token
- **THEN** the password setup page SHALL be displayed
- **AND** NO authentication check SHALL be required

#### Scenario: Login page access
- **WHEN** a user accesses `/` or `/login` without authentication
- **THEN** the login page SHALL be displayed
- **AND** NO redirect SHALL occur

## MODIFIED Requirements

### Requirement: Sidebar Navigation
The system SHALL provide a collapsible sidebar for navigation with active page highlighting.

#### Scenario: Navigation link updates URL
- **WHEN** a user clicks a navigation link in the sidebar
- **THEN** the browser URL SHALL update to match the destination
- **AND** the page content SHALL change accordingly
- **AND** the navigation SHALL be added to browser history

#### Scenario: Active page highlighting
- **WHEN** a user is on a specific page
- **THEN** the corresponding sidebar navigation item SHALL be visually highlighted
- **AND** the highlighting SHALL be based on the current URL path

#### Scenario: Programmatic navigation
- **WHEN** the application performs programmatic navigation (e.g., after form submission)
- **THEN** the browser URL SHALL update appropriately
- **AND** the navigation SHALL be added to browser history
