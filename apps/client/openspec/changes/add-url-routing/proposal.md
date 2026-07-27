# Add URL-Based Routing

## Why

The application currently uses state-based navigation (`currentPage` state variable) instead of URL-based routing. This causes several issues:
- Browser refresh always returns users to the dashboard/home page, losing their current location
- Users cannot bookmark specific pages
- Browser back/forward buttons don't work as expected
- No support for deep linking to specific resources (e.g., `/users`, `/groups/123`)
- Poor user experience when navigating the application

## What Changes

- Install and integrate React Router (react-router-dom)
- Replace state-based navigation with URL-based routing
- Define routes for all pages: `/`, `/users`, `/groups`, `/groups/:id`, `/settings`, `/administrators`, `/assets`, `/templates`, `/public-assets`, `/org-units`
- Update all navigation links to use React Router's `<Link>` or `useNavigate()` instead of `setCurrentPage()`
- Preserve authentication state and protected routes
- Maintain existing sidebar navigation UI while using proper routing underneath
- **BREAKING**: Users will need to refresh their browser to get the new routing system

## Impact

- **Affected specs:** navigation, authentication
- **Affected code:**
  - `frontend/src/App.tsx` - Replace state navigation with React Router
  - All navigation links in sidebar and buttons
  - May affect authentication flow and protected routes
- **Dependencies:** Need to add `react-router-dom` package
- **User experience:** Significantly improved - refresh maintains position, back/forward buttons work, bookmarkable URLs
- **Migration:** Users will need to refresh after deployment
