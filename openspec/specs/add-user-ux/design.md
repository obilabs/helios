# Software Design Document: Add User UX Improvements (Phase 3 & 4)

## 1. Overview
Enhance the user creation experience by refining the UI, enforcing data consistency through dropdowns, and integrating license management.

## 2. Requirements

### 2.1 Refinements (QuickAddUserSlideOut.tsx)
-   **Job Title Dropdown**: Replace free-text input with a dropdown populated from Master Data (like Departments).
-   **Manager Dropdown**: Ensure it filters active users and prevents self-selection (already partially implemented, verify robustness).
    -   *Constraint*: Must handle potentially large lists (consider virtual scrolling if > 100 users, though currently limited to 100).
-   **Validation**: Ensure "Create in" checkboxes respect available integrations (Google/Microsoft).

### 2.2 Phase 3: Add User Page (/add-user)
-   **Alignment**: Fix CSS grid/flex alignment issues to matching the design system.
-   **Provider Selection**: Add "Create in Google Workspace" / "Create in Microsoft 365" checkboxes similar to the slideout.
-   **Consistency**: Ensure fields match the `QuickAddUserSlideOut` (Job Title, Dept, Manager).

### 2.3 Phase 4: License Management
-   **UI**: Add "Assign License" dropdown to both Quick Add and Full Add forms.
-   **Backend**: Expose endpoints to list available licenses and assign them during user creation.
-   **Integration**:
    -   Google Workspace: `skuId` assignment.
    -   Microsoft 365: `skuId` assignment.

## 3. Technical Design

### 3.1 Frontend Components

#### QuickAddUserSlideOut.tsx
-   **Props**: Accept `organizationId`.
-   **State**: `availableLicenses` (array).
-   **Effect**: Fetch licenses on mount.
-   **Render**:
    -   Replace `<input name="jobTitle">` with `<Select options={jobTitles} ... />`.
    -   Add `<Select name="license" ... />` below Role.

#### AddUser.tsx
-   Refactor form layout to use standard `.form-group` and `.form-row` classes for alignment.
-   Import and reuse `ValidationUtils`.

### 3.2 Backend API

#### New Endpoint: `GET /api/v1/licenses`
-   **Response**:
    ```json
    {
      "success": true,
      "data": {
        "google": [{ "skuId": "123", "name": "Google Workspace Business Starter", "available": 5 }],
        "microsoft": [{ "skuId": "456", "name": "Microsoft 365 E3", "available": 10 }]
      }
    }
    ```

#### Modified Endpoint: `POST /api/v1/organization/users`
-   **Body**: Accept `licenses: { google: string[], microsoft: string[] }`.
-   **Logic**: Call provider APIs to assign licenses after user creation.

## 4. Data Flow
1.  **Init**: Fetch Department, Job Titles (Master Data), and Licenses.
2.  **Input**: User selects values from dropdowns.
3.  **Submit**: POST payload includes validated IDs/Strings and License SKUs.
4.  **Process**: Create User -> Async Job -> Assign Licenses -> Sync to Providers.
