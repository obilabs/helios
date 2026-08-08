# URL Routing Design

## Context

The Helios Client Portal currently uses React state (`currentPage`) to manage navigation between pages. This approach doesn't integrate with browser navigation APIs, causing poor UX when users refresh pages or use browser navigation buttons.

## Goals / Non-Goals

### Goals
- Implement proper URL-based routing using React Router
- Preserve current UI/UX while adding proper navigation underneath
- Support browser back/forward buttons
- Enable bookmarking and deep linking
- Maintain authentication protection on routes

### Non-Goals
- NOT redesigning the UI or navigation structure
- NOT adding new pages or features
- NOT changing authentication mechanism (just integrate with routing)

## Decisions

### Decision 1: Use React Router v6
**Rationale:** Industry standard, well-maintained, modern hooks-based API, excellent TypeScript support

**Alternatives considered:**
- Wouter (lighter weight) - Too minimal for our needs
- Reach Router (deprecated) - Merged into React Router
- Custom routing - Reinventing the wheel, not worth maintenance burden

### Decision 2: Use BrowserRouter (not HashRouter)
**Rationale:** Clean URLs without `#`, better for SEO and sharing, proper browser history integration

**Trade-off:** Requires server-side configuration to handle client-side routes (already configured in Vite dev server and will need nginx/apache config in production)

### Decision 3: Route Structure
```
/ - Dashboard (or login if not authenticated)
/users - User list (staff tab by default)
/groups - Groups list
/groups/:id - Group detail page
/settings - Settings page
/administrators - Administrators page
/assets - Asset management
/templates - Template studio
/public-assets - Public assets management
/org-units - Organizational units
/setup-password - Password setup (public route)
/add-user - Add user page
```

### Decision 4: Protected Routes Pattern
Create a `<ProtectedRoute>` wrapper component that:
- Checks for authentication token
- Redirects to login if not authenticated
- Stores intended destination for post-login redirect
- Wraps all authenticated pages

### Decision 5: Sidebar Navigation Integration
Keep existing sidebar UI, but:
- Replace `onClick={() => setCurrentPage('page')}` with `<Link to="/page">`
- Use `useLocation()` hook to highlight active page
- Maintain collapse/expand state separately from routing

## Risks / Trade-offs

### Risk: Breaking existing bookmarks/URLs
**Mitigation:** Users don't currently have bookmarkable URLs (everything is #/), so this is actually an improvement. No migration needed.

### Risk: Authentication state issues
**Mitigation:** Carefully test authentication flow, especially:
- Redirect to login when token expires
- Redirect back to intended page after login
- Handle public routes (/setup-password) properly

### Risk: Performance regression
**Mitigation:** React Router is highly optimized. Minimal bundle size increase (~10KB gzipped). No performance concerns expected.

## Migration Plan

### Phase 1: Installation
1. Install react-router-dom: `npm install react-router-dom`
2. Add TypeScript types if needed

### Phase 2: Core Implementation
1. Wrap App with `<BrowserRouter>` in main.tsx
2. Create `<ProtectedRoute>` component
3. Define all routes using `<Routes>` and `<Route>`
4. Replace page switching logic with route rendering

### Phase 3: Navigation Updates
1. Update sidebar links to use `<Link>` or `<NavLink>`
2. Replace all `setCurrentPage()` calls with `navigate()`
3. Update buttons and programmatic navigation

### Phase 4: Testing
1. Test all navigation paths
2. Verify authentication protection
3. Test browser controls
4. Test direct URL access

### Rollback Plan
If critical issues discovered:
1. Git revert the routing changes
2. Rebuild frontend container
3. Investigate issues
4. Re-deploy with fixes

## Open Questions

- **Q: Should we add route-based code splitting?**
  - A: Not in this phase - can add later if bundle size becomes an issue

- **Q: Should we persist scroll position on navigation?**
  - A: React Router handles this automatically, test and adjust if needed

- **Q: Do we need nested route layouts?**
  - A: Not currently needed, flat route structure is sufficient
