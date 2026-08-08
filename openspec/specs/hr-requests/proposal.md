# Proposal: HR Requests & Approval Flow

## Goal
Enable HR personnel to submit structured onboarding and offboarding requests. These requests will go into a "Pending" state, requiring approval from an IT Admin before user accounts are created or modified.

## Prototype & Current State
*   **Schema**: `onboarding_requests` table exists (Migration 062).
*   **Backend**: `RequestService` implemented for CRUD operations.
*   **Frontend**: `RequestsPage` (`/admin/requests`) skeleton created.

## Scope
1.  **Frontend: Request Submission Form**
    *   Create a "New Request" modal/slideout.
    *   Fields: First Name, Last Name, Personal Email, Start Date, Department, Job Title, Manager.
    *   Re-use components from `AddUserSlideout` where possible.
2.  **Frontend: Approval Dashboard**
    *   Enhance `RequestsPage` to show pending requests.
    *   Add "Approve" and "Reject" actions for Admins.
    *   **Approve Action**: Should trigger the *User Creation* flow (pre-filling data from the request) OR automatically convert to a `Staged` user.
3.  **CSV Bulk Import**
    *   Add "Import CSV" feature to `RequestsPage`.
    *   Parse CSV and create multiple `pending` requests.
    *   Use existing `CsvParserService`.
4.  **Notifications**
    *   Email notification to Admins when a new request is submitted.
    *   Email notification to HR Requester when request is approved/rejected.

## Technical Specifications
### Data Model (`onboarding_requests` table)
*   `type`: 'onboarding' | 'offboarding'
*   `status`: 'pending' | 'approved' | 'rejected'
*   `data`: JSONB (Snapshot of form data)

### Approval Logic
*   **On Approval**:
    *   Call `UserOnboardingService.createHeliosUser()` with `user_status = 'staged'`.
    *   Update request status to `approved`.
*   **On Rejection**:
    *   Update status to `rejected` with a comment.

## Dependencies
*   `RequestService` (Backend)
*   `UserOnboardingService` (Backend - for final user creation)

## Risks
*   **Data Staleness**: Validating that the "Department" or "Manager" in an old pending request still exists before approval.
