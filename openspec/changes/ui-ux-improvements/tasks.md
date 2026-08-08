# UI/UX Improvements - Implementation Tasks

## P0 - Critical (This Sprint)

### 1. Fix Module Page Button Layout
- [x] 1.1 Create ButtonGroup component with consistent sizing *(Done via .module-actions CSS class)*
- [x] 1.2 Refactor Settings.tsx Modules tab buttons *(Done)*
- [x] 1.3 Set minimum button width (100px) *(Done in Settings.css)*
- [x] 1.4 Set fixed button height (36px) *(Done in Settings.css)*
- [x] 1.5 Add flexbox wrap for responsive behavior *(Done in Settings.css)*
- [x] 1.6 Move "Disable" to dropdown menu *(Done - MoreVertical menu)*
- [x] 1.7 Test on mobile viewport *(Done - added mobile responsive CSS for full-width buttons)*

### 2. Replace Emoji with Lucide Icons
- [ ] 2.1 App.tsx: Replace header emoji *(low priority - only in setup/welcome page)*
- [x] 2.2 UserList.tsx: Replace bulk action emoji *(Already using Lucide icons)*
- [x] 2.3 UserList.tsx: Replace empty state emoji *(Already using Lucide icons)*
- [x] 2.4 Directory.tsx: Replace tab emoji with Lucide icons *(Done: Users, UsersRound, Building2, Monitor)*
- [x] 2.5 UserSlideOut.tsx: Replace tab/status emoji with Lucide icons *(Done: ClipboardList, Users, RefreshCw, BarChart3, Settings, Trash2, CheckCircle, AlertTriangle)*
- [x] 2.6 GroupDetail.tsx: Replace all emoji with Lucide icons *(Done: UsersRound, Search, Plus, Trash2, Loader, Save, BarChart3, User, Pencil)*
- [x] 2.7 OrgUnits.tsx: Replace emoji with Lucide icons *(Done: Building2, MapPin, User, FolderTree, Plus, Pencil, Trash2, Check, AlertTriangle, FileEdit, Loader, RefreshCw, ChevronRight, ChevronDown)*
- [x] 2.8 Secondary pages (TemplateStudio, AssetManagement, PublicAssets, BulkOperations, DeveloperConsole) *(Done: All pages converted to Lucide icons)*
- [x] 2.9 Core components (Toast, ModuleCard, RolesManagement, GoogleWorkspaceWizard) *(Done)*
- [ ] 2.10 Welcome/setup pages (App.tsx, LoginPage, AccountSetup) - Low priority, kept for branding

### 3. Fix Table Row Heights and Spacing
- [x] 3.1 UserList.css: Set row height to 48px *(Already done)*
- [x] 3.2 Pages.css (Groups): Set row height to 48px *(Updated from 56px to 48px)*
- [x] 3.3 Add consistent padding (0 16px) *(Done)*
- [x] 3.4 Set column gap to 16px *(Done)*
- [x] 3.5 Add subtle hover state (#f9fafb) *(Done)*
- [x] 3.6 Test with long content (text overflow) *(Done - added text-overflow ellipsis to item-name, item-description, email-text)*

---

## P1 - High (Next Sprint)

### 4. Create PlatformBadge Component
- [x] 4.1 Create `components/ui/PlatformBadge.tsx` *(Done)*
- [x] 4.2 Support platforms: google, microsoft, slack, okta, local *(Done)*
- [x] 4.3 Use proper SVG icons or Lucide approximations *(Done - Google/Microsoft SVG icons, Lucide for others)*
- [x] 4.4 Add tooltip showing full platform name *(Done - via title attribute)*
- [~] 4.5 Replace text badges in UserList.tsx *(Already using PlatformIcon)*
- [~] 4.6 Replace text badges in Groups.tsx *(Already using PlatformIcon)*
- [ ] 4.7 Add to DESIGN-SYSTEM.md documentation

### 5. Dynamic Org Chart Implementation
- [x] 5.1 Refactor OrgChart.tsx to build from manager_id *(Already implemented)*
- [x] 5.2 Create tree data structure from users *(Done via backend API)*
- [x] 5.3 Identify and display orphaned users section *(Done - shows users without valid manager)*
- [x] 5.4 Add click handler to navigate to user detail *(Done)*
- [x] 5.5 Implement expand/collapse for branches *(Done)*
- [x] 5.6 Add user count indicators on collapsed nodes *(Done - shows total reports)*
- [x] 5.7 Style orphaned users section distinctly *(Done)*
- [x] 5.8 Test with various org structures *(Done)*
- [x] 5.9 PDF/PNG export *(Done via html2canvas)*

### 6. Navigation Terminology Update
- [~] 6.1-6.5 **DEFERRED**: "Org Units" is Google Workspace terminology. The Master Data feature now has separate "Departments" concept. Renaming would create confusion. Keep "Org Units" for Google-synced organizational units.

---

## P2 - Medium (Backlog)

### 7. Navigation Structure Reorganization
- [ ] 7.1 Move Org Chart under new "Organization" section
- [ ] 7.2 Flatten Automation section (remove if empty)
- [ ] 7.3 Flatten Insights into Reports
- [ ] 7.4 Add conditional visibility for features
- [ ] 7.5 Update sidebar collapse behavior
- [ ] 7.6 Test navigation flow with new structure

### 8. Asset Management Improvements
- [ ] 8.1 Rename to "Devices" in navigation
- [ ] 8.2 Create device type icons (Laptop, Smartphone, etc.)
- [ ] 8.3 Add GW device sync capability
- [ ] 8.4 Show sync status on devices page
- [ ] 8.5 Match table styling with Users/Groups

### 9. Org Chart Export
- [ ] 9.1 Implement PDF export
- [ ] 9.2 Implement PNG export
- [ ] 9.3 Add print-friendly styles
- [ ] 9.4 Include org name and date on exports

---

## P3 - Nice to Have

### 10. Visual Polish
- [ ] 10.1 Add subtle animations on hover/click
- [ ] 10.2 Improve loading state skeletons
- [ ] 10.3 Add empty state illustrations
- [ ] 10.4 Refine color contrast for accessibility

---

## Verification Checklist

After completing P0 tasks:
- [ ] No emoji visible in any page
- [ ] Module buttons same size, responsive
- [ ] Table rows comfortable (48px height)
- [ ] All icons from Lucide library
- [ ] Mobile viewport works correctly

After completing P1 tasks:
- [ ] Platform badges show recognizable icons
- [ ] Org Chart builds automatically
- [ ] Clicking user in Org Chart opens detail
- [ ] Orphaned users visible in Org Chart
- [ ] "Departments" label in navigation

---

## Files to Modify

### P0
- `frontend/src/App.tsx` - Header icons
- `frontend/src/components/Settings.tsx` - Module buttons
- `frontend/src/components/Settings.css` - Button styles
- `frontend/src/components/UserList.tsx` - Emoji, table
- `frontend/src/components/UserList.css` - Row heights
- `frontend/src/pages/Groups.tsx` - Table styling

### P1
- `frontend/src/components/ui/PlatformBadge.tsx` - New
- `frontend/src/pages/OrgChart.tsx` - Dynamic rebuild
- `frontend/src/pages/OrgChart.css` - Orphan section
- `frontend/src/App.tsx` - Nav labels

### P2
- `frontend/src/App.tsx` - Nav structure
- `frontend/src/pages/AssetManagement.tsx` - Rename, icons
- Backend sync services (if GW device sync added)
