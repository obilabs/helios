# OpenSpec Proposal: People Directory (User-Facing)

**ID:** people-directory
**Status:** Draft
**Priority:** Medium
**Author:** Claude (Autonomous Agent)
**Created:** 2025-12-08

## Summary

A user-facing people discovery experience that helps employees connect with coworkers. This is the "consumer" side of the user system - separate from admin user management.

## Audience

| Role | Access |
|------|--------|
| All employees | Browse directory, view profiles, edit own profile |
| Managers | See their direct reports highlighted |
| Admins | Configure which fields are visible/editable |

**This is NOT:** Admin user management, HR tools, or employment data editing.

## Core Features

### 1. My Profile
Users edit their own "about me" information:
- Bio, fun facts, interests
- Voice/video introductions
- Name pronunciation
- "Ask me about" topics
- Current status/project

### 2. People Directory
Browse and search coworkers:
- Search by name, department, skills, interests
- Filter by team, location, department
- Grid and list views
- "New to the team" section

### 3. Profile View
View a coworker's profile:
- Contact info (based on privacy settings)
- Role and team context
- "Get to know" content
- Shared groups, projects
- Manager and direct reports

### 4. Org Chart Integration
Visual exploration:
- Click person → see their profile
- Browse by department or reporting line
- Find path between two people

## User Stories

### As an Employee
- I want to introduce myself so new coworkers can get to know me
- I want to record how to pronounce my name so people say it correctly
- I want to find coworkers with specific skills to ask questions
- I want to see who's on my team and learn about them
- I want to control who sees my personal information

### As a New Hire
- I want to learn about my teammates before meeting them
- I want to watch video intros to put faces to names
- I want to find people with shared interests to connect with

### As a Manager
- I want to see my team's profiles in one place
- I want to know when new people join my department

## Information Architecture

```
Main Navigation
├── Dashboard
├── People              ← NEW
│   ├── Directory       (browse all)
│   ├── My Team         (direct reports + peers)
│   ├── Org Chart       (visual explorer)
│   └── New Joiners     (recent hires)
├── Groups
├── Users (Admin only)  ← Existing admin feature
└── Settings
    └── My Profile      ← Edit own profile
```

## Page Designs

### People Directory

```
+--------------------------------------------------+
| People                                           |
+--------------------------------------------------+
| [Search people, skills, interests...]            |
|                                                  |
| Department: [All ▼]  Location: [All ▼]          |
| Team: [All ▼]        [Grid] [List]              |
+--------------------------------------------------+
| New to Acme (3)                          [See all]|
| +--------+ +--------+ +--------+                 |
| | [Photo]| | [Photo]| | [Photo]|                 |
| | Alex R | | Sam K  | | Jo L   |                 |
| | Design | | Eng    | | Sales  |                 |
| | 🎬 🔊  | | 🔊     | | 🎬     |                 |
| +--------+ +--------+ +--------+                 |
+--------------------------------------------------+
| All People (127)                                 |
| +--------+ +--------+ +--------+ +--------+     |
| | [Photo]| | [Photo]| | [Photo]| | [Photo]|     |
| | Sarah C| | Mike J | | Priya P| | Tom H  |     |
| | Eng    | | Eng    | | Product| | Sales  |     |
| | SF     | | NYC    | | Remote | | London |     |
| +--------+ +--------+ +--------+ +--------+     |
+--------------------------------------------------+
```

### Profile View (Coworker)

```
+--------------------------------------------------+
| ← Back to People                                 |
+--------------------------------------------------+
| +--------+  Sarah Chen, PhD            [Message] |
| | [Photo]|  Senior Engineer                      |
| |        |  Engineering • Frontend Team          |
| |        |  San Francisco Office                 |
| +--------+  🔊 "sah-RAH CHEN" [▶]                |
+--------------------------------------------------+
| About                                            |
| Hi! I'm Sarah. I've been building web apps for  |
| 8 years and joined Acme to work on...           |
|                                                  |
| [▶ Watch my intro]  [🔊 Listen]                 |
+--------------------------------------------------+
| Ask Me About                                     |
| [React] [Accessibility] [TypeScript] [Baking]   |
+--------------------------------------------------+
| Fun Facts                                        |
| 🐱 3 cats named Kirk, Spock, and Bones         |
| 🌶️ Makes award-winning hot sauce               |
| ♟️ Former state chess champion                  |
+--------------------------------------------------+
| Currently                                        |
| 🔨 Leading the design system refresh            |
+--------------------------------------------------+
| Interests                                        |
| [Photography] [Hiking] [Board Games] [Cooking]  |
+--------------------------------------------------+
| Contact                                          |
| 📧 sarah.chen@acme.com                          |
| 💬 @sarah.chen (Slack)                          |
+--------------------------------------------------+
| Team                                             |
| Reports to: Mike Johnson (Tech Lead)            |
| Team: Frontend (4 people)                       |
| [View in Org Chart]                             |
+--------------------------------------------------+
```

### My Profile (Edit Mode)

```
+--------------------------------------------------+
| My Profile                    65% Complete       |
+--------------------------------------------------+
| [Photo]  [Change Photo]                          |
|                                                  |
| Display Name: [Sarah Chen, PhD    ]              |
| Pronouns:     [She/Her           ▼]              |
+--------------------------------------------------+
| Name Pronunciation              [Record] [Play]  |
| 🔊 "sah-RAH CHEN" (recorded Jan 5)      [Delete]|
|                                                  |
| Tip: Help coworkers say your name correctly!    |
+--------------------------------------------------+
| About Me                                         |
| [Rich text editor...                            ]|
| [                                               ]|
|                                                  |
| Voice Introduction (optional)   [Record]        |
| 🎤 Not recorded yet                             |
|                                                  |
| Video Introduction (optional)   [Upload]        |
| 🎬 Not uploaded yet                             |
+--------------------------------------------------+
| Fun Facts                                [+ Add] |
| 🐱 3 cats named Kirk, Spock, and Bones    [Edit]|
| 🌶️ Makes award-winning hot sauce          [Edit]|
| ♟️ Former state chess champion             [Edit]|
+--------------------------------------------------+
| Ask Me About                             [+ Add] |
| Topics you're happy to help others with         |
| [React ×] [Accessibility ×] [TypeScript ×]      |
+--------------------------------------------------+
| Interests & Hobbies                      [+ Add] |
| [Photography ×] [Hiking ×] [Board Games ×]      |
+--------------------------------------------------+
| Currently Working On                             |
| [Leading the design system refresh         ]    |
+--------------------------------------------------+
| Privacy Settings                      [Manage]  |
+--------------------------------------------------+
|                              [Cancel] [Save]    |
+--------------------------------------------------+
```

### My Team View

```
+--------------------------------------------------+
| My Team                                          |
+--------------------------------------------------+
| Your Manager                                     |
| +------------------------------------------+    |
| | [Photo] Mike Johnson                     |    |
| |         Tech Lead • Engineering          |    |
| |         [View Profile]                   |    |
| +------------------------------------------+    |
+--------------------------------------------------+
| Your Peers (reporting to Mike)                   |
| +--------+ +--------+ +--------+                 |
| | [Photo]| | [Photo]| | [Photo]|                 |
| | Priya  | | Tom    | | Alex   |                 |
| +--------+ +--------+ +--------+                 |
+--------------------------------------------------+
| Your Direct Reports (3)        ← If manager     |
| +--------+ +--------+ +--------+                 |
| | [Photo]| | [Photo]| | [Photo]|                 |
| | Junior1| | Junior2| | Junior3|                 |
| +--------+ +--------+ +--------+                 |
+--------------------------------------------------+
```

## Media Recording UI

### Voice Recording

```
+------------------------------------------+
| Record Voice Introduction                |
+------------------------------------------+
| Maximum 60 seconds                       |
|                                          |
|         ◉ 0:00 / 1:00                   |
|    ▁▂▃▅▂▁▃▅▇▅▃▂▁  (waveform)           |
|                                          |
|        [🎤 Start Recording]              |
|                                          |
| Tips:                                    |
| • Introduce yourself and your role      |
| • Share what you're working on          |
| • Mention something personal/fun        |
+------------------------------------------+

Recording state:
+------------------------------------------+
|         ⏺ 0:23 / 1:00                   |
|    ▁▂▃▅▂▁▃▅▇▅▃▂▁▂▃▅▇▅▃               |
|                                          |
|        [⏹ Stop Recording]               |
+------------------------------------------+

Preview state:
+------------------------------------------+
| Preview                                  |
|         ▶ 0:00 / 0:45                   |
|    ▁▂▃▅▂▁▃▅▇▅▃▂▁▂▃▅▇▅▃               |
|                                          |
|   [🔄 Re-record]  [✓ Save]              |
+------------------------------------------+
```

## API Endpoints (User-Facing)

```
# My Profile
GET    /api/me/profile              # Get my profile for editing
PUT    /api/me/profile              # Update my profile
POST   /api/me/media/:type          # Upload voice/video
DELETE /api/me/media/:type          # Remove media
GET    /api/me/privacy              # Get my privacy settings
PUT    /api/me/privacy              # Update privacy settings

# People Directory
GET    /api/people                  # List people (paginated, filtered)
GET    /api/people/:id              # View someone's profile
GET    /api/people/new              # Recently joined
GET    /api/people/search           # Search by name, skills, interests

# My Team
GET    /api/me/team                 # My manager, peers, reports

# Discovery
GET    /api/people/by-skill/:skill  # Find people with skill
GET    /api/people/by-interest/:interest
```

## Privacy Model

Users control visibility of their personal fields:

| Field | Default Visibility | Options |
|-------|-------------------|---------|
| Name, Photo, Title | Everyone | Cannot restrict |
| Email | Everyone | Everyone, Team, Manager |
| Phone | Manager only | Everyone, Team, Manager, None |
| Bio | Everyone | Everyone, Team, Manager |
| Voice/Video Intro | Everyone | Everyone, Team, None |
| Fun Facts | Everyone | Everyone, Team, None |
| Interests | Everyone | Everyone, Team, None |
| Personal Email | None | Team, Manager, None |

## Relationship to Admin Features

| Feature | User-Facing | Admin-Facing |
|---------|-------------|--------------|
| **Edit bio, fun facts** | My Profile page | - |
| **Edit job title** | - | UserSlideOut |
| **Edit department** | - | UserSlideOut |
| **View coworker** | Profile View | UserSlideOut |
| **Manage user** | - | Users page |
| **Configure fields** | - | Settings > User Fields |

## Implementation Phases

### Phase 1: My Profile
- Profile editing page
- Basic fields (bio, pronouns)
- Privacy settings

### Phase 2: People Directory
- Directory listing with search
- Profile view (read-only)
- Filters (department, location)

### Phase 3: Rich Media
- Voice recording/upload
- Video upload
- Name pronunciation

### Phase 4: Discovery
- Fun facts, interests, "ask me about"
- New joiners section
- Search by skills/interests
- My Team view

## Files to Create

```
frontend/src/pages/
├── People.tsx              # Directory listing
├── PersonProfile.tsx       # View coworker profile
├── MyProfile.tsx           # Edit own profile
└── MyTeam.tsx              # Team view

frontend/src/components/
├── PersonCard.tsx          # Grid card component
├── ProfileHeader.tsx       # Profile header with media
├── MediaRecorder.tsx       # Voice/video recording
├── FunFactsEditor.tsx      # Fun facts list editor
└── InterestTags.tsx        # Interest tag editor

backend/src/routes/
├── me.routes.ts            # My profile endpoints
└── people.routes.ts        # Directory endpoints

backend/src/services/
└── media-upload.service.ts # Handle media to MinIO
```

## Success Criteria

1. Users can complete their profile in < 5 minutes
2. 80% profile completion rate within 30 days of launch
3. Users can find any coworker in < 10 seconds
4. Voice intros play without buffering
5. Mobile-responsive experience
