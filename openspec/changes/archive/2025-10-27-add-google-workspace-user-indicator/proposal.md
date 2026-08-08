# Add Google Workspace User Indicator

## Why

Users synced from Google Workspace are not visually distinguishable in the user list UI. When users have `googleWorkspaceId` populated (indicating they're synced from Google Workspace), there's no visual indicator in the PLATFORMS column showing their Google Workspace connection. This makes it difficult for admins to understand which users are managed through Google Workspace vs locally created.

## What Changes

- Dynamically add 'google_workspace' to the platforms array when rendering users who have `googleWorkspaceId` populated
- Display blue "G" icon (Google's brand color #4285F4) in the PLATFORMS column for Google Workspace users
- Update platform filter logic to include users with `googleWorkspaceId` when filtering by 'google_workspace'
- Ensure platform indicators work correctly alongside existing platforms (local, Microsoft 365, etc.)

## Impact

- **Affected specs:** user-directory
- **Affected code:**
  - `frontend/src/components/UserList.tsx` - Platform rendering logic (lines 540-574, 629-642)
- **User experience:** Admins can now visually identify which users are synced from Google Workspace
- **No breaking changes:** Existing platform indicators continue to work as before
