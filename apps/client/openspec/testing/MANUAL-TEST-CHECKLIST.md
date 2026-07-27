# Manual Testing Checklist - Onboarding Flow

**Purpose:** Verify a non-technical user can complete setup without external help
**Test Environment:** Fresh workspace, no prior configuration
**Tester:** _______________
**Date:** _______________

---

## Pre-Test Setup

- [ ] Fresh database (no existing organization)
- [ ] Docker services running (`docker-compose up -d`)
- [ ] Frontend accessible at http://localhost:3000
- [ ] Backend accessible at http://localhost:3001

---

## Phase 1: Initial Access & First Impressions

### 1.1 Landing Page
- [ ] Page loads without errors
- [ ] Clear indication this is a setup/welcome screen
- [ ] No confusing technical jargon visible
- [ ] Professional appearance (no broken styles)
- [ ] Mobile responsive (test on phone/tablet)

**Notes:** _________________________________________________

### 1.2 Setup Flow Introduction
- [ ] Clear "Get Started" or "Set Up" button visible
- [ ] User understands what they're about to do
- [ ] No login form shown (fresh install = setup first)
- [ ] Progress indicator visible (Step 1 of X)

**Notes:** _________________________________________________

---

## Phase 2: Organization Setup

### 2.1 Organization Information
- [ ] Organization name field is clearly labeled
- [ ] Domain field has helpful placeholder/example
- [ ] Validation messages are friendly (not technical errors)
- [ ] Required fields are clearly marked
- [ ] "Next" button is clearly visible

**Test inputs:**
- [ ] Empty submission shows helpful error
- [ ] Invalid domain format shows helpful error
- [ ] Valid input proceeds to next step

**Notes:** _________________________________________________

### 2.2 Admin Account Creation
- [ ] First name field visible and labeled
- [ ] Last name field visible and labeled
- [ ] Email field with validation
- [ ] Password field with requirements shown
- [ ] Password confirmation field
- [ ] Password strength indicator (if present)

**Test inputs:**
- [ ] Weak password shows requirements
- [ ] Mismatched passwords show clear error
- [ ] Valid input proceeds to next step

**Notes:** _________________________________________________

---

## Phase 3: Google Workspace Connection (Optional)

### 3.1 Module Selection
- [ ] Google Workspace option clearly presented
- [ ] "Skip for now" option available
- [ ] Benefits of connecting are explained
- [ ] No pressure to connect immediately

**Notes:** _________________________________________________

### 3.2 Service Account Setup (If connecting)
- [ ] Clear instructions for creating service account
- [ ] Link to Google Cloud Console provided
- [ ] Step-by-step guide visible or linked
- [ ] JSON file upload area is obvious
- [ ] Drag-and-drop supported
- [ ] File selection button works
- [ ] Upload progress/confirmation shown

**Test inputs:**
- [ ] Invalid JSON shows friendly error
- [ ] Wrong file type shows friendly error
- [ ] Valid JSON proceeds to next step

**Notes:** _________________________________________________

### 3.3 Admin Email & Domain
- [ ] Admin email field clearly labeled
- [ ] Explanation of why admin email is needed
- [ ] Domain auto-detected or easy to enter
- [ ] "Test Connection" button visible

**Notes:** _________________________________________________

### 3.4 Connection Test
- [ ] Test button provides clear feedback
- [ ] Loading state shown during test
- [ ] Success message is celebratory/clear
- [ ] Failure message explains what went wrong
- [ ] Failure message suggests fixes
- [ ] Retry option available

**Notes:** _________________________________________________

### 3.5 Domain-Wide Delegation Setup
- [ ] Clear explanation of what DWD is
- [ ] Step-by-step instructions provided
- [ ] Client ID displayed for copying
- [ ] Required scopes listed clearly
- [ ] "I've completed this" confirmation
- [ ] Verification of DWD setup

**Notes:** _________________________________________________

---

## Phase 4: Initial Sync

### 4.1 Sync Initiation
- [ ] Clear explanation of what will happen
- [ ] "Start Sync" button visible
- [ ] Progress indicator during sync
- [ ] Estimated time shown (if possible)
- [ ] User can see sync is working

**Notes:** _________________________________________________

### 4.2 Sync Completion
- [ ] Success message clearly shown
- [ ] Count of users synced displayed
- [ ] Count of groups synced displayed
- [ ] "Continue to Dashboard" button visible

**Notes:** _________________________________________________

---

## Phase 5: First Login Experience

### 5.1 Login Page
- [ ] Email field pre-filled (if just created account)
- [ ] Password field ready for input
- [ ] "Login" button clearly visible
- [ ] Forgot password link visible
- [ ] No confusing options

**Notes:** _________________________________________________

### 5.2 Dashboard First View
- [ ] Welcome message or guidance shown
- [ ] Key stats visible (user count, group count)
- [ ] Navigation is intuitive
- [ ] No empty states that confuse
- [ ] Quick actions available

**Notes:** _________________________________________________

---

## Phase 6: Core Navigation

### 6.1 Sidebar Navigation
- [ ] All menu items visible
- [ ] Icons are intuitive
- [ ] Labels are clear
- [ ] Active page is highlighted
- [ ] Collapse/expand works (if applicable)

**Test each navigation item:**
- [ ] Dashboard/Home loads correctly
- [ ] Users page loads correctly
- [ ] Groups page loads correctly
- [ ] Settings page loads correctly
- [ ] Org Chart loads correctly (if enabled)

**Notes:** _________________________________________________

### 6.2 User Menu
- [ ] User name/email visible
- [ ] Dropdown menu works
- [ ] Logout option visible
- [ ] Settings shortcut available

**Notes:** _________________________________________________

---

## Phase 7: Users Page Functionality

### 7.1 User List Display
- [ ] Users from Google Workspace appear
- [ ] Names display correctly
- [ ] Emails display correctly
- [ ] Status indicators visible
- [ ] Profile photos load (if synced)

**Notes:** _________________________________________________

### 7.2 User Type Tabs
- [ ] Staff tab works and shows count
- [ ] Guests tab works and shows count
- [ ] Contacts tab works and shows count
- [ ] Counts update correctly

**Notes:** _________________________________________________

### 7.3 User Status Filters
- [ ] All filter works
- [ ] Active filter works
- [ ] Staged/Pending filter works
- [ ] Suspended filter works
- [ ] Deleted filter works

**Notes:** _________________________________________________

### 7.4 User Search
- [ ] Search box visible
- [ ] Search by name works
- [ ] Search by email works
- [ ] Results update in real-time
- [ ] "No results" message is helpful

**Notes:** _________________________________________________

### 7.5 User Details
- [ ] Clicking user opens detail panel
- [ ] All user info displayed
- [ ] Edit option available (if applicable)
- [ ] Close button works
- [ ] Panel is responsive

**Notes:** _________________________________________________

---

## Phase 8: Groups Page Functionality

### 8.1 Group List Display
- [ ] Groups from Google Workspace appear
- [ ] Group names display correctly
- [ ] Member counts visible
- [ ] Group types/categories shown

**Notes:** _________________________________________________

### 8.2 Group Details
- [ ] Clicking group opens details
- [ ] Members list visible
- [ ] Group settings visible
- [ ] Close button works

**Notes:** _________________________________________________

---

## Phase 9: Settings Page

### 9.1 Settings Navigation
- [ ] Tabs are clearly visible
- [ ] Active tab is highlighted
- [ ] All tabs are accessible

**Test each tab:**
- [ ] Modules tab loads
- [ ] Organization tab loads
- [ ] Security tab loads
- [ ] Integrations tab loads

**Notes:** _________________________________________________

### 9.2 Modules Tab
- [ ] Google Workspace status shown
- [ ] Enable/Disable options work
- [ ] Configuration details visible
- [ ] Sync controls available

**Notes:** _________________________________________________

### 9.3 Manual Sync
- [ ] "Sync Now" button visible
- [ ] Sync progress shown
- [ ] Sync completion confirmed
- [ ] Last sync timestamp updates

**Notes:** _________________________________________________

---

## Phase 10: Error Handling & Edge Cases

### 10.1 Network Errors
- [ ] Offline state handled gracefully
- [ ] Retry options provided
- [ ] No cryptic error messages

**Notes:** _________________________________________________

### 10.2 Session Expiry
- [ ] Expired session redirects to login
- [ ] Clear message shown
- [ ] User can re-login easily

**Notes:** _________________________________________________

### 10.3 Invalid Actions
- [ ] Attempting invalid actions shows helpful errors
- [ ] User is guided to correct action
- [ ] No system crashes

**Notes:** _________________________________________________

---

## Phase 11: Mobile Responsiveness

### 11.1 Phone (< 768px)
- [ ] All pages render correctly
- [ ] Navigation is accessible
- [ ] Touch targets are adequate
- [ ] Text is readable
- [ ] Forms are usable

**Notes:** _________________________________________________

### 11.2 Tablet (768px - 1024px)
- [ ] Layout adapts appropriately
- [ ] No horizontal scrolling needed
- [ ] Tables are readable

**Notes:** _________________________________________________

---

## Phase 12: Accessibility

### 12.1 Keyboard Navigation
- [ ] Can tab through all interactive elements
- [ ] Focus indicators visible
- [ ] Enter/Space activates buttons
- [ ] Escape closes modals

**Notes:** _________________________________________________

### 12.2 Screen Reader (if testing)
- [ ] Page titles announced
- [ ] Form labels read correctly
- [ ] Error messages announced
- [ ] Navigation is logical

**Notes:** _________________________________________________

---

## Final Assessment

### Overall Onboarding Experience
Rate 1-5 (1=Poor, 5=Excellent):

- [ ] Clarity of instructions: ___
- [ ] Visual design: ___
- [ ] Error handling: ___
- [ ] Speed/Performance: ___
- [ ] Mobile experience: ___
- [ ] Overall ease of use: ___

### Critical Issues Found
List any blocking issues:

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Improvements Suggested
List any UX improvements:

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Can a Non-Technical User Complete Setup Alone?
- [ ] Yes, without any issues
- [ ] Yes, with minor confusion
- [ ] No, would need help at step: _______________
- [ ] No, blocking issues prevent completion

---

## Sign-Off

**Tester Signature:** _______________
**Date:** _______________
**Build/Version:** _______________

---

## Quick Reference: Test Credentials

If testing with existing data:
- **Email:** jack@gridworx.io
- **Password:** P@ssw0rd123!

For fresh setup, create new admin during onboarding.
