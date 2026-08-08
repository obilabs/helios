# OpenSpec Proposal: Org Chart Seed Data & Remove UI Placeholders

**ID:** org-chart-seed-data
**Status:** Draft
**Priority:** P0.25 (Before infrastructure-fixes)
**Author:** Claude (Research + Development)
**Created:** 2025-12-08

## Summary

Populate the database with realistic test users for org chart testing, and remove hardcoded placeholder data from UI components. Helios should be the source of truth for user data, with optional sync to Google Workspace later.

## Problem Statement

### Current Issues
1. **Hardcoded placeholder data in UI** - Pages show fake counts like "25 users, 5 managers" instead of real database counts
2. **No test users for org chart** - Only 4 real users exist, can't test org chart hierarchy
3. **No reporting manager chains** - Can't visualize organizational structure
4. **No orphaned users** - Can't test edge case detection

### User Expectation
> "I should be able to enable user account in google later by checking the sync to google box"

This confirms: **Helios is the source of truth**, Google Workspace is an optional downstream sync target.

## Research Findings: Org Chart Architecture

### Key Concepts (from enterprise tool research)

| Concept | Definition | Cardinality |
|---------|-----------|-------------|
| **Department** | Functional group (Finance, HR, Engineering) | User has ONE |
| **Reporting Manager** | Direct supervisor relationship | User has ONE (or NULL for CEO/orphans) |
| **Teams** | Cross-functional project groups | User has ZERO-TO-MANY |

### Org Chart Generation

**Primary data source: `reporting_manager_id` relationships (NOT department hierarchy)**

```
CEO (reporting_manager_id = NULL)
├── CTO (reporting_manager_id = CEO)
│   ├── VP Engineering (reporting_manager_id = CTO)
│   │   ├── Engineering Manager
│   │   │   ├── Developer 1
│   │   │   └── Developer 2
│   │   └── ...
│   └── VP Product
└── CFO (reporting_manager_id = CEO)
    └── ...
```

Departments are metadata for filtering/grouping, not for building hierarchy.

### Orphaned Users

Orphans are users where:
1. `reporting_manager_id IS NULL` but they're not CEO/top-level
2. `reporting_manager_id` references inactive/deleted user
3. Should be flagged for admin review

### Cross-Functional Teams

- Separate from department hierarchy
- User can belong to multiple teams
- Teams can span departments (e.g., "Project Phoenix" with Eng + Marketing + Product)
- Use `access_groups` with `membership_type = 'static'` for manual teams
- Use `membership_type = 'dynamic'` with rules for automatic membership

## Existing Schema (Already Supports This)

Migration 026 already added:
- `organization_users.reporting_manager_id` (UUID, self-referencing FK)
- `check_manager_hierarchy()` function (prevents circular references)
- `get_org_hierarchy()` function (recursive CTE for org chart)
- `get_direct_reports_count()` and `get_total_reports_count()` functions

Migration 007 already added:
- `departments` table with `parent_department_id` for hierarchy
- `organization_users.department_id` FK

Migration 031 already added:
- `access_groups.membership_type` (static/dynamic)
- `dynamic_group_rules` table for automatic membership

**Key column names in organization_users:**
- `job_title` (not `title`)
- `reporting_manager_id` (not `manager_id`)
- `user_status` (not `status`)
- `employee_type` (Full Time, Part Time, Contractor, Intern)

## Proposed Test Data Structure

### 28 Users Across 5 Levels

```
Level 0 - CEO (1 user)
├── Jack Chen - CEO

Level 1 - C-Suite (4 users)
├── Sarah Chen - CTO (reports to CEO)
├── Robert Taylor - CFO (reports to CEO)
├── Amanda White - CMO (reports to CEO)
└── Thomas Anderson - COO (reports to CEO)

Level 2 - VPs (2 users)
├── Michael Rodriguez - VP Engineering (reports to CTO)
└── Jennifer Lee - VP Product (reports to CTO)

Level 3 - Managers (7 users)
├── David Kim - Engineering Manager (reports to VP Eng)
├── Rachel Green - Engineering Manager (reports to VP Eng)
├── Nathan Brown - Product Manager (reports to VP Product)
├── Michelle Wang - Finance Manager (reports to CFO)
├── Kevin Lee - Marketing Manager (reports to CMO)
├── Stephanie Davis - Operations Manager (reports to COO)
└── Nicole Baker - HR Manager (reports to COO)

Level 4 - Staff (11 users)
├── Engineering (5): Emily Watson, James Chen, Lisa Park, Chris Martinez, Amy Thompson
├── Product (2): Sophia Garcia, Oliver Smith
├── Finance (2): Daniel Johnson, Ashley Williams
├── Marketing (2): Jessica Chen, Brandon Miller
├── Operations (1): Ryan Cooper
└── HR (1): Eric Wilson

Orphans (3 users) - No manager assigned
├── Frank Thompson - Security Consultant (contractor)
├── Grace Liu - Data Analyst (new hire, not yet assigned)
└── Jake Roberts - Marketing Intern (temporary)
```

### 7 Departments
- Executive, Engineering, Product, Finance, Marketing, Operations, Human Resources

### 4 Groups
1. **All Staff** (dynamic) - Everyone with a department
2. **Leadership Team** (static) - C-Suite + VPs
3. **Tech Team** (dynamic) - Engineering OR Product department
4. **Project Phoenix** (static) - Cross-functional project team

## UI Changes Required

### Remove Hardcoded Placeholder Data

Files to audit and fix:
1. Dashboard widgets showing fake stats
2. Roles section showing "25 users, 5 managers"
3. Any "System role: Standard user with access to..." text
4. Stats cards that don't pull from API

### Replace With
- Real API calls to `/api/users/count`, `/api/groups/count`
- Loading states while fetching
- Empty states when no data

## Success Criteria

1. Database contains 28 test users with proper hierarchy
2. Org chart renders correctly with all levels
3. 3 orphaned users appear in "orphans" detection/warning
4. Cross-functional groups show correct membership
5. All UI components show real data from database
6. No hardcoded placeholder text remains

## Google Workspace Sync (Future)

After this change, the flow is:
1. Users exist in Helios (source of truth)
2. Admin can optionally "Enable Google account" per user
3. Sync pushes user to Google Workspace
4. Changes in Google can be pulled back (configurable)

This proposal ONLY covers seed data and UI cleanup. Google sync is separate work.

## File: Seed Migration

See `039_seed_test_users_and_org_chart.sql` already drafted in `/database/migrations/`

The agent should:
1. Review and validate the migration
2. Run it against the database
3. Write tests to verify data
4. Find and fix UI placeholder issues
